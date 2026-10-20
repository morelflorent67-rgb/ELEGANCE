import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import type { Database } from "@/db/types";
import { appointment, appointmentItem, customer, staff } from "@/db/schema";
import { loadSettings } from "@/modules/availability";
import {
  computeDashboard,
  type DashboardAppointment,
  type DashboardStaff,
  type DashboardTotals,
} from "./compute";
import { resolvePeriod, type Period, type PeriodKind } from "./period";

/** Combien de lapins récents le tableau de bord montre. */
const RECENT_NO_SHOWS = 5;

export interface RecentNoShow {
  appointmentId: string;
  customerId: string;
  /** « Adam K. » ; « Client supprimé » pour une fiche anonymisée (D-43). */
  customerName: string;
  /** Rang de ce lapin pour le client : 1 pour le premier (R-52). */
  ordinal: number;
  startsAt: Date;
  staffFirstName: string;
  /** Réservation en ligne bloquée par le gérant (R-52). */
  blocked: boolean;
}

export interface DashboardView {
  period: Period;
  totals: DashboardTotals;
  /** Les derniers lapins, toutes périodes confondues. */
  recentNoShows: RecentNoShow[];
  /** Nombre de lapins à partir duquel le gérant peut bloquer la réservation en ligne (réglage, R-52). */
  noShowBlockThreshold: number;
}

function displayName(firstName: string | null, lastName: string | null): string {
  if (!firstName && !lastName) return "Client supprimé";
  const initial = lastName ? ` ${lastName.charAt(0).toUpperCase()}.` : "";
  return `${firstName ?? ""}${initial}`.trim();
}

/**
 * Les chiffres d'une période, pour le tableau de bord du gérant (R-53 à R-55) : calculés ici, côté serveur, à l'heure
 * de Paris. Le chiffre d'affaires est un repère sans valeur comptable (R-55).
 */
export async function loadDashboard(
  db: Database,
  input: { kind: PeriodKind; date?: string },
  now: Date = new Date(),
): Promise<DashboardView> {
  const settings = await loadSettings(db);
  const period = resolvePeriod(input.kind, input.date, now, settings.timezone);

  const rows = await db
    .select({
      id: appointment.id,
      staffId: appointment.staffId,
      status: appointment.status,
      source: appointment.source,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      adjustedAmountCents: appointment.adjustedAmountCents,
    })
    .from(appointment)
    .where(and(gte(appointment.startsAt, period.start), lt(appointment.startsAt, period.end)));

  const prices = rows.length
    ? await db
        .select({
          appointmentId: appointmentItem.appointmentId,
          total: sql<number>`coalesce(sum(${appointmentItem.priceCents}), 0)::int`,
        })
        .from(appointmentItem)
        .where(
          inArray(
            appointmentItem.appointmentId,
            rows.map((r) => r.id),
          ),
        )
        .groupBy(appointmentItem.appointmentId)
    : [];
  const priceOf = new Map(prices.map((p) => [p.appointmentId, p.total]));
  const appointments: DashboardAppointment[] = rows.map((r) => ({
    ...r,
    priceCents: priceOf.get(r.id) ?? 0,
  }));

  // L'équipe active dans son ordre, puis les membres retirés qui ont encore des RDV sur la période.
  const team = await db
    .select({ id: staff.id, firstName: staff.firstName, role: staff.role, active: staff.active })
    .from(staff)
    .orderBy(asc(staff.sortOrder), asc(staff.firstName));
  const withAppointments = new Set(rows.map((r) => r.staffId));
  const shown: DashboardStaff[] = [
    ...team.filter((m) => m.active),
    ...team.filter((m) => !m.active && withAppointments.has(m.id)),
  ].map(({ id, firstName, role }) => ({ id, firstName, role }));

  const recent = await db
    .select({
      appointmentId: appointment.id,
      customerId: appointment.customerId,
      startsAt: appointment.startsAt,
      firstName: customer.firstName,
      lastName: customer.lastName,
      blocked: customer.onlineBookingBlocked,
      staffFirstName: staff.firstName,
    })
    .from(appointment)
    .innerJoin(customer, eq(customer.id, appointment.customerId))
    .innerJoin(staff, eq(staff.id, appointment.staffId))
    .where(eq(appointment.status, "no_show"))
    .orderBy(desc(appointment.startsAt), desc(appointment.id))
    .limit(RECENT_NO_SHOWS);
  const recentNoShows = await Promise.all(
    recent.map(async (r): Promise<RecentNoShow> => {
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(appointment)
        .where(
          and(
            eq(appointment.customerId, r.customerId),
            eq(appointment.status, "no_show"),
            lte(appointment.startsAt, r.startsAt),
          ),
        );
      return {
        appointmentId: r.appointmentId,
        customerId: r.customerId,
        customerName: displayName(r.firstName, r.lastName),
        ordinal: n,
        startsAt: r.startsAt,
        staffFirstName: r.staffFirstName,
        blocked: r.blocked,
      };
    }),
  );

  return {
    period,
    totals: computeDashboard(appointments, shown, now),
    recentNoShows,
    noShowBlockThreshold: settings.noShowBlockThreshold,
  };
}
