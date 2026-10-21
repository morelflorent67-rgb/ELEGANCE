import { and, asc, desc, eq, gt, gte, inArray } from "drizzle-orm";
import { DateTime } from "luxon";
import type { Database } from "@/db/types";
import { appointment, appointmentItem, appointmentSeries, customer, staff } from "@/db/schema";
import { DomainError } from "@/lib/domain-error";
import { recordAudit } from "@/modules/audit/record";
import { enqueueEmail } from "@/modules/mail/outbox";
import { scheduleReminder } from "@/modules/mail/reminders";
import { assertActiveAuthor } from "@/modules/staff/team";
import {
  eligibleStaff,
  loadSettings,
  loadSnapshot,
  planSeries,
  resolveServices,
  ruleFits,
  ruleLabel,
  seriesLimit,
  type PlannedDate,
  type RepeatRule,
  type SeriesEnd,
} from "@/modules/availability";
import { pgCode, type AppointmentRow } from "./change-appointment";

// RDV répétés depuis la tablette (D-71, D-83 à D-92). Une série naît d'un RDV existant (« Répéter ce RDV ») et se
// prolonge depuis n'importe lequel de ses RDV. Chaque date est un RDV ordinaire, posé avec les mêmes contrôles que les
// autres (R-01 à R-05, R-13, R-21 à R-23), sauf la limite de RDV à venir (R-25, D-87). Les dates impossibles sont
// sautées et rendues avec leur raison ; un seul email liste les dates posées (D-91).

/** D-86 : au plus 6 mois, soit 27 RDV chaque semaine ; borne de saisie. */
export const SERIES_MAX_TOTAL = 30;

export interface RepeatInput {
  /** Le RDV de départ, qui devient le premier de la série. */
  appointmentId: string;
  rule: RepeatRule;
  /** Un coiffeur précis, ou « any » pour « Sans préférence » (D-84). */
  staffId: string | "any";
  end: SeriesEnd;
}

export interface ExtendInput {
  /** N'importe quel RDV de la série. */
  appointmentId: string;
  end: SeriesEnd;
}

export interface SeriesPlan {
  /** « Toutes les 2 semaines » */
  ruleLabel: string;
  /** Dernier jour possible (D-86). */
  limit: string;
  dates: PlannedDate[];
}

export interface SeriesWritten extends SeriesPlan {
  seriesId: string;
  created: { id: string; startsAt: Date; staffId: string }[];
}

const DAY = 86_400_000;

/** Ce qu'il faut pour planifier, à la création comme à la prolongation. */
interface Context {
  source: AppointmentRow;
  series: typeof appointmentSeries.$inferSelect | null;
  rule: RepeatRule;
  anchor: string;
  time: string;
  after: string;
  limit: string;
  alreadyPlanned: number;
  staffChoice: string | "any";
  serviceIds: string[];
  forName: string | null;
}

/** Le salon ne répète ni ne prolonge un RDV annulé, signalé ou terminé. */
function assertActive(row: AppointmentRow, now: Date): void {
  if (row.status !== "confirmed") throw new DomainError("not_modifiable");
  if (row.endsAt.getTime() <= now.getTime()) throw new DomainError("appointment_over");
}

function validEnd(end: SeriesEnd, after: string): boolean {
  if (end.kind === "count")
    return Number.isInteger(end.total) && end.total >= 1 && end.total <= SERIES_MAX_TOTAL;
  return DateTime.fromISO(end.date).isValid && end.date > after;
}

async function serviceIdsOf(db: Database, appointmentId: string): Promise<string[]> {
  const items = await db
    .select({ serviceId: appointmentItem.serviceId })
    .from(appointmentItem)
    .where(eq(appointmentItem.appointmentId, appointmentId))
    .orderBy(asc(appointmentItem.position));
  return items.map((i) => i.serviceId);
}

async function loadRow(
  db: Database,
  appointmentId: string,
  lock: boolean,
): Promise<AppointmentRow> {
  const query = db.select().from(appointment).where(eq(appointment.id, appointmentId));
  const [row] = lock ? await query.for("update") : await query;
  if (!row) throw new DomainError("appointment_not_found");
  return row;
}

