"use server";

import { after } from "next/server";
import { DateTime } from "luxon";
import { z } from "zod";
import { db } from "@/db/client";
import { DomainError, type DomainErrorCode } from "@/lib/domain-error";
import { capitalize, formatDay, formatTime, parisDate } from "@/lib/format";
import { callerIp } from "@/lib/request-ip";
import { getAuthDriver } from "@/modules/auth";
import { getSlotsForRange, loadSettings } from "@/modules/availability";
import { createAppointment } from "@/modules/booking";
import { loadStaffChoices, type StaffChoice } from "@/modules/catalog";
import { currentCustomer } from "@/modules/customers/accounts";
import { sendEmailsForAppointment } from "@/modules/mail/send-now";
import { hitRateLimit } from "@/modules/security/rate-limit";

// Actions de la page de réservation. Rien n'est calculé dans le navigateur : créneaux, règles et refus viennent du serveur.

const serviceIds = z.array(z.uuid()).min(1).max(8);
const staffId = z.union([z.uuid(), z.literal("any")]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export interface SlotView {
  /** Début du RDV, en ISO UTC. */
  iso: string;
  /** « 10:00 », heure de Paris. */
  time: string;
}

export interface DayView {
  /** « AAAA-MM-JJ » */
  date: string;
  /** « Mercredi 21 octobre » */
  label: string;
  slots: SlotView[];
}

type Failure = {
  ok: false;
  error: DomainErrorCode | "invalid" | "rate_limited" | "not_signed_in" | "failed";
};

function toFailure(error: unknown): Failure {
  if (error instanceof DomainError) return { ok: false, error: error.code };
  console.error("Erreur inattendue dans l'action de réservation :", error);
  return { ok: false, error: "failed" };
}

const dayView = (date: string, slots: { startsAt: Date }[]): DayView => ({
  date,
  label: capitalize(
    formatDay(DateTime.fromISO(date, { zone: "Europe/Paris" }).set({ hour: 12 }).toJSDate()),
  ),
  slots: slots.map((s) => ({ iso: s.startsAt.toISOString(), time: formatTime(s.startsAt) })),
});

export async function fetchStaffChoices(
  input: unknown,
): Promise<{ ok: true; choices: StaffChoice[] } | Failure> {
  const parsed = z.object({ serviceIds }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    return { ok: true, choices: await loadStaffChoices(db(), parsed.data.serviceIds, "online") };
  } catch (error) {
    return toFailure(error);
  }
}

/** Créneaux de plusieurs jours. Seuls les jours avec au moins un créneau sont renvoyés. */
export async function fetchDays(input: unknown): Promise<{ ok: true; days: DayView[] } | Failure> {
  const parsed = z
    .object({ serviceIds, staffId, from: isoDate, days: z.number().int().min(1).max(14) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const limit = await hitRateLimit(db(), `slots:ip:${await callerIp()}`, {
      limit: 300,
      windowSeconds: 600,
    });
    if (!limit.allowed) return { ok: false, error: "rate_limited" };
    const range = await getSlotsForRange(db(), { ...parsed.data, audience: "online" });
    return {
      ok: true,
      days: range.filter((d) => d.slots.length > 0).map((d) => dayView(d.date, d.slots)),
    };
  } catch (error) {
    return toFailure(error);
  }
}

/** Date du jour à Paris, pour démarrer la liste des créneaux. */
export async function fetchToday(): Promise<{ today: string; lastBookable: string }> {
  const settings = await loadSettings(db());
  const now = new Date();
  return {
    today: parisDate(now),
    lastBookable: DateTime.fromJSDate(now, { zone: settings.timezone })
      .plus({ days: settings.maxHorizonDays })
      .toISODate()!,
  };
}

export async function confirmBooking(
  input: unknown,
): Promise<{ ok: true; appointmentId: string } | Failure> {
  const parsed = z
    .object({
      serviceIds,
      staffId,
      startsAt: z.iso.datetime(),
      note: z.string().max(300).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  try {
    const customer = await currentCustomer(db(), getAuthDriver());
    if (!customer) return { ok: false, error: "not_signed_in" };

    const limit = await hitRateLimit(db(), `book:customer:${customer.id}`, {
      limit: 10,
      windowSeconds: 900,
    });
    if (!limit.allowed) return { ok: false, error: "rate_limited" };

    const note = parsed.data.note?.trim();
    const created = await createAppointment(db(), {
      customerId: customer.id,
      serviceIds: parsed.data.serviceIds,
      staffId: parsed.data.staffId,
      startsAt: new Date(parsed.data.startsAt),
      source: "online",
      ...(note ? { note } : {}),
    });

    // R-60 : l'email part après la réponse. En cas d'échec, il reste dans la file et le cron le reprend.
    after(() => sendEmailsForAppointment(db(), created.id));
    return { ok: true, appointmentId: created.id };
  } catch (error) {
    return toFailure(error);
  }
}
