import { DateTime } from "luxon";
import type { Database } from "@/db/types";
import { slotsForDay } from "./engine";
import { loadSettings, loadSnapshot } from "./load";
import { eligibleStaff, resolveServices, type ServiceRow } from "./services";
import type { Audience, Slot } from "./types";

export interface DaySlots {
  date: string;
  slots: Slot[];
}

interface RangeInput {
  /** Premier jour, « AAAA-MM-JJ » (heure de Paris). */
  from: string;
  days: number;
  serviceIds: string[];
  staffId: string | "any";
  audience: Audience;
  now?: Date;
  /**
   * Déplacement d'un RDV existant : ses prestations et sa durée figées (R-16) remplacent celles de la carte,
   * et il ne bloque pas son propre nouveau créneau.
   */
  moving?: { appointmentId: string; services: ServiceRow[]; durationMinutes: number };
}

/** Créneaux de plusieurs jours d'affilée, avec une seule lecture de la base. Jours fermés ou complets : liste vide. */
export async function getSlotsForRange(db: Database, input: RangeInput): Promise<DaySlots[]> {
  const { from, days, serviceIds, staffId, audience, moving } = input;
  const now = input.now ?? new Date();

  const services = moving
    ? { rows: moving.services, durationMinutes: moving.durationMinutes }
    : await resolveServices(db, serviceIds, audience);
  let candidates = await eligibleStaff(db, services.rows);
  if (staffId !== "any") candidates = candidates.filter((c) => c.id === staffId);
  const staffIds = candidates.map((c) => c.id);

  const { timezone } = await loadSettings(db);
  const first = DateTime.fromISO(from, { zone: timezone });
  const dates = Array.from({ length: days }, (_, i) => first.plus({ days: i }).toISODate()!);
  if (staffIds.length === 0) return dates.map((date) => ({ date, slots: [] }));

  const { snapshot } = await loadSnapshot(db, {
    from: first.startOf("day").toJSDate(),
    to: first
      .plus({ days: days - 1 })
      .endOf("day")
      .toJSDate(),
    staffIds,
    ...(moving ? { excludeAppointmentId: moving.appointmentId } : {}),
  });

  return dates.map((date) => ({
    date,
    slots: slotsForDay(snapshot, {
      date,
      durationMinutes: services.durationMinutes,
      staffIds,
      audience,
      now,
    }),
  }));
}

/** Premier jour qui a au moins un créneau, à partir de `from`, sur `searchDays` jours au plus ; sinon null. */
export async function getNextAvailableDay(
  db: Database,
  input: Omit<RangeInput, "days"> & { searchDays?: number },
): Promise<DaySlots | null> {
  const range = await getSlotsForRange(db, { ...input, days: input.searchDays ?? 60 });
  return range.find((day) => day.slots.length > 0) ?? null;
}
