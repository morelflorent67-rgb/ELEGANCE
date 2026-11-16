import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt, ne } from "drizzle-orm";
import { authRecovery, authSession, authUser } from "@/db/schema";
import type { Database } from "@/db/types";
import { dummyHash, hashPassword, verifyPasswordHash } from "./password";
import type { AuthDriver, AuthRole, AuthUser, SessionStore } from "./types";

// Authentification maison (D-116) : comptes et sessions dans Postgres, mots de passe hachés par scrypt.
// Le jeton de session vit dans le cookie ; la base ne garde que son empreinte SHA-256 : une fuite de la base
// ne donne aucune session ouverte.

const DAY = 24 * 3600 * 1000;
const SESSION_LIFETIME = 90 * DAY;
/** Sous ce seuil, la session est repoussée à 90 jours (durée glissante). */
const RENEW_BELOW = 60 * DAY;
const RECOVERY_LIFETIME = 60 * 60 * 1000;
const MIN_PASSWORD = 8;
/** Au-delà, on ne calcule rien : un mot de passe énorme ne doit pas occuper le serveur. */
const MAX_PASSWORD = 256;

export interface PostgresDriverDeps {
  db: Database;
  store: SessionStore;
  now: () => Date;
  /** Envoie le lien de réinitialisation. Hors de la file d'emails : le lien est un secret (D-117). */
  sendResetEmail: (to: string, link: string) => Promise<void>;
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const normalizeEmail = (email: string) => email.trim().toLowerCase();

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return (e?.code ?? e?.cause?.code) === "23505";
}

