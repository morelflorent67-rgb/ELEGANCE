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
  customer_has_account:
    "Ce client a un compte : il modifie ses informations lui-même, dans « Mes informations ».",
  customers_both_have_accounts:
    "Ces deux fiches ont chacune un compte : elles ne se fusionnent pas. Supprimez celle qui ne sert plus.",
  invalid_for_name: "« Pour qui ? » : un prénom de 40 caractères au plus.",
  invalid_series:
    "Vérifiez la répétition : au moins 2 rendez-vous en tout, et une date de fin après ce rendez-vous.",
  already_in_series: "Ce rendez-vous fait déjà partie d'une série : prolongez-la plutôt.",
  not_in_series: "Ce rendez-vous ne fait pas partie d'une série.",
  series_empty: "Aucune de ces dates n'est libre : rien n'a été réservé.",
  appointment_not_found: "Ce rendez-vous n'existe plus.",
  appointment_over: "Ce rendez-vous est terminé : il ne se modifie plus.",
  not_modifiable: "Ce rendez-vous est déjà annulé ou signalé : il ne se modifie plus.",
  not_started: "Le rendez-vous n'a pas encore commencé.",
  not_no_show: "Ce rendez-vous n'est pas signalé comme un lapin.",
  invalid_amount: "Le montant doit être un nombre d'euros entre 0 et 1 000, avec au plus deux décimales.",
  author_required: "Choisissez qui fait la modification.",
  unknown_author: "Ce prénom ne fait plus partie de l'équipe.",
  terminal_not_configured:
    "Le terminal d'encaissement n'est pas encore relié. Le gérant le relie dans l'espace gérant, « Terminal d'encaissement ».",
  terminal_busy: "Un encaissement est déjà en cours sur le terminal. Terminez-le ou annulez-le d'abord.",
  terminal_unavailable: "Le terminal ne répond pas. Vérifiez qu'il est allumé et connecté, puis réessayez.",
  already_paid: "Ce rendez-vous est déjà encaissé.",
  invalid_pairing:
    "Le terminal a refusé ce code. Générez-en un nouveau sur le terminal (Connexions, API) et vérifiez le code marchand.",
  payment_not_found: "Cet encaissement n'existe plus.",
  customer_not_blockable: "Le client n'a pas encore assez de lapins pour être bloqué.",
  invalid_service:
    "Vérifiez le nom, le prix et la durée : un multiple de 15 minutes, jusqu'à 8 heures.",
  unknown_staff: "Ce membre de l'équipe n'existe plus ou n'est plus actif. Rechargez la page.",
  staff_role_mismatch:
    "Les coiffeurs réalisent les prestations des coiffeurs, les apprentis celles du tarif formation.",
  no_staff_for_service:
    "Une prestation réservable en ligne a besoin d'au moins un coiffeur habilité. Cochez un nom, ou passez-la « sur appel ».",
  invalid_staff: "Le prénom doit faire entre 1 et 40 caractères.",
  staff_name_taken: "Un membre de l'équipe porte déjà ce prénom.",
  staff_needed_for_service:
    "Cette personne est la dernière à réaliser une prestation réservable en ligne. Passez cette prestation « sur appel » ou retirez-la de la carte, puis réessayez.",
  invalid_hours:
    "Vérifiez les horaires : chaque plage finit après son début, sur la grille de 15 minutes, sans toucher la suivante, et au moins un jour doit rester ouvert.",
  invalid_closure:
    "Vérifiez les dates : la fin ne peut pas précéder le début. Le motif fait 80 caractères au plus.",
  invalid_absence:
    "Vérifiez l'absence : la fin ne peut pas précéder le début, et des heures précises se donnent sur un seul jour, par quarts d'heure.",
  absence_in_past: "Cette absence est déjà terminée.",
  unknown_absence: "Cette absence n'existe plus.",
  closure_in_past: "Cette fermeture est déjà terminée.",
  unknown_closure: "Cette fermeture n'existe plus.",
  manager_locked: "L'espace gérant est verrouillé. Saisissez le code gérant.",
  not_signed_in: "Votre session a expiré. Reconnectez-vous.",
  rate_limited: "Trop d'essais. Patientez un instant.",
  invalid: "Ces informations ne sont pas valides.",
};

export const teamMessage = (error: TeamError): string =>
  MESSAGES[error] ?? "Une erreur est survenue. Réessayez, ou rechargez la page.";

export type TeamResult<T = Record<never, never>> =
  ({ ok: true } & T) | { ok: false; error: TeamError; retryAfterSeconds?: number };
