// Horaires tels que la vitrine les montre (R-01, R-03) : lus en base, mis en forme ici. Fonctions pures.
// Le type vient du module de gestion ; ce fichier ne dépend ni de la base ni de l'interface.

export interface DayRange {
  opensAt: string;
  closesAt: string;
}

/** Jour de la semaine (1 = lundi … 7 = dimanche) → plages d'ouverture ; la pause est le trou entre deux plages. */
export type WeekHours = Record<number, DayRange[]>;

export interface HoursRow {
  label: string;
  closed: boolean;
  /** « 10 h – 12 h », « 13 h – 19 h » : une chaîne par plage. */
  ranges: string[];
}

const DAY_NAMES: Record<number, string> = {
  1: "Lundi",
  2: "Mardi",
  3: "Mercredi",
  4: "Jeudi",
  5: "Vendredi",
  6: "Samedi",
  7: "Dimanche",
};
const SCHEMA_DAYS: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

/** « 10:00 » → « 10 h », « 18:30 » → « 18 h 30 », « 09:00 » → « 9 h ». */
export function formatHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

export function formatRanges(ranges: DayRange[]): string[] {
  return ranges.map((r) => `${formatHour(r.opensAt)} – ${formatHour(r.closesAt)}`);
}

const lower = (name: string) => name.toLowerCase();

/** Des jours triés → « Mardi – samedi » (3 jours consécutifs ou plus), « Lundi, mardi », « Mardi, jeudi ». */
function daysLabel(days: number[]): string {
  const runs: number[][] = [];
  for (const d of days) {
    const last = runs[runs.length - 1];
    if (last && d === last[last.length - 1] + 1) last.push(d);
    else runs.push([d]);
  }
  const parts: string[] = [];
  for (const run of runs) {
    if (run.length >= 3) parts.push(`${DAY_NAMES[run[0]]} – ${lower(DAY_NAMES[run[run.length - 1]])}`);
    else run.forEach((d) => parts.push(DAY_NAMES[d]));
  }
  // Seul le premier mot prend sa majuscule : « Mardi, jeudi, samedi ».
  return parts.map((p, i) => (i === 0 ? p : lower(p.charAt(0)) + p.slice(1))).join(", ");
}

/**
 * Le résumé des horaires : les jours qui ont les mêmes plages sont regroupés, les jours fermés forment une dernière
 * ligne (dimanche en premier, comme sur la maquette).
 */
export function groupWeekHours(week: WeekHours): HoursRow[] {
  const byRanges = new Map<string, { days: number[]; ranges: string[] }>();
  const closedDays: number[] = [];
  for (const day of WEEKDAYS) {
    const ranges = formatRanges(week[day] ?? []);
    if (ranges.length === 0) {
      closedDays.push(day);
      continue;
    }
    const key = ranges.join("|");
    const entry = byRanges.get(key) ?? { days: [], ranges };
    entry.days.push(day);
    byRanges.set(key, entry);
  }
  const rows: HoursRow[] = [...byRanges.values()].map((e) => ({
    label: daysLabel(e.days),
    closed: false,
    ranges: e.ranges,
  }));
  if (closedDays.length > 0) {
    const sundayFirst = [...closedDays].sort((a, b) => (a % 7) - (b % 7));
    rows.push({
      label: sundayFirst.map((d, i) => (i === 0 ? DAY_NAMES[d] : lower(DAY_NAMES[d]))).join(", "),
      closed: true,
      ranges: [],
    });
  }
  return rows;
}

/** Les sept jours, du lundi au dimanche. */
export function weekRows(week: WeekHours): HoursRow[] {
  return WEEKDAYS.map((day) => {
    const ranges = formatRanges(week[day] ?? []);
    return { label: DAY_NAMES[day], closed: ranges.length === 0, ranges };
  });
}

export interface SchemaOpeningHours {
  "@type": "OpeningHoursSpecification";
  dayOfWeek: string;
  opens: string;
  closes: string;
}

/** Données structurées (schema.org) : une entrée par jour et par plage. */
export function schemaOpeningHours(week: WeekHours): SchemaOpeningHours[] {
  return WEEKDAYS.flatMap((day) =>
    (week[day] ?? []).map((r) => ({
      "@type": "OpeningHoursSpecification" as const,
      dayOfWeek: `https://schema.org/${SCHEMA_DAYS[day]}`,
      opens: r.opensAt,
      closes: r.closesAt,
    })),
  );
}

/** « Mardi – samedi · 10 h – 12 h, 13 h – 19 h » : une ligne pour le menu et les encarts. */
export function hoursSummary(week: WeekHours): string {
  const open = groupWeekHours(week).filter((row) => !row.closed);
  if (open.length === 0) return "Fermé";
  return open.map((row) => `${row.label} · ${row.ranges.join(", ")}`).join(" — ");
}

/** « du mardi au samedi » quand les jours ouverts se suivent (3 jours ou plus) ; sinon null et l'appelant reste général. */
export function openingPhrase(week: WeekHours): string | null {
  const open = WEEKDAYS.filter((d) => (week[d] ?? []).length > 0);
  if (open.length < 3) return null;
  const consecutive = open.every((d, i) => i === 0 || d === open[i - 1] + 1);
  if (!consecutive) return null;
  return `du ${lower(DAY_NAMES[open[0]])} au ${lower(DAY_NAMES[open[open.length - 1]])}`;
}

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

function dayMonth(iso: string): { day: number; month: number; year: number } {
  const [year, month, day] = iso.split("-").map(Number);
  return { day, month, year };
}

/** « le 24 décembre », « du 24 au 26 décembre », « du 28 décembre au 3 janvier » : une fermeture exceptionnelle (R-03). */
export function formatClosure(startsOn: string, endsOn: string): string {
  const a = dayMonth(startsOn);
  const b = dayMonth(endsOn);
  const label = (d: { day: number; month: number }) => `${d.day === 1 ? "1er" : d.day} ${MONTHS[d.month - 1]}`;
  if (startsOn === endsOn) return `le ${label(a)}`;
  if (a.month === b.month && a.year === b.year) {
    return `du ${a.day === 1 ? "1er" : a.day} au ${label(b)}`;
  }
  return `du ${label(a)} au ${label(b)}`;
}
