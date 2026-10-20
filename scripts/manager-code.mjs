// Définit ou remplace le code gérant (R-73, D-53) : 6 chiffres, stocké haché dans les réglages du salon.
// Usage : pnpm manager:set-code (base locale) ou pnpm manager:set-code:remote (base Supabase : modifie la base en ligne).
// Le code se tape sans s'afficher ; il n'est jamais écrit nulle part en clair.
import { config } from "dotenv";
import postgres from "postgres";
import { hashManagerCode, MANAGER_CODE_PATTERN } from "../src/modules/staff/manager-code.ts";
import { ask } from "./lib/ask.mjs";

config({ path: ".env.local", quiet: true });

const remote = process.argv.includes("--remote");
const raw = remote ? process.env.REMOTE_DATABASE_URL : process.env.DATABASE_URL;
if (!raw || raw.includes("[YOUR-PASSWORD]")) {
  console.error(`${remote ? "REMOTE_DATABASE_URL" : "DATABASE_URL"} manque dans .env.local.`);
  process.exit(1);
}
const url = new URL(raw);
url.search = "";
console.log(`Base visée : ${url.hostname}:${url.port || 5432}${remote ? " (distante)" : " (locale)"}`);

const code = await ask("Nouveau code gérant (6 chiffres) : ", { hidden: true });
if (!MANAGER_CODE_PATTERN.test(code)) {
  console.error("Le code doit avoir exactement 6 chiffres.");
  process.exit(1);
}
const again = await ask("Retapez le code pour confirmer : ", { hidden: true });
if (again !== code) {
  console.error("Les deux codes ne sont pas identiques. Rien n'a été modifié.");
  process.exit(1);
}

const sql = postgres(url.toString(), { prepare: false, max: 1, ssl: remote ? "require" : false });
try {
  const updated = await sql`update salon_settings set manager_pin_hash = ${hashManagerCode(code)} where id = true`;
  if (updated.count !== 1) {
    console.error("Réglages du salon introuvables : lancez d'abord les données de départ (pnpm db:seed).");
    process.exit(1);
  }
  console.log("Code gérant enregistré.");
} finally {
  await sql.end();
}
