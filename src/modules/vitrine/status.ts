// « Ouvert maintenant », « Ouvre mardi à 10 h » : l'état du salon à l'instant, d'après les horaires (R-01) et les
// fermetures exceptionnelles (R-03) lus en base. Fonctions pures : l'accueil les appelle dans le navigateur avec
// l'heure de Paris (la page est servie depuis le cache, l'état change d'une minute à l'autre).

import {
  formatClosure,
  formatHour,
  formatRanges,
  groupWeekHours,
  openingPhrase,
  type WeekHours,
} from "./hours";

/** L'instant présent, en heure de Paris. */
export interface ParisNow {
  /** « AAAA-MM-JJ » */
  date: string;
  /** 1 = lundi … 7 = dimanche */
  weekday: number;
  /** Minutes depuis minuit. */
  minutes: number;
}

export interface Closure {
  startsOn: string;
  endsOn: string;
}

export interface OpenStatus {
  open: boolean;
  /** « Ouvert maintenant », « En pause », « Ouvre à 10 h », « Ouvre mardi à 10 h », « Fermé » */
  headline: string;
  /** « Jusqu'à 19 h », « Réouverture à 13 h », « Du mardi au samedi »… */
  detail: string;
}

const DAY_NAMES = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** « AAAA-MM-JJ » + n jours. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 1 = lundi … 7 = dimanche, pour une date « AAAA-MM-JJ ». */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

const closedOn = (date: string, closures: Closure[]) =>
  closures.some((c) => c.startsOn <= date && date <= c.endsOn);

/** L'heure de Paris (ou du fuseau du salon) à l'instant donné, sans bibliothèque : Intl suffit. */
export function zonedNow(instant: Date, timeZone = "Europe/Paris"): ParisNow {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    date,
    weekday: weekdayOf(date),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** L'état du salon à l'instant (R-01, R-03). */
export function openStatus(week: WeekHours, closures: Closure[], now: ParisNow): OpenStatus {
  const today = closedOn(now.date, closures) ? [] : (week[now.weekday] ?? []);
  const ranges = [...today].sort((a, b) => a.opensAt.localeCompare(b.opensAt));

  if (ranges.length > 0) {
    const first = ranges[0];
    if (now.minutes < toMinutes(first.opensAt)) {
      return {
        open: false,
        headline: `Ouvre à ${formatHour(first.opensAt)}`,
        detail: `Aujourd'hui, ${formatRanges(ranges).join(" et ")}`,
      };
    }
    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i];
      const next = ranges[i + 1];
      if (now.minutes >= toMinutes(range.opensAt) && now.minutes < toMinutes(range.closesAt)) {
        return {
          open: true,
          headline: "Ouvert maintenant",
          detail: next
            ? `Jusqu'à ${formatHour(range.closesAt)} · reprise à ${formatHour(next.opensAt)}`
            : `Jusqu'à ${formatHour(range.closesAt)}`,
        };
      }
      if (
        next &&
        now.minutes >= toMinutes(range.closesAt) &&
        now.minutes < toMinutes(next.opensAt)
      ) {
        return {
          open: false,
          headline: "En pause",
          detail: `Réouverture à ${formatHour(next.opensAt)}`,
        };
      }
    }
  }

  // Fermé pour le reste de la journée : le prochain jour ouvert, fermetures comprises (60 jours au plus).
  const phrase = openingPhrase(week);
  const detail = closedOn(now.date, closures)
    ? "Fermeture exceptionnelle aujourd'hui"
    : phrase
      ? capitalize(phrase)
      : "";
  for (let i = 1; i <= 60; i++) {
    const date = addDays(now.date, i);
    if (closedOn(date, closures)) continue;
    const dayRanges = [...(week[weekdayOf(date)] ?? [])].sort((a, b) =>
      a.opensAt.localeCompare(b.opensAt),
    );
    if (dayRanges.length === 0) continue;
    const [, month, day] = date.split("-").map(Number);
    const when =
      i === 1
        ? "demain"
        : i < 7
          ? DAY_NAMES[weekdayOf(date) - 1]
          : `${DAY_NAMES[weekdayOf(date) - 1]} ${day === 1 ? "1er" : day} ${MONTHS[month - 1]}`;
    return { open: false, headline: `Ouvre ${when} à ${formatHour(dayRanges[0].opensAt)}`, detail };
  }
  return { open: false, headline: "Fermé", detail };
}

/** « Samedi 31 octobre » pour un jour seul, « Du 24 au 26 décembre » pour plusieurs (R-03). */
export function closureLabel(closure: Closure): string {
  if (closure.startsOn === closure.endsOn) {
    return capitalize(
      `${DAY_NAMES[weekdayOf(closure.startsOn) - 1]} ${formatClosure(closure.startsOn, closure.endsOn).replace(/^le /, "")}`,
    );
  }
  return capitalize(formatClosure(closure.startsOn, closure.endsOn));
}

/** « Du mardi au samedi : 10 h – 12 h et 13 h – 19 h, sur rendez-vous. » ; jours aux horaires différents : un par un. */
export function hoursSentence(week: WeekHours): string {
  const open = groupWeekHours(week).filter((row) => !row.closed);
  if (open.length === 0) return "Sur rendez-vous.";
  const phrase = openingPhrase(week);
  if (open.length === 1 && phrase) {
    return `${capitalize(phrase)} : ${open[0].ranges.join(" et ")}, sur rendez-vous.`;
  }
  return `${open.map((row) => `${row.label} : ${row.ranges.join(" et ")}`).join(" ; ")}. Sur rendez-vous.`;
}
