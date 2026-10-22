import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/types";
import { appointment, customer } from "@/db/schema";
import { DomainError } from "@/lib/domain-error";
import { normalizePhone } from "@/lib/phone";
import { recordAudit } from "@/modules/audit/record";
import { assertActiveAuthor } from "@/modules/staff/team";
import { validate, type FieldErrors } from "./schemas";

// Fiches sans compte (D-70) : le salon les crée à la tablette (D-76) ou les importe du fichier du salon (D-77). Une
// fiche sans compte n'a pas d'accès en ligne ; elle reçoit les emails si elle a une adresse (D-81) et devient un compte
// quand la personne s'inscrit avec le même email (D-79). Deux fiches au même numéro se signalent et le gérant peut
// les fusionner (D-79).

const name = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Indiquez le ${label}.`)
    .max(80, `Le ${label} est trop long (80 caractères au plus).`);

/** D-76 : prénom, nom et téléphone obligatoires ; email facultatif. */
export const salonCustomerSchema = z.object({
  firstName: name("prénom"),
  lastName: name("nom"),
  phone: z
    .string()
    .trim()
    .min(1, "Indiquez le téléphone.")
    .refine(
      (value) => normalizePhone(value) !== null,
      "Ce numéro de téléphone ne semble pas valide.",
    )
    .transform((value) => normalizePhone(value)!),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .transform((value) => (value === "" ? null : value))
    .pipe(z.email("Cette adresse email ne semble pas valide.").nullable()),
});

export interface SameCustomer {
  id: string;
  name: string;
  hasAccount: boolean;
}

export type SalonCustomerResult =
  | { ok: true; customerId: string }
  | { ok: false; error: "invalid"; fieldErrors: FieldErrors }
  /** L'email est déjà celui d'une autre fiche : un email = une fiche (R-70). */
  | { ok: false; error: "email_taken"; existing: SameCustomer }
  /** Une fiche a déjà ce numéro : la tablette propose de la choisir, ou de créer quand même (une famille partage un numéro). */
  | { ok: false; error: "phone_exists"; existing: SameCustomer[] };

const fullName = (row: { firstName: string | null; lastName: string | null }) =>
  `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();

async function byEmail(
  db: Database,
  email: string,
  exceptId?: string,
): Promise<SameCustomer | null> {
  const [row] = await db
    .select({
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      authUserId: customer.authUserId,
    })
    .from(customer)
    .where(
      and(
        sql`lower(${customer.email}) = ${email.toLowerCase()}`,
        ...(exceptId ? [ne(customer.id, exceptId)] : []),
      ),
    );
  return row ? { id: row.id, name: fullName(row), hasAccount: !!row.authUserId } : null;
}

/** Les autres fiches au même numéro, fiches supprimées exclues (D-79). */
export async function findSamePhone(
  db: Database,
  phone: string,
  exceptId?: string,
): Promise<SameCustomer[]> {
  const rows = await db
    .select({
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      authUserId: customer.authUserId,
    })
    .from(customer)
    .where(
      and(
        eq(customer.phone, phone),
        isNull(customer.anonymizedAt),
        ...(exceptId ? [ne(customer.id, exceptId)] : []),
      ),
    )
    .orderBy(asc(customer.lastName), asc(customer.firstName))
    .limit(5);
  return rows.map((r) => ({ id: r.id, name: fullName(r), hasAccount: !!r.authUserId }));
}

const isUniqueViolation = (error: unknown) => {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e?.code ?? e?.cause?.code) === "23505";
};

/**
 * Le salon crée une fiche pour une personne sans compte (R-26, D-76). Refusée si l'email est déjà pris ; si une fiche a
 * déjà ce numéro, la tablette le dit d'abord, et `samePhoneConfirmed` crée quand même.
 */
export async function createSalonCustomer(
  db: Database,
  raw: unknown,
  options: { samePhoneConfirmed?: boolean } = {},
  now: Date = new Date(),
): Promise<SalonCustomerResult> {
  const parsed = validate(salonCustomerSchema, raw);
  if (!parsed.ok) return { ok: false, error: "invalid", fieldErrors: parsed.errors };
  const input = parsed.data;

  try {
    return await db.transaction(async (tx): Promise<SalonCustomerResult> => {
      if (input.email) {
        const taken = await byEmail(tx, input.email);
        if (taken) return { ok: false, error: "email_taken", existing: taken };
      }
      if (!options.samePhoneConfirmed) {
        const same = await findSamePhone(tx, input.phone);
        if (same.length > 0) return { ok: false, error: "phone_exists", existing: same };
      }
      const [row] = await tx
        .insert(customer)
        .values({ ...input, origin: "salon", createdAt: now })
        .returning({ id: customer.id });
      // Ni le nom ni le numéro au journal (principe 6) ; la tablette n'a pas encore d'auteur à ce stade.
      await recordAudit(
        tx,
        {
          actorType: "staff",
          actorId: null,
          action: "customer.created",
          entity: "customer",
          entityId: row.id,
          after: { origin: "salon", withEmail: !!input.email },
        },
        now,
      );
      return { ok: true, customerId: row.id };
    });
  } catch (error) {
    // Course perdue : une autre fiche a pris cet email entre la vérification et l'écriture.
    if (!isUniqueViolation(error) || !input.email) throw error;
    const taken = await byEmail(db, input.email);
    if (!taken) throw error;
    return { ok: false, error: "email_taken", existing: taken };
  }
}

