import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/types";
import { appointment, appointmentItem, staff } from "@/db/schema";

export type AppointmentStatus = (typeof appointment.$inferSelect)["status"];

export interface AppointmentView {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
  staffFirstName: string;
  note: string | null;
  items: { name: string; priceCents: number; durationMin: number }[];
  totalPriceCents: number;
  durationMinutes: number;
}

async function withItems(
  db: Database,
  rows: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    status: AppointmentStatus;
    staffFirstName: string;
    note: string | null;
  }[],
): Promise<AppointmentView[]> {
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
  return rows.map((row) => {
    const own = items.filter((i) => i.appointmentId === row.id);
    return {
      ...row,
      items: own.map(({ name, priceCents, durationMin }) => ({ name, priceCents, durationMin })),
      totalPriceCents: own.reduce((sum, i) => sum + i.priceCents, 0),
      durationMinutes: own.reduce((sum, i) => sum + i.durationMin, 0),
    };
  });
}

const columns = {
  id: appointment.id,
  startsAt: appointment.startsAt,
  endsAt: appointment.endsAt,
  status: appointment.status,
  staffFirstName: staff.firstName,
  note: appointment.customerNote,
};

/** Un RDV d'un client, ou null s'il n'existe pas ou appartient à quelqu'un d'autre : on ne révèle rien. */
export async function loadCustomerAppointment(
  db: Database,
  customerId: string,
  appointmentId: string,
): Promise<AppointmentView | null> {
  const rows = await db
    .select(columns)
    .from(appointment)
    .innerJoin(staff, eq(staff.id, appointment.staffId))
    .where(and(eq(appointment.id, appointmentId), eq(appointment.customerId, customerId)));
  return (await withItems(db, rows))[0] ?? null;
}

/** Tous les RDV d'un client, le plus récent d'abord. */
export async function listCustomerAppointments(
  db: Database,
  customerId: string,
): Promise<AppointmentView[]> {
  const rows = await db
    .select(columns)
    .from(appointment)
    .innerJoin(staff, eq(staff.id, appointment.staffId))
    .where(eq(appointment.customerId, customerId))
    .orderBy(desc(appointment.startsAt));
  return withItems(db, rows);
}
