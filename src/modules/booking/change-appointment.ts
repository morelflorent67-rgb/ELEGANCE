import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { DateTime } from "luxon";
import type { Database } from "@/db/types";
import { appointment, appointmentItem, customer, service, staff } from "@/db/schema";
import { DomainError } from "@/lib/domain-error";
import { recordAudit } from "@/modules/audit/record";
import {
  checkSlot,
  eligibleStaff,
  loadSettings,
  loadSnapshot,
  pickStaff,
  type Audience,
  type ServiceRow,
} from "@/modules/availability";
import { enqueueEmail } from "@/modules/mail/outbox";

// Modification et annulation d'un RDV par le client (R-30 à R-32). Le délai se décide ici, sur l'horloge reçue en
// paramètre, avec `salon_settings.change_cutoff_hours` : le navigateur n'a jamais le dernier mot.

const HOUR = 3_600_000;

export type AppointmentRow = typeof appointment.$inferSelect;

/** Un RDV que son client peut encore modifier ou annuler en ligne. */
export interface ChangeableAppointment {
  id: string;
  startsAt: Date;
  endsAt: Date;
  staffId: string;
  staffFirstName: string;
  note: string | null;
  /** Prestations figées au moment de la réservation (R-16), dans l'ordre. */
  items: { serviceId: string; name: string; priceCents: number; durationMin: number }[];
  durationMinutes: number;
  totalPriceCents: number;
  /** Lignes de la carte correspondantes, pour recalculer l'habilitation des coiffeurs (R-13). */
  services: ServiceRow[];
}

/** Le RDV appartient-il bien à ce client ? Sinon « introuvable » : on ne révèle rien sur les RDV des autres. */
async function loadOwn(
  db: Database,
  customerId: string,
  appointmentId: string,
  lock: boolean,
): Promise<AppointmentRow> {
  const query = db
    .select()
    .from(appointment)
    .where(and(eq(appointment.id, appointmentId), eq(appointment.customerId, customerId)));
  const [row] = lock ? await query.for("update") : await query;
  if (!row) throw new DomainError("appointment_not_found");
  return row;
}

/**
 * R-30 : jusqu'à `cutoffHours` avant le début, inclus. R-32 en découle : un RDV pris moins de 48 h avant son début
 * est déjà dans ce délai dès sa création. R-31 : passé ce délai, le client appelle le salon.
 */
function assertChangeable(row: AppointmentRow, cutoffHours: number, now: Date): void {
  if (row.status !== "confirmed") throw new DomainError("not_modifiable");
  if (now.getTime() > row.startsAt.getTime() - cutoffHours * HOUR) {
    throw new DomainError("change_too_late");
  }
}

export async function loadItems(db: Database, row: AppointmentRow) {
  const items = await db
    .select({
      serviceId: appointmentItem.serviceId,
      name: appointmentItem.nameSnapshot,
      priceCents: appointmentItem.priceCents,
      durationMin: appointmentItem.durationMin,
    })
    .from(appointmentItem)
    .where(eq(appointmentItem.appointmentId, row.id))
    .orderBy(asc(appointmentItem.position));
  // Les prestations sont relues sans filtre « active » ni « en ligne » : le RDV existe déjà (R-16).
  const found = await db
    .select()
    .from(service)
    .where(
      inArray(
        service.id,
        items.map((i) => i.serviceId),
      ),
    );
  const byId = new Map(found.map((s) => [s.id, s]));
  return {
    items,
    services: items.map((i) => byId.get(i.serviceId)!),
    durationMinutes: items.reduce((sum, i) => sum + i.durationMin, 0),
    totalPriceCents: items.reduce((sum, i) => sum + i.priceCents, 0),
  };
}

/**
 * Le RDV d'un client, à condition qu'il soit encore modifiable en ligne. Refus : `appointment_not_found`,
 * `not_modifiable` (déjà annulé ou honoré), `change_too_late` (R-30, R-31, R-32).
 */
export async function loadChangeableAppointment(
  db: Database,
  customerId: string,
  appointmentId: string,
  now: Date = new Date(),
): Promise<ChangeableAppointment> {
  const row = await loadOwn(db, customerId, appointmentId, false);
  const { changeCutoffHours } = await loadSettings(db);
  assertChangeable(row, changeCutoffHours, now);
  const [member] = await db
    .select({ firstName: staff.firstName })
    .from(staff)
    .where(eq(staff.id, row.staffId));
  return {
    id: row.id,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    staffId: row.staffId,
    staffFirstName: member.firstName,
    note: row.customerNote,
    ...(await loadItems(db, row)),
  };
}