export function createPostgresDriver({ db, store, now, sendResetEmail }: PostgresDriverDeps): AuthDriver {
  const toUser = (row: { id: string; email: string; role: string }): AuthUser => ({
    id: row.id,
    email: row.email,
    role: row.role as AuthRole,
  });

  async function openSession(userId: string): Promise<void> {
    const token = newToken();
    await db.insert(authSession).values({
      tokenHash: sha256(token),
      userId,
      expiresAt: new Date(now().getTime() + SESSION_LIFETIME),
    });
    await store.set(token);
  }

  /** Session en cours : le compte, l'empreinte de son jeton, et la fin de validité. */
  async function readSession() {
    const token = await store.get();
    if (!token) return null;
    const tokenHash = sha256(token);
    const [row] = await db
      .select({
        tokenHash: authSession.tokenHash,
        expiresAt: authSession.expiresAt,
        id: authUser.id,
        email: authUser.email,
        role: authUser.role,
      })
      .from(authSession)
      .innerJoin(authUser, eq(authUser.id, authSession.userId))
      .where(eq(authSession.tokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  }

  async function findByEmail(email: string) {
    const [row] = await db
      .select()
      .from(authUser)
      .where(eq(authUser.email, normalizeEmail(email)))
      .limit(1);
    return row ?? null;
  }

  /** Vérifie un mot de passe ; une adresse inconnue coûte le même calcul (aucune fuite par la durée). */
  async function checkPassword(email: string, password: string) {
    if (password.length > MAX_PASSWORD) return null;
    const user = await findByEmail(email);
    const ok = await verifyPasswordHash(password, user?.passwordHash ?? (await dummyHash()));
    return ok ? user : null;
  }

  return {
    async signUp({ email, password }) {
      if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
        return { ok: false, reason: "weak_password" };
      }
      try {
        const [user] = await db
          .insert(authUser)
          .values({ email: normalizeEmail(email), passwordHash: await hashPassword(password) })
          .returning();
        await openSession(user.id);
        return { ok: true, user: toUser(user) };
      } catch (error) {
        if (isUniqueViolation(error)) return { ok: false, reason: "email_taken" };
        console.error("Inscription impossible", error);
        return { ok: false, reason: "failed" };
      }
    },

    async signIn({ email, password }) {
      try {
        const user = await checkPassword(email, password);
        if (!user) return { ok: false, reason: "invalid_credentials" };
        await openSession(user.id);
        return { ok: true, user: toUser(user) };
      } catch (error) {
        console.error("Connexion impossible", error);
        return { ok: false, reason: "failed" };
      }
    },

    async signOut() {
      const token = await store.get();
      if (token) await db.delete(authSession).where(eq(authSession.tokenHash, sha256(token)));
      await store.clear();
    },

    async currentUser() {
      const session = await readSession();
      if (!session) return null;
      const current = now();
      if (session.expiresAt <= current) {
        await db.delete(authSession).where(eq(authSession.tokenHash, session.tokenHash));
        return null;
      }
      // La durée est glissante : en base seulement (le cookie, lui, dure plus longtemps ; la base fait foi).
      if (session.expiresAt.getTime() - current.getTime() < RENEW_BELOW) {
        await db
          .update(authSession)
          .set({ expiresAt: new Date(current.getTime() + SESSION_LIFETIME) })
          .where(eq(authSession.tokenHash, session.tokenHash));
      }
      return toUser(session);
    },

    async requestPasswordReset(email, redirectTo) {
      // Jamais d'erreur ni de différence visible : la réponse ne révèle pas si l'adresse a un compte.
      try {
        const user = await findByEmail(email);
        if (!user) return;
        const current = now();
        await db
          .delete(authRecovery)
          .where(and(eq(authRecovery.userId, user.id), lt(authRecovery.expiresAt, current)));
        const code = newToken();
        await db.insert(authRecovery).values({
          tokenHash: sha256(code),
          userId: user.id,
          expiresAt: new Date(current.getTime() + RECOVERY_LIFETIME),
        });
        const link = `${redirectTo}${redirectTo.includes("?") ? "&" : "?"}code=${code}`;
        await sendResetEmail(user.email, link);
      } catch (error) {
        // Le lien n'est jamais écrit dans le journal : seulement la raison.
        console.error("Email de réinitialisation non envoyé :", error instanceof Error ? error.message : "erreur");
      }
    },

    async exchangeRecoveryCode(code) {
      if (!code) return false;
      const current = now();
      // Une seule requête : marquer utilisé et vérifier la validité ensemble, sans course entre deux clics.
      const [used] = await db
        .update(authRecovery)
        .set({ usedAt: current })
        .where(
          and(
            eq(authRecovery.tokenHash, sha256(code)),
            isNull(authRecovery.usedAt),
            gt(authRecovery.expiresAt, current),
          ),
        )
        .returning({ userId: authRecovery.userId });
      if (!used) return false;
      await openSession(used.userId);
      return true;
    },

    async updatePassword(password) {
      const session = await readSession();
      if (!session || session.expiresAt <= now()) return { ok: false, reason: "failed" };
      if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
        return { ok: false, reason: "weak_password" };
      }
      const passwordHash = await hashPassword(password);
      await db.transaction(async (tx) => {
        await tx.update(authUser).set({ passwordHash, updatedAt: now() }).where(eq(authUser.id, session.id));
        // Un téléphone perdu ou une session oubliée ne survit pas au changement ; la session en cours reste.
        await tx
          .delete(authSession)
          .where(and(eq(authSession.userId, session.id), ne(authSession.tokenHash, session.tokenHash)));
        await tx.delete(authRecovery).where(eq(authRecovery.userId, session.id));
      });
      return { ok: true };
    },

    async deleteUser(id) {
      await db.delete(authUser).where(eq(authUser.id, id));
    },

    async verifyPassword(email, password) {
      return (await checkPassword(email, password)) !== null;
    },

    async updateEmail(id, email) {
      try {
        const [row] = await db
          .update(authUser)
          .set({ email: normalizeEmail(email), updatedAt: now() })
          .where(eq(authUser.id, id))
          .returning({ id: authUser.id });
        return row ? { ok: true } : { ok: false, reason: "failed" };
      } catch (error) {
        if (isUniqueViolation(error)) return { ok: false, reason: "email_taken" };
        console.error("Changement d'email impossible", error);
        return { ok: false, reason: "failed" };
      }
    },
  };
}
