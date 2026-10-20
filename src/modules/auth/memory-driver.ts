import { randomUUID } from "node:crypto";
import type { AuthDriver, AuthUser } from "./types";

// Authentification en mémoire : réservée aux tests (voir getAuthDriver, qui la refuse sur Vercel).
// Les mots de passe sont conservés en clair : aucune donnée réelle ne doit jamais y passer.

export interface SessionStore {
  get(): string | undefined | Promise<string | undefined>;
  set(sessionId: string): void | Promise<void>;
  clear(): void | Promise<void>;
}

interface MemoryUser extends AuthUser {
  password: string;
}

export const memoryAuthState = {
  users: new Map<string, MemoryUser>(), // clé : email en minuscules
  sessions: new Map<string, string>(), // session → id utilisateur
  recoveryCodes: new Map<string, string>(), // code → email
  /** Emails de réinitialisation demandés, pour les tests. */
  resets: [] as { email: string; redirectTo: string; code: string }[],
};

export function resetMemoryAuth(): void {
  memoryAuthState.users.clear();
  memoryAuthState.sessions.clear();
  memoryAuthState.recoveryCodes.clear();
  memoryAuthState.resets.length = 0;
}

export function createMemoryDriver(store: SessionStore): AuthDriver {
  const userBySession = async (): Promise<MemoryUser | null> => {
    const sessionId = await store.get();
    const userId = sessionId ? memoryAuthState.sessions.get(sessionId) : undefined;
    if (!userId) return null;
    return [...memoryAuthState.users.values()].find((u) => u.id === userId) ?? null;
  };
  const open = async (user: MemoryUser) => {
    const sessionId = randomUUID();
    memoryAuthState.sessions.set(sessionId, user.id);
    await store.set(sessionId);
  };

  return {
    async signUp({ email, password }) {
      const key = email.toLowerCase();
      if (memoryAuthState.users.has(key)) return { ok: false, reason: "email_taken" };
      if (password.length < 8) return { ok: false, reason: "weak_password" };
      const user: MemoryUser = { id: randomUUID(), email: key, password };
      memoryAuthState.users.set(key, user);
      await open(user);
      return { ok: true, user: { id: user.id, email: user.email } };
    },
    async signIn({ email, password }) {
      const user = memoryAuthState.users.get(email.toLowerCase());
      if (!user || user.password !== password) return { ok: false, reason: "invalid_credentials" };
      await open(user);
      return { ok: true, user: { id: user.id, email: user.email } };
    },
    async signOut() {
      const sessionId = await store.get();
      if (sessionId) memoryAuthState.sessions.delete(sessionId);
      await store.clear();
    },
    async currentUser() {
      const user = await userBySession();
      return user ? { id: user.id, email: user.email } : null;
    },
    async requestPasswordReset(email, redirectTo) {
      const key = email.toLowerCase();
      if (!memoryAuthState.users.has(key)) return;
      const code = randomUUID();
      memoryAuthState.recoveryCodes.set(code, key);
      memoryAuthState.resets.push({ email: key, redirectTo, code });
    },
    async exchangeRecoveryCode(code) {
      const email = memoryAuthState.recoveryCodes.get(code);
      const user = email ? memoryAuthState.users.get(email) : undefined;
      if (!user) return false;
      memoryAuthState.recoveryCodes.delete(code);
      await open(user);
      return true;
    },
    async updatePassword(password) {
      const user = await userBySession();
      if (!user) return { ok: false, reason: "failed" };
      if (password.length < 8) return { ok: false, reason: "weak_password" };
      user.password = password;
      return { ok: true };
    },
    async deleteUser(id) {
      for (const [key, user] of memoryAuthState.users) {
        if (user.id === id) memoryAuthState.users.delete(key);
      }
      for (const [sessionId, userId] of memoryAuthState.sessions) {
        if (userId === id) memoryAuthState.sessions.delete(sessionId);
      }
    },
    async verifyPassword(email, password) {
      const user = memoryAuthState.users.get(email.toLowerCase());
      return !!user && user.password === password;
    },
    async updateEmail(id, email) {
      const key = email.toLowerCase();
      const entry = [...memoryAuthState.users.entries()].find(([, user]) => user.id === id);
      if (!entry) return { ok: false, reason: "failed" };
      const [oldKey, user] = entry;
      if (key !== oldKey && memoryAuthState.users.has(key)) {
        return { ok: false, reason: "email_taken" };
      }
      memoryAuthState.users.delete(oldKey);
      user.email = key;
      memoryAuthState.users.set(key, user);
      return { ok: true };
    },
  };
}
