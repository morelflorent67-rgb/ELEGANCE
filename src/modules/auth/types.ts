// Interface d'authentification : Supabase Auth en production, une version en mémoire pour les tests de bout en bout
// (Docker étant impossible, Supabase ne tourne pas en local). Les autres modules ne connaissent que cette interface.

/** Rôle posé dans `app_metadata` (le client ne peut pas le modifier) : « staff » ouvre la tablette du salon (R-72). */
export type AuthRole = "customer" | "staff";

export interface AuthUser {
  id: string;
  email: string;
  role: AuthRole;
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
  /** Supprime un compte (annulation d'une inscription qui a échoué à moitié, suppression par le client : R-75). */
  deleteUser(id: string): Promise<void>;
  /**
   * Vérifie un mot de passe sans toucher à la session en cours : demandé avant de changer l'email ou le mot de passe,
   * ou de supprimer le compte.
   */
  verifyPassword(email: string, password: string): Promise<boolean>;
  /** Change l'adresse de connexion d'un compte (email marqué confirmé : D-42). */
  updateEmail(
    id: string,
    email: string,
  ): Promise<{ ok: true } | { ok: false; reason: "email_taken" | "failed" }>;
}
