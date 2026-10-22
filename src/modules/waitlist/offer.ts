import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/types";
import { service, staff, waitlistEntry, waitlistOffer } from "@/db/schema";
import { DomainError, type DomainErrorCode } from "@/lib/domain-error";
import { createAppointment, type CreatedAppointment } from "@/modules/booking";

export type OfferState = "pending" | "accepted" | "declined" | "expired" | "lost";

export interface OfferView {
  id: string;
  entryId: string;
  /** « pending » devient « expired » dès que le délai est passé, même avant le passage du traitement. */
  state: OfferState;
  startsAt: Date;
  endsAt: Date;
  expiresAt: Date;
  staffFirstName: string;
  items: { name: string; priceCents: number; durationMin: number }[];
  totalPriceCents: number;
}

/** Refus qui signent une place devenue impossible : l'offre est perdue, la personne suivante aura sa chance. */
const LOST_CODES: DomainErrorCode[] = [
  "slot_unavailable",
  "too_soon",
  "too_far",
  "closed",
  "outside_hours",
  "off_grid",
  "in_past",
  "staff_not_eligible",
  "unknown_service",
  "not_bookable_online",
  "mixed_categories",
];

/** L'offre d'un client, avec ce qu'il faut pour l'afficher ; null si elle n'est pas à lui. */
export async function loadOffer(
  db: Database,
  customerId: string,
  offerId: string,
  now: Date = new Date(),
): Promise<OfferView | null> {
  const [row] = await db
    .select({
      offer: waitlistOffer,
      staffFirstName: staff.firstName,
      serviceIds: waitlistEntry.serviceIds,
    })
    .from(waitlistOffer)
    .innerJoin(waitlistEntry, eq(waitlistEntry.id, waitlistOffer.entryId))
    .innerJoin(staff, eq(staff.id, waitlistOffer.staffId))
    .where(and(eq(waitlistOffer.id, offerId), eq(waitlistOffer.customerId, customerId)));
  if (!row) return null;

  const rows = await db
    .select({
      id: service.id,
      name: service.name,
      priceCents: service.priceCents,
      durationMin: service.durationMin,
    })
    .from(service)
    .where(inArray(service.id, row.serviceIds));
  // L'ordre choisi par le client (R-14) est celui de l'inscription.
  const items = row.serviceIds
    .map((id) => rows.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => !!r);

  const { offer } = row;
  const state: OfferState =
    offer.status === "pending" && offer.expiresAt.getTime() <= now.getTime()
      ? "expired"
      : offer.status;
  return {
    id: offer.id,
    entryId: offer.entryId,
    state,
    startsAt: offer.startsAt,
    endsAt: offer.endsAt,
    expiresAt: offer.expiresAt,
    staffFirstName: row.staffFirstName,
    items: items.map(({ name, priceCents, durationMin }) => ({ name, priceCents, durationMin })),
    totalPriceCents: items.reduce((sum, i) => sum + i.priceCents, 0),
  };
}

/**
 * Prend la place gardée (D-99, D-100) : crée le RDV par le chemin ordinaire, qui revérifie tout (délais, limite de RDV
 * à venir R-25, coiffeur et créneau encore libres), et clôt l'offre et l'inscription dans la même transaction.
 * Une place devenue impossible rend l'offre « perdue » ; une limite de RDV atteinte la laisse en cours (le client peut
 * annuler un RDV, puis revenir avant la fin du délai).
 */
export async function acceptOffer(
  db: Database,
  input: { customerId: string; offerId: string },
  now: Date = new Date(),
): Promise<CreatedAppointment> {
  try {
    return await db.transaction(async (tx) => {
      const [offer] = await tx
        .select()
        .from(waitlistOffer)
        .where(and(eq(waitlistOffer.id, input.offerId), eq(waitlistOffer.customerId, input.customerId)))
        .for("update");
      if (!offer) throw new DomainError("offer_not_found");
      if (offer.status !== "pending") throw new DomainError("offer_closed");
      if (offer.expiresAt.getTime() <= now.getTime()) throw new DomainError("offer_expired");

      const [entry] = await tx.select().from(waitlistEntry).where(eq(waitlistEntry.id, offer.entryId));
      const created = await createAppointment(
        tx,
        {
          customerId: input.customerId,
          serviceIds: entry.serviceIds,
          staffId: offer.staffId,
          startsAt: offer.startsAt,
          source: "online",
          holdOfferId: offer.id,
        },
        now,
      );
      await tx.update(waitlistOffer).set({ status: "accepted" }).where(eq(waitlistOffer.id, offer.id));
      await tx.update(waitlistEntry).set({ status: "fulfilled" }).where(eq(waitlistEntry.id, entry.id));
      return created;
    });
  } catch (error) {
    if (error instanceof DomainError && (LOST_CODES.includes(error.code) || error.code === "offer_expired")) {
      await db
        .update(waitlistOffer)
        .set({ status: error.code === "offer_expired" ? "expired" : "lost" })
        .where(and(eq(waitlistOffer.id, input.offerId), eq(waitlistOffer.status, "pending")));
    }
    throw error;
  }
}

