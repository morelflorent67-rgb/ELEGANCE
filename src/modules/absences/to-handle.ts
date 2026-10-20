import { and, asc, eq, gt, gte, inArray } from "drizzle-orm";
import { DateTime } from "luxon";
import type { Database } from "@/db/types";
import {
  absence,
  appointment,
  appointmentItem,
  closure,
  customer,
  emailOutbox,
  openingHours,
  serviceStaff,
  staff,
} from "@/db/schema";
import { checkSlot, eligibleStaff, loadSettings, loadSnapshot } from "@/modules/availability";
import { loadItems } from "@/modules/booking/change-appointment";

// Les rendez-vous « à traiter » (R-42, D-57) : confirmés, pas encore terminés, et qui ne tiennent plus. Rien n'est
// enregistré : la liste se déduit de l'état actuel (absences, fermetures, horaires, équipe, habilitations). Un
// rendez-vous déplacé ou annulé en sort tout seul, et supprimer une absence en sort ceux qu'elle touchait.

export type HandleReason =
  | { kind: "absence"; reason: string | null } // R-42 : le coiffeur est absent
  | { kind: "closure"; reason: string | null } // D-57 : le salon est fermé ce jour-là
  | { kind: "outside_hours" } // D-57 : hors des plages d'ouverture, ou à cheval sur la pause
  | { kind: "staff_left" } // D-57 : le coiffeur a quitté l'équipe
  | { kind: "not_eligible" }; // D-57 : le coiffeur n'est plus habilité pour une de ses prestations

export interface AppointmentToHandle {
  id: string;
  startsAt: Date;
  endsAt: Date;
  staffId: string;
  staffFirstName: string;
  customerId: string;
  customerName: string;
  phone: string | null;
  /** Prestations figées du rendez-vous (R-16), dans l'ordre. */
  services: string[];
  reasons: HandleReason[];
  /** Un email au client attend déjà la confirmation du gérant (R-43). */
  heldEmail: boolean;
}

