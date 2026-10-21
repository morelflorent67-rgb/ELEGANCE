import { and, asc, eq, gt, gte, inArray, lt, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DateTime } from "luxon";
import type { Database } from "@/db/types";
import { absence, appointment, appointmentItem, customer, staff } from "@/db/schema";
import { capitalize, formatDay, parisDate } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { planningStatus, type PlanningStatus } from "@/modules/appointments/status";
import { loadSettings, loadSnapshot, openRangesOn } from "@/modules/availability";
import { listActiveStaff, type TeamMember } from "@/modules/staff/team";

// Ce que la tablette affiche (R-72) : le planning d'un jour en une colonne par coiffeur, et la fiche d'un RDV.
// Tout est calculé ici, côté serveur, à l'heure de Paris ; la tablette ne fait qu'afficher.

export interface PlanningAppointment {
  id: string;
  staffId: string;
  staffFirstName: string;
  startsAt: Date;
  endsAt: Date;
  /** Minutes depuis minuit, heure de Paris : la position dans la colonne. */
  startMinute: number;
  endMinute: number;
  customerId: string;
  /** Le titulaire du RDV (R-28). */
  customerName: string;
  /** « Pour qui ? » : le prénom du proche, ou null (D-80). */
  forName: string | null;
  /** Faux pour une fiche sans compte (D-70). */
  hasAccount: boolean;
  /** Faux pour une fiche sans email : aucun email ne part (D-81). */
  hasEmail: boolean;
  /** Numéro complet : la tablette est réservée à l'équipe. */
  phone: string;
  /** « Coupe homme + Taillage barbe » */
  summary: string;
  items: { name: string; priceCents: number; durationMin: number }[];
  totalPriceCents: number;
  /** Montant encaissé corrigé à la clôture (R-53, R-54), ou null : le prix de la carte. */
  adjustedAmountCents: number | null;
  durationMinutes: number;
  note: string | null;
  source: "online" | "salon";
  /** R-51 : honoré par défaut une fois passé. */
  status: PlanningStatus;
  /** R-52 : lapins déjà signalés pour ce client, ce RDV compris s'il en est un. */
  noShowCount: number;
  /** R-52 : réservation en ligne bloquée par le gérant. */
  blocked: boolean;
  /** Qui a réservé au salon (R-74), null pour une réservation en ligne. */
  bookedBy: string | null;
}

/** La fiche d'un RDV : les mêmes informations que dans le planning. */
export type AppointmentCard = PlanningAppointment;

export interface DayColumn {
  staff: TeamMember;
  appointments: PlanningAppointment[];
  absences: { startMinute: number; endMinute: number; reason: string | null }[];
}

export interface DayPlanning {
  /** « AAAA-MM-JJ » */
  date: string;
  /** « Mardi 3 novembre » */
  label: string;
  /** Faux : jour de repos ou fermeture exceptionnelle (R-01, R-03). */
  open: boolean;
  /** Plages d'ouverture en minutes depuis minuit ; la pause est le trou entre deux plages. */
  ranges: { from: number; to: number }[];
  columns: DayColumn[];
  /** RDV du jour, annulés exclus. */
  count: number;
  /** « À suivre » : les prochains RDV à venir, seulement le jour courant. */
  next: PlanningAppointment[];
}

const NEXT_COUNT = 4;

const bookedByStaff = alias(staff, "booked_by_staff");

const columns = {
  id: appointment.id,
  staffId: appointment.staffId,
  staffFirstName: staff.firstName,
  startsAt: appointment.startsAt,
  endsAt: appointment.endsAt,
  status: appointment.status,
  source: appointment.source,
  adjustedAmountCents: appointment.adjustedAmountCents,
  note: appointment.customerNote,
  forName: appointment.forName,
  customerId: customer.id,
  authUserId: customer.authUserId,
  email: customer.email,
  firstName: customer.firstName,
  lastName: customer.lastName,
  phone: customer.phone,
  blocked: customer.onlineBookingBlocked,
  bookedBy: bookedByStaff.firstName,
};

