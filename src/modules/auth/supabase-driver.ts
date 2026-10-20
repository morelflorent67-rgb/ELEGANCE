import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabaseEnv } from "@/lib/env";
import type { AuthDriver } from "./types";

// Authentification Supabase, toujours côté serveur : cookies httpOnly, aucune clé dans le navigateur (principe 5).
// Ne se teste pas en intégration continue (pas de Supabase en local) : voir scripts/smoke-supabase-auth.mjs.

async function serverClient() {
  const env = supabaseEnv();
  const store = await cookies();
  return createServerClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Appelé depuis un composant serveur, qui ne peut pas écrire de cookie : le proxy rafraîchit la session.
        }
      },
    },
  });
}

function adminClient() {
  const env = supabaseEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const isWeakPassword = (error: { code?: string; message: string }) =>
  error.code === "weak_password" || /password/i.test(error.message);

export function createSupabaseDriver(): AuthDriver {
  return {
    async signUp({ email, password }) {
      // Création par l'API d'administration : email marqué confirmé (D-42), rôle posé dans app_metadata
      // (que le client ne peut pas modifier).
      const { data, error } = await adminClient().auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role: "customer" },
      });
      if (error || !data.user) {
        if (
          error?.code === "email_exists" ||
          /already|registered|exists/i.test(error?.message ?? "")
        ) {
          return { ok: false, reason: "email_taken" };
        }
        if (error && isWeakPassword(error)) return { ok: false, reason: "weak_password" };
        return { ok: false, reason: "failed" };
      }
      const { error: signInError } = await (
        await serverClient()
      ).auth.signInWithPassword({ email, password });
      if (signInError) {
        await adminClient().auth.admin.deleteUser(data.user.id);
        return { ok: false, reason: "failed" };
      }
      return { ok: true, user: { id: data.user.id, email } };
    },

    async signIn({ email, password }) {
      const { data, error } = await (
        await serverClient()
      ).auth.signInWithPassword({ email, password });
      if (error || !data.user) {
        return {
          ok: false,
          reason: error?.code === "invalid_credentials" ? "invalid_credentials" : "failed",
        };
      }
      return { ok: true, user: { id: data.user.id, email: data.user.email ?? email } };
    },

    async signOut() {
      await (await serverClient()).auth.signOut();
    },

    async currentUser() {
      // getUser() vérifie le jeton auprès de Supabase ; getSession() se fierait au cookie seul.
      const { data } = await (await serverClient()).auth.getUser();
      return data.user?.email ? { id: data.user.id, email: data.user.email } : null;
    },

    async requestPasswordReset(email, redirectTo) {
      // Aucune erreur remontée : la réponse ne doit pas révéler si l'adresse a un compte.
      await (await serverClient()).auth.resetPasswordForEmail(email, { redirectTo });
    },

    async exchangeRecoveryCode(code) {
      const { error } = await (await serverClient()).auth.exchangeCodeForSession(code);
      return !error;
    },

    async updatePassword(password) {
      const { error } = await (await serverClient()).auth.updateUser({ password });
      if (!error) return { ok: true };
      return { ok: false, reason: isWeakPassword(error) ? "weak_password" : "failed" };
    },

    async deleteUser(id) {
      await adminClient().auth.admin.deleteUser(id);
    },

    async verifyPassword(email, password) {
      // Client sans cookies ni session : la connexion en cours n'est pas touchée.
      const env = supabaseEnv();
      const probe = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data, error } = await probe.auth.signInWithPassword({ email, password });
      return !error && !!data.user;
    },

    async updateEmail(id, email) {
      const { error } = await adminClient().auth.admin.updateUserById(id, {
        email,
        email_confirm: true,
      });
      if (!error) return { ok: true };
      if (error.code === "email_exists" || /already|registered|exists/i.test(error.message)) {
        return { ok: false, reason: "email_taken" };
      }
      return { ok: false, reason: "failed" };
    },
  };
}
