// Contrôle manuel de la base en ligne (`pnpm smoke:db`), en lecture seule : les chargements de la tablette passent-ils
// par le pooler Supabase sans rester bloqués ? Les tests d'intégration tournent sur un Postgres local, sans pooler :
// ils ne peuvent pas voir ce défaut (lot 8 : planning bloqué en mode transaction, voir docs/decisions.md).
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { CLIENT_OPTIONS, connectionOptions } from "@/db/connection-url";
import * as schema from "@/db/schema";
import type { Database } from "@/db/types";
import { parisDate } from "@/lib/format";
import { countAppointmentsToHandle } from "@/modules/absences";
import { loadDayPlanning } from "@/modules/planning";
import { listActiveStaff } from "@/modules/staff";

function remoteUrl(): string {
  if (process.env.REMOTE_DATABASE_URL) return process.env.REMOTE_DATABASE_URL;
  const env = readFileSync(".env.local", "utf8");
  const found = env.match(/^REMOTE_DATABASE_URL=(.*)$/m)?.[1]?.trim();
  if (!found) throw new Error("REMOTE_DATABASE_URL manque dans .env.local.");
  return found;
}

const { url, ssl } = connectionOptions(remoteUrl());
const client = postgres(url, { ...CLIENT_OPTIONS, ssl });
const db = drizzle(client, { schema }) as unknown as Database;

afterAll(() => client.end({ timeout: 2 }));

/** Échoue au lieu d'attendre : un blocage durait jusqu'à la limite de 300 s des fonctions Vercel. */
function within<T>(ms: number, work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`bloqué plus de ${ms} ms`)), ms)),
  ]);
}

describe("base en ligne (lecture seule)", () => {
  it("passe par le pooler en mode session", () => {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith(".pooler.supabase.com")) expect(parsed.port).toBe("5432");
  });

  it("charge un écran du planning, barre comprise, plusieurs fois de suite sans blocage", async () => {
    const today = parisDate(new Date());
    for (let round = 0; round < 3; round++) {
      // Comme la page : planning, équipe et pastille « à traiter » en même temps.
      await within(
        10_000,
        Promise.all([loadDayPlanning(db, today), listActiveStaff(db), countAppointmentsToHandle(db)]),
      );
    }
  });

  it("supporte deux écrans chargés en même temps (préchargements, rafraîchissement)", async () => {
    const today = parisDate(new Date());
    const screen = () =>
      Promise.all([loadDayPlanning(db, today), listActiveStaff(db), countAppointmentsToHandle(db)]);
    await within(10_000, Promise.all([screen(), screen()]));
  });
});
