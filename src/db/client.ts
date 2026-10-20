import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { databaseEnv } from "@/lib/env";
import { connectionOptions } from "./connection-url";
import * as schema from "./schema";

// Seul point d'accès à la base : jamais importé par un composant client (server-only).
// prepare: false est requis par le « transaction pooler » de Supabase.
const globalForDb = globalThis as unknown as { __sql?: ReturnType<typeof postgres> };

function connection() {
  if (!globalForDb.__sql) {
    const { url, ssl } = connectionOptions(databaseEnv().DATABASE_URL);
    globalForDb.__sql = postgres(url, { prepare: false, max: 5, ssl });
  }
  return globalForDb.__sql;
}

export function db() {
  return drizzle(connection(), { schema });
}

export function sql() {
  return connection();
}
