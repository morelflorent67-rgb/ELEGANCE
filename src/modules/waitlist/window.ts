import { DateTime } from "luxon";

/** Plage de la journée voulue (D-73) : avant midi, à partir de midi, ou toute la journée. */
export type WaitlistWindow = "morning" | "afternoon" | "day";

/** Midi, heure de Paris : même coupure que « Matin » et « Après-midi » de l'écran des créneaux. */
export const WINDOW_SPLIT_MINUTE = 12 * 60;

/** Un RDV qui commence à `startsAt` entre-t-il dans la plage ? */
export function inWindow(window: WaitlistWindow, startsAt: Date, zone: string): boolean {
  if (window === "day") return true;
  const local = DateTime.fromJSDate(startsAt, { zone });
  const minute = local.hour * 60 + local.minute;
  return window === "morning" ? minute < WINDOW_SPLIT_MINUTE : minute >= WINDOW_SPLIT_MINUTE;
}

export const WINDOW_LABELS: Record<WaitlistWindow, string> = {
  morning: "le matin",
  afternoon: "l'après-midi",
  day: "toute la journée",
};
