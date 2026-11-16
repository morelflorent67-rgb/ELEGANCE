// Applique les données de départ (src/db/seed.sql) à la base de DATABASE_URL.
// Rejouable sans danger. N'affiche jamais le mot de passe.
import { loadEnv } from "./lib/load-env.mjs";
import { readFileSync } from "node:fs";
import postgres from "postgres";

const envFile = loadEnv();

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error(`DATABASE_URL manque dans ${envFile}.`);
  process.exit(1);
}

const url = new URL(raw);
url.search = "";
console.log(
  `Base visée : ${url.hostname}:${url.port || 5432}`,
);

const sql = postgres(url.toString(), { prepare: false, max: 1, ssl: false });
try {
  await sql.unsafe(readFileSync("src/db/seed.sql", "utf8"));
  const [{ services }] = await sql`select count(*)::int as services from service`;
  const [{ staff }] = await sql`select count(*)::int as staff from staff`;
  console.log(`Données de départ appliquées : ${staff} membres, ${services} prestations.`);
} finally {
  await sql.end();
}
