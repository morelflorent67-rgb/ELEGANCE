import { DateTime } from "luxon";
import { checkSlot, pickStaff } from "./engine";
import type { RejectionReason, Snapshot } from "./types";

// RDV répétés (D-71, D-83 à D-92) : les dates d'une règle et le choix du coiffeur pour chacune. Fonctions pures, comme
// le reste du calcul des créneaux ; les jours sont des dates de Paris (« AAAA-MM-JJ »), l'heure est la même à chaque
// date (heure de Paris, changement d'heure compris).

export type MonthlyMode = "day_of_month" | "weekday_rank" | "last_weekday";

export type RepeatRule =
  | { frequency: "weekly"; intervalWeeks: 1 | 2 | 3 | 4 }
  | { frequency: "monthly"; monthlyMode: MonthlyMode };

/** D-86 : une série ne va jamais plus loin que 6 mois après son premier RDV (ou après sa dernière date, à la prolongation). */
export const SERIES_MAX_MONTHS = 6;

/** Une date de la règle : `date` vide quand le mois n'a pas ce jour (un 31, D-85). `month` : « AAAA-MM ». */
export interface Occurrence {
  index: number;
  date: string | null;
  month: string;
}

const day = (iso: string) => DateTime.fromISO(iso, { zone: "UTC" });

/** Rang du jour de la semaine dans son mois : le 10 novembre 2026 est le 2e mardi. */
export const weekdayRank = (date: string): number => Math.ceil(day(date).day / 7);

/** Vrai si la semaine suivante tombe le mois d'après : le 24 novembre 2026 est le dernier mardi. */
export const isLastWeekdayOfMonth = (date: string): boolean =>
  day(date).plus({ weeks: 1 }).month !== day(date).month;

/** Les façons de répéter chaque mois que permet le premier RDV (D-85). */
export function monthlyModesFor(anchor: string): MonthlyMode[] {
  const modes: MonthlyMode[] = ["day_of_month"];
  if (weekdayRank(anchor) <= 4) modes.push("weekday_rank");
  if (isLastWeekdayOfMonth(anchor)) modes.push("last_weekday");
  return modes;
}

/** La règle est-elle possible à partir de ce premier RDV ? (« 5e mardi » ne se répète pas.) */
export const ruleFits = (anchor: string, rule: RepeatRule): boolean =>
  rule.frequency === "weekly"
    ? [1, 2, 3, 4].includes(rule.intervalWeeks)
    : monthlyModesFor(anchor).includes(rule.monthlyMode);

/** Dernier jour possible d'une série commencée (ou prolongée) le `from` : 6 mois plus tard. */
export const seriesLimit = (from: string): string =>
  day(from).plus({ months: SERIES_MAX_MONTHS }).toISODate()!;

/** La k-ième date de la règle après le premier RDV (k ≥ 1). */
export function occurrence(anchor: string, rule: RepeatRule, index: number): Occurrence {
  const start = day(anchor);
  if (rule.frequency === "weekly") {
    const date = start.plus({ weeks: index * rule.intervalWeeks });
    return { index, date: date.toISODate()!, month: date.toFormat("yyyy-MM") };
  }
  const month = start.startOf("month").plus({ months: index });
  const label = month.toFormat("yyyy-MM");
  if (rule.monthlyMode === "day_of_month") {
    // Luxon ramènerait un 31 au 30 : un mois trop court n'a pas de date (D-85).
    const date = start.day <= month.daysInMonth! ? month.set({ day: start.day }) : null;
    return { index, date: date?.toISODate() ?? null, month: label };
  }
  // Premier jour du mois qui tombe le bon jour de la semaine, puis le rang voulu (ou le dernier).
  const first = month.plus({ days: (start.weekday - month.weekday + 7) % 7 });
  if (rule.monthlyMode === "weekday_rank") {
    const date = first.plus({ weeks: weekdayRank(anchor) - 1 });
    return { index, date: date.toISODate()!, month: label };
  }
  let last = first;
  while (last.plus({ weeks: 1 }).month === month.month) last = last.plus({ weeks: 1 });
  return { index, date: last.toISODate()!, month: label };
}

/** Jour qui sert à comparer une date manquante aux bornes : la fin de son mois. */
const reference = (o: Occurrence) => o.date ?? day(`${o.month}-01`).endOf("month").toISODate()!;

/**
 * Les dates de la règle strictement après `after` et jusqu'à `until` compris. Une date manquante (un 31) est rendue avec
 * `date: null` : elle est sautée, et listée comme telle (D-71).
 */
export function occurrencesBetween(
  anchor: string,
  rule: RepeatRule,
  after: string,
  until: string,
): Occurrence[] {
  const list: Occurrence[] = [];
  for (let index = 1; ; index++) {
    const o = occurrence(anchor, rule, index);
    const ref = reference(o);
    if (ref > until) return list;
    if (ref > after) list.push(o);
  }
}