/**
 * Le salon corrige une fiche sans compte (D-76) : prénom, nom, téléphone, email. Une fiche avec compte appartient à son
 * titulaire (« Mes informations », R-76) : la tablette ne la change pas. Signée par le membre qui corrige (R-74).
 */
export async function updateSalonCustomer(
  db: Database,
  input: { customerId: string; authorStaffId: string | null | undefined; fields: unknown },
  now: Date = new Date(),
): Promise<Exclude<SalonCustomerResult, { error: "phone_exists" }>> {
  const parsed = validate(salonCustomerSchema, input.fields);
  if (!parsed.ok) return { ok: false, error: "invalid", fieldErrors: parsed.errors };
  const fields = parsed.data;

  return db.transaction(async (tx) => {
    const authorId = await assertActiveAuthor(tx, input.authorStaffId);
    const [row] = await tx
      .select()
      .from(customer)
      .where(and(eq(customer.id, input.customerId), isNull(customer.anonymizedAt)))
      .for("update");
    if (!row) throw new DomainError("unknown_customer");
    if (row.authUserId) throw new DomainError("customer_has_account");

    if (fields.email) {
      const taken = await byEmail(tx, fields.email, row.id);
      if (taken) return { ok: false, error: "email_taken", existing: taken };
    }
    await tx.update(customer).set(fields).where(eq(customer.id, row.id));
    // Le journal dit ce qui a changé, jamais les valeurs (principe 6 : pas de données personnelles).
    const changed = (Object.keys(fields) as (keyof typeof fields)[]).filter(
      (key) => (row[key] ?? null) !== fields[key],
    );
    await recordAudit(
      tx,
      {
        actorType: "staff",
        actorId: authorId,
        action: "customer.updated",
        entity: "customer",
        entityId: row.id,
        after: { changed },
      },
      now,
    );
    return { ok: true, customerId: row.id };
  });
}

/**
 * Le gérant fusionne deux fiches de la même personne (D-79) : les RDV de l'une passent sur l'autre, qui complète ses
 * champs vides (email, nom, téléphone) et garde l'historique repris. La fiche qui a un compte est toujours celle qui
 * reste ; deux comptes ne se fusionnent pas. La fiche fusionnée disparaît.
 */
export async function mergeCustomers(
  db: Database,
  input: { keepId: string; mergeId: string; actorId: string | null },
  now: Date = new Date(),
): Promise<{ keptId: string }> {
  if (input.keepId === input.mergeId) throw new DomainError("unknown_customer");
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(customer)
      .where(
        and(inArray(customer.id, [input.keepId, input.mergeId]), isNull(customer.anonymizedAt)),
      )
      .orderBy(asc(customer.id))
      .for("update");
    if (rows.length !== 2) throw new DomainError("unknown_customer");
    const [a, b] = rows;
    if (a.authUserId && b.authUserId) throw new DomainError("customers_both_have_accounts");

    const asked = rows.find((r) => r.id === input.keepId)!;
    const other = rows.find((r) => r.id === input.mergeId)!;
    const keep = other.authUserId ? other : asked;
    const gone = keep === asked ? other : asked;

    const moved = await tx
      .update(appointment)
      .set({ customerId: keep.id })
      .where(eq(appointment.customerId, gone.id))
      .returning({ id: appointment.id });
    // La fiche fusionnée part avant la mise à jour : son email peut passer sur celle qui reste (un email = une fiche).
    await tx.delete(customer).where(eq(customer.id, gone.id));

    const latest = [keep.legacyLastVisitOn, gone.legacyLastVisitOn]
      .filter((d): d is string => !!d)
      .sort()
      .at(-1);
    const visits =
      keep.legacyVisits === null && gone.legacyVisits === null
        ? null
        : (keep.legacyVisits ?? 0) + (gone.legacyVisits ?? 0);
    await tx
      .update(customer)
      .set({
        firstName: keep.firstName || gone.firstName,
        lastName: keep.lastName || gone.lastName,
        phone: keep.phone || gone.phone,
        email: keep.email || gone.email,
        onlineBookingBlocked: keep.onlineBookingBlocked || gone.onlineBookingBlocked,
        reviewOptOut: keep.reviewOptOut || gone.reviewOptOut,
        winbackOptOut: keep.winbackOptOut || gone.winbackOptOut,
        legacyVisits: visits,
        legacyLastVisitOn: latest ?? null,
        originNoticeSentAt: keep.originNoticeSentAt ?? gone.originNoticeSentAt,
      })
      .where(eq(customer.id, keep.id));
    await recordAudit(
      tx,
      {
        actorType: "manager",
        actorId: input.actorId,
        action: "customer.merged",
        entity: "customer",
        entityId: keep.id,
        after: { mergedId: gone.id, movedAppointments: moved.length },
      },
      now,
    );
    return { keptId: keep.id };
  });
}
