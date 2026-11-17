import type { BookingState } from "@/api/types";

// Enchaînement des écrans de la réservation, comme celui du site (booking-flow.tsx). Aucune règle : le serveur décide,
// ici on ne fait qu'éviter un écran inutile avec l'état donné par le serveur (client bloqué, maximum de RDV atteint).

export type StepNumber = 1 | 2 | 3 | 4 | 5;

/** Les étapes affichées : cinq, ou trois quand on déplace un RDV (les prestations et le compte sont connus). */
export function stepsFor(moving: boolean): StepNumber[] {
  return moving ? [2, 3, 5] : [1, 2, 3, 4, 5];
}

/** Où aller après le choix du créneau (ou après la connexion). */
export function routeAfterSlot(options: {
  moving: boolean;
  signedIn: boolean;
  booking: BookingState | null;
}): "/reserver/recap" | "/reserver/compte" | "/reserver/bloque" | "/reserver/limite" {
  if (options.moving) return "/reserver/recap";
  if (!options.signedIn) return "/reserver/compte";
  if (options.booking?.blocked) return "/reserver/bloque";
  if (options.booking && options.booking.upcoming >= options.booking.maxUpcoming) return "/reserver/limite";
  return "/reserver/recap";
}
