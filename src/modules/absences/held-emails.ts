import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db/types";
import { appointment, customer, emailOutbox } from "@/db/schema";
import { recordAudit } from "@/modules/audit/record";

// Les emails retenus jusqu'à la confirmation du gérant (R-43, D-56) : ceux des rendez-vous déplacés ou annulés pour
// cause d'absence, de fermeture, de nouveaux horaires ou de départ. Le planning est déjà à jour ; le client, lui, ne
// reçoit rien avant que le gérant ait confirmé avec son code (l'équipe a appelé les clients entre-temps, D-20).

export interface HeldEmail {
  id: string;
  type: (typeof emailOutbox.$inferSelect)["type"];
  appointmentId: string;
  customerName: string;
  /** Début actuel du rendez-vous. */
  startsAt: Date;
}

const heldAndPending = and(eq(emailOutbox.heldForManager, true), eq(emailOutbox.status, "pending"));

export async function listHeldEmails(db: Database): Promise<HeldEmail[]> {
  const rows = await db
    .select({
      id: emailOutbox.id,
      type: emailOutbox.type,
      appointmentId: emailOutbox.appointmentId,
      firstName: customer.firstName,
      lastName: customer.lastName,
      startsAt: appointment.startsAt,
    })
    .from(emailOutbox)
    .innerJoin(appointment, eq(appointment.id, emailOutbox.appointmentId))
    .innerJoin(customer, eq(customer.id, appointment.customerId))
    .where(heldAndPending)
    .orderBy(asc(emailOutbox.createdAt), asc(emailOutbox.id));
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    appointmentId: r.appointmentId!,
    customerName: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim(),
    startsAt: r.startsAt,
  }));
}

/**
 * Le gérant confirme : tous les emails retenus rejoignent la file normale (R-43). L'envoi se fait ensuite, comme pour
 * tout email (envoi immédiat après la réponse, reprise par le cron). Rien n'est écrit au journal s'il n'y a rien à
 * libérer ; sinon une seule entrée, sans nom ni adresse.
 */
export async function releaseHeldEmails(
  db: Database,
  managerId: string,
  now: Date = new Date(),
): Promise<{ count: number; appointmentIds: string[] }> {
  return db.transaction(async (tx) => {
    const held = await tx
      .select({ id: emailOutbox.id, appointmentId: emailOutbox.appointmentId })
      .from(emailOutbox)
      .where(heldAndPending)
      .for("update");
    if (held.length === 0) return { count: 0, appointmentIds: [] };

    for (const email of held) {
      await tx
        .update(emailOutbox)
        .set({ heldForManager: false, nextAttemptAt: now })
        .where(eq(emailOutbox.id, email.id));
    }
    const appointmentIds = [
      ...new Set(held.map((h) => h.appointmentId).filter((id): id is string => id !== null)),
    ];
    await recordAudit(
      tx,
      {
        actorType: "manager",
        actorId: managerId,
        action: "emails.released",
        entity: "email_outbox",
        entityId: "held",
        after: { count: held.length, appointmentIds },
      },
      now,
    );
    return { count: held.length, appointmentIds };
  });
}
