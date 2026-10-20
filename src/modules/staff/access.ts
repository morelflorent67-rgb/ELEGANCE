import { z } from "zod";
import type { Database } from "@/db/types";
import type { AuthDriver, AuthUser } from "@/modules/auth/types";
import { hitRateLimit } from "@/modules/security/rate-limit";

// Accès de la tablette du salon (R-72, D-50) : un compte « équipe » unique, reconnu à son rôle dans `app_metadata`.
// Il n'a aucune fiche client : il n'ouvre pas l'espace client, et un compte client n'ouvre pas la tablette.

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Cette adresse email ne semble pas valide.")),
  password: z.string().min(1, "Indiquez le mot de passe."),
});

const LIMITS = {
  ip: { limit: 30, windowSeconds: 900 },
  email: { limit: 10, windowSeconds: 900 },
} as const;

export type StaffLoginResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: "invalid"; fieldErrors: Record<string, string> }
  | { ok: false; error: "invalid_credentials" | "failed" }
  | { ok: false; error: "rate_limited"; retryAfterSeconds: number };

/** Le compte équipe de la session en cours, ou null (visiteur, client, session expirée). */
export async function currentStaffUser(driver: AuthDriver): Promise<AuthUser | null> {
  const user = await driver.currentUser();
  return user?.role === "staff" ? user : null;
}

/**
 * Connexion de la tablette. Même réponse pour un email inconnu, un mauvais mot de passe et un compte qui n'est pas
 * celui de l'équipe (ce dernier est déconnecté aussitôt). Essais limités par adresse IP et par email.
 */
export async function loginStaff(
  db: Database,
  driver: AuthDriver,
  raw: unknown,
  context: { ip: string; now?: Date },
): Promise<StaffLoginResult> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, error: "invalid", fieldErrors };
  }
  const { email, password } = parsed.data;

  let retry: number | null = null;
  for (const [key, options] of [
    [`staff-login:ip:${context.ip}`, LIMITS.ip],
    [`staff-login:email:${email}`, LIMITS.email],
  ] as const) {
    const result = await hitRateLimit(db, key, options, context.now);
    if (!result.allowed) retry = Math.max(retry ?? 0, result.retryAfterSeconds);
  }
  if (retry !== null) return { ok: false, error: "rate_limited", retryAfterSeconds: retry };

  const signedIn = await driver.signIn({ email, password });
  if (!signedIn.ok) {
    return {
      ok: false,
      error: signedIn.reason === "invalid_credentials" ? "invalid_credentials" : "failed",
    };
  }
  if (signedIn.user.role !== "staff") {
    await driver.signOut();
    return { ok: false, error: "invalid_credentials" };
  }
  return { ok: true, user: signedIn.user };
}