/** « Pas cette fois » : l'offre est refusée, l'inscription reste. Sans effet si l'offre n'est plus en cours. */
export async function declineOffer(
  db: Database,
  input: { customerId: string; offerId: string },
  now: Date = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const [offer] = await tx
      .select()
      .from(waitlistOffer)
      .where(and(eq(waitlistOffer.id, input.offerId), eq(waitlistOffer.customerId, input.customerId)))
      .for("update");
    if (!offer) throw new DomainError("offer_not_found");
    if (offer.status !== "pending") return;
    await tx
      .update(waitlistOffer)
      .set({ status: offer.expiresAt.getTime() <= now.getTime() ? "expired" : "declined" })
      .where(eq(waitlistOffer.id, offer.id));
  });
}

/** « Quitter la liste » : l'inscription se ferme, son offre en cours est refusée (sa place passe à la suivante). */
export async function leaveWaitlist(
  db: Database,
  input: { customerId: string; entryId: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [entry] = await tx
      .select()
      .from(waitlistEntry)
      .where(and(eq(waitlistEntry.id, input.entryId), eq(waitlistEntry.customerId, input.customerId)))
      .for("update");
    if (!entry) throw new DomainError("offer_not_found");
    if (entry.status !== "active") return;
    await tx.update(waitlistEntry).set({ status: "removed" }).where(eq(waitlistEntry.id, entry.id));
    await tx
      .update(waitlistOffer)
      .set({ status: "declined" })
      .where(and(eq(waitlistOffer.entryId, entry.id), eq(waitlistOffer.status, "pending")));
  });
}

export interface WaitlistLine {
  id: string;
  days: string[];
  window: "morning" | "afternoon" | "day";
  staffFirstName: string | null;
  serviceNames: string[];
  /** Offre en cours (non expirée), s'il y en a une. */
  offer: { id: string; startsAt: Date; expiresAt: Date; staffFirstName: string } | null;
}

/** Les inscriptions en cours d'un client, pour « Mes rendez-vous » (avec « Me retirer »). */
export async function listCustomerWaitlist(
  db: Database,
  customerId: string,
  now: Date = new Date(),
): Promise<WaitlistLine[]> {
  const entries = await db
    .select()
    .from(waitlistEntry)
    .where(and(eq(waitlistEntry.customerId, customerId), eq(waitlistEntry.status, "active")))
    .orderBy(asc(waitlistEntry.createdAt));
  if (entries.length === 0) return [];

  const [offers, staffRows, serviceRows] = await Promise.all([
    db
      .select({ offer: waitlistOffer, staffFirstName: staff.firstName })
      .from(waitlistOffer)
      .innerJoin(staff, eq(staff.id, waitlistOffer.staffId))
      .where(
        and(
          inArray(
            waitlistOffer.entryId,
            entries.map((e) => e.id),
          ),
          eq(waitlistOffer.status, "pending"),
        ),
      ),
    db.select({ id: staff.id, firstName: staff.firstName }).from(staff),
    db.select({ id: service.id, name: service.name }).from(service),
  ]);

  return entries.map((e) => {
    const found = offers.find(
      (o) => o.offer.entryId === e.id && o.offer.expiresAt.getTime() > now.getTime(),
    );
    return {
      id: e.id,
      days: e.days,
      window: e.window,
      staffFirstName: staffRows.find((s) => s.id === e.staffId)?.firstName ?? null,
      serviceNames: e.serviceIds.map((id) => serviceRows.find((s) => s.id === id)?.name ?? ""),
      offer: found
        ? {
            id: found.offer.id,
            startsAt: found.offer.startsAt,
            expiresAt: found.offer.expiresAt,
            staffFirstName: found.staffFirstName,
          }
        : null,
    };
  });
}