async function repeatContext(
  db: Database,
  input: RepeatInput,
  lock: boolean,
  now: Date,
): Promise<Context> {
  const source = await loadRow(db, input.appointmentId, lock);
  assertActive(source, now);
  if (source.seriesId) throw new DomainError("already_in_series");
  const { timezone } = await loadSettings(db);
  const local = DateTime.fromJSDate(source.startsAt, { zone: timezone });
  const anchor = local.toISODate()!;
  // D-85 : « 5e mardi » ne se répète pas ; D-86 : la fin vient après le premier RDV.
  const tooFew = input.end.kind === "count" && input.end.total < 2;
  if (!ruleFits(anchor, input.rule) || !validEnd(input.end, anchor) || tooFew) {
    throw new DomainError("invalid_series");
  }
  return {
    source,
    series: null,
    rule: input.rule,
    anchor,
    time: local.toFormat("HH:mm"),
    after: anchor,
    limit: seriesLimit(anchor),
    alreadyPlanned: 1, // « N rendez-vous en tout », celui de départ compris (D-86)
    staffChoice: input.staffId,
    serviceIds: await serviceIdsOf(db, source.id),
    forName: source.forName,
  };
}

async function extendContext(
  db: Database,
  input: ExtendInput,
  lock: boolean,
  now: Date,
): Promise<Context> {
  const row = await loadRow(db, input.appointmentId, false);
  if (!row.seriesId) throw new DomainError("not_in_series");
  const query = db.select().from(appointmentSeries).where(eq(appointmentSeries.id, row.seriesId));
  const [series] = lock ? await query.for("update") : await query;
  // Le dernier RDV posé de la série donne les prestations et « Pour qui ? » (D-90).
  const [latest] = await db
    .select()
    .from(appointment)
    .where(eq(appointment.seriesId, series.id))
    .orderBy(desc(appointment.startsAt))
    .limit(1);
  // Une série finie depuis longtemps reprend à partir d'aujourd'hui, pas dans le passé.
  const today = DateTime.fromJSDate(now, { zone: (await loadSettings(db)).timezone }).toISODate()!;
  const after = series.lastPlannedOn > today ? series.lastPlannedOn : today;
  if (!validEnd(input.end, after)) throw new DomainError("invalid_series");
  const rule: RepeatRule =
    series.frequency === "weekly"
      ? { frequency: "weekly", intervalWeeks: series.intervalWeeks as 1 | 2 | 3 | 4 }
      : { frequency: "monthly", monthlyMode: series.monthlyMode! };
  return {
    source: row,
    series,
    rule,
    anchor: series.anchorOn,
    time: series.startTime.slice(0, 5),
    after,
    limit: seriesLimit(after),
    alreadyPlanned: 0, // à la prolongation, « N rendez-vous de plus »
    staffChoice: series.staffId ?? "any",
    serviceIds: await serviceIdsOf(db, latest.id),
    forName: latest.forName,
  };
}

/** Calcule les dates (D-84) ; `lock` verrouille les coiffeurs candidats, comme une réservation simple. */
async function plan(db: Database, ctx: Context, end: SeriesEnd, lock: boolean, now: Date) {
  // D-92 : le prix de la carte du jour ; une prestation retirée de la carte ne se répète plus.
  const services = await resolveServices(db, ctx.serviceIds, "salon");
  let candidates = await eligibleStaff(db, services.rows);
  if (ctx.staffChoice !== "any") candidates = candidates.filter((c) => c.id === ctx.staffChoice);
  if (candidates.length === 0) throw new DomainError("staff_not_eligible");
  const staffIds = candidates.map((c) => c.id);
  if (lock) {
    await db
      .select({ id: staff.id })
      .from(staff)
      .where(inArray(staff.id, staffIds))
      .orderBy(staff.id)
      .for("update");
  }
  const { timezone } = await loadSettings(db);
  const from = DateTime.fromISO(ctx.after, { zone: timezone }).startOf("day").toJSDate();
  const to = new Date(DateTime.fromISO(ctx.limit, { zone: timezone }).toMillis() + 2 * DAY);
  const { snapshot } = await loadSnapshot(db, { from, to, staffIds });
  const { dates, lastExamined } = planSeries(snapshot, {
    anchor: ctx.anchor,
    rule: ctx.rule,
    after: ctx.after,
    time: ctx.time,
    durationMinutes: services.durationMinutes,
    staffIds,
    end,
    alreadyPlanned: ctx.alreadyPlanned,
    limit: ctx.limit,
    now,
  });
  return { services, dates, lastExamined };
}

