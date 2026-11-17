import * as Calendar from "expo-calendar/legacy";
import { Platform } from "react-native";

// « Ajouter au calendrier » (lot 27) : l'événement est écrit dans le calendrier de l'iPhone, avec une alerte une heure avant.
// L'accès au calendrier n'est demandé qu'au toucher du bouton.

export type CalendarResult = "added" | "denied" | "error";

export async function addToCalendar(event: {
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  notes?: string;
}): Promise<CalendarResult> {
  if (Platform.OS !== "ios") return "error";
  try {
    const permission = await Calendar.requestCalendarPermissionsAsync();
    if (!permission.granted) return "denied";
    const calendar = await Calendar.getDefaultCalendarAsync();
    await Calendar.createEventAsync(calendar.id, {
      title: event.title,
      startDate: new Date(event.startsAt),
      endDate: new Date(event.endsAt),
      location: event.location,
      notes: event.notes,
      timeZone: "Europe/Paris",
      alarms: [{ relativeOffset: -60 }],
    });
    return "added";
  } catch {
    return "error";
  }
}

export const calendarMessage = (result: CalendarResult): string =>
  result === "added"
    ? "Le rendez-vous est dans votre calendrier."
    : result === "denied"
      ? "L'accès au calendrier est refusé. Vous pouvez l'autoriser dans les réglages de l'iPhone."
      : "Impossible d'ajouter le rendez-vous au calendrier.";
