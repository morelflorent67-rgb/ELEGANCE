import type { Database } from "@/db/types";
import { enqueueEmail } from "./outbox";

const HOUR = 3_600_000;

/**
 * R-61 : le rappel part `reminderHours` (24 h, D-64) avant le RDV, et seulement pour un RDV pris plus tôt. Renvoie l'instant
 * d'envoi, ou null si ce moment est déjà arrivé (RDV pris dans les 72 h : la confirmation suffit) ou si le rappel est
 * coupé dans les réglages (0).
 */
export function reminderDue(startsAt: Date, now: Date, reminderHours: number): Date | null {
  if (reminderHours <= 0) return null;
  const due = new Date(startsAt.getTime() - reminderHours * HOUR);
  return due.getTime() > now.getTime() ? due : null;
}

/**
 * Programme le rappel d'un RDV, dans la même transaction que sa réservation ou son déplacement (principe 7). La charge
 * utile garde le créneau annoncé : si le RDV bouge avant l'envoi, l'ancien rappel est abandonné et le déplacement en a
 * programmé un nouveau.
 */
export async function scheduleReminder(
  db: Database,
  input: {
    appointmentId: string;
    toEmail: string;
    startsAt: Date;
    now: Date;
    reminderHours: number;
  },
): Promise<void> {
  const runAt = reminderDue(input.startsAt, input.now, input.reminderHours);
  if (!runAt) return;
  await enqueueEmail(db, {
    type: "reminder",
    toEmail: input.toEmail,
    appointmentId: input.appointmentId,
    dedupeKey: `reminder:${input.appointmentId}:${input.startsAt.toISOString()}`,
    runAt,
    payload: { startsAt: input.startsAt.toISOString() },
  });
}