/** Annule le RDV d'un client (R-30). Rejouer l'annulation d'un RDV déjà annulé ne fait rien de plus : pas de second email. */
export async function cancelAppointment(
  db: Database,
  input: { customerId: string; appointmentId: string },
  now: Date = new Date(),
): Promise<{ alreadyCancelled: boolean }> {
  return db.transaction(async (tx) => {
    const row = await loadOwn(tx, input.customerId, input.appointmentId, true);
    if (row.status === "cancelled_by_customer") return { alreadyCancelled: true };
    const { changeCutoffHours } = await loadSettings(tx);
    assertChangeable(row, changeCutoffHours, now);

    await tx
      .update(appointment)
      .set({ status: "cancelled_by_customer" })
      .where(eq(appointment.id, row.id));
    await recordAudit(
      tx,
      {
        actorType: "customer",
        actorId: input.customerId,
        action: "appointment.cancelled",
        entity: "appointment",
        entityId: row.id,
        before: { status: row.status, startsAt: row.startsAt.toISOString(), staffId: row.staffId },
        after: { status: "cancelled_by_customer" },
      },
      now,
    );

    const [owner] = await tx
      .select({ email: customer.email })
      .from(customer)
      .where(eq(customer.id, input.customerId));
    if (owner?.email) {
      await enqueueEmail(tx, {
        type: "cancellation",
        toEmail: owner.email,
        appointmentId: row.id,
        dedupeKey: `cancellation:${row.id}`,
      });
    }
    return { alreadyCancelled: false };
  });
}

export interface RescheduleInput {
  customerId: string;
  appointmentId: string;
  /** Un coiffeur précis, ou « any » pour « Sans préférence » (R-20). */
  staffId: string | "any";
  startsAt: Date;
}

export interface RescheduledAppointment {
  /** Faux si le RDV était déjà à ce créneau avec ce coiffeur : rien n'a changé, aucun email. */
  changed: boolean;
  staffId: string;
  startsAt: Date;
  endsAt: Date;
}

/** Code d'erreur Postgres, qu'il soit direct ou enveloppé par Drizzle. */
export function pgCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

/** Qui déplace le RDV : le client (R-30) ou un membre de l'équipe sur la tablette (R-33, R-74). */
export type ChangeActor = { type: "customer" | "staff"; id: string };

/**
 * Déplace un RDV déjà verrouillé et déjà jugé modifiable par l'appelant : le client avec son délai de 48 h
 * (`rescheduleAppointment`), le salon sans délai (`salonRescheduleAppointment`). Les contrôles de créneau sont les
 * mêmes dans les deux cas (R-01 à R-06 pour le client, grille et horaires du salon sinon, R-13, R-21 à R-23) ;
 * la contrainte d'exclusion de la base reste la barrière finale.
 */
