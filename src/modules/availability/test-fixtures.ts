import type { BusyInterval, Snapshot } from "./types";

export const PARIS = "Europe/Paris";

/**
 * Heure de Paris → instant, pour les tests : at("2026-11-03", "10:30").
 * Décalage fixe selon la date : heure d'été (UTC+2) du 29/03/2026 au 24/10/2026 inclus, puis UTC+1.
 * Les tests évitent les dates de changement d'heure et celles d'après mars 2027.
 */
export function at(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const day = Date.UTC(y, m - 1, d);
  const summer = day >= Date.UTC(2026, 2, 29) && day <= Date.UTC(2026, 9, 24);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - (summer ? 2 : 1), mm));
}

export const ORHAN = "orhan";
export const ENES = "enes";
export const KAAN = "kaan";
export const TAHA = "taha";

export function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  // Mardi (2) au samedi (6), 10 h–12 h et 13 h–19 h : R-01.
  const openingHours = [2, 3, 4, 5, 6].flatMap((weekday) => [
    { weekday, opensAt: "10:00:00", closesAt: "12:00:00" },
    { weekday, opensAt: "13:00:00", closesAt: "19:00:00" },
  ]);
  return {
    settings: {
      timezone: PARIS,
      minNoticeMinutes: 60,
      maxHorizonDays: 42,
      onlineSlotStepMinutes: 30,
      salonSlotStepMinutes: 15,
    },
    openingHours,
    closures: [],
    appointments: [],
    absences: [],
    ...overrides,
  };
}

export function busy(staffId: string, date: string, from: string, to: string): BusyInterval {
  return { staffId, startsAt: at(date, from), endsAt: at(date, to) };
}
