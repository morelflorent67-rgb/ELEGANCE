import type { AuthRole, AuthUser } from "./types";

// Traduction du jeton de session Supabase en utilisateur. Le jeton est vérifié avant (signature et expiration, par
// `getClaims()`) : ici, aucune décision de sécurité autre que la lecture du rôle.

/** Seul « staff » ouvre la tablette ; tout autre rôle, ou son absence, vaut « customer ». Le rôle vient de
 * `app_metadata`, que le client ne peut pas modifier (jamais de `user_metadata`). */
export const roleOf = (user: { app_metadata?: object }): AuthRole =>
  (user.app_metadata as { role?: unknown } | undefined)?.role === "staff" ? "staff" : "customer";

interface SessionClaims {
  sub?: unknown;
  email?: unknown;
  app_metadata?: object;
}

/** L'utilisateur décrit par un jeton vérifié, ou null s'il manque l'identifiant ou l'email. */
export function userFromClaims(claims: SessionClaims | null | undefined): AuthUser | null {
  if (!claims) return null;
  const { sub, email } = claims;
  if (typeof sub !== "string" || !sub || typeof email !== "string" || !email) return null;
  return { id: sub, email, role: roleOf(claims) };
}
