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
  // Gestion de la carte et de l'équipe par le gérant (R-10 à R-13)
  | "invalid_service"
  | "unknown_staff"
  | "staff_role_mismatch"
  | "no_staff_for_service";

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string = code) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
