import { DateTime } from "luxon";

/**
 * L'instant (UTC, ISO) d'une minute de la journée d'un jour affiché, à l'heure de Paris (principe 3). Null si la date
 * ou la minute est invalide. Sert au glisser-déposer : la tablette envoie « jour + minute », jamais une heure.
 */
export function parisInstant(date: string, minute: number): string | null {
  if (!Number.isInteger(minute) || minute < 0 || minute >= 24 * 60) return null;
  const start = DateTime.fromISO(date, { zone: "Europe/Paris" }).set({
    hour: Math.floor(minute / 60),
    minute: minute % 60,
    second: 0,
    millisecond: 0,
  });
  return start.isValid ? start.toUTC().toISO() : null;
}
