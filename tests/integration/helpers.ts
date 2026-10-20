import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { DateTime } from "luxon";
import postgres from "postgres";
import { inject } from "vitest";
import * as schema from "../../src/db/schema";
import type { Database } from "../../src/db/types";

// Identifiants fixes posés par src/db/seed.sql.
export const ORHAN = "00000000-0000-4000-8000-0000000000a1";
export const ENES = "00000000-0000-4000-8000-0000000000a2";
export const KAAN = "00000000-0000-4000-8000-0000000000a3";
export const TAHA = "00000000-0000-4000-8000-0000000000a4";

export const COUPE = "00000000-0000-4000-8000-000000000b01"; // 18 € · 30 min
export const COUPE_BARBE = "00000000-0000-4000-8000-000000000b02"; // 28 € · 30 min
export const COUPE_FORMATION = "00000000-0000-4000-8000-000000000b03"; // 10 € · 45 min · apprentis
export const COUPE_BARBE_FORMATION = "00000000-0000-4000-8000-000000000b04"; // 15 € · 45 min · apprentis
export const TAILLAGE_BARBE = "00000000-0000-4000-8000-000000000b05"; // 12 € · 15 min
export const SOIN_VISAGE = "00000000-0000-4000-8000-000000000b06"; // 25 € · 30 min
export const COLORATION = "00000000-0000-4000-8000-000000000b07"; // sur appel
export const TRIBAL = "00000000-0000-4000-8000-000000000b08"; // sur appel

/** Heure de Paris → instant : paris("2026-11-03", "10:00"). */
export const paris = (date: string, time: string): Date =>
  DateTime.fromISO(`${date}T${time}`, { zone: "Europe/Paris" }).toJSDate();

/** « Maintenant » des tests : lundi 2 novembre 2026, 8 h à Paris. */
export const NOW = paris("2026-11-02", "08:00");

const seedSql = readFileSync("src/db/seed.sql", "utf8");

export interface TestDb {
  db: Database;
  sql: postgres.Sql;
  /** Vide toutes les données puis rejoue les données de départ : chaque test part d'un état connu. */
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

export function connectTestDb(): TestDb {
  // Deux clients distincts : Drizzle modifie la conversion des dates du client qu'on lui donne,
  // ce qui casserait les requêtes SQL brutes des tests (paramètres de type Date).
  const url = inject("databaseUrl");
  const sql = postgres(url, { max: 10, onnotice: () => {} });
  const drizzleClient = postgres(url, { max: 10, onnotice: () => {} });
  const db = drizzle(drizzleClient, { schema });
  return {
    db,
    sql,
    async reset() {
      await sql.unsafe(`
        truncate appointment_item, appointment, absence, closure, email_outbox, audit_log,
                 customer, service_staff, service, staff, opening_hours, salon_settings
        restart identity cascade`);
      await sql.unsafe(seedSql);
    },
    close: async () => {
      await Promise.all([sql.end(), drizzleClient.end()]);
    },
  };
}

export async function createCustomer(
  sql: postgres.Sql,
  overrides: { blocked?: boolean; name?: string } = {},
): Promise<string> {
  const [row] = await sql`
    insert into customer (first_name, last_name, phone, email, online_booking_blocked)
    values (${overrides.name ?? "Test"}, 'Client', '0600000000', 'client@example.com', ${overrides.blocked ?? false})
    returning id`;
  return row.id as string;
}

export async function insertAppointment(
  sql: postgres.Sql,
  input: {
    customerId: string;
    staffId: string;
    startsAt: Date;
    endsAt: Date;
    status?: string;
  },
) {
  await sql`
    insert into appointment (customer_id, staff_id, starts_at, ends_at, status, source)
    values (${input.customerId}, ${input.staffId}, ${input.startsAt}, ${input.endsAt},
            ${input.status ?? "confirmed"}, 'salon')`;
}
