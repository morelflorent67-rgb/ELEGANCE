import { and, gt, gte, inArray, lt, lte, ne } from "drizzle-orm";
import { DateTime } from "luxon";
import type { Database } from "@/db/types";
import { absence, appointment, closure, openingHours, salonSettings } from "@/db/schema";
import type { Snapshot } from "./types";

/** Statuts qui occupent encore un coiffeur (R-23) : une annulation libère le créneau. */
export const OCCUPYING_STATUSES = ["confirmed", "honored", "no_show"] as const;

export type SalonSettingsRow = typeof salonSettings.$inferSelect;

export async function loadSettings(db: Database): Promise<SalonSettingsRow> {
  const [settings] = await db.select().from(salonSettings).limit(1);
  if (!settings) throw new Error("Réglages du salon absents : lancer `pnpm db:seed`.");
  return settings;
}

/**
 * Charge ce qu'il faut pour calculer les créneaux sur la fenêtre [from, to] (instants) :
 * réglages, horaires, fermetures, RDV occupants et absences des coiffeurs demandés.
 * `excludeAppointmentId` : un RDV qu'on déplace ne doit pas bloquer son propre nouveau créneau.
 */
export async function loadSnapshot(
  db: Database,
  input: { from: Date; to: Date; staffIds: string[]; excludeAppointmentId?: string },
): Promise<{ snapshot: Snapshot; settings: SalonSettingsRow }> {
  const { from, to, staffIds, excludeAppointmentId } = input;
  const settings = await loadSettings(db);
  const zone = settings.timezone;
  const firstDay = DateTime.fromJSDate(from, { zone }).toISODate()!;
  const lastDay = DateTime.fromJSDate(to, { zone }).toISODate()!;

  const [hours, closures, appointments, absences] = await Promise.all([
    db.select().from(openingHours),
    db
      .select()
      .from(closure)
      .where(and(lte(closure.startsOn, lastDay), gte(closure.endsOn, firstDay))),
    staffIds.length === 0
      ? []
      : db
          .select({
            staffId: appointment.staffId,
            startsAt: appointment.startsAt,
            endsAt: appointment.endsAt,
          })
          .from(appointment)
          .where(
            and(
              inArray(appointment.staffId, staffIds),
              inArray(appointment.status, [...OCCUPYING_STATUSES]),
              lt(appointment.startsAt, to),
              gt(appointment.endsAt, from),
              ...(excludeAppointmentId ? [ne(appointment.id, excludeAppointmentId)] : []),
            ),
          ),
    staffIds.length === 0
      ? []
      : db
          .select({ staffId: absence.staffId, startsAt: absence.startsAt, endsAt: absence.endsAt })
          .from(absence)
          .where(
            and(
              inArray(absence.staffId, staffIds),
              lt(absence.startsAt, to),
              gt(absence.endsAt, from),
            ),
          ),
  ]);

  return {
    settings,
    snapshot: {
      settings: {
        timezone: settings.timezone,
        minNoticeMinutes: settings.minNoticeMinutes,
        maxHorizonDays: settings.maxHorizonDays,
        onlineSlotStepMinutes: settings.onlineSlotStepMinutes,
        salonSlotStepMinutes: settings.salonSlotStepMinutes,
      },
      openingHours: hours.map((h) => ({
        weekday: h.weekday,
        opensAt: h.opensAt,
        closesAt: h.closesAt,
      })),
      closures: closures.map((c) => ({ startsOn: c.startsOn, endsOn: c.endsOn })),
      appointments,
      absences,
    },
  };
}
