// Erreurs métier : un code stable que l'interface traduit en message pour le client ou le salon.
export type DomainErrorCode =
  // Horaires et délais (R-01 à R-06)
  | "in_past"
  | "too_soon"
  | "too_far"
  | "closed"
  | "outside_hours"
  | "off_grid"
  // Disponibilité (R-22, R-23)
  | "slot_unavailable"
  // Prestations et équipe (R-13, R-17, R-18)
  | "no_services"
  | "unknown_service"
  | "not_bookable_online"
  | "mixed_categories"
  | "staff_not_eligible"
  // Client (R-25, R-52)
  | "unknown_customer"
  | "too_many_upcoming"
  | "customer_blocked"
  // Modification, annulation, compte (R-30 à R-32, R-75)
  | "appointment_not_found"
  | "not_modifiable"
  | "change_too_late"
  | "imminent_appointment"
  | "wrong_password"
  | "email_taken"
  // Actions du salon (R-26, R-33, R-51, R-52, R-73, R-74)
  | "author_required"
  | "unknown_author"
  | "appointment_over"
  | "not_started"
  | "not_no_show"
  | "customer_not_blockable"
  | "customer_has_no_account"
  // Fiches sans compte (D-76, D-79)
  | "customer_has_account"
  | "customers_both_have_accounts"
  | "invalid_for_name"
  // RDV répétés (D-71, D-83 à D-92)
  | "invalid_series"
  | "already_in_series"
  | "not_in_series"
  | "series_empty"
  // Liste d'attente (D-73, D-99, D-100)
  | "invalid_waitlist"
  | "slots_available"
  | "waitlist_full"
  | "offer_not_found"
  | "offer_closed"
  | "offer_expired"
  // Correction du montant à la clôture (R-53, R-54)
  | "invalid_amount"
  // Encaissement au terminal (D-105)
  | "terminal_not_configured"
  | "terminal_busy"
  | "terminal_unavailable"
  | "already_paid"
  | "invalid_pairing"
  | "payment_not_found"
  // Gestion de la carte et de l'équipe par le gérant (R-10 à R-13)
  | "invalid_service"
  | "unknown_staff"
  | "staff_role_mismatch"
  | "no_staff_for_service"
  | "invalid_staff"
  | "staff_name_taken"
  | "staff_needed_for_service"
  // Horaires et fermetures (R-01, R-03)
  | "invalid_hours"
  | "invalid_closure"
  | "invalid_absence"
  | "absence_in_past"
  | "unknown_absence"
  | "closure_in_past"
  | "unknown_closure";

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string = code) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
