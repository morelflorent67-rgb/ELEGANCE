import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/types";
import { appointment, appointmentItem, staff } from "@/db/schema";

export type AppointmentStatus = (typeof appointment.$inferSelect)["status"];

export interface AppointmentView {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
  createdAt: Date;
  staffFirstName: string;
  note: string | null;
  /** « Pour qui ? » (D-80), ou null. */
  forName: string | null;
  /** RDV répété : sa série (D-71, D-92), ou null. */
  seriesId: string | null;
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
    createdAt: Date;
    staffFirstName: string;
    note: string | null;
    forName: string | null;
    seriesId: string | null;
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
  createdAt: appointment.createdAt,
  staffFirstName: staff.firstName,
  note: appointment.customerNote,
  forName: appointment.forName,
  seriesId: appointment.seriesId,
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

/**
 * Ce qu'il faut pour « Reprendre le même RDV » : les prestations (dans l'ordre) et le coiffeur d'un RDV passé du client.
 * Null si le RDV n'existe pas ou appartient à quelqu'un d'autre.
 */
export async function loadRepeatSource(
  db: Database,
  customerId: string,
  appointmentId: string,
): Promise<{ serviceIds: string[]; staffId: string } | null> {
  const [row] = await db
    .select({ staffId: appointment.staffId })
    .from(appointment)
    .where(and(eq(appointment.id, appointmentId), eq(appointment.customerId, customerId)));
  if (!row) return null;
  const items = await db
    .select({ serviceId: appointmentItem.serviceId })
    .from(appointmentItem)
    .where(eq(appointmentItem.appointmentId, appointmentId))
    .orderBy(asc(appointmentItem.position));
  return { serviceIds: items.map((i) => i.serviceId), staffId: row.staffId };
}
