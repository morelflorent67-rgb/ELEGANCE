import { z } from "zod";
import { normalizePhone } from "@/lib/phone";

// Validation des formulaires de compte (R-70). Les messages sont affichés tels quels au client.

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

const newPassword = z.string().min(8, "8 caractères minimum.").max(72, "72 caractères au maximum.");

/** Création de compte : prénom, nom, téléphone, email, mot de passe et conditions acceptées (R-70, R-71). */
export const signUpSchema = z.object({
  firstName: name("prénom"),
  lastName: name("nom"),
  phone: z
    .string()
    .trim()
    .min(1, "Indiquez votre téléphone.")
    .refine(
      (value) => normalizePhone(value) !== null,
      "Ce numéro de téléphone ne semble pas valide.",
    )
    .transform((value) => normalizePhone(value)!),
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
