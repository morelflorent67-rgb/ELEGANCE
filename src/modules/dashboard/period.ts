import { DateTime } from "luxon";
import { capitalize } from "@/lib/format";

// Les périodes du tableau de bord (R-53) : un jour, une semaine (du lundi au dimanche) ou un mois civil, à l'heure de
// Paris. Fonctions pures : le serveur les calcule, la tablette ne fait qu'afficher.

export type PeriodKind = "day" | "week" | "month";

export interface Period {
  kind: PeriodKind;
  /** Début inclus et fin exclue, en instants (minuit de Paris, quel que soit le changement d'heure). */
  start: Date;
  end: Date;
  /** Premier jour de la période, « AAAA-MM-JJ » : sert de repère dans l'adresse de la page. */
  date: string;
  title: string;
  /** Premier jour de la période précédente. */
  prevDate: string;
  /** Premier jour de la période suivante, ou null pour la période en cours : on ne va pas dans le futur. */
  nextDate: string | null;
  isCurrent: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UNIT = { day: "days", week: "weeks", month: "months" } as const;

/** « 1er » le premier du mois, sinon le numéro. */
const dayNumber = (d: DateTime) => (d.day === 1 ? "1er" : String(d.day));
const monthName = (d: DateTime) => d.setLocale("fr").toFormat("LLLL");

function titleOf(kind: PeriodKind, start: DateTime, now: DateTime, isCurrent: boolean): string {
  const withYear = start.year !== now.year;
  if (kind === "month") return capitalize(`${monthName(start)} ${start.year}`);

  if (kind === "week") {
    const last = start.plus({ days: 6 });
    const from =
      start.month === last.month ? dayNumber(start) : `${dayNumber(start)} ${monthName(start)}`;
    const year = withYear ? ` ${last.year}` : "";
    return `Semaine du ${from} au ${dayNumber(last)} ${monthName(last)}${year}`;
  }

  const label = `${start.setLocale("fr").toFormat("cccc")} ${dayNumber(start)} ${monthName(start)}`;
  if (isCurrent) return `Aujourd’hui · ${label}`;
  if (start.equals(now.startOf("day").minus({ days: 1 }))) return `Hier · ${label}`;
  return capitalize(withYear ? `${label} ${start.year}` : label);
}

/**
 * La période qui contient `date` (n'importe quel jour de la période), ou la période en cours si `date` est absente,
 * invalide ou à venir.
 */
export function resolvePeriod(
  kind: PeriodKind,
  date: string | undefined,
  now: Date,
  zone: string,
): Period {
  const nowLocal = DateTime.fromJSDate(now, { zone });
  const currentStart = nowLocal.startOf(kind);

  let start = currentStart;
  if (date && ISO_DATE.test(date)) {
    const given = DateTime.fromISO(date, { zone });
    if (given.isValid && given.startOf(kind) <= currentStart) start = given.startOf(kind);
  }

  const unit = UNIT[kind];
  const isCurrent = start.toMillis() === currentStart.toMillis();
  return {
    kind,
    start: start.toJSDate(),
    end: start.plus({ [unit]: 1 }).toJSDate(),
    date: start.toISODate()!,
    title: titleOf(kind, start, nowLocal, isCurrent),
    prevDate: start.minus({ [unit]: 1 }).toISODate()!,
    nextDate: isCurrent ? null : start.plus({ [unit]: 1 }).toISODate()!,
    isCurrent,
  };
}
