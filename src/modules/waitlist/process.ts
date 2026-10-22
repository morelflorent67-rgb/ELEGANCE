import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import type { Database } from "@/db/types";
import { customer, staff, waitlistEntry, waitlistOffer } from "@/db/schema";
import {
  eligibleStaff,
  loadSettings,
  loadSnapshot,
  pickStaff,
  resolveServices,
  slotsForDay,
} from "@/modules/availability";
import { enqueueEmail } from "@/modules/mail/outbox";
import { inWindow } from "./window";

/** Verrou qui fait passer un seul traitement de la liste à la fois (deux passages simultanés offriraient la même place). */
const WAITLIST_LOCK = 7_301_001;
/** Une offre n'est faite que si la place reste gardée au moins ce temps (ou toute la durée réglée si elle est plus courte). */
const MIN_HOLD_MINUTES = 5;

export interface WaitlistRun {
  /** Offres arrivées au bout de leur délai, sans réponse. */
  expired: number;
  /** Inscriptions fermées : tous les jours sont passés, ou la prestation n'existe plus. */
  closed: number;
  /** Offres faites pendant ce passage. */
  offers: { offerId: string; entryId: string }[];
}

/**
 * Fait avancer la liste d'attente (D-73, D-99, D-100). Idempotent : à appeler après tout ce qui libère une place
 * (annulation, déplacement, absence ou fermeture retirée), après chaque réponse à une offre, et par le cron.
 *
 * 1. les offres sans réponse au bout de leur délai expirent ;
 * 2. les inscriptions dont tous les jours sont passés se ferment ;
 * 3. pour chaque inscrite sans offre en cours, dans l'ordre d'inscription, la première place libre qui lui convient
 *    (jour, plage, coiffeur) lui est offerte et gardée `waitlist_hold_minutes` : une seule personne à la fois.
 *    Une place déjà refusée, ou laissée expirer, par cette inscrite ne lui est pas reproposée.
 * L'email de l'offre entre dans la file d'envoi dans la même transaction.
 */
export async function processWaitlist(db: Database, now: Date = new Date()): Promise<WaitlistRun> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${WAITLIST_LOCK})`);
    const settings = await loadSettings(tx);
    const zone = settings.timezone;
    const result: WaitlistRun = { expired: 0, closed: 0, offers: [] };

    const expired = await tx
      .update(waitlistOffer)
      .set({ status: "expired" })
      .where(and(eq(waitlistOffer.status, "pending"), lte(waitlistOffer.expiresAt, now)))
      .returning({ id: waitlistOffer.id });
    result.expired = expired.length;

    const today = DateTime.fromJSDate(now, { zone }).toISODate()!;
    const entries = await tx
      .select()
      .from(waitlistEntry)
      .where(eq(waitlistEntry.status, "active"))
      .orderBy(asc(waitlistEntry.createdAt), asc(waitlistEntry.id));
    const pending = await tx
      .select({ entryId: waitlistOffer.entryId })
      .from(waitlistOffer)
      .where(eq(waitlistOffer.status, "pending"));
    const hasOffer = new Set(pending.map((p) => p.entryId));

    const close = async (entryId: string) => {
      await tx.update(waitlistEntry).set({ status: "removed" }).where(eq(waitlistEntry.id, entryId));
      result.closed++;
    };

    for (const entry of entries) {
      if (hasOffer.has(entry.id)) continue;
      const futureDays = entry.days.filter((d) => d >= today);
      if (futureDays.length === 0) {
        await close(entry.id);
        continue;
      }

      const [client] = await tx.select().from(customer).where(eq(customer.id, entry.customerId));
      if (!client?.email || client.anonymizedAt || client.onlineBookingBlocked) continue;

      let services;
      try {
        services = await resolveServices(tx, entry.serviceIds, "online");
      } catch {
        // Une prestation retirée ou plus réservable en ligne : l'inscription n'a plus d'objet.
        await close(entry.id);
        continue;
      }
      let candidates = await eligibleStaff(tx, services.rows);
      if (entry.staffId) candidates = candidates.filter((c) => c.id === entry.staffId);
      if (candidates.length === 0) continue;
      const staffIds = candidates.map((c) => c.id);

      await tx
        .select({ id: staff.id })
        .from(staff)
        .where(inArray(staff.id, staffIds))
        .orderBy(staff.id)
        .for("update");

      const { snapshot } = await loadSnapshot(tx, {
        from: DateTime.fromISO(futureDays[0], { zone }).startOf("day").toJSDate(),
        to: DateTime.fromISO(futureDays[futureDays.length - 1], { zone }).endOf("day").toJSDate(),
        staffIds,
        now,
      });
      const refused = await tx
        .select({ staffId: waitlistOffer.staffId, startsAt: waitlistOffer.startsAt })
        .from(waitlistOffer)
        .where(
          and(
            eq(waitlistOffer.entryId, entry.id),
            inArray(waitlistOffer.status, ["declined", "expired"]),
          ),
        );
      const refusedKeys = new Set(refused.map((r) => `${r.staffId}|${r.startsAt.getTime()}`));

      const minHold = Math.min(settings.waitlistHoldMinutes, MIN_HOLD_MINUTES) * 60_000;
      let chosen: { staffId: string; startsAt: Date; expiresAt: Date } | null = null;
      for (const date of futureDays) {
        const slots = slotsForDay(snapshot, {
          date,
          durationMinutes: services.durationMinutes,
          staffIds,
          audience: "online",
          now,
        }).filter((s) => inWindow(entry.window, s.startsAt, zone));
        for (const slot of slots) {
          const free = slot.staffIds.filter(
            (id) => !refusedKeys.has(`${id}|${slot.startsAt.getTime()}`),
          );
          if (free.length === 0) continue;
          const staffId = pickStaff(free, snapshot.appointments, date, zone);
          // La place n'est plus réservable en ligne dans le délai minimal (R-06) : on la garde au plus jusque-là.
          const expiresAt = new Date(
            Math.min(
              now.getTime() + settings.waitlistHoldMinutes * 60_000,
              slot.startsAt.getTime() - settings.minNoticeMinutes * 60_000,
            ),
          );
          if (expiresAt.getTime() - now.getTime() < minHold) continue;
          chosen = { staffId, startsAt: slot.startsAt, expiresAt };
          break;
        }
        if (chosen) break;
      }
      if (!chosen) continue;

      const [offer] = await tx
        .insert(waitlistOffer)
        .values({
          entryId: entry.id,
          customerId: entry.customerId,
          staffId: chosen.staffId,
          startsAt: chosen.startsAt,
          endsAt: new Date(chosen.startsAt.getTime() + services.durationMinutes * 60_000),
          expiresAt: chosen.expiresAt,
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: waitlistOffer.id });
      if (!offer) continue;
      hasOffer.add(entry.id);
      await enqueueEmail(tx, {
        type: "waitlist_offer",
        toEmail: client.email,
        appointmentId: null,
        dedupeKey: `waitlist-offer:${offer.id}`,
        payload: { offerId: offer.id },
      });
      result.offers.push({ offerId: offer.id, entryId: entry.id });
    }
    return result;
  });
}