async function hydrate(
  db: Database,
  where: SQL | undefined,
  zone: string,
  now: Date,
): Promise<AppointmentCard[]> {
  const rows = await db
    .select(columns)
    .from(appointment)
    .innerJoin(customer, eq(customer.id, appointment.customerId))
    .innerJoin(staff, eq(staff.id, appointment.staffId))
    .leftJoin(bookedByStaff, eq(bookedByStaff.id, appointment.createdByStaffId))
    .where(where)
    .orderBy(asc(appointment.startsAt));
  if (rows.length === 0) return [];

  const items = await db
    .select({
      appointmentId: appointmentItem.appointmentId,
      name: appointmentItem.nameSnapshot,
      priceCents: appointmentItem.priceCents,
      durationMin: appointmentItem.durationMin,
    })
    .from(appointmentItem)
    .where(
      inArray(
        appointmentItem.appointmentId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(appointmentItem.position));
  const noShows = await db
    .select({ customerId: appointment.customerId, n: sql<number>`count(*)::int` })
    .from(appointment)
    .where(
      and(
        eq(appointment.status, "no_show"),
        inArray(appointment.customerId, [...new Set(rows.map((r) => r.customerId))]),
      ),
    )
    .groupBy(appointment.customerId);
  const noShowCount = new Map(noShows.map((n) => [n.customerId, n.n]));

  const minuteOf = (date: Date) => {
    const local = DateTime.fromJSDate(date, { zone });
    return local.hour * 60 + local.minute;
  };

  return rows.map((row) => {
    const own = items.filter((i) => i.appointmentId === row.id);
    return {
      id: row.id,
      staffId: row.staffId,
      staffFirstName: row.staffFirstName,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      startMinute: minuteOf(row.startsAt),
      endMinute: minuteOf(row.endsAt),
      customerId: row.customerId,
      customerName: `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim(),
      forName: row.forName,
      hasAccount: !!row.authUserId,
      hasEmail: !!row.email,
      phone: row.phone ? formatPhone(row.phone) : "",
      summary: own.map((i) => i.name).join(" + "),
      items: own.map(({ name, priceCents, durationMin }) => ({ name, priceCents, durationMin })),
      totalPriceCents: own.reduce((sum, i) => sum + i.priceCents, 0),
      adjustedAmountCents: row.adjustedAmountCents,
      durationMinutes: own.reduce((sum, i) => sum + i.durationMin, 0),
      note: row.note,
      source: row.source,
      status: planningStatus(row, now),
      noShowCount: noShowCount.get(row.customerId) ?? 0,
      blocked: row.blocked,
      bookedBy: row.bookedBy,
    };
  });
}

/** Le planning d'un jour (« AAAA-MM-JJ », heure de Paris) : une colonne par coiffeur actif. */
export async function loadDayPlanning(
  db: Database,
  date: string,
  now: Date = new Date(),
): Promise<DayPlanning> {
  const { timezone } = await loadSettings(db);
  const start = DateTime.fromISO(date, { zone: timezone }).startOf("day");
  const from = start.toJSDate();
  const to = start.plus({ days: 1 }).toJSDate();

  const team = await listActiveStaff(db);
  const [{ snapshot }, list, absences] = await Promise.all([
    loadSnapshot(db, { from, to, staffIds: team.map((m) => m.id) }),
    hydrate(
      db,
      and(
        gte(appointment.startsAt, from),
        lt(appointment.startsAt, to),
        ne(appointment.status, "cancelled_by_customer"),
        ne(appointment.status, "cancelled_by_salon"),
      ),
      timezone,
      now,
    ),
    db
      .select({
        staffId: absence.staffId,
        startsAt: absence.startsAt,
        endsAt: absence.endsAt,
        reason: absence.reason,
      })
      .from(absence)
      .where(and(lt(absence.startsAt, to), gt(absence.endsAt, from))),
  ]);

  const ranges = openRangesOn(snapshot, date);
  const minuteIn = (instant: Date, edge: "start" | "end") => {
    if (instant <= from) return 0;
    if (instant >= to) return 24 * 60;
    const local = DateTime.fromJSDate(instant, { zone: timezone });
    return local.hour * 60 + local.minute + (edge === "end" && local.second > 0 ? 1 : 0);
  };

  const cols: DayColumn[] = team.map((member) => ({
    staff: member,
    appointments: list.filter((a) => a.staffId === member.id),
    absences: absences
      .filter((a) => a.staffId === member.id)
      .map((a) => ({
        startMinute: minuteIn(a.startsAt, "start"),
        endMinute: minuteIn(a.endsAt, "end"),
        reason: a.reason,
      })),
  }));

  const order = new Map(team.map((m, index) => [m.id, index]));
  const isToday = parisDate(now) === date;
  const next = isToday
    ? list
        .filter((a) => a.status === "upcoming")
        .sort(
          (a, b) =>
            a.startsAt.getTime() - b.startsAt.getTime() ||
            (order.get(a.staffId) ?? 0) - (order.get(b.staffId) ?? 0),
        )
        .slice(0, NEXT_COUNT)
    : [];

  return {
    date,
    label: capitalize(formatDay(start.set({ hour: 12 }).toJSDate())),
    open: ranges.length > 0,
    ranges,
    columns: cols,
    count: list.length,
    next,
  };
}

/** La fiche d'un RDV, ou null s'il n'existe pas. Annulés compris : la fiche d'un RDV annulé reste consultable. */
export async function loadAppointmentCard(
  db: Database,
  appointmentId: string,
  now: Date = new Date(),
): Promise<AppointmentCard | null> {
  const { timezone } = await loadSettings(db);
  const [card] = await hydrate(db, eq(appointment.id, appointmentId), timezone, now);
  return card ?? null;
}
