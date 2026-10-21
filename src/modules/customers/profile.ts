import { and, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Database } from "@/db/types";
import { appointment, customer, emailOutbox } from "@/db/schema";
import { DomainError } from "@/lib/domain-error";
import type { AuthDriver } from "@/modules/auth/types";
import { recordAudit } from "@/modules/audit/record";
import { loadSettings } from "@/modules/availability";
import { hitRateLimit } from "@/modules/security/rate-limit";
import { toProfile, type CustomerProfile } from "./accounts";
import {
  deleteAccountSchema,
  passwordChangeSchema,
  profileSchema,
  validate,
  type FieldErrors,
} from "./schemas";

// « Mes informations » (R-76) : coordonnées, mot de passe, suppression du compte (R-75, D-43).
// Changer l'email ou le mot de passe, ou supprimer le compte, demande le mot de passe actuel : une session laissée
// ouverte sur un téléphone ne suffit pas à prendre le compte.

interface Context {
  now?: Date;
}

export type ProfileResult<T = Record<never, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: "invalid"; fieldErrors: FieldErrors }
  | { ok: false; error: "wrong_password" | "email_taken" | "imminent_appointment" | "failed" }
  | { ok: false; error: "rate_limited"; retryAfterSeconds: number };

/** Mot de passe vérifié 10 fois par 15 minutes et par client au plus. */
const PASSWORD_CHECKS = { limit: 10, windowSeconds: 900 } as const;

/** Vérifie le mot de passe actuel, avec limitation d'essais. Retourne l'échec à renvoyer, ou null si tout va bien. */
async function checkPassword(
  db: Database,
  driver: AuthDriver,
  row: { id: string; email: string | null },
  password: string,
  now?: Date,
): Promise<Extract<ProfileResult, { ok: false }> | null> {
  const limit = await hitRateLimit(db, `pw:customer:${row.id}`, PASSWORD_CHECKS, now);
  if (!limit.allowed) {
    return { ok: false, error: "rate_limited", retryAfterSeconds: limit.retryAfterSeconds };
  }
  if (!row.email || !(await driver.verifyPassword(row.email, password))) {
    return { ok: false, error: "wrong_password" };
  }
  return null;
}

async function loadActive(db: Database, customerId: string) {
  const [row] = await db
    .select()
    .from(customer)
    .where(and(eq(customer.id, customerId), isNull(customer.anonymizedAt)));
  return row ?? null;
}

const pgCode = (error: unknown): string | undefined => {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
};

/** Modifie prénom, nom, téléphone et email (R-70). Un nouvel email demande le mot de passe actuel. */
export async function updateProfile(
  db: Database,
  driver: AuthDriver,
  customerId: string,
  raw: unknown,
  context: Context = {},
): Promise<ProfileResult<{ customer: CustomerProfile }>> {
  const parsed = validate(profileSchema, raw);
  if (!parsed.ok) return { ok: false, error: "invalid", fieldErrors: parsed.errors };
  const input = parsed.data;

  const row = await loadActive(db, customerId);
  if (!row) return { ok: false, error: "failed" };

  const emailChanged = input.email !== row.email?.toLowerCase();
  if (emailChanged) {
    if (!input.currentPassword) {
      return {
        ok: false,
        error: "invalid",
        fieldErrors: {
          currentPassword: "Indiquez votre mot de passe actuel pour changer d'email.",
        },
      };
    }
    const refused = await checkPassword(db, driver, row, input.currentPassword, context.now);
    if (refused) return refused;

    const [taken] = await db
      .select({ id: customer.id })
      .from(customer)
      .where(and(eq(customer.email, input.email), ne(customer.id, customerId)));
    if (taken) return { ok: false, error: "email_taken" };

    if (!row.authUserId) return { ok: false, error: "failed" };
    const changed = await driver.updateEmail(row.authUserId, input.email);
    if (!changed.ok) return { ok: false, error: changed.reason };
  }

  try {
    const updated = await db.transaction(async (tx) => {
      const [after] = await tx
        .update(customer)
        .set({
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          email: input.email,
        })
        .where(eq(customer.id, customerId))
        .returning();
      const fields = (
        [
          ["firstName", row.firstName, after.firstName],
          ["lastName", row.lastName, after.lastName],
          ["phone", row.phone, after.phone],
          ["email", row.email, after.email],
        ] as const
      )
        .filter(([, before, now]) => before !== now)
        .map(([field]) => field);
      // Le journal garde les noms des champs, jamais leurs valeurs : aucune donnée personnelle.
      if (fields.length > 0) {
        await recordAudit(
          tx,
          {
            actorType: "customer",
            actorId: customerId,
            action: "customer.updated",
            entity: "customer",
            entityId: customerId,
            after: { fields },
          },
          context.now,
        );
      }
      return after;
    });
    return { ok: true, customer: toProfile(updated) };
  } catch (error) {
    // Un autre compte a pris cette adresse entre-temps : on remet l'ancienne dans l'authentification.
    if (emailChanged && row.authUserId && row.email) {
      await driver.updateEmail(row.authUserId, row.email);
    }
    if (pgCode(error) === "23505") return { ok: false, error: "email_taken" };
    throw error;
  }
}

