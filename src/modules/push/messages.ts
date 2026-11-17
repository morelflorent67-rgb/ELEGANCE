import { capitalize, formatDay, formatTime } from "@/lib/format";
import type { PushMessage } from "./transport";

// Le texte des notifications (R-102). Court, sans prix ni adresse : l'écran verrouillé de l'iPhone est lu par d'autres.

const when = (startsAt: Date) => `${formatDay(startsAt)} à ${formatTime(startsAt)}`;

/** « Aujourd'hui », « demain » ou le jour écrit, selon le nombre de jours de Paris avant le RDV. */
function dayWord(daysAway: number, startsAt: Date): string {
  if (daysAway <= 0) return "aujourd'hui";
  if (daysAway === 1) return "demain";
  return formatDay(startsAt);
}

const withStaff = (staffFirstName: string | null) => (staffFirstName ? ` avec ${staffFirstName}` : "");

export function reminderMessage(input: {
  appointmentId: string;
  startsAt: Date;
  daysAway: number;
  staffFirstName: string | null;
}): PushMessage {
  return {
    title: "Rappel de rendez-vous",
    body: `${capitalize(dayWord(input.daysAway, input.startsAt))} à ${formatTime(input.startsAt)}${withStaff(input.staffFirstName)}.`,
    data: { kind: "appointment", appointmentId: input.appointmentId },
  };
}

export function offerMessage(input: {
  offerId: string;
  startsAt: Date;
  holdMinutes: number;
  staffFirstName: string | null;
}): PushMessage {
  return {
    title: "Une place s'est libérée",
    body: `${capitalize(when(input.startsAt))}${withStaff(input.staffFirstName)}. Elle vous est gardée ${input.holdMinutes} minutes.`,
    data: { kind: "offer", offerId: input.offerId },
  };
}

export function movedBySalonMessage(input: { appointmentId: string; startsAt: Date; staffFirstName: string | null }): PushMessage {
  return {
    title: "Rendez-vous déplacé par le salon",
    body: `Votre rendez-vous est maintenant le ${when(input.startsAt)}${withStaff(input.staffFirstName)}.`,
    data: { kind: "appointment", appointmentId: input.appointmentId },
  };
}

export function cancelledBySalonMessage(input: { appointmentId: string; startsAt: Date }): PushMessage {
  return {
    title: "Rendez-vous annulé par le salon",
    body: `Votre rendez-vous du ${when(input.startsAt)} est annulé. Vous pouvez en reprendre un depuis l'app.`,
    data: { kind: "appointment", appointmentId: input.appointmentId },
  };
}
