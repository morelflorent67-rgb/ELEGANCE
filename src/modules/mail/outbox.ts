import type { Database } from "@/db/types";
import { emailOutbox } from "@/db/schema";

export type EmailType = (typeof emailOutbox.$inferInsert)["type"];

/**
 * Met un email dans la file d'envoi (principe 7). Appelé dans la même transaction que l'action qui le motive :
 * le RDV et son email existent ensemble ou pas du tout, et aucun envoi n'a lieu pendant la réservation.
 * `dedupeKey` garantit qu'un même message ne part pas deux fois. Renvoie vrai si le message est nouveau, faux si la
 * même clé existait déjà.
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
    /** Retenu jusqu'à la confirmation du gérant (R-43, D-56) : ni l'envoi immédiat ni le cron ne le prennent. */
    held?: boolean;
  },
): Promise<boolean> {
  const inserted = await db
    .insert(emailOutbox)
    .values({
      type: input.type,
      toEmail: input.toEmail,
      appointmentId: input.appointmentId,
      dedupeKey: input.dedupeKey,
      ...(input.payload ? { payload: input.payload } : {}),
      ...(input.held ? { heldForManager: true } : {}),
      ...(input.runAt ? { nextAttemptAt: input.runAt } : {}),
    })
    .onConflictDoNothing({ target: emailOutbox.dedupeKey })
    .returning({ id: emailOutbox.id });
  return inserted.length > 0;
}
