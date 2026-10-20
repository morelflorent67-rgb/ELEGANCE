// Interface d'authentification : Supabase Auth en production, une version en mémoire pour les tests de bout en bout
// (Docker étant impossible, Supabase ne tourne pas en local). Les autres modules ne connaissent que cette interface.

export interface AuthUser {
  id: string;
  email: string;
}

export type SignUpResult =
  { ok: true; user: AuthUser } | { ok: false; reason: "email_taken" | "weak_password" | "failed" };

export type SignInResult =
  { ok: true; user: AuthUser } | { ok: false; reason: "invalid_credentials" | "failed" };

export interface AuthDriver {
  /** Crée le compte (email déjà confirmé : D-42) et ouvre la session. */
  signUp(input: { email: string; password: string }): Promise<SignUpResult>;
  signIn(input: { email: string; password: string }): Promise<SignInResult>;
  signOut(): Promise<void>;
  /** Utilisateur de la session en cours, ou null. */
  currentUser(): Promise<AuthUser | null>;
  /** Envoie l'email de réinitialisation. Ne révèle jamais si l'adresse existe. */
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  /** Échange le code du lien de réinitialisation contre une session. */
  exchangeRecoveryCode(code: string): Promise<boolean>;
  /** Change le mot de passe de l'utilisateur de la session (après le lien de réinitialisation). */
  updatePassword(
    password: string,
  ): Promise<{ ok: true } | { ok: false; reason: "weak_password" | "failed" }>;
  /** Supprime un compte (annulation d'une inscription qui a échoué à moitié). */
  deleteUser(id: string): Promise<void>;
}
