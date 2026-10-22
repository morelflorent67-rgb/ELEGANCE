import { DateTime } from "luxon";
import type { Audience, BusyInterval, EngineSettings, Slot, SlotCheck, Snapshot } from "./types";

// Cœur du calcul des créneaux : fonctions pures, sans base ni interface (principe 1).
// Les heures arrivent et repartent en UTC (Date) ; tout calcul de jour et d'horaire se fait à l'heure de Paris.

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const stepFor = (settings: EngineSettings, audience: Audience) =>
  audience === "online" ? settings.onlineSlotStepMinutes : settings.salonSlotStepMinutes;

/** Instant correspondant à `minuteOfDay` (heure locale) le jour `date` (« AAAA-MM-JJ »). */
function localInstant(date: string, minuteOfDay: number, zone: string): DateTime {
  return DateTime.fromISO(date, { zone }).set({
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
  });
}

/** Plages d'ouverture du jour, en minutes locales ; vide si le salon est fermé (jour de repos ou fermeture, R-01, R-03). */
export function openRangesOn(snapshot: Snapshot, date: string): { from: number; to: number }[] {
  if (snapshot.closures.some((c) => c.startsOn <= date && date <= c.endsOn)) return [];
  const weekday = DateTime.fromISO(date, { zone: snapshot.settings.timezone }).weekday;
  return snapshot.openingHours
    .filter((r) => r.weekday === weekday)
    .map((r) => ({ from: minutesOf(r.opensAt), to: minutesOf(r.closesAt) }))
    .sort((a, b) => a.from - b.from);
}

const overlaps = (busy: BusyInterval, start: Date, end: Date) =>
  busy.startsAt < end && busy.endsAt > start;

/**
 * Un RDV peut-il commencer à `startsAt` pour ce coiffeur ?
 * Vérifie, dans l'ordre : passé, délais en ligne (R-06), jour d'ouverture (R-01, R-03), grille (R-04),
 * plage horaire sans pause ni dépassement de 19 h (R-04, R-05), puis disponibilité du coiffeur (R-21, R-22).
 */
export function checkSlot(
  snapshot: Snapshot,
  input: {
    staffId: string;
    startsAt: Date;
    durationMinutes: number;
    audience: Audience;
    now: Date;
  },
): SlotCheck {
  const { settings } = snapshot;
  const zone = settings.timezone;
  const { staffId, startsAt, durationMinutes, audience, now } = input;
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

  if (startsAt < now) return { ok: false, reason: "in_past" };

  if (audience === "online") {
    if (startsAt.getTime() < now.getTime() + settings.minNoticeMinutes * 60_000) {
      return { ok: false, reason: "too_soon" };
    }
    const horizon = DateTime.fromJSDate(now, { zone }).plus({ days: settings.maxHorizonDays });
    if (startsAt.getTime() > horizon.toMillis()) return { ok: false, reason: "too_far" };
  }

  const local = DateTime.fromJSDate(startsAt, { zone });
  const date = local.toISODate()!;
  const ranges = openRangesOn(snapshot, date);
  if (ranges.length === 0) return { ok: false, reason: "closed" };

  const step = stepFor(settings, audience);
  const startMinute = local.hour * 60 + local.minute;
  if (local.second !== 0 || local.millisecond !== 0 || startMinute % step !== 0) {
    return { ok: false, reason: "off_grid" };
  }

  const endMinute = startMinute + durationMinutes;
  if (!ranges.some((r) => r.from <= startMinute && endMinute <= r.to)) {
    return { ok: false, reason: "outside_hours" };
  }

  const taken =
    snapshot.appointments.some((a) => a.staffId === staffId && overlaps(a, startsAt, endsAt)) ||
    snapshot.absences.some((a) => a.staffId === staffId && overlaps(a, startsAt, endsAt));
  if (taken) return { ok: false, reason: "busy" };

  // D-100 : une place gardée pour la liste d'attente n'est pas réservable en ligne par quelqu'un d'autre.
  if (
    audience === "online" &&
    snapshot.holds?.some((h) => h.staffId === staffId && overlaps(h, startsAt, endsAt))
  ) {
    return { ok: false, reason: "held" };
  }

  return { ok: true };
}

/** Créneaux d'un jour, avec les coiffeurs libres à chaque horaire (au moins un). */
export function slotsForDay(
  snapshot: Snapshot,
  input: {
    date: string;
    durationMinutes: number;
    staffIds: string[];
    audience: Audience;
    now: Date;
  },
): Slot[] {
  const { settings } = snapshot;
  const { date, durationMinutes, staffIds, audience, now } = input;
  const step = stepFor(settings, audience);
  const slots: Slot[] = [];

  for (const range of openRangesOn(snapshot, date)) {
    const first = Math.ceil(range.from / step) * step;
    for (let minute = first; minute + durationMinutes <= range.to; minute += step) {
      const startsAt = localInstant(date, minute, settings.timezone).toJSDate();
      const free = staffIds.filter(
        (staffId) => checkSlot(snapshot, { staffId, startsAt, durationMinutes, audience, now }).ok,
      );
      if (free.length > 0) slots.push({ startsAt, staffIds: free });
    }
  }
  return slots;
}

/**
 * « Sans préférence » (R-20) : parmi les coiffeurs libres, celui qui a le moins de RDV ce jour-là ;
 * à égalité, le premier de la liste (ordre d'affichage). `freeStaffIds` doit être dans l'ordre d'affichage.
 */
export function pickStaff(
  freeStaffIds: string[],
  appointments: BusyInterval[],
  date: string,
  zone: string,
): string {
  const countOn = (staffId: string) =>
    appointments.filter(
      (a) =>
        a.staffId === staffId && DateTime.fromJSDate(a.startsAt, { zone }).toISODate() === date,
    ).length;

  return freeStaffIds.reduce((best, candidate) =>
    countOn(candidate) < countOn(best) ? candidate : best,
  );
}