/** Aperçu de « Répéter ce RDV » : les dates retenues et sautées, sans rien écrire. */
export async function previewRepeat(
  db: Database,
  input: RepeatInput,
  now: Date = new Date(),
): Promise<SeriesPlan> {
  const ctx = await repeatContext(db, input, false, now);
  const { dates } = await plan(db, ctx, input.end, false, now);
  return { ruleLabel: ruleLabel(ctx.anchor, ctx.rule), limit: ctx.limit, dates };
}

/** Aperçu de « Prolonger la série » (D-90). */
export async function previewExtend(
  db: Database,
  input: ExtendInput,
  now: Date = new Date(),
): Promise<SeriesPlan> {
  const ctx = await extendContext(db, input, false, now);
  const { dates } = await plan(db, ctx, input.end, false, now);
  return { ruleLabel: ruleLabel(ctx.anchor, ctx.rule), limit: ctx.limit, dates };
}

/**
 * Pose les dates d'une série en une transaction : verrous, revérification sur des données fraîches, un RDV par date
 * libre. Une date prise entre l'aperçu et la confirmation est sautée (« busy ») : la base reste la barrière finale
 * (R-23), chaque date est posée dans son propre point de sauvegarde.
 */
async function write(
  db: Database,
  mode: "repeat" | "extend",
  input: RepeatInput | ExtendInput,
  authorStaffId: string,
  now: Date,
): Promise<SeriesWritten> {
  try {
    return await db.transaction(async (tx) => {
      const authorId = await assertActiveAuthor(tx, authorStaffId);
      const ctx =
        mode === "repeat"
          ? await repeatContext(tx, input as RepeatInput, true, now)
          : await extendContext(tx, input as ExtendInput, true, now);
      const [client] = await tx
        .select()
        .from(customer)
        .where(eq(customer.id, ctx.source.customerId))
        .for("update");
      if (!client || client.anonymizedAt) throw new DomainError("customer_has_no_account");

      const { services, dates, lastExamined } = await plan(tx, ctx, input.end, true, now);
      if (!dates.some((d) => d.ok)) throw new DomainError("series_empty");
      const { reminderHours } = await loadSettings(tx);

      let seriesId: string;
      if (ctx.series) {
        seriesId = ctx.series.id;
        await tx
          .update(appointmentSeries)
          .set({ lastPlannedOn: lastExamined })
          .where(eq(appointmentSeries.id, seriesId));
      } else {
        const [created] = await tx
          .insert(appointmentSeries)
          .values({
            frequency: ctx.rule.frequency,
            intervalWeeks: ctx.rule.frequency === "weekly" ? ctx.rule.intervalWeeks : null,
            monthlyMode: ctx.rule.frequency === "monthly" ? ctx.rule.monthlyMode : null,
            anchorOn: ctx.anchor,
            startTime: ctx.time,
            staffId: ctx.staffChoice === "any" ? null : ctx.staffChoice,
            lastPlannedOn: lastExamined,
            createdByStaffId: authorId,
            createdAt: now,
          })
          .returning({ id: appointmentSeries.id });
        seriesId = created.id;
        await tx.update(appointment).set({ seriesId }).where(eq(appointment.id, ctx.source.id));
      }

      const final: PlannedDate[] = [];
      const created: SeriesWritten["created"] = [];
      for (const date of dates) {
        if (!date.ok) {
          final.push(date);
          continue;
        }
        const endsAt = new Date(date.startsAt.getTime() + services.durationMinutes * 60_000);
        try {
          const id = await tx.transaction(async (sp) => {
            const [row] = await sp
              .insert(appointment)
              .values({
                customerId: ctx.source.customerId,
                staffId: date.staffId,
                startsAt: date.startsAt,
                endsAt,
                status: "confirmed",
                source: "salon",
                forName: ctx.forName,
                createdByStaffId: authorId,
                seriesId,
                createdAt: now,
              })
              .returning({ id: appointment.id });
            await sp.insert(appointmentItem).values(
              services.rows.map((s, position) => ({
                appointmentId: row.id,
                serviceId: s.id,
                nameSnapshot: s.name,
                priceCents: s.priceCents,
                durationMin: s.durationMin,
                position,
              })),
            );
            return row.id;
          });
          created.push({ id, startsAt: date.startsAt, staffId: date.staffId });
          final.push(date);
        } catch (error) {
          // R-23 : la base refuse un chevauchement venu d'un autre chemin d'écriture ; la date est sautée.
          if (pgCode(error) !== "23P01") throw error;
          final.push({ date: date.date, month: date.date.slice(0, 7), ok: false, reason: "busy" });
        }
      }
      if (created.length === 0) throw new DomainError("series_empty");

      await recordAudit(
        tx,
        {
          actorType: "staff",
          actorId: authorId,
          action: mode === "repeat" ? "series.created" : "series.extended",
          entity: "appointment_series",
          entityId: seriesId,
          after: {
            from: ctx.source.id,
            appointments: created.map((c) => ({
              id: c.id,
              startsAt: c.startsAt.toISOString(),
              staffId: c.staffId,
            })),
            skipped: final
              .filter((d) => !d.ok)
              .map((d) => (d.ok ? null : { date: d.date ?? d.month, reason: d.reason })),
          },
        },
        now,
      );

      // D-91 : un seul email liste les dates posées ; chaque RDV a son rappel (R-61).
      if (client.email) {
        const listed =
          mode === "repeat"
            ? [ctx.source.id, ...created.map((c) => c.id)]
            : created.map((c) => c.id);
        await enqueueEmail(tx, {
          type: "series_confirmation",
          toEmail: client.email,
          appointmentId: created[0].id,
          dedupeKey: `series:${seriesId}:${created[0].id}`,
          payload: { seriesId, appointmentIds: listed, extended: mode === "extend" },
        });
        for (const c of created) {
          await scheduleReminder(tx, {
            appointmentId: c.id,
            toEmail: client.email,
            startsAt: c.startsAt,
            now,
            reminderHours,
          });
        }
      }

      return {
        seriesId,
        ruleLabel: ruleLabel(ctx.anchor, ctx.rule),
        limit: ctx.limit,
        dates: final,
        created,
      };
    });
  } catch (error) {
    if (pgCode(error) === "23P01") throw new DomainError("slot_unavailable");
    throw error;
  }
}