/** Change le mot de passe : l'ancien est exigé. */
export async function changePassword(
  db: Database,
  driver: AuthDriver,
  customerId: string,
  raw: unknown,
  context: Context = {},
): Promise<ProfileResult> {
  const parsed = validate(passwordChangeSchema, raw);
  if (!parsed.ok) return { ok: false, error: "invalid", fieldErrors: parsed.errors };
  const row = await loadActive(db, customerId);
  if (!row) return { ok: false, error: "failed" };

  const refused = await checkPassword(db, driver, row, parsed.data.currentPassword, context.now);
  if (refused) return refused;

  const updated = await driver.updatePassword(parsed.data.newPassword);
  if (!updated.ok) {
    if (updated.reason === "weak_password") {
      return {
        ok: false,
        error: "invalid",
        fieldErrors: { newPassword: "Choisissez un mot de passe plus solide." },
      };
    }
    return { ok: false, error: "failed" };
  }
  await recordAudit(
    db,
    {
      actorType: "customer",
      actorId: customerId,
      action: "customer.password_changed",
      entity: "customer",
      entityId: customerId,
    },
    context.now,
  );
  return { ok: true };
}

export interface AnonymizeInput {
  customerId: string;
  actor: { type: "customer" | "manager"; id: string | null };
  /**
   * RDV à venir dans le délai de modification : « refuse » (le client appelle le salon, R-30) ou « cancel »
   * (le gérant, qui n'est pas soumis au délai : R-33).
   */
  onImminent: "refuse" | "cancel";
}

/**
 * Supprime une fiche client (R-75, D-43) : efface nom, téléphone et email, détache le compte d'authentification,
 * annule les RDV à venir (le créneau est libéré) et garde les RDV passés sans identité, pour que le chiffre d'affaires
 * et le journal restent justes. Les emails en attente sont supprimés et l'adresse effacée des emails déjà envoyés.
 * Retourne l'identifiant du compte d'authentification à supprimer ensuite.
 */
