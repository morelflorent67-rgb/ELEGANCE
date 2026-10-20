import { asc, eq, gte } from "drizzle-orm";
import { DateTime } from "luxon";
import type { Database } from "@/db/types";
import { closure, openingHours, salonSettings } from "@/db/schema";
import { DomainError } from "@/lib/domain-error";
import { recordAudit } from "@/modules/audit/record";

// Horaires d'ouverture et fermetures exceptionnelles, vus par le gérant (R-01, R-03). Une transaction par action,
// avec sa trace au journal (principe 6). `actorId` est le compte équipe qui a saisi le code gérant (R-73).
// Les rendez-vous déjà pris ne sont jamais touchés ici : ceux qui ne tiennent plus sont à traiter (D-57).

/** « 10:00 » : heure de Paris, sur la grille de 15 minutes (R-04). */
export interface DayRange {
  opensAt: string;
  closesAt: string;
}

/** Jour de la semaine (1 = lundi … 7 = dimanche) → plages d'ouverture. Une pause est le trou entre deux plages. */
export type WeekHours = Record<number, DayRange[]>;

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const MAX_RANGES_PER_DAY = 3;
const TIME = /^([01]\d|2[0-3]):(00|15|30|45)$/;
const MAX_CLOSURE_DAYS = 400;
const MAX_REASON = 80;

const hhmm = (time: string) => time.slice(0, 5);

export async function loadWeekHours(db: Database): Promise<WeekHours> {
  const rows = await db
    .select()
    .from(openingHours)
    .orderBy(asc(openingHours.weekday), asc(openingHours.opensAt));
  const week: WeekHours = Object.fromEntries(WEEKDAYS.map((d) => [d, [] as DayRange[]]));
  for (const row of rows) {
    week[row.weekday].push({ opensAt: hhmm(row.opensAt), closesAt: hhmm(row.closesAt) });
  }
  return week;
}

/** Vérifie la semaine (R-04 : grille de 15 minutes) et la rend triée. Refus : `invalid_hours`. */
function parseWeek(input: WeekHours): WeekHours {
  const keys = Object.keys(input).sort();
  if (keys.join(",") !== WEEKDAYS.join(",")) throw new DomainError("invalid_hours");

  const week: WeekHours = {};
  for (const weekday of WEEKDAYS) {
    const ranges = input[weekday];
    if (!Array.isArray(ranges) || ranges.length > MAX_RANGES_PER_DAY) {
      throw new DomainError("invalid_hours");
    }
    const sorted = ranges
      .map((r) => ({ opensAt: String(r?.opensAt), closesAt: String(r?.closesAt) }))
      .sort((a, b) => a.opensAt.localeCompare(b.opensAt));
    sorted.forEach((range, index) => {
      if (!TIME.test(range.opensAt) || !TIME.test(range.closesAt)) {
        throw new DomainError("invalid_hours");
      }
      if (range.opensAt >= range.closesAt) throw new DomainError("invalid_hours");
      // Deux plages ne se chevauchent pas et ne se touchent pas : une pause d'au moins 15 minutes les sépare.
      if (index > 0 && sorted[index - 1].closesAt >= range.opensAt) {
        throw new DomainError("invalid_hours");
      }
    });
    week[weekday] = sorted;
  }
  // Une semaine sans aucun jour ouvert est presque sûrement une erreur : le salon n'aurait plus aucun créneau.
  if (WEEKDAYS.every((d) => week[d].length === 0)) throw new DomainError("invalid_hours");
  return week;
}

/** Remplace les horaires de la semaine (R-01, R-03). Rien n'est écrit si rien ne change. */
export async function setOpeningHours(
  db: Database,
  input: WeekHours,
  actorId: string,
): Promise<void> {
  const week = parseWeek(input);
  await db.transaction(async (tx) => {
    // Même verrou que les réglages du salon : deux enregistrements simultanés ne se mélangent pas.
    await tx.select().from(salonSettings).for("update");
    const before = await loadWeekHours(tx);
    if (JSON.stringify(before) === JSON.stringify(week)) return;

    await tx.delete(openingHours);
    const rows = WEEKDAYS.flatMap((weekday) => week[weekday].map((range) => ({ weekday, ...range })));
    await tx.insert(openingHours).values(rows);
    await recordAudit(tx, {
      actorType: "manager",
      actorId,
      action: "hours.changed",
      entity: "opening_hours",
      entityId: "week",
      before,
      after: week,
    });
  });
}

export interface ClosureInput {
  /** « AAAA-MM-JJ », jours entiers, bornes incluses (R-03). */
  startsOn: string;
  endsOn: string;
  reason?: string | null;
}

export interface ManagedClosure {
  id: number;
  startsOn: string;
  endsOn: string;
  reason: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function parisToday(db: Database, now: Date): Promise<string> {
  const [settings] = await db.select({ timezone: salonSettings.timezone }).from(salonSettings);
  return DateTime.fromJSDate(now, { zone: settings?.timezone ?? "Europe/Paris" }).toISODate()!;
}

/** Les fermetures en cours et à venir, par date de début. Les fermetures passées ne sont plus affichées. */
export async function listClosures(db: Database, now: Date = new Date()): Promise<ManagedClosure[]> {
  const today = await parisToday(db, now);
  const rows = await db
    .select()
    .from(closure)
    .where(gte(closure.endsOn, today))
    .orderBy(asc(closure.startsOn), asc(closure.endsOn), asc(closure.id));
  return rows.map((r) => ({ id: r.id, startsOn: r.startsOn, endsOn: r.endsOn, reason: r.reason }));
}

/**
 * Déclare une fermeture exceptionnelle : jour férié, congés (R-03). Plus aucun créneau n'est proposé ces jours-là.
 * Refus : `invalid_closure` (dates ou motif), `closure_in_past` (fermeture entièrement passée).
 */
export async function addClosure(
  db: Database,
  input: ClosureInput,
  actorId: string,
  now: Date = new Date(),
): Promise<number> {
  const { startsOn, endsOn } = input;
  const start = ISO_DATE.test(startsOn) ? DateTime.fromISO(startsOn) : null;
  const end = ISO_DATE.test(endsOn) ? DateTime.fromISO(endsOn) : null;
  if (!start?.isValid || !end?.isValid || endsOn < startsOn) throw new DomainError("invalid_closure");
  if (end.diff(start, "days").days + 1 > MAX_CLOSURE_DAYS) throw new DomainError("invalid_closure");
  const reason = (input.reason ?? "").trim() || null;
  if (reason && reason.length > MAX_REASON) throw new DomainError("invalid_closure");

  return db.transaction(async (tx) => {
    if (endsOn < (await parisToday(tx, now))) throw new DomainError("closure_in_past");
    const [created] = await tx
      .insert(closure)
      .values({ startsOn, endsOn, reason })
      .returning({ id: closure.id });
    await recordAudit(tx, {
      actorType: "manager",
      actorId,
      action: "closure.added",
      entity: "closure",
      entityId: String(created.id),
      after: { startsOn, endsOn, reason },
    });
    return created.id;
  });
}

/** Supprime une fermeture : le salon redevient ouvert ces jours-là. */
export async function removeClosure(db: Database, id: number, actorId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(closure).where(eq(closure.id, id)).for("update");
    if (!row) throw new DomainError("unknown_closure");
    await tx.delete(closure).where(eq(closure.id, id));
    await recordAudit(tx, {
      actorType: "manager",
      actorId,
      action: "closure.removed",
      entity: "closure",
      entityId: String(id),
      before: { startsOn: row.startsOn, endsOn: row.endsOn, reason: row.reason },
    });
  });
}
