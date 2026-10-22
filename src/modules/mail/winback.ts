import { and, desc, eq, gt, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { DateTime } from "luxon";
import type { Database } from "@/db/types";
import { appointment, customer } from "@/db/schema";
import { loadSettings } from "@/modules/availability";
import { enqueueEmail } from "./outbox";

/** Heure de Paris à partir de laquelle une relance peut partir : jamais en pleine nuit. */
export const WINBACK_SEND_HOUR = 8;
/** Un cron manqué est rattrapé pendant ce nombre de jours ; au-delà, la relance serait hors de propos. */
export const WINBACK_CATCHUP_DAYS = 3;

/**
 * Programme les relances « Nous serions ravis de vous revoir » (D-74) : `winback_after_days` (15) jours après le dernier
 * RDV honoré d'un client inscrit qui n'a aucun RDV à venir, une seule fois par visite (clé unique par RDV). À appeler par
 * le cron, avant l'envoi. Renvoie le nombre de relances nouvellement mises en file.
 *
 * Seuls les comptes clients sont relancés, pas les fiches sans compte (décision de Florent, 22 octobre 2026). Rien
 * n'est programmé pour un client qui s'est désinscrit, bloqué en ligne ou supprimé (R-75). Le lapin signalé après la
 * mise en file, un nouveau RDV ou une désinscription sont revérifiés à l'envoi.
 */
export async function scheduleWinbackEmails(db: Database, now: Date = new Date()): Promise<number> {
  const settings = await loadSettings(db);
  const zone = settings.timezone;
  const dueBefore = new Date(now.getTime() - settings.winbackAfterDays * 86_400_000);
  const dueAfter = new Date(dueBefore.getTime() - WINBACK_CATCHUP_DAYS * 86_400_000);

  // Les visites honorées terminées dans la fenêtre « il y a N jours, rattrapage compris ».
  const candidates = await db
    .select({
      id: appointment.id,
      customerId: appointment.customerId,
      endsAt: appointment.endsAt,
      email: customer.email,
    })
    .from(appointment)
    .innerJoin(customer, eq(customer.id, appointment.customerId))
    .where(
      and(
        inArray(appointment.status, ["confirmed", "honored"]),
        lte(appointment.endsAt, dueBefore),
        gt(appointment.endsAt, dueAfter),
        isNotNull(customer.email),
        isNotNull(customer.authUserId),
        isNull(customer.anonymizedAt),
        eq(customer.winbackOptOut, false),
        eq(customer.onlineBookingBlocked, false),
      ),
    )
    .orderBy(desc(appointment.endsAt));

  // Un client n'a qu'une relance : celle de sa dernière visite.
  const byCustomer = new Map<string, (typeof candidates)[number]>();
  for (const c of candidates) if (!byCustomer.has(c.customerId)) byCustomer.set(c.customerId, c);
  if (byCustomer.size === 0) return 0;

  // Ni RDV à venir, ni visite plus récente que celle de la fenêtre : le client n'est pas revenu.
  const later = await db
    .select({
      customerId: appointment.customerId,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
    })
    .from(appointment)
    .where(
      and(
        inArray(appointment.customerId, [...byCustomer.keys()]),
        inArray(appointment.status, ["confirmed", "honored"]),
        gt(appointment.endsAt, dueAfter),
      ),
    );

  const startOfToday = DateTime.fromJSDate(now, { zone }).startOf("day");
  const runAt = startOfToday.set({ hour: WINBACK_SEND_HOUR }).toJSDate();
  let queued = 0;
  for (const c of byCustomer.values()) {
    const returned = later.some(
      (a) =>
        a.customerId === c.customerId &&
        (a.startsAt.getTime() > now.getTime() || a.endsAt.getTime() > c.endsAt.getTime()),
    );
    if (returned || !c.email) continue;
    const isNew = await enqueueEmail(db, {
      type: "winback",
      toEmail: c.email,
      appointmentId: c.id,
      dedupeKey: `winback:${c.id}`,
      runAt,
    });
    if (isNew) queued++;
  }
  return queued;
}
