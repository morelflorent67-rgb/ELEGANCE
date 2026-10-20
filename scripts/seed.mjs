// Applique les données de départ (src/db/seed.sql) à la base locale, ou à la base distante avec --remote.
// Rejouable sans danger. N'affiche jamais le mot de passe.
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });

const remote = process.argv.includes("--remote");
const raw = remote ? process.env.REMOTE_DATABASE_URL : process.env.DATABASE_URL;
if (!raw || raw.includes("[YOUR-PASSWORD]")) {
  console.error(`${remote ? "REMOTE_DATABASE_URL" : "DATABASE_URL"} manque dans .env.local.`);
  process.exit(1);
}

const url = new URL(raw);
url.search = "";
console.log(
  `Base visée : ${url.hostname}:${url.port || 5432}${remote ? " (distante)" : " (locale)"}`,
);

const sql = postgres(url.toString(), { prepare: false, max: 1, ssl: remote ? "require" : false });
try {
  await sql.unsafe(readFileSync("src/db/seed.sql", "utf8"));
  const [{ services }] = await sql`select count(*)::int as services from service`;
  const [{ staff }] = await sql`select count(*)::int as staff from staff`;
  console.log(`Données de départ appliquées : ${staff} membres, ${services} prestations.`);
} finally {
  await sql.end();
}
