import "server-only";
import { cookies } from "next/headers";
import { db } from "@/db/client";
import { siteUrl } from "@/lib/env";
import { transportFromEnv } from "@/modules/mail/transport-from-env";
import { renderPasswordResetEmail } from "@/modules/mail/templates/password-reset";
import { createMemoryDriver } from "./memory-driver";
import { createPostgresDriver } from "./postgres-driver";
import { createSupabaseDriver } from "./supabase-driver";
import type { AuthDriver, SessionStore } from "./types";

const MEMORY_COOKIE = "elegance-test-session";
const SESSION_COOKIE = "elegance-session";
/** Le cookie dure plus que la session (90 jours) : c'est la base qui fait foi. */
const COOKIE_MAX_AGE = 400 * 24 * 3600;

function cookieStore(name: string, options: { secure: boolean; maxAge?: number }): SessionStore {
  return {
    async get() {
      return (await cookies()).get(name)?.value;
    },
    async set(sessionId) {
      (await cookies()).set(name, sessionId, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: options.secure,
        maxAge: options.maxAge,
      });
    },
    async clear() {
      (await cookies()).delete(name);
    },
  };
}

/**
 * Pilote d'authentification de la requête en cours : comptes et sessions dans Postgres (D-116).
 * `AUTH_DRIVER=memory` sert aux tests de bout en bout : il est refusé sur toute machine Vercel, pour qu'il ne puisse
 * jamais protéger un vrai site.
 */
export function getAuthDriver(): AuthDriver {
  if (process.env.AUTH_DRIVER === "memory") {
    if (process.env.VERCEL) throw new Error("AUTH_DRIVER=memory est interdit sur Vercel.");
    return createMemoryDriver(cookieStore(MEMORY_COOKIE, { secure: false }));
  }
  if (process.env.AUTH_DRIVER === "supabase") return createSupabaseDriver();
  const base = siteUrl();
  return createPostgresDriver({
    db: db(),
    store: cookieStore(SESSION_COOKIE, { secure: base.startsWith("https://"), maxAge: COOKIE_MAX_AGE }),
    now: () => new Date(),
    async sendResetEmail(to, link) {
      const email = renderPasswordResetEmail({ link, logoUrl: `${base}/email/logo.png` });
      await transportFromEnv().send({ to: { email: to }, subject: email.subject, html: email.html, text: email.text });
    },
  });
}

export type { AuthDriver, AuthUser } from "./types";
