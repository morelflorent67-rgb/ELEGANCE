import { and, count, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import type { Database } from "@/db/types";
import { customer, waitlistEntry } from "@/db/schema";
import { DomainError } from "@/lib/domain-error";
import {
  eligibleStaff,
  loadSettings,
  loadSnapshot,
  resolveServices,
  slotsForDay,
} from "@/modules/availability";
import { inWindow, type WaitlistWindow } from "./window";

/** Au plus 14 jours dans une inscription (contrainte de la base), et 5 inscriptions en cours par client. */
export const WAITLIST_MAX_DAYS = 14;
export const WAITLIST_MAX_ACTIVE = 5;

export interface JoinWaitlistInput {
  customerId: string;
  serviceIds: string[];
  /** Un coiffeur précis, ou « any » pour « Sans préférence » (R-20). */
  staffId: string | "any";
  /** Jours voulus, « AAAA-MM-JJ » (heure de Paris). */
  days: string[];
  window: WaitlistWindow;
}

/**
 * Inscrit un client à la liste d'attente (D-73, D-99). Refuse s'il reste une place qui lui convient : il peut la
 * réserver tout de suite (`slots_available`). Les jours doivent être dans l'horizon de réservation (R-06).
 */
export async function joinWaitlist(
  db: Database,
  input: JoinWaitlistInput,
  now: Date = new Date(),
): Promise<{ entryId: string }> {
  const days = [...new Set(input.days)].sort();
  if (days.length === 0 || days.length > WAITLIST_MAX_DAYS) throw new DomainError("invalid_waitlist");

  return db.transaction(async (tx) => {
    const [client] = await tx.select().from(customer).where(eq(customer.id, input.customerId)).for("update");
    if (!client || client.anonymizedAt) throw new DomainError("unknown_customer");
    if (client.onlineBookingBlocked) throw new DomainError("customer_blocked");

    const services = await resolveServices(tx, input.serviceIds, "online");
    let candidates = await eligibleStaff(tx, services.rows);
    if (input.staffId !== "any") candidates = candidates.filter((c) => c.id === input.staffId);
    if (candidates.length === 0) throw new DomainError("staff_not_eligible");
    const staffIds = candidates.map((c) => c.id);

    const settings = await loadSettings(tx);
    const zone = settings.timezone;
    const { snapshot } = await loadSnapshot(tx, {
      from: DateTime.fromISO(days[0], { zone }).startOf("day").toJSDate(),
      to: DateTime.fromISO(days[days.length - 1], { zone }).endOf("day").toJSDate(),
      staffIds,
      now,
    });
    const today = DateTime.fromJSDate(now, { zone }).toISODate()!;
    const last = DateTime.fromJSDate(now, { zone }).plus({ days: settings.maxHorizonDays }).toISODate()!;
    if (days.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d) || d < today || d > last)) {
      throw new DomainError("invalid_waitlist");
    }

    const [{ active }] = await tx
      .select({ active: count() })
      .from(waitlistEntry)
      .where(and(eq(waitlistEntry.customerId, input.customerId), eq(waitlistEntry.status, "active")));
    if (active >= WAITLIST_MAX_ACTIVE) throw new DomainError("waitlist_full");

    for (const date of days) {
      const slots = slotsForDay(snapshot, {
        date,
        durationMinutes: services.durationMinutes,
        staffIds,
        audience: "online",
        now,
      });
      if (slots.some((s) => inWindow(input.window, s.startsAt, zone))) {
        throw new DomainError("slots_available");
      }
    }

    const [entry] = await tx
      .insert(waitlistEntry)
      .values({
        customerId: input.customerId,
        serviceIds: input.serviceIds,
        staffId: input.staffId === "any" ? null : input.staffId,
        days,
        window: input.window,
        createdAt: now,
      })
      .returning({ id: waitlistEntry.id });
    return { entryId: entry.id };
  });
}