/** Minutes depuis minuit, heure de Paris. */
const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export async function listAppointmentsToHandle(
  db: Database,
  now: Date = new Date(),
): Promise<AppointmentToHandle[]> {
  const { timezone: zone } = await loadSettings(db);
  const today = DateTime.fromJSDate(now, { zone }).toISODate()!;

  const rows = await db
    .select({
      id: appointment.id,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      staffId: appointment.staffId,
      staffFirstName: staff.firstName,
      staffActive: staff.active,
      customerId: appointment.customerId,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
    })
    .from(appointment)
    .innerJoin(staff, eq(staff.id, appointment.staffId))
    .innerJoin(customer, eq(customer.id, appointment.customerId))
    .where(and(eq(appointment.status, "confirmed"), gt(appointment.endsAt, now)))
    .orderBy(asc(appointment.startsAt), asc(appointment.id));
  if (rows.length === 0) return [];
  const appointmentIds = rows.map((r) => r.id);

  const [items, absences, closures, hours, links, held] = await Promise.all([
    db
      .select({
        appointmentId: appointmentItem.appointmentId,
        serviceId: appointmentItem.serviceId,
        name: appointmentItem.nameSnapshot,
      })
      .from(appointmentItem)
      .where(inArray(appointmentItem.appointmentId, appointmentIds))
      .orderBy(asc(appointmentItem.position)),
    db
      .select({
        staffId: absence.staffId,
        startsAt: absence.startsAt,
        endsAt: absence.endsAt,
        reason: absence.reason,
      })
      .from(absence)
      .where(gt(absence.endsAt, now)),
    db.select().from(closure).where(gte(closure.endsOn, today)),
    db.select().from(openingHours),
    db.select().from(serviceStaff),
    db
      .select({ appointmentId: emailOutbox.appointmentId })
      .from(emailOutbox)
      .where(and(eq(emailOutbox.heldForManager, true), eq(emailOutbox.status, "pending"))),
  ]);
  const heldIds = new Set(held.map((h) => h.appointmentId));
  const qualified = new Set(links.map((l) => `${l.serviceId}:${l.staffId}`));

  return rows.flatMap((row) => {
    const own = items.filter((i) => i.appointmentId === row.id);
    const reasons: HandleReason[] = [];

    if (!row.staffActive) reasons.push({ kind: "staff_left" });
    else if (own.some((i) => !qualified.has(`${i.serviceId}:${row.staffId}`))) {
      reasons.push({ kind: "not_eligible" });
    }

    for (const a of absences) {
      if (
        a.staffId === row.staffId &&
        a.startsAt.getTime() < row.endsAt.getTime() &&
        a.endsAt.getTime() > row.startsAt.getTime()
      ) {
        reasons.push({ kind: "absence", reason: a.reason });
      }
    }

    const start = DateTime.fromJSDate(row.startsAt, { zone });
    const date = start.toISODate()!;
    for (const c of closures) {
      if (c.startsOn <= date && date <= c.endsOn) reasons.push({ kind: "closure", reason: c.reason });
    }

    // Une seule plage doit contenir tout le rendez-vous : il ne chevauche jamais la pause (R-04).
    const from = start.hour * 60 + start.minute;
    const to = from + Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / 60_000);
    const fits = hours.some(
      (h) => h.weekday === start.weekday && minutesOf(h.opensAt) <= from && to <= minutesOf(h.closesAt),
    );
    if (!fits) reasons.push({ kind: "outside_hours" });

    if (reasons.length === 0) return [];
    return [
      {
        id: row.id,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        staffId: row.staffId,
        staffFirstName: row.staffFirstName,
        customerId: row.customerId,
        customerName: `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim(),
        phone: row.phone,
        services: own.map((i) => i.name),
        reasons,
        heldEmail: heldIds.has(row.id),
      },
    ];
  });
}

export async function countAppointmentsToHandle(db: Database, now: Date = new Date()): Promise<number> {
  return (await listAppointmentsToHandle(db, now)).length;
}

/**
 * Faut-il retenir l'email d'un changement décidé par le salon sur ce rendez-vous (R-43, D-56) ? Oui s'il est à traiter,
 * ou si un email est déjà retenu pour lui : le client ne reçoit rien avant la confirmation du gérant.
 */
export async function needsHold(
  db: Database,
  appointmentId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const [alreadyHeld] = await db
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.appointmentId, appointmentId),
        eq(emailOutbox.heldForManager, true),
        eq(emailOutbox.status, "pending"),
      ),
    )
    .limit(1);
  if (alreadyHeld) return true;
  return (await listAppointmentsToHandle(db, now)).some((a) => a.id === appointmentId);
}

export interface FreeColleague {
  id: string;
  firstName: string;
}

/**
 * Les collègues à qui confier ce rendez-vous (R-42) : actifs, habilités pour toutes ses prestations (R-13), de la
 * même catégorie (R-18), et libres sur son créneau (R-22 : ni rendez-vous, ni absence, ni pause, ni fermeture).
 * Un jour de fermeture, ou hors des horaires, personne n'est proposé : le créneau lui-même n'existe plus.
 */
export async function listFreeColleagues(
  db: Database,
  appointmentId: string,
  now: Date = new Date(),
): Promise<FreeColleague[]> {
  const [row] = await db
    .select()
    .from(appointment)
    .where(
      and(
        eq(appointment.id, appointmentId),
        eq(appointment.status, "confirmed"),
        gt(appointment.endsAt, now),
      ),
    );
  if (!row) return [];

  const { services, durationMinutes } = await loadItems(db, row);
  const candidates = (await eligibleStaff(db, services)).filter((c) => c.id !== row.staffId);
  if (candidates.length === 0) return [];
  const candidateIds = candidates.map((c) => c.id);

  const margin = 36 * 3_600_000; // couvre tout le jour de Paris du rendez-vous, changement d'heure compris
  const { snapshot } = await loadSnapshot(db, {
    from: new Date(row.startsAt.getTime() - margin),
    to: new Date(row.startsAt.getTime() + margin),
    staffIds: candidateIds,
    excludeAppointmentId: row.id,
  });
  const free = candidateIds.filter(
    (staffId) =>
      checkSlot(snapshot, {
        staffId,
        startsAt: row.startsAt,
        durationMinutes,
        audience: "salon",
        now,
      }).ok,
  );
  if (free.length === 0) return [];

  const names = await db
    .select({ id: staff.id, firstName: staff.firstName })
    .from(staff)
    .where(inArray(staff.id, free));
  return free.map((id) => names.find((n) => n.id === id)!).filter(Boolean);
}
