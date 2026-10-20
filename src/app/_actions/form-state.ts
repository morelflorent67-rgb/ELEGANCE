import type { BookingState, CustomerProfile } from "@/modules/customers/accounts";

// État renvoyé par les actions de formulaire de compte. Dans un fichier à part : un fichier « use server »
// ne peut exporter que des fonctions.
export interface FormState {
  status: "idle" | "ok" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Valeurs saisies, à réafficher après une erreur (jamais le mot de passe). */
  values?: Record<string, string>;
  customer?: CustomerProfile;
  booking?: BookingState;
}

export const idleState: FormState = { status: "idle" };
