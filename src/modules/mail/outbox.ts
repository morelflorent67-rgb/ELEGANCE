import type { Database } from "@/db/types";
import { emailOutbox } from "@/db/schema";

export type EmailType = (typeof emailOutbox.$inferInsert)["type"];

/**
 * Met un email dans la file d'envoi (principe 7). Appelé dans la même transaction que l'action qui le motive :
 * le RDV et son email existent ensemble ou pas du tout, et aucun envoi n'a lieu pendant la réservation.
 * `dedupeKey` garantit qu'un même message ne part pas deux fois.
 */
export async function enqueueEmail(
  db: Database,
  input: {
    type: EmailType;
    toEmail: string;
    appointmentId: string | null;
    dedupeKey: string;
    runAt?: Date;
    /** Données propres au message (ex. l'ancien créneau d'un déplacement). Rien de plus que ce que l'email affiche. */
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await db
    .insert(emailOutbox)
    .values({
      type: input.type,
      toEmail: input.toEmail,
      appointmentId: input.appointmentId,
      dedupeKey: input.dedupeKey,
      ...(input.payload ? { payload: input.payload } : {}),
      ...(input.runAt ? { nextAttemptAt: input.runAt } : {}),
    })
    .onConflictDoNothing({ target: emailOutbox.dedupeKey });
}
