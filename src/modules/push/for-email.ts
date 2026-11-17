import { eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { z } from "zod";
import type { Database } from "@/db/types";
import { appointment, customer, pushDevice, salonSettings, staff, waitlistOffer } from "@/db/schema";
import { loadOffer } from "@/modules/waitlist/offer";
import { devicesOf } from "./devices";
import { cancelledBySalonMessage, movedBySalonMessage, offerMessage, reminderMessage } from "./messages";
import type { PushMessage, PushTransport } from "./transport";

/** Ce que la notification doit savoir de l'email qui vient de partir. */
export interface SentEmail {
  type: string;
  appointmentId: string | null;
  payload: unknown;
}

const modificationPayload = z.object({
  startsAt: z.iso.datetime(),
  staffFirstName: z.string().nullable(),
  by: z.literal("salon").optional(),
});
const cancellationPayload = z.object({ by: z.literal("salon").optional() });
const offerPayload = z.object({ offerId: z.uuid() });

const daysBetween = (from: Date, to: Date, zone: string) =>
  Math.round(
    DateTime.fromJSDate(to, { zone }).startOf("day").diff(DateTime.fromJSDate(from, { zone }).startOf("day"), "days").days,
  );

/**
 * La notification qui accompagne un email (R-102, D-124) : rappel, place libérée, RDV déplacé ou annulé **par le salon**.
 * Les autres emails n'en ont pas (confirmation, avis, relance : la relance n'a pas de notification, règle 4.5.4 d'Apple).
 * Appelée seulement après l'envoi de l'email, donc les mêmes règles d'abandon et de report s'appliquent déjà.
 */
async function messageFor(
  db: Database,
  email: SentEmail,
  now: Date,
): Promise<{ customerId: string; message: PushMessage } | null> {
  if (email.type === "waitlist_offer") {
    const payload = offerPayload.safeParse(email.payload);
    if (!payload.success) return null;
    const [row] = await db
      .select({ customerId: waitlistOffer.customerId })
      .from(waitlistOffer)
      .where(eq(waitlistOffer.id, payload.data.offerId));
    if (!row) return null;
    const offer = await loadOffer(db, row.customerId, payload.data.offerId, now);
    if (!offer || offer.state !== "pending") return null;
    const [settings] = await db.select().from(salonSettings).limit(1);
    return {
      customerId: row.customerId,
      message: offerMessage({
        offerId: offer.id,
        startsAt: offer.startsAt,
        holdMinutes: settings?.waitlistHoldMinutes ?? 15,
        staffFirstName: offer.staffFirstName,
      }),
    };
  }

  if (!email.appointmentId) return null;
  if (!["reminder", "modification", "cancellation"].includes(email.type)) return null;
  const [appt] = await db
    .select({
      id: appointment.id,
      startsAt: appointment.startsAt,
      customerId: appointment.customerId,
      staffFirstName: staff.firstName,
    })
    .from(appointment)
    .innerJoin(staff, eq(staff.id, appointment.staffId))
    .innerJoin(customer, eq(customer.id, appointment.customerId))
    .where(eq(appointment.id, email.appointmentId));
  if (!appt) return null;

  if (email.type === "reminder") {
    const [settings] = await db.select().from(salonSettings).limit(1);
    return {
      customerId: appt.customerId,
      message: reminderMessage({
        appointmentId: appt.id,
        startsAt: appt.startsAt,
        daysAway: daysBetween(now, appt.startsAt, settings?.timezone ?? "Europe/Paris"),
        staffFirstName: appt.staffFirstName,
      }),
    };
  }
  if (email.type === "modification") {
    const payload = modificationPayload.safeParse(email.payload);
    if (!payload.success || payload.data.by !== "salon") return null; // le client sait ce qu'il vient de faire
    return {
      customerId: appt.customerId,
      message: movedBySalonMessage({
        appointmentId: appt.id,
        startsAt: new Date(payload.data.startsAt),
        staffFirstName: payload.data.staffFirstName ?? appt.staffFirstName,
      }),
    };
  }
  const payload = cancellationPayload.safeParse(email.payload ?? {});
  if (!payload.success || payload.data.by !== "salon") return null;
  return { customerId: appt.customerId, message: cancelledBySalonMessage({ appointmentId: appt.id, startsAt: appt.startsAt }) };
}

/**
 * Envoie la notification de l'email qui vient de partir, à tous les appareils du client. Ne lève jamais d'erreur : une
 * notification manquée ne touche ni l'email ni le RDV. Un appareil qu'Apple ne connaît plus est oublié. Renvoie le
 * nombre de notifications envoyées.
 */
export async function pushForEmail(db: Database, email: SentEmail, push: PushTransport, now: Date): Promise<number> {
  try {
    const found = await messageFor(db, email, now);
    if (!found) return 0;
    let sent = 0;
    for (const token of await devicesOf(db, found.customerId)) {
      const result = await push.send(token, found.message);
      if (result === "sent") sent++;
      if (result === "invalid_token") await db.delete(pushDevice).where(eq(pushDevice.token, token));
    }
    return sent;
  } catch (error) {
    console.error("Notification impossible (l'email est parti) :", error);
    return 0;
  }
}
