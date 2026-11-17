import "server-only";
import { cookies } from "next/headers";
import { db } from "@/db/client";
import { siteUrl } from "@/lib/env";
import { authDriverKind } from "@/lib/test-drivers";
import { transportFromEnv } from "@/modules/mail/transport-from-env";
import { renderPasswordResetEmail } from "@/modules/mail/templates/password-reset";
import { createMemoryDriver } from "./memory-driver";
import { createPostgresDriver } from "./postgres-driver";
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

/** Envoie le lien de réinitialisation du mot de passe (hors de la file d'emails : le lien est un secret, D-117). */
export async function sendPasswordResetEmail(to: string, link: string): Promise<void> {
  const email = renderPasswordResetEmail({ link, logoUrl: `${siteUrl()}/email/logo.png` });
  await transportFromEnv().send({ to: { email: to }, subject: email.subject, html: email.html, text: email.text });
}

/**
 * Pilote d'authentification de la requête en cours : comptes et sessions dans Postgres (D-116).
 * `AUTH_DRIVER=memory` sert aux tests de bout en bout : il est refusé sans `ALLOW_TEST_DRIVERS=true` (src/lib/test-drivers.ts),
 * pour qu'il ne puisse jamais protéger un vrai site.
 */
export function getAuthDriver(): AuthDriver {
  if (authDriverKind() === "memory") {
    return createMemoryDriver(cookieStore(MEMORY_COOKIE, { secure: false }));
  }
  const base = siteUrl();
  return createPostgresDriver({
    db: db(),
    store: cookieStore(SESSION_COOKIE, { secure: base.startsWith("https://"), maxAge: COOKIE_MAX_AGE }),
    now: () => new Date(),
    sendResetEmail: sendPasswordResetEmail,
  });
}

export type { AuthDriver, AuthUser } from "./types";
