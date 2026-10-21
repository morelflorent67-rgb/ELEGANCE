import { and, asc, count, eq, gt } from "drizzle-orm";
import type { Database } from "@/db/types";
import { appointment, appointmentItem, auditLog, staff } from "@/db/schema";
import { SALON, salonAddressLine } from "@/lib/salon";
import type { IcsEvent } from "./ics";

/** Événement d'agenda d'un RDV, ou null s'il n'existe pas ou n'est plus actif. */
export async function loadCalendarEvent(
  db: Database,
  appointmentId: string,
): Promise<IcsEvent | null> {
  const [row] = await db
    .select({
      id: appointment.id,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      status: appointment.status,
      staffFirstName: staff.firstName,
    })
    .from(appointment)
    .innerJoin(staff, eq(staff.id, appointment.staffId))
    .where(eq(appointment.id, appointmentId));
  if (!row || row.status === "cancelled_by_customer" || row.status === "cancelled_by_salon")
    return null;

  const items = await db
    .select({ name: appointmentItem.nameSnapshot })
    .from(appointmentItem)
    .where(eq(appointmentItem.appointmentId, appointmentId))
    .orderBy(asc(appointmentItem.position));

  // Chaque déplacement augmente le numéro de version : l'agenda met à jour l'événement déjà ajouté (même UID).
  const [{ moves }] = await db
    .select({ moves: count() })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entity, "appointment"),
        eq(auditLog.entityId, row.id),
        eq(auditLog.action, "appointment.rescheduled"),
      ),
    );

  return {
    uid: `appointment-${row.id}@elegance-strasbourg`,
    sequence: moves,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    summary: `${items.map((i) => i.name).join(" + ")} chez ${SALON.name}`,
    description: `Avec ${row.staffFirstName}, paiement sur place. Pour un changement : ${SALON.phoneDisplay}.`,
    location: salonAddressLine,
  };
}

/** Les RDV à venir d'une série, pour « Ajouter à l'agenda » de son email (D-91). Vide si plus rien n'est à venir. */
export async function loadSeriesCalendarEvents(
  db: Database,
  seriesId: string,
  now: Date = new Date(),
): Promise<IcsEvent[]> {
  const rows = await db
    .select({ id: appointment.id })
    .from(appointment)
    .where(
      and(
        eq(appointment.seriesId, seriesId),
        eq(appointment.status, "confirmed"),
        gt(appointment.endsAt, now),
      ),
    )
    .orderBy(asc(appointment.startsAt));
  const events = await Promise.all(rows.map((r) => loadCalendarEvent(db, r.id)));
  return events.filter((e): e is IcsEvent => e !== null);
}