/** Instant de début à `time` (« HH:mm » ou « HH:mm:ss », heure de Paris) le jour `date`. */
export const startInstant = (date: string, time: string, zone: string): Date =>
  DateTime.fromISO(`${date}T${time.length === 5 ? `${time}:00` : time}`, { zone }).toJSDate();

/** Pourquoi une date est sautée (D-71, D-84). `no_such_day` : le mois n'a pas ce jour. */
export type SkipReason = "no_such_day" | RejectionReason;

export type PlannedDate =
  | { date: string; ok: true; startsAt: Date; staffId: string }
  | { date: string | null; month: string; ok: false; reason: SkipReason };

/** Ce que la série demande : fin par un nombre de RDV (celui de départ compris) ou par une date (D-86). */
export type SeriesEnd = { kind: "count"; total: number } | { kind: "until"; date: string };

/**
 * Choisit, pour chaque date de la règle, un coiffeur libre (D-84) : le coiffeur demandé, ou « Sans préférence » parmi
 * `staffIds` (le moins chargé ce jour-là, D-40). Une date où personne ne convient est sautée, avec sa raison.
 * Avec « N rendez-vous », une date sautée est remplacée par la suivante de la règle, sans dépasser `limit` (D-86) ;
 * `alreadyPlanned` : nombre de RDV déjà dans la série (1 à la création : le RDV de départ).
 * Chaque date retenue occupe son coiffeur pour les suivantes (elles sont toutes posées ensemble).
 */
export function planSeries(
  snapshot: Snapshot,
  input: {
    anchor: string;
    rule: RepeatRule;
    /** Dernière date déjà examinée : la série reprend après (le premier RDV à la création). */
    after: string;
    time: string;
    durationMinutes: number;
    /** Coiffeurs possibles dans l'ordre d'affichage ; un seul pour un coiffeur précis. */
    staffIds: string[];
    end: SeriesEnd;
    alreadyPlanned: number;
    limit: string;
    now: Date;
  },
): { dates: PlannedDate[]; lastExamined: string } {
  const { anchor, rule, after, time, durationMinutes, staffIds, end, limit, now } = input;
  const zone = snapshot.settings.timezone;
  const until = end.kind === "until" && end.date < limit ? end.date : limit;
  const wanted = end.kind === "count" ? end.total - input.alreadyPlanned : Infinity;

  const taken = [...snapshot.appointments];
  const dates: PlannedDate[] = [];
  let lastExamined = after;
  let planned = 0;
  for (const o of occurrencesBetween(anchor, rule, after, until)) {
    if (planned >= wanted) break;
    lastExamined = reference(o);
    if (!o.date) {
      dates.push({ date: null, month: o.month, ok: false, reason: "no_such_day" });
      continue;
    }
    const startsAt = startInstant(o.date, time, zone);
    const view = { ...snapshot, appointments: taken };
    const checks = staffIds.map((staffId) => ({
      staffId,
      result: checkSlot(view, { staffId, startsAt, durationMinutes, audience: "salon", now }),
    }));
    const free = checks.filter((c) => c.result.ok).map((c) => c.staffId);
    if (free.length === 0) {
      // Comme pour un RDV simple : un refus d'horaire vaut pour tous ; seul « occupé » dépend du coiffeur.
      const reason =
        checks.map((c) => (c.result.ok ? null : c.result.reason)).find((r) => r !== "busy") ??
        "busy";
      dates.push({ date: o.date, month: o.month, ok: false, reason });
      continue;
    }
    const staffId = free.length === 1 ? free[0] : pickStaff(free, taken, o.date, zone);
    taken.push({
      staffId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000),
    });
    dates.push({ date: o.date, ok: true, startsAt, staffId });
    planned++;
  }
  return { dates, lastExamined };
}

const ORDINAL = ["1er", "2e", "3e", "4e"];
const WEEKDAY = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

/** « Toutes les 2 semaines », « Chaque mois, le 2e mardi » : ce que la tablette et les emails affichent. */
export function ruleLabel(anchor: string, rule: RepeatRule): string {
  if (rule.frequency === "weekly") {
    return rule.intervalWeeks === 1
      ? "Chaque semaine"
      : `Toutes les ${rule.intervalWeeks} semaines`;
  }
  const start = day(anchor);
  const weekday = WEEKDAY[start.weekday - 1];
  if (rule.monthlyMode === "day_of_month") {
    return `Chaque mois, le ${start.day === 1 ? "1er" : start.day}`;
  }
  if (rule.monthlyMode === "weekday_rank") {
    return `Chaque mois, le ${ORDINAL[weekdayRank(anchor) - 1]} ${weekday}`;
  }
  return `Chaque mois, le dernier ${weekday}`;
}
