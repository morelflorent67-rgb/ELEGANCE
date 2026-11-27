import { z } from "zod";
import { normalizePhone } from "@/lib/phone";

// Validation des formulaires de compte (R-70, D-126). Les messages sont affichés tels quels au client.

const name = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Indiquez votre ${label}.`)
    .max(80, `Votre ${label} est trop long (80 caractères au plus).`);

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Cette adresse email ne semble pas valide."));

// Téléphone facultatif (D-126, demandé par Apple) : vide ou absent → null ; un numéro saisi doit être valide.
const phone = z
  .string()
  .nullish()
  .transform((value) => (value ?? "").trim())
  .refine(
    (value) => value === "" || normalizePhone(value) !== null,
    "Ce numéro de téléphone ne semble pas valide.",
  )
  .transform((value) => (value === "" ? null : normalizePhone(value)));

const newPassword = z.string().min(8, "8 caractères minimum.").max(72, "72 caractères au maximum.");

/** Création de compte : prénom, nom, email, mot de passe, conditions acceptées et téléphone facultatif (R-70, R-71, D-126). */
export const signUpSchema = z.object({
  firstName: name("prénom"),
  lastName: name("nom"),
  phone,
  email,
  password: newPassword,
  acceptTerms: z.literal(true, { error: "Acceptez les conditions pour créer votre compte." }),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Indiquez votre mot de passe."),
});

export const resetRequestSchema = z.object({ email });

export const newPasswordSchema = z.object({ password: newPassword });

/** « Mes informations » : coordonnées (R-70). Le mot de passe actuel n'est exigé que si l'email change. */
export const profileSchema = z.object({
  firstName: name("prénom"),
  lastName: name("nom"),
  phone,
  email,
  currentPassword: z.string().optional(),
});

/** Changement de mot de passe : l'ancien est exigé. */
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Indiquez votre mot de passe actuel."),
  newPassword,
});

/** Suppression du compte : confirmée par le mot de passe. */
export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Indiquez votre mot de passe pour confirmer."),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export type FieldErrors = Record<string, string>;

/** Valide des champs de formulaire ; en cas d'erreur, un message par champ (le premier). */
export function validate<T extends z.ZodType>(
  schema: T,
  raw: unknown,
): { ok: true; data: z.infer<T> } | { ok: false; errors: FieldErrors } {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? "form");
    errors[field] ??= issue.message;
  }
  return { ok: false, errors };
}
