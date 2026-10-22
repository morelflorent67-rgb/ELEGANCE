// Mise en forme des créneaux pour le parcours de réservation (lot 12) : jours de la bande, matin et après-midi,
// horaires proches d'un créneau pris entre-temps. Fonctions pures ; les créneaux eux-mêmes viennent du serveur.

const DOW = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
const DOW_LONG = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
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
const MONTHS_SHORT = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

export interface DayNames {
  /** « sam » */
  dow: string;
  num: number;
  /** « octobre » */
  month: string;
  year: number;
  /** « Samedi 24 octobre » */
  long: string;
  /** « Sam. 24 oct. » */
  short: string;
}

/** Les noms d'un jour « AAAA-MM-JJ » (jour civil, sans fuseau : la date est déjà celle de Paris). */
export function dayNames(date: string): DayNames {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return {
    dow: DOW[weekday],
    num: d,
    month: MONTHS[m - 1],
    year: y,
    long: `${DOW_LONG[weekday]} ${d === 1 ? "1er" : d} ${MONTHS[m - 1]}`,
    short: `${DOW_LONG[weekday].slice(0, 3)}. ${d} ${MONTHS_SHORT[m - 1]}`,
  };
}

const minutesOf = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
const timeOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** « 14:30 » + 45 min → « 15:15 ». */
export const endTime = (time: string, durationMin: number): string =>
  timeOf(minutesOf(time) + durationMin);

/** Les créneaux d'un jour, rangés en « Matin » (avant midi) et « Après-midi ». Une période vide n'apparaît pas. */
export function periodsOf<T extends { time: string }>(slots: T[]): { label: string; slots: T[] }[] {
  const morning = slots.filter((s) => minutesOf(s.time) < 12 * 60);
  const afternoon = slots.filter((s) => minutesOf(s.time) >= 12 * 60);
  return [
    ...(morning.length ? [{ label: "Matin", slots: morning }] : []),
    ...(afternoon.length ? [{ label: "Après-midi", slots: afternoon }] : []),
  ];
}

/** Créneau pris entre-temps : les `count` horaires libres les plus proches, dans l'ordre de la journée. */
export function nearestSlots<T extends { time: string }>(slots: T[], lost: string, count = 3): T[] {
  const target = minutesOf(lost);
  return [...slots]
    .filter((s) => s.time !== lost)
    .sort((a, b) => Math.abs(minutesOf(a.time) - target) - Math.abs(minutesOf(b.time) - target))
    .slice(0, count)
    .sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
}
