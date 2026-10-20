import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "@/lib/env";
import * as schema from "./schema";

// Seul point d'accès à la base : jamais importé par un composant client (server-only).
// prepare: false est requis par le « transaction pooler » de Supabase.
const globalForDb = globalThis as unknown as { __sql?: ReturnType<typeof postgres> };

function connection() {
  globalForDb.__sql ??= postgres(serverEnv().DATABASE_URL, { prepare: false, max: 5 });
  return globalForDb.__sql;
}

export function db() {
  return drizzle(connection(), { schema });
}

export function sql() {
  return connection();
}
