import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/types";
import { appointment, customer } from "@/db/schema";
import { DomainError } from "@/lib/domain-error";
import { recordAudit } from "@/modules/audit/record";
import { enqueueEmail } from "@/modules/mail/outbox";
import { assertActiveAuthor } from "@/modules/staff/team";
import type { ServiceRow } from "@/modules/availability";
import {
  applyReschedule,
  loadItems,
  pgCode,
  type AppointmentRow,
  type RescheduledAppointment,
} from "./change-appointment";

// Modification, annulation et lapins décidés par le salon sur la tablette (R-33, R-51, R-74). Le salon n'a pas le délai
// de 48 h du client ; il ne touche en revanche jamais à un RDV déjà terminé ni déjà annulé. Chaque action exige un
// auteur choisi sur la tablette (R-74), vérifié ici, et s'inscrit au journal dans la même transaction.

/** Le RDV, verrouillé : n'importe quel client, c'est le salon qui agit. */
async function loadLocked(db: Database, appointmentId: string): Promise<AppointmentRow> {
  const [row] = await db
    .select()
    .from(appointment)
    .where(eq(appointment.id, appointmentId))
    .for("update");
  if (!row) throw new DomainError("appointment_not_found");
  return row;
}

/** Un RDV confirmé et pas encore terminé : seul état où le salon le déplace ou l'annule. */
function assertSalonChangeable(row: AppointmentRow, now: Date): void {
  if (row.status !== "confirmed") throw new DomainError("not_modifiable");
  if (row.endsAt.getTime() <= now.getTime()) throw new DomainError("appointment_over");
}

/** Un RDV que le salon peut encore déplacer, avec ce qu'il faut pour chercher un autre créneau (prestations figées, R-16). */
export interface MovableAppointment {
  id: string;
  staffId: string;
  startsAt: Date;
  services: ServiceRow[];
  durationMinutes: number;
}

/** Refus : `appointment_not_found`, `not_modifiable` (annulé ou signalé), `appointment_over` (terminé). */
export async function loadSalonMovable(
  db: Database,
  appointmentId: string,
  now: Date = new Date(),
): Promise<MovableAppointment> {
  const [row] = await db.select().from(appointment).where(eq(appointment.id, appointmentId));
  if (!row) throw new DomainError("appointment_not_found");
  assertSalonChangeable(row, now);
  const { services, durationMinutes } = await loadItems(db, row);
  return { id: row.id, staffId: row.staffId, startsAt: row.startsAt, services, durationMinutes };
}

export interface SalonCancelInput {
  appointmentId: string;
  /** Membre de l'équipe qui annule (R-74). */
  authorStaffId: string;
}

/**
 * Annule un RDV à la demande du salon (R-33). Un email d'annulation part au client, avec un texte propre au salon
 * (D-52). Rejouer l'annulation d'un RDV déjà annulé par le salon ne fait rien de plus : pas de second email.
 */
export async function salonCancelAppointment(
  db: Database,
  input: SalonCancelInput,
  now: Date = new Date(),
): Promise<{ alreadyCancelled: boolean }> {
  return db.transaction(async (tx) => {
    const authorId = await assertActiveAuthor(tx, input.authorStaffId);
    const row = await loadLocked(tx, input.appointmentId);
    if (row.status === "cancelled_by_salon") return { alreadyCancelled: true };
    assertSalonChangeable(row, now);

    await tx
      .update(appointment)
      .set({ status: "cancelled_by_salon" })
      .where(eq(appointment.id, row.id));
    await recordAudit(
      tx,
      {
        actorType: "staff",
        actorId: authorId,
        action: "appointment.cancelled",
        entity: "appointment",
        entityId: row.id,
        before: { status: row.status, startsAt: row.startsAt.toISOString(), staffId: row.staffId },
        after: { status: "cancelled_by_salon" },
      },
      now,
    );

    const [owner] = await tx
      .select({ email: customer.email })
      .from(customer)
      .where(eq(customer.id, row.customerId));
    if (owner?.email) {
      await enqueueEmail(tx, {
        type: "cancellation",
        toEmail: owner.email,
        appointmentId: row.id,
        dedupeKey: `cancellation:${row.id}`,
        payload: { by: "salon" },
      });
    }
    return { alreadyCancelled: false };
  });
}