/** « Répéter ce RDV » (D-83) : refus `already_in_series`, `invalid_series`, `series_empty`, et ceux d'une réservation. */
export function repeatAppointment(
  db: Database,
  input: RepeatInput & { authorStaffId: string },
  now: Date = new Date(),
): Promise<SeriesWritten> {
  return write(db, "repeat", input, input.authorStaffId, now);
}

/** « Prolonger la série » (D-90) : la même règle reprend après la dernière date prévue. */
export function extendSeries(
  db: Database,
  input: ExtendInput & { authorStaffId: string },
  now: Date = new Date(),
): Promise<SeriesWritten> {
  return write(db, "extend", input, input.authorStaffId, now);
}

// ---------------------------------------------------------------------------------------------------------------
// Annulation groupée par le salon (D-88)

export type SeriesCancelScope = "following" | "all";

/** Les RDV de la série que l'annulation toucherait : confirmés, pas terminés, à partir de celui-ci ou tous. */
export async function seriesCancellable(
  db: Database,
  input: { appointmentId: string; scope: SeriesCancelScope },
  now: Date = new Date(),
  lock = false,
): Promise<AppointmentRow[]> {
  const row = await loadRow(db, input.appointmentId, lock);
  if (!row.seriesId) throw new DomainError("not_in_series");
  assertActive(row, now);
  const query = db
    .select()
    .from(appointment)
    .where(
      and(
        eq(appointment.seriesId, row.seriesId),
        eq(appointment.status, "confirmed"),
        gt(appointment.endsAt, now),
        ...(input.scope === "following" ? [gte(appointment.startsAt, row.startsAt)] : []),
      ),
    )
    .orderBy(asc(appointment.startsAt));
  return lock ? query.for("update") : query;
}

/**
 * Annule « celui-ci et les suivants », ou tous les RDV à venir de la série (D-88). Les RDV passés restent. Chaque
 * annulation est au journal ; un seul email d'annulation liste les dates (D-91), retenu pour le gérant si l'un des RDV
 * était à traiter (R-43).
 */
