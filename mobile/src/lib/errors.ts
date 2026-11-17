// Les refus du serveur arrivent sous la forme d'un code stable (`{ code }`, voir src/lib/domain-error.ts du site) :
// l'app ne lit jamais un texte du serveur, elle traduit le code ici. Un test du site vérifie que chaque code qui
// peut atteindre un client a sa phrase (src/modules/mobile/error-codes.test.ts).

const MESSAGES: Record<string, string> = {
  // Horaires et délais
  in_past: "Ce créneau est déjà passé. Choisissez-en un autre.",
  too_soon: "Ce créneau est trop proche pour être réservé en ligne. Appelez le salon.",
  too_far: "Ce jour est trop loin pour être réservé pour le moment.",
  closed: "Le salon est fermé ce jour-là.",
  outside_hours: "Ce créneau est en dehors des horaires du salon.",
  off_grid: "Ce créneau n'existe pas. Choisissez-en un autre.",
  // Disponibilité
  slot_unavailable: "Ce créneau vient d'être pris. Choisissez-en un autre.",
  // Prestations et équipe
  no_services: "Choisissez au moins une prestation.",
  unknown_service: "Cette prestation n'est plus proposée.",
  not_bookable_online: "Cette prestation ne se réserve que par téléphone. Appelez le salon.",
  mixed_categories: "Ces prestations ne peuvent pas être réservées ensemble.",
  staff_not_eligible: "Ce coiffeur ne réalise pas ces prestations.",
  // Client
  unknown_customer: "Votre compte est introuvable. Reconnectez-vous.",
  too_many_upcoming: "Vous avez atteint le nombre maximum de rendez-vous à venir.",
  customer_blocked: "La réservation en ligne est indisponible pour votre compte. Appelez le salon.",
  // Modification, annulation, compte
  appointment_not_found: "Ce rendez-vous est introuvable.",
  not_modifiable: "Ce rendez-vous ne peut plus être modifié.",
  change_too_late: "Il est trop tard pour modifier ou annuler en ligne. Appelez le salon.",
  imminent_appointment:
    "Votre prochain rendez-vous est trop proche pour supprimer votre compte en ligne. Appelez le salon.",
  wrong_password: "Ce mot de passe n'est pas le bon.",
  email_taken: "Un compte existe déjà avec cette adresse email.",
  // Liste d'attente
  invalid_waitlist: "Ces jours ne peuvent pas être mis en liste d'attente.",
  slots_available: "Il reste des places ce jour-là : vous pouvez les réserver directement.",
  waitlist_full: "Vous avez atteint le nombre maximum d'inscriptions en liste d'attente.",
  offer_not_found: "Cette place est introuvable.",
  offer_closed: "Cette place n'est plus disponible.",
  offer_expired: "Le délai pour prendre cette place est écoulé.",
  // Réponses de l'API elle-même
  invalid: "Certaines informations ne sont pas valides.",
  not_signed_in: "Votre session a expiré. Reconnectez-vous.",
  invalid_credentials: "Email ou mot de passe incorrect.",
  failed: "Une erreur est survenue. Réessayez, ou appelez le salon.",
  // Propre à l'app : pas de réponse du serveur
  network: "Pas de connexion. Vérifiez votre réseau et réessayez.",
};

export const GENERIC_ERROR = MESSAGES.failed;

/** « 45 secondes », « 3 minutes ». */
function wait(seconds: number): string {
  return seconds >= 120 ? `${Math.ceil(seconds / 60)} minutes` : `${seconds} secondes`;
}

/** Phrase française d'un code de refus ; un code inconnu (serveur plus récent que l'app) donne la phrase générale. */
export function errorMessage(code: string, extra: { retryAfterSeconds?: number } = {}): string {
  if (code === "rate_limited") {
    return extra.retryAfterSeconds
      ? `Trop d'essais. Réessayez dans ${wait(extra.retryAfterSeconds)}.`
      : "Trop d'essais. Réessayez dans quelques instants.";
  }
  return MESSAGES[code] ?? GENERIC_ERROR;
}

/** Les codes que l'app sait traduire (pour le test de couverture du site). */
export const TRANSLATED_CODES = [...Object.keys(MESSAGES), "rate_limited"];
