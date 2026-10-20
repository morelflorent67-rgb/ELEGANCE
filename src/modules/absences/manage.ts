import { asc, eq, gt } from "drizzle-orm";
import { DateTime } from "luxon";
import type { Database } from "@/db/types";
import { absence, staff } from "@/db/schema";
import { DomainError } from "@/lib/domain-error";
import { recordAudit } from "@/modules/audit/record";
import { loadSettings } from "@/modules/availability";
import { assertActiveAuthor } from "@/modules/staff/team";

// Absences des coiffeurs (R-40, R-41). L'équipe les déclare depuis la tablette (D-55) ; chaque déclaration est signée
// d'un membre de l'équipe (R-74) et inscrite au journal dans la même transaction. Les rendez-vous qu'une absence
// touche se traitent ensuite avec `to-handle.ts` (R-42, R-43).

export interface AbsenceInput {
  staffId: string;
  /** « AAAA-MM-JJ », heure de Paris. */
  startDate: string;
  /** Dernier jour inclus. Pour des heures précises, le même jour que `startDate`. */
  endDate: string;
  /** « 14:00 » : sans heures, l'absence couvre les journées entières (R-40). */
  startTime?: string;
  endTime?: string;
  reason?: string | null;
}

export interface ManagedAbsence {
  id: string;
  staffId: string;
  staffFirstName: string;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):(00|15|30|45)$/; // grille de 15 minutes (R-04)
const MAX_DAYS = 400;
const MAX_REASON = 80;

/** Les bornes de l'absence, en instants. Refus : `invalid_absence`. */
function boundsOf(input: AbsenceInput, zone: string): { startsAt: Date; endsAt: Date; reason: string | null } {
  const start = ISO_DATE.test(input.startDate) ? DateTime.fromISO(input.startDate, { zone }) : null;
  const end = ISO_DATE.test(input.endDate) ? DateTime.fromISO(input.endDate, { zone }) : null;
  if (!start?.isValid || !end?.isValid || input.endDate < input.startDate) {
    throw new DomainError("invalid_absence");
  }
  if (end.diff(start, "days").days + 1 > MAX_DAYS) throw new DomainError("invalid_absence");
  const reason = (input.reason ?? "").trim() || null;
  if (reason && reason.length > MAX_REASON) throw new DomainError("invalid_absence");

  const hasHours = input.startTime !== undefined || input.endTime !== undefined;
  if (!hasHours) {
    // Des journées entières, de minuit à minuit à Paris : le jour du changement d'heure dure 23 ou 25 heures.
    return {
      startsAt: start.startOf("day").toJSDate(),
      endsAt: end.plus({ days: 1 }).startOf("day").toJSDate(),
      reason,
    };
  }
  // Quelques heures : un seul jour, début et fin sur la grille de 15 minutes.
  if (
    input.startDate !== input.endDate ||
    !input.startTime ||
    !input.endTime ||
    !TIME.test(input.startTime) ||
    !TIME.test(input.endTime) ||
    input.endTime <= input.startTime
  ) {
    throw new DomainError("invalid_absence");
  }
  return {
    startsAt: DateTime.fromISO(`${input.startDate}T${input.startTime}`, { zone }).toJSDate(),
    endsAt: DateTime.fromISO(`${input.startDate}T${input.endTime}`, { zone }).toJSDate(),
    reason,
  };
}

/**
 * Déclare une absence (R-40) : plus aucun créneau n'est proposé à ce coiffeur pendant ce temps (R-41). Les rendez-vous
 * déjà pris ne bougent pas : ils apparaissent dans la liste « à traiter » (R-42).
 * Refus : `invalid_absence`, `absence_in_past` (déjà terminée), `unknown_staff` (membre inconnu ou retiré),
 * `author_required` / `unknown_author` (R-74).
 */
export async function declareAbsence(
  db: Database,
  input: AbsenceInput,
  authorStaffId: string,
  now: Date = new Date(),
): Promise<{ id: string }> {
  const { timezone } = await loadSettings(db);
  const { startsAt, endsAt, reason } = boundsOf(input, timezone);

  return db.transaction(async (tx) => {
    const authorId = await assertActiveAuthor(tx, authorStaffId);
    const [member] = await tx
      .select({ active: staff.active })
      .from(staff)
      .where(eq(staff.id, input.staffId));
    if (!member?.active) throw new DomainError("unknown_staff");
    if (endsAt.getTime() <= now.getTime()) throw new DomainError("absence_in_past");

    const [created] = await tx
      .insert(absence)
      .values({ staffId: input.staffId, startsAt, endsAt, reason })
      .returning({ id: absence.id });
    await recordAudit(
      tx,
      {
        actorType: "staff",
        actorId: authorId,
        action: "absence.declared",
        entity: "absence",
        entityId: created.id,
        after: {
          staffId: input.staffId,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          reason,
        },
      },
      now,
    );
    return created;
  });
}

/** Supprime une absence : les créneaux du coiffeur se rouvrent. Refus : `unknown_absence`. */
export async function deleteAbsence(
  db: Database,
  absenceId: string,
  authorStaffId: string,
  now: Date = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const authorId = await assertActiveAuthor(tx, authorStaffId);
    const [row] = await tx.select().from(absence).where(eq(absence.id, absenceId)).for("update");
    if (!row) throw new DomainError("unknown_absence");
    await tx.delete(absence).where(eq(absence.id, absenceId));
    await recordAudit(
      tx,
      {
        actorType: "staff",
        actorId: authorId,
        action: "absence.deleted",
        entity: "absence",
        entityId: absenceId,
        before: {
          staffId: row.staffId,
          startsAt: row.startsAt.toISOString(),
          endsAt: row.endsAt.toISOString(),
          reason: row.reason,
        },
      },
      now,
    );
  });
}

/** Les absences en cours et à venir, par date de début. Celles d'un membre retiré restent listées. */
export async function listAbsences(db: Database, now: Date = new Date()): Promise<ManagedAbsence[]> {
  return db
    .select({
      id: absence.id,
      staffId: absence.staffId,
      staffFirstName: staff.firstName,
      startsAt: absence.startsAt,
      endsAt: absence.endsAt,
      reason: absence.reason,
    })
    .from(absence)
    .innerJoin(staff, eq(staff.id, absence.staffId))
    .where(gt(absence.endsAt, now))
    .orderBy(asc(absence.startsAt), asc(absence.id));
}
