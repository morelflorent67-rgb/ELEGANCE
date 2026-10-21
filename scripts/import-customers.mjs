// Importe le fichier clients du salon (export Treatwell, CSV) en fiches sans compte (D-70, D-77).
// Usage : pnpm customers:import "C:\chemin\vers\fichier.csv" (base locale)
//         pnpm customers:import:remote "C:\chemin\vers\fichier.csv" (base Supabase : modifie la base en ligne)
// Le fichier reste où il est : il est refusé s'il se trouve dans le dépôt (public). Rien de personnel n'est affiché :
// seulement des nombres. Un bilan s'affiche d'abord, et rien n'est écrit sans « oui ». Rejouable sans doublons.
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import postgres from "postgres";
import { normalizePhone } from "../src/lib/phone.ts";
import { applyImport } from "../src/modules/customers/import-apply.ts";
import { importSince, parseCsv, planImport } from "../src/modules/customers/import-file.ts";
import { ask } from "./lib/ask.mjs";

config({ path: ".env.local", quiet: true });

const remote = process.argv.includes("--remote");
const fileArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
if (!fileArg) {
  console.error('Indiquez le fichier : pnpm customers:import "C:\\chemin\\vers\\fichier.csv"');
  process.exit(1);
}

const file = resolve(fileArg);
const inRepo = relative(process.cwd(), file);
if (!inRepo.startsWith("..") && !isAbsolute(inRepo)) {
  console.error(
    "Ce fichier est dans le dossier du projet, qui est public sur GitHub. Déplacez-le ailleurs (par exemple dans Téléchargements), puis relancez.",
  );
  process.exit(1);
}

const raw = remote ? process.env.REMOTE_DATABASE_URL : process.env.DATABASE_URL;
if (!raw || raw.includes("[YOUR-PASSWORD]")) {
  console.error(`${remote ? "REMOTE_DATABASE_URL" : "DATABASE_URL"} manque dans .env.local.`);
  process.exit(1);
}
const url = new URL(raw);
url.search = "";

const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());
const since = importSince(today);
const { candidates, report } = planImport(parseCsv(readFileSync(file, "utf8")), {
  since,
  today,
  normalizePhone,
});

const frDate = (iso) => iso.split("-").reverse().join("/");
console.log(`
Fichier lu : ${report.read} clients.
  Gardés : ${report.kept} fiches (venus depuis le ${frDate(since)}, avec un téléphone ou un email)
  Écartés, dernière visite avant le ${frDate(since)} : ${report.tooOld}
  Écartés, ni téléphone ni email : ${report.noContact}
  Écartés, sans visite ou sans prénom : ${report.incomplete}
  Doublons réunis : ${report.duplicates}
  Numéros illisibles (fiche gardée si l'email suffit) : ${report.invalidPhones}
  Dont sans email (aucun email ne leur sera envoyé) : ${candidates.filter((c) => !c.email).length}
`);
console.log(
  `Base visée : ${url.hostname}:${url.port || 5432}${remote ? " (distante, EN LIGNE)" : " (locale)"}`,
);

const answer = await ask(`Importer ces ${report.kept} fiches ? Tapez « oui » pour confirmer : `);
if (answer.toLowerCase() !== "oui") {
  console.log("Rien n'a été importé.");
  process.exit(0);
}

const sql = postgres(url.toString(), { prepare: false, max: 1, ssl: remote ? "require" : false });
try {
  const result = await applyImport(sql, candidates);
  console.log(`
Import terminé.
  Nouvelles fiches sans compte : ${result.created}
  Fiches déjà importées, mises à jour : ${result.refreshed}
  Clients déjà connus (compte ou fiche du salon), historique ajouté : ${result.completed}
Aucun email n'a été envoyé.`);
} finally {
  await sql.end();
}
