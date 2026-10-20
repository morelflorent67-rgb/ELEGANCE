import "server-only";
import { cookies } from "next/headers";
import { createMemoryDriver } from "./memory-driver";
import { createSupabaseDriver } from "./supabase-driver";
import type { AuthDriver } from "./types";

const MEMORY_COOKIE = "elegance-test-session";

/**
 * Pilote d'authentification de la requête en cours. Supabase par défaut. `AUTH_DRIVER=memory` sert aux tests de
 * bout en bout : il est refusé sur toute machine Vercel, pour qu'il ne puisse jamais protéger un vrai site.
 */
export function getAuthDriver(): AuthDriver {
  if (process.env.AUTH_DRIVER === "memory") {
    if (process.env.VERCEL) throw new Error("AUTH_DRIVER=memory est interdit sur Vercel.");
    return createMemoryDriver({
      async get() {
        return (await cookies()).get(MEMORY_COOKIE)?.value;
      },
      async set(sessionId) {
        (await cookies()).set(MEMORY_COOKIE, sessionId, {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
        });
      },
      async clear() {
        (await cookies()).delete(MEMORY_COOKIE);
      },
    });
  }
  return createSupabaseDriver();
}

export type { AuthDriver, AuthUser } from "./types";
