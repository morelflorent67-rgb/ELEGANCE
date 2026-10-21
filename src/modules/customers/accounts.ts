import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import type { Database } from "@/db/types";
import { appointment, customer } from "@/db/schema";
import { recordAudit } from "@/modules/audit/record";
import type { AuthDriver } from "@/modules/auth/types";
import { loadSettings } from "@/modules/availability";
import { hitRateLimit } from "@/modules/security/rate-limit";
import {
  loginSchema,
  newPasswordSchema,
  resetRequestSchema,
  signUpSchema,
  validate,
  type FieldErrors,
} from "./schemas";

export type CustomerRow = typeof customer.$inferSelect;

/** Fiche client sans rien de sensible, utilisable côté interface. */
export interface CustomerProfile {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

export const toProfile = (row: CustomerRow): CustomerProfile => ({
  id: row.id,
  firstName: row.firstName ?? "",
  lastName: row.lastName ?? "",
  phone: row.phone ?? "",
  email: row.email ?? "",
});

export type AccountResult =
  | { ok: true; customer: CustomerProfile }
  | { ok: false; error: "invalid"; fieldErrors: FieldErrors }
  | { ok: false; error: "email_taken" | "invalid_credentials" | "failed" }
  | { ok: false; error: "rate_limited"; retryAfterSeconds: number };

interface Context {
  /** Adresse de l'appelant, pour limiter les essais. */
  ip: string;
  now?: Date;
}

/** Limites d'essais : par adresse IP et par email, sur une heure pour l'inscription, 15 minutes pour la connexion. */
const LIMITS = {
  signupIp: { limit: 10, windowSeconds: 3600 },
  signupEmail: { limit: 5, windowSeconds: 3600 },
  loginIp: { limit: 30, windowSeconds: 900 },
  loginEmail: { limit: 10, windowSeconds: 900 },
  resetIp: { limit: 10, windowSeconds: 3600 },
  resetEmail: { limit: 3, windowSeconds: 3600 },
} as const;

async function limited(
  db: Database,
  checks: { key: string; limit: number; windowSeconds: number }[],
  now?: Date,
): Promise<number | null> {
  let retry: number | null = null;
  for (const { key, ...options } of checks) {
    const result = await hitRateLimit(db, key, options, now);
    if (!result.allowed) retry = Math.max(retry ?? 0, result.retryAfterSeconds);
  }
  return retry;
}

/**
 * Création du compte (R-70, R-71, D-42) : valide, limite les essais, crée l'identité puis la fiche client, et laisse
 * le client connecté. Si la fiche ne peut pas être créée, l'identité est supprimée : pas de compte à moitié créé.
 */
export async function registerCustomer(
  db: Database,
  driver: AuthDriver,
  raw: unknown,
  context: Context,
): Promise<AccountResult> {
  const parsed = validate(signUpSchema, raw);
  if (!parsed.ok) return { ok: false, error: "invalid", fieldErrors: parsed.errors };
  const input = parsed.data;

  const retry = await limited(
    db,
    [
      { key: `signup:ip:${context.ip}`, ...LIMITS.signupIp },
      { key: `signup:email:${input.email}`, ...LIMITS.signupEmail },
    ],
    context.now,
  );
  if (retry !== null) return { ok: false, error: "rate_limited", retryAfterSeconds: retry };

  // D-79 : une fiche sans compte au même email (créée au salon ou importée) devient ce compte, avec son historique.
  // Une fiche qui a déjà un compte garde le refus habituel.
  const [existing] = await db
    .select({ id: customer.id, authUserId: customer.authUserId })
    .from(customer)
    .where(and(sql`lower(${customer.email}) = ${input.email}`, isNull(customer.anonymizedAt)));
  if (existing?.authUserId) return { ok: false, error: "email_taken" };

  const created = await driver.signUp({ email: input.email, password: input.password });
  if (!created.ok) {
    if (created.reason === "email_taken") return { ok: false, error: "email_taken" };
    if (created.reason === "weak_password") {
      return {
        ok: false,
        error: "invalid",
        fieldErrors: { password: "Choisissez un mot de passe plus solide." },
      };
    }
    return { ok: false, error: "failed" };
  }

  try {
    const details = {
      authUserId: created.user.id,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      email: input.email,
    };
    if (existing) {
      const row = await db.transaction(async (tx) => {
        // Rattachement seulement si la fiche est toujours sans compte : deux inscriptions simultanées ne la partagent pas.
        const [linked] = await tx
          .update(customer)
          .set(details)
          .where(
            and(
              eq(customer.id, existing.id),
              isNull(customer.authUserId),
              isNull(customer.anonymizedAt),
            ),
          )
          .returning();
        if (!linked) throw Object.assign(new Error("fiche déjà rattachée"), { code: "23505" });
        await recordAudit(tx, {
          actorType: "customer",
          actorId: linked.id,
          action: "customer.account_linked",
          entity: "customer",
          entityId: linked.id,
          after: { origin: linked.origin },
        });
        return linked;
      });
      return { ok: true, customer: toProfile(row) };
    }
    const [row] = await db.insert(customer).values(details).returning();
    return { ok: true, customer: toProfile(row) };
  } catch (error) {
    await driver.signOut();
    await driver.deleteUser(created.user.id);
    const code =
      (error as { code?: string; cause?: { code?: string } }).code ??
      (error as { cause?: { code?: string } }).cause?.code;
    if (code === "23505") return { ok: false, error: "email_taken" };
    throw error;
  }
}

/** Connexion d'un client. Même réponse pour un email inconnu et un mauvais mot de passe. */
export async function loginCustomer(
  db: Database,
  driver: AuthDriver,
  raw: unknown,
  context: Context,
): Promise<AccountResult> {
  const parsed = validate(loginSchema, raw);
  if (!parsed.ok) return { ok: false, error: "invalid", fieldErrors: parsed.errors };
  const { email, password } = parsed.data;

  const retry = await limited(
    db,
    [
      { key: `login:ip:${context.ip}`, ...LIMITS.loginIp },
      { key: `login:email:${email}`, ...LIMITS.loginEmail },
    ],
    context.now,
  );
  if (retry !== null) return { ok: false, error: "rate_limited", retryAfterSeconds: retry };

  const signedIn = await driver.signIn({ email, password });
  if (!signedIn.ok) {
    return {
      ok: false,
      error: signedIn.reason === "invalid_credentials" ? "invalid_credentials" : "failed",
    };
  }
  const [row] = await db
    .select()
    .from(customer)
    .where(and(eq(customer.authUserId, signedIn.user.id), isNull(customer.anonymizedAt)));
  if (!row) {
    // Compte sans fiche client (par exemple un compte de l'équipe) : pas d'accès à l'espace client.
    await driver.signOut();
    return { ok: false, error: "invalid_credentials" };
  }
  return { ok: true, customer: toProfile(row) };
}

/** Client de la session en cours, ou null. */
export async function currentCustomer(
  db: Database,
  driver: AuthDriver,
): Promise<CustomerProfile | null> {
  const user = await driver.currentUser();
  if (!user) return null;
  const [row] = await db
    .select()
    .from(customer)
    .where(and(eq(customer.authUserId, user.id), isNull(customer.anonymizedAt)));
  return row ? toProfile(row) : null;
}

export interface BookingState {
  /** R-52 : réservation en ligne bloquée par le gérant. */
  blocked: boolean;
  /** R-25 : RDV à venir et maximum autorisé. */
  upcoming: number;
  maxUpcoming: number;
}

/** Ce que le client peut faire en ligne, pour avertir dès l'étape d'identification (maquette). */
export async function customerBookingState(
  db: Database,
  customerId: string,
  now: Date = new Date(),
): Promise<BookingState> {
  const settings = await loadSettings(db);
  const [row] = await db
    .select({ blocked: customer.onlineBookingBlocked })
    .from(customer)
    .where(eq(customer.id, customerId));
  const [{ upcoming }] = await db
    .select({ upcoming: count() })
    .from(appointment)
    .where(
      and(
        eq(appointment.customerId, customerId),
        eq(appointment.status, "confirmed"),
        gt(appointment.startsAt, now),
      ),
    );
  return {
    blocked: row?.blocked ?? false,
    upcoming,
    maxUpcoming: settings.maxUpcomingPerCustomer,
  };
}

/** Demande de réinitialisation du mot de passe : répond toujours « ok » (aucune fuite sur l'existence du compte). */
export async function requestPasswordReset(
  db: Database,
  driver: AuthDriver,
  raw: unknown,
  redirectTo: string,
  context: Context,
): Promise<
  | { ok: true }
  | { ok: false; error: "invalid"; fieldErrors: FieldErrors }
  | { ok: false; error: "rate_limited"; retryAfterSeconds: number }
> {
  const parsed = validate(resetRequestSchema, raw);
  if (!parsed.ok) return { ok: false, error: "invalid", fieldErrors: parsed.errors };
  const retry = await limited(
    db,
    [
      { key: `reset:ip:${context.ip}`, ...LIMITS.resetIp },
      { key: `reset:email:${parsed.data.email}`, ...LIMITS.resetEmail },
    ],
    context.now,
  );
  if (retry !== null) return { ok: false, error: "rate_limited", retryAfterSeconds: retry };
  await driver.requestPasswordReset(parsed.data.email, redirectTo);
  return { ok: true };
}

/** Nouveau mot de passe, après le lien de réinitialisation. */
export async function setNewPassword(
  driver: AuthDriver,
  raw: unknown,
): Promise<
  | { ok: true }
  | { ok: false; error: "invalid"; fieldErrors: FieldErrors }
  | { ok: false; error: "failed" }
> {
  const parsed = validate(newPasswordSchema, raw);
  if (!parsed.ok) return { ok: false, error: "invalid", fieldErrors: parsed.errors };
  const updated = await driver.updatePassword(parsed.data.password);
  if (updated.ok) return { ok: true };
  if (updated.reason === "weak_password") {
    return {
      ok: false,
      error: "invalid",
      fieldErrors: { password: "Choisissez un mot de passe plus solide." },
    };
  }
  return { ok: false, error: "failed" };
}
