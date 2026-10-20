// Mise en forme pour l'interface et les emails, toujours à l'heure de Paris (principe 3).
const ZONE = "Europe/Paris";

const euroWhole = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const euroCents = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/** 2800 → « 28 € », 1250 → « 12,50 € » (espace insécable de la locale remplacé par une espace normale). */
export function formatPrice(cents: number): string {
  const formatter = cents % 100 === 0 ? euroWhole : euroCents;
  return formatter.format(cents / 100).replace(/[  ]/g, " ");
}

/** 30 → « 30 min », 75 → « 1 h 15 », 120 → « 2 h ». */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

const timeFormat = new Intl.DateTimeFormat("fr-FR", {
  timeZone: ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
export const formatTime = (date: Date): string => timeFormat.format(date);

const dayLong = new Intl.DateTimeFormat("fr-FR", {
  timeZone: ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});
const dayLongYear = new Intl.DateTimeFormat("fr-FR", {
  timeZone: ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const dayShort = new Intl.DateTimeFormat("fr-FR", {
  timeZone: ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** « samedi 24 octobre » */
export const formatDay = (date: Date): string => dayLong.format(date);
/** « samedi 24 octobre 2026 » */
export const formatDayWithYear = (date: Date): string => dayLongYear.format(date);
/** « sam. 24 oct. » */
export const formatDayShort = (date: Date): string => dayShort.format(date);

/** « Samedi 24 octobre » : première lettre en capitale, pour les titres. */
export const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Jour de Paris d'un instant, « AAAA-MM-JJ ». */
export function parisDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return parts; // en-CA donne déjà AAAA-MM-JJ
}
