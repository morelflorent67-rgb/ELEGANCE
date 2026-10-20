import type { DomainErrorCode } from "@/lib/domain-error";

// Messages de la tablette pour les refus du serveur. Un seul endroit : le planning, la réservation et l'espace gérant
// disent la même chose pour le même refus.

export type TeamError =
  DomainErrorCode | "not_signed_in" | "manager_locked" | "rate_limited" | "invalid" | "failed";

const MESSAGES: Partial<Record<TeamError, string>> = {
  slot_unavailable: "Ce créneau vient d'être pris. Choisissez-en un autre.",
  in_past: "Ce créneau est déjà passé.",
  closed: "Le salon est fermé ce jour-là.",
  outside_hours: "Le salon est fermé à cet horaire, ou la prestation dépasse l'heure de fermeture.",
  off_grid: "Cet horaire n'est pas sur la grille des créneaux.",
  too_many_upcoming: "Ce client a déjà le maximum de rendez-vous à venir.",
  staff_not_eligible: "Ce coiffeur ne réalise pas ces prestations.",
  mixed_categories: "Un rendez-vous ne mélange pas les prestations des coiffeurs et des apprentis.",
  unknown_service: "Cette prestation n'existe plus.",
  no_services: "Choisissez au moins une prestation.",
  unknown_customer: "Ce client n'existe plus.",
  customer_has_no_account: "Cette fiche client a été supprimée.",
  appointment_not_found: "Ce rendez-vous n'existe plus.",
  appointment_over: "Ce rendez-vous est terminé : il ne se modifie plus.",
  not_modifiable: "Ce rendez-vous est déjà annulé ou signalé : il ne se modifie plus.",
  not_started: "Le rendez-vous n'a pas encore commencé.",
  not_no_show: "Ce rendez-vous n'est pas signalé comme un lapin.",
  author_required: "Choisissez qui fait la modification.",
  unknown_author: "Ce prénom ne fait plus partie de l'équipe.",
  customer_not_blockable: "Le client n'a pas encore assez de lapins pour être bloqué.",
  invalid_service:
    "Vérifiez le nom, le prix et la durée : un multiple de 15 minutes, jusqu'à 8 heures.",
  unknown_staff: "Ce membre de l'équipe n'existe plus ou n'est plus actif. Rechargez la page.",
  staff_role_mismatch:
    "Les coiffeurs réalisent les prestations des coiffeurs, les apprentis celles du tarif formation.",
  no_staff_for_service:
    "Une prestation réservable en ligne a besoin d'au moins un coiffeur habilité. Cochez un nom, ou passez-la « sur appel ».",
  manager_locked: "L'espace gérant est verrouillé. Saisissez le code gérant.",
  not_signed_in: "Votre session a expiré. Reconnectez-vous.",
  rate_limited: "Trop d'essais. Patientez un instant.",
  invalid: "Ces informations ne sont pas valides.",
};

export const teamMessage = (error: TeamError): string =>
  MESSAGES[error] ?? "Une erreur est survenue. Réessayez, ou rechargez la page.";

export type TeamResult<T = Record<never, never>> =
  ({ ok: true } & T) | { ok: false; error: TeamError; retryAfterSeconds?: number };