export async function anonymizeCustomer(
  db: Database,
  input: AnonymizeInput,
  now: Date = new Date(),
): Promise<{ authUserId: string | null; cancelledAppointmentIds: string[] }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(customer)
      .where(and(eq(customer.id, input.customerId), isNull(customer.anonymizedAt)))
      .for("update");
    if (!row) throw new DomainError("unknown_customer");

    const { changeCutoffHours } = await loadSettings(tx);
    const upcoming = await tx
      .select({ id: appointment.id, startsAt: appointment.startsAt })
      .from(appointment)
      .where(
        and(
          eq(appointment.customerId, row.id),
          eq(appointment.status, "confirmed"),
          gt(appointment.startsAt, now),
        ),
      )
      .for("update");
    const limit = now.getTime() + changeCutoffHours * 3_600_000;
    if (input.onImminent === "refuse" && upcoming.some((a) => a.startsAt.getTime() < limit)) {
      throw new DomainError("imminent_appointment");
    }

    const cancelledIds = upcoming.map((a) => a.id);
    if (cancelledIds.length > 0) {
      await tx
        .update(appointment)
        .set({
          status: input.actor.type === "customer" ? "cancelled_by_customer" : "cancelled_by_salon",
        })
        .where(inArray(appointment.id, cancelledIds));
      for (const id of cancelledIds) {
        await recordAudit(
          tx,
          {
            actorType: input.actor.type,
            actorId: input.actor.id,
            action: "appointment.cancelled",
            entity: "appointment",
            entityId: id,
            after: { reason: "account_deleted" },
          },
          now,
        );
      }
    }

    // Emails : plus rien à envoyer à cette personne, et son adresse n'a plus de raison d'être gardée.
    const own = await tx
      .select({ id: appointment.id })
      .from(appointment)
      .where(eq(appointment.customerId, row.id));
    const ownIds = own.map((a) => a.id);
    const concerned = row.email
      ? or(
          eq(emailOutbox.toEmail, row.email),
          ownIds.length > 0 ? inArray(emailOutbox.appointmentId, ownIds) : sql`false`,
        )
      : ownIds.length > 0
        ? inArray(emailOutbox.appointmentId, ownIds)
        : sql`false`;
    await tx.delete(emailOutbox).where(and(concerned, ne(emailOutbox.status, "sent")));
    await tx.update(emailOutbox).set({ toEmail: "" }).where(concerned);

    await tx
      .update(customer)
      .set({
        firstName: null,
        lastName: null,
        phone: null,
        email: null,
        authUserId: null,
        legacyVisits: null,
        legacyLastVisitOn: null,
        anonymizedAt: now,
      })
      .where(eq(customer.id, row.id));
    await recordAudit(
      tx,
      {
        actorType: input.actor.type,
        actorId: input.actor.id,
        action: "customer.deleted",
        entity: "customer",
        entityId: row.id,
        after: { cancelledAppointments: cancelledIds.length },
      },
      now,
    );

    return { authUserId: row.authUserId, cancelledAppointmentIds: cancelledIds };
  });
}

/**
 * Suppression de son compte par le client (R-75). Refusée tant qu'un RDV tombe dans le délai de modification : on ne
 * contourne pas la règle des 48 h en supprimant son compte (R-30) ; le client appelle le salon.
 */
export async function deleteAccount(
  db: Database,
  driver: AuthDriver,
  customerId: string,
  raw: unknown,
  context: Context = {},
): Promise<ProfileResult> {
  const parsed = validate(deleteAccountSchema, raw);
  if (!parsed.ok) return { ok: false, error: "invalid", fieldErrors: parsed.errors };
  const row = await loadActive(db, customerId);
  if (!row) return { ok: false, error: "failed" };

  const refused = await checkPassword(db, driver, row, parsed.data.password, context.now);
  if (refused) return refused;

  let result;
  try {
    result = await anonymizeCustomer(
      db,
      { customerId, actor: { type: "customer", id: customerId }, onImminent: "refuse" },
      context.now,
    );
  } catch (error) {
    if (error instanceof DomainError && error.code === "imminent_appointment") {
      return { ok: false, error: "imminent_appointment" };
    }
    throw error;
  }

  // La fiche est déjà anonymisée : l'accès à l'espace client est fermé même si la suppression du compte échoue.
  await driver.signOut();
  if (result.authUserId) await driver.deleteUser(result.authUserId);
  return { ok: true };
}

/** Le client a-t-il un RDV dans le délai de modification ? Sert à prévenir avant même de demander le mot de passe. */
export async function hasImminentAppointment(
  db: Database,
  customerId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const { changeCutoffHours } = await loadSettings(db);
  const limit = new Date(now.getTime() + changeCutoffHours * 3_600_000);
  const rows = await db
    .select({ id: appointment.id })
    .from(appointment)
    .where(
      and(
        eq(appointment.customerId, customerId),
        eq(appointment.status, "confirmed"),
        gt(appointment.startsAt, now),
        lt(appointment.startsAt, limit),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