export async function salonCancelSeries(
  db: Database,
  input: {
    appointmentId: string;
    scope: SeriesCancelScope;
    authorStaffId: string;
    holdEmails?: boolean;
  },
  now: Date = new Date(),
): Promise<{ cancelled: string[] }> {
  return db.transaction(async (tx) => {
    const authorId = await assertActiveAuthor(tx, input.authorStaffId);
    const rows = await seriesCancellable(tx, input, now, true);
    if (rows.length === 0) return { cancelled: [] };
    const ids = rows.map((r) => r.id);
    await tx
      .update(appointment)
      .set({ status: "cancelled_by_salon" })
      .where(inArray(appointment.id, ids));
    for (const row of rows) {
      await recordAudit(
        tx,
        {
          actorType: "staff",
          actorId: authorId,
          action: "appointment.cancelled",
          entity: "appointment",
          entityId: row.id,
          before: {
            status: row.status,
            startsAt: row.startsAt.toISOString(),
            staffId: row.staffId,
          },
          after: { status: "cancelled_by_salon", series: input.scope },
        },
        now,
      );
    }
    const [owner] = await tx
      .select({ email: customer.email })
      .from(customer)
      .where(eq(customer.id, rows[0].customerId));
    if (owner?.email) {
      await enqueueEmail(tx, {
        type: "cancellation",
        toEmail: owner.email,
        appointmentId: ids[0],
        dedupeKey: `cancellation:${ids[0]}`,
        payload: { by: "salon", appointmentIds: ids },
        ...(input.holdEmails ? { held: true } : {}),
      });
    }
    return { cancelled: ids };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Lecture pour la fiche RDV (D-92)

export interface SeriesView {
  seriesId: string;
  ruleLabel: string;
  /** Rang de ce RDV parmi les RDV non annulés de la série (« 3e sur 8 »), ou null s'il est annulé. */
  position: number | null;
  total: number;
  isLast: boolean;
  /** RDV à venir de la série, annulés exclus. */
  upcoming: { id: string; startsAt: Date; staffFirstName: string }[];
  /** RDV à venir avant celui-ci : « Tous les RDV à venir de la série » n'a de sens que s'il y en a (D-88). */
  upcomingBefore: number;
  /** Ce que touche « Celui-ci et les suivants ». */
  followingCount: number;
  /** Coiffeur demandé à la création, ou « any » (D-84). */
  staffChoice: string | "any";
  /** Prolongation (D-90) : premier jour possible et dernier jour (6 mois plus loin, D-86). */
  extendFirstDay: string;
  extendLimit: string;
}

export async function loadSeriesView(
  db: Database,
  appointmentId: string,
  now: Date = new Date(),
): Promise<SeriesView | null> {
  const row = await loadRow(db, appointmentId, false);
  if (!row.seriesId) return null;
  const [series] = await db
    .select()
    .from(appointmentSeries)
    .where(eq(appointmentSeries.id, row.seriesId));
  const all = await db
    .select({
      id: appointment.id,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      status: appointment.status,
      staffFirstName: staff.firstName,
    })
    .from(appointment)
    .innerJoin(staff, eq(staff.id, appointment.staffId))
    .where(eq(appointment.seriesId, row.seriesId))
    .orderBy(asc(appointment.startsAt));
  const kept = all.filter(
    (a) => a.status !== "cancelled_by_customer" && a.status !== "cancelled_by_salon",
  );
  const index = kept.findIndex((a) => a.id === row.id);
  const upcoming = kept.filter(
    (a) => a.status === "confirmed" && a.endsAt.getTime() > now.getTime(),
  );
  const rule: RepeatRule =
    series.frequency === "weekly"
      ? { frequency: "weekly", intervalWeeks: series.intervalWeeks as 1 | 2 | 3 | 4 }
      : { frequency: "monthly", monthlyMode: series.monthlyMode! };
  const { timezone } = await loadSettings(db);
  const today = DateTime.fromJSDate(now, { zone: timezone }).toISODate()!;
  const after = series.lastPlannedOn > today ? series.lastPlannedOn : today;
  return {
    seriesId: series.id,
    ruleLabel: ruleLabel(series.anchorOn, rule),
    position: index >= 0 ? index + 1 : null,
    total: kept.length,
    isLast: index >= 0 && index === kept.length - 1,
    upcoming: upcoming.map(({ id, startsAt, staffFirstName }) => ({
      id,
      startsAt,
      staffFirstName,
    })),
    upcomingBefore: upcoming.filter((a) => a.startsAt.getTime() < row.startsAt.getTime()).length,
    followingCount: upcoming.filter((a) => a.startsAt.getTime() >= row.startsAt.getTime()).length,
    staffChoice: series.staffId ?? "any",
    extendFirstDay: DateTime.fromISO(after).plus({ days: 1 }).toISODate()!,
    extendLimit: seriesLimit(after),
  };
}
