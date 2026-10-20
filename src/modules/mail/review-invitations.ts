import { and, eq, gte, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { DateTime } from "luxon";
import type { Database } from "@/db/types";
import { appointment, customer } from "@/db/schema";
import { loadSettings } from "@/modules/availability";
import { enqueueEmail } from "./outbox";

/** Heure de Paris à partir de laquelle une invitation peut partir : jamais en pleine nuit. */
export const REVIEW_SEND_HOUR = 8;
/** Un cron manqué est rattrapé pendant ce nombre de jours ; au-delà, l'invitation serait hors de propos. */
export const REVIEW_CATCHUP_DAYS = 3;

/**
 * Programme les invitations à un avis (R-64) : le lendemain d'un RDV honoré (R-51, donc confirmé et terminé, ni
 * lapin ni annulé), à partir de 8 h. À appeler par le cron, avant l'envoi. Rejouer le passage ne programme rien de
 * plus (clé unique par RDV). Renvoie le nombre d'invitations nouvellement mises en file.
 *
 * Rien n'est programmé tant que le salon n'a pas renseigné sa page d'avis (`review_url`), ni pour un client qui ne
 * veut plus de ces invitations, ni pour une fiche supprimée (R-75). Un lapin signalé après la mise en file est
 * revérifié à l'envoi (D-54).
 */
export async function scheduleReviewInvitations(
  db: Database,
  now: Date = new Date(),
): Promise<number> {
  const settings = await loadSettings(db);
  if (!settings.reviewUrl) return 0;

  const startOfToday = DateTime.fromJSDate(now, { zone: settings.timezone }).startOf("day");
  const rows = await db
    .select({ id: appointment.id, email: customer.email })
    .from(appointment)
    .innerJoin(customer, eq(customer.id, appointment.customerId))
    .where(
      and(
        inArray(appointment.status, ["confirmed", "honored"]),
        // Terminé la veille ou un des jours précédents (rattrapage), jamais aujourd'hui.
        lt(appointment.endsAt, startOfToday.toJSDate()),
        gte(appointment.endsAt, startOfToday.minus({ days: REVIEW_CATCHUP_DAYS }).toJSDate()),
        isNotNull(customer.email),
        isNull(customer.anonymizedAt),
        eq(customer.reviewOptOut, false),
      ),
    );

  const runAt = startOfToday.set({ hour: REVIEW_SEND_HOUR }).toJSDate();
  let queued = 0;
  for (const row of rows) {
    if (!row.email) continue;
    const isNew = await enqueueEmail(db, {
      type: "review_invitation",
      toEmail: row.email,
      appointmentId: row.id,
      dedupeKey: `review:${row.id}`,
      runAt,
    });
    if (isNew) queued++;
  }
  return queued;
}
