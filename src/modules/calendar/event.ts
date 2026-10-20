import { asc, eq } from "drizzle-orm";
import type { Database } from "@/db/types";
import { appointment, appointmentItem, staff } from "@/db/schema";
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

  return {
    uid: `appointment-${row.id}@elegance-strasbourg`,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    summary: `${items.map((i) => i.name).join(" + ")} chez ${SALON.name}`,
    description: `Avec ${row.staffFirstName}, paiement sur place. Pour un changement : ${SALON.phoneDisplay}.`,
    location: salonAddressLine,
  };
}