export interface SalonRescheduleInput {
  appointmentId: string;
  /** Un coiffeur précis, ou « any » pour « Sans préférence » (R-20). */
  staffId: string | "any";
  startsAt: Date;
  authorStaffId: string;
}

/**
 * Déplace un RDV à la demande du salon : jour, heure et coiffeur, jamais les prestations (D-51). Mêmes contrôles de
 * créneau que pour le client, avec la grille et les exemptions du salon (R-04, R-27). L'email de modification part au
 * client avec le texte du salon (D-52).
 */
export async function salonRescheduleAppointment(
  db: Database,
  input: SalonRescheduleInput,
  now: Date = new Date(),
): Promise<RescheduledAppointment> {
  try {
    return await db.transaction(async (tx) => {
      const authorId = await assertActiveAuthor(tx, input.authorStaffId);
      const row = await loadLocked(tx, input.appointmentId);
      assertSalonChangeable(row, now);
      return applyReschedule(
        tx,
        row,
        {
          staffId: input.staffId,
          startsAt: input.startsAt,
          audience: "salon",
          actor: { type: "staff", id: authorId },
        },
        now,
      );
    });
  } catch (error) {
    // R-23 : la base a refusé le chevauchement (course perdue).
    if (pgCode(error) === "23P01") throw new DomainError("slot_unavailable");
    throw error;
  }
}

/** Compte les lapins d'un client : ses RDV « non venu » (R-52). */
export async function countNoShows(db: Database, customerId: string): Promise<number> {
  const rows = await db
    .select({ id: appointment.id })
    .from(appointment)
    .where(and(eq(appointment.customerId, customerId), eq(appointment.status, "no_show")));
  return rows.length;
}

export interface AttendanceInput {
  appointmentId: string;
  authorStaffId: string;
}

/**
 * Signale un lapin (R-51, R-52) : un RDV confirmé dont l'heure de début est passée devient « non venu ». Le coiffeur
 * reste occupé sur ce créneau (R-23). Un RDV non signalé est honoré par défaut, sans rien enregistrer.
 */
export async function markNoShow(
  db: Database,
  input: AttendanceInput,
  now: Date = new Date(),
): Promise<{ alreadyMarked: boolean; noShowCount: number }> {
  return db.transaction(async (tx) => {
    const authorId = await assertActiveAuthor(tx, input.authorStaffId);
    const row = await loadLocked(tx, input.appointmentId);
    if (row.status === "no_show") {
      return { alreadyMarked: true, noShowCount: await countNoShows(tx, row.customerId) };
    }
    if (row.status !== "confirmed") throw new DomainError("not_modifiable");
    if (row.startsAt.getTime() > now.getTime()) throw new DomainError("not_started");

    await tx.update(appointment).set({ status: "no_show" }).where(eq(appointment.id, row.id));
    await recordAudit(
      tx,
      {
        actorType: "staff",
        actorId: authorId,
        action: "appointment.no_show",
        entity: "appointment",
        entityId: row.id,
        before: { status: row.status },
        after: { status: "no_show" },
      },
      now,
    );
    return { alreadyMarked: false, noShowCount: await countNoShows(tx, row.customerId) };
  });
}

/** Retire un lapin signalé par erreur : le RDV redevient confirmé (donc honoré une fois passé). */
export async function undoNoShow(
  db: Database,
  input: AttendanceInput,
  now: Date = new Date(),
): Promise<{ noShowCount: number }> {
  return db.transaction(async (tx) => {
    const authorId = await assertActiveAuthor(tx, input.authorStaffId);
    const row = await loadLocked(tx, input.appointmentId);
    if (row.status !== "no_show") throw new DomainError("not_no_show");

    await tx.update(appointment).set({ status: "confirmed" }).where(eq(appointment.id, row.id));
    await recordAudit(
      tx,
      {
        actorType: "staff",
        actorId: authorId,
        action: "appointment.no_show_undone",
        entity: "appointment",
        entityId: row.id,
        before: { status: row.status },
        after: { status: "confirmed" },
      },
      now,
    );
    return { noShowCount: await countNoShows(tx, row.customerId) };
  });
}