export async function applyReschedule(
  tx: Database,
  row: AppointmentRow,
  input: {
    staffId: string | "any";
    startsAt: Date;
    audience: Audience;
    actor: ChangeActor;
    /** L'email du client attend la confirmation du gérant (R-43, D-56). */
    holdEmails?: boolean;
  },
  now: Date,
): Promise<RescheduledAppointment> {
  const settings = await loadSettings(tx);
  const { services, durationMinutes } = await loadItems(tx, row);
  let candidates = await eligibleStaff(tx, services);
  if (input.staffId !== "any") candidates = candidates.filter((c) => c.id === input.staffId);
  if (candidates.length === 0) throw new DomainError("staff_not_eligible");
  const candidateIds = candidates.map((c) => c.id);

  await tx
    .select({ id: staff.id })
    .from(staff)
    .where(inArray(staff.id, candidateIds))
    .orderBy(staff.id)
    .for("update");

  // Fenêtre large : elle couvre tout le jour de Paris du nouveau créneau, quel que soit le changement d'heure.
  const margin = 36 * HOUR;
  const { snapshot } = await loadSnapshot(tx, {
    from: new Date(input.startsAt.getTime() - margin),
    to: new Date(input.startsAt.getTime() + margin),
    staffIds: candidateIds,
    excludeAppointmentId: row.id,
  });

  const checks = candidateIds.map((staffId) => ({
    staffId,
    result: checkSlot(snapshot, {
      staffId,
      startsAt: input.startsAt,
      durationMinutes,
      audience: input.audience,
      now,
    }),
  }));
  const free = checks.filter((c) => c.result.ok).map((c) => c.staffId);
  if (free.length === 0) {
    const reason = checks
      .map((c) => (c.result.ok ? null : c.result.reason))
      .find((r) => r !== "busy");
    throw new DomainError(reason ?? "slot_unavailable");
  }

  const sameStart = input.startsAt.getTime() === row.startsAt.getTime();
  const date = DateTime.fromJSDate(input.startsAt, { zone: settings.timezone }).toISODate()!;
  const staffId =
    input.staffId !== "any"
      ? free[0]
      : sameStart && free.includes(row.staffId)
        ? row.staffId // « Sans préférence » sur le même horaire : on garde son coiffeur
        : pickStaff(free, snapshot.appointments, date, settings.timezone);
  const endsAt = new Date(input.startsAt.getTime() + durationMinutes * 60_000);

  if (sameStart && staffId === row.staffId) {
    return { changed: false, staffId, startsAt: input.startsAt, endsAt };
  }

  await tx
    .update(appointment)
    .set({ staffId, startsAt: input.startsAt, endsAt })
    .where(eq(appointment.id, row.id));
  await recordAudit(
    tx,
    {
      actorType: input.actor.type,
      actorId: input.actor.id,
      action: "appointment.rescheduled",
      entity: "appointment",
      entityId: row.id,
      before: { startsAt: row.startsAt.toISOString(), staffId: row.staffId },
      after: { startsAt: input.startsAt.toISOString(), staffId },
    },
    now,
  );

  const [owner] = await tx
    .select({ email: customer.email })
    .from(customer)
    .where(eq(customer.id, row.customerId));
  if (owner?.email) {
    const names = await tx
      .select({ id: staff.id, firstName: staff.firstName })
      .from(staff)
      .where(inArray(staff.id, [row.staffId, staffId]));
    const nameOf = (id: string) => names.find((n) => n.id === id)?.firstName ?? null;
    // Une clé unique par déplacement : un RDV peut être déplacé plusieurs fois.
    // Le message garde l'ancien ET le nouveau créneau : si l'envoi tarde (panne) et que le RDV bouge encore,
    // chaque email reste fidèle au déplacement qu'il annonce.
    await enqueueEmail(tx, {
      type: "modification",
      toEmail: owner.email,
      appointmentId: row.id,
      dedupeKey: `modification:${row.id}:${randomUUID()}`,
      ...(input.holdEmails ? { held: true } : {}),
      payload: {
        previousStartsAt: row.startsAt.toISOString(),
        previousStaffFirstName: nameOf(row.staffId),
        startsAt: input.startsAt.toISOString(),
        staffFirstName: nameOf(staffId),
        // L'horloge qui a décidé des délais : R-32 compare cet instant à celui du nouveau créneau.
        changedAt: now.toISOString(),
        // D-52 : un changement décidé par le salon se dit autrement (« suite à notre échange »).
        ...(input.actor.type === "staff" ? { by: "salon" } : {}),
      },
    });
  }

  return { changed: true, staffId, startsAt: input.startsAt, endsAt };
}

/**
 * Déplace le RDV d'un client vers un autre créneau, éventuellement avec un autre coiffeur (R-30). Le RDV garde son
 * identifiant, ses prestations et son prix figés (R-16) : seuls l'heure et le coiffeur changent. L'ancien créneau est
 * libéré et le nouveau pris dans la même transaction. Le nouveau créneau peut être à moins de 48 h : le RDV n'est
 * alors plus modifiable en ligne (R-30, R-32).
 */
export async function rescheduleAppointment(
  db: Database,
  input: RescheduleInput,
  now: Date = new Date(),
): Promise<RescheduledAppointment> {
  try {
    return await db.transaction(async (tx) => {
      const row = await loadOwn(tx, input.customerId, input.appointmentId, true);
      const settings = await loadSettings(tx);
      assertChangeable(row, settings.changeCutoffHours, now);
      return applyReschedule(
        tx,
        row,
        {
          staffId: input.staffId,
          startsAt: input.startsAt,
          audience: "online",
          actor: { type: "customer", id: input.customerId },
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
