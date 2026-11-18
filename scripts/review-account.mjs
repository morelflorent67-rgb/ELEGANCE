// Marque une fiche client existante comme compte de démonstration de l'examinateur d'Apple (R-103, D-125), dans la
// base de DATABASE_URL. Le compte se crée d'abord dans l'app ou sur le site (inscription ordinaire) ; ce script ne
// demande ni ne touche aucun mot de passe. Usage : pnpm review:account
import postgres from "postgres";
import { ask } from "./lib/ask.mjs";
import { loadEnv } from "./lib/load-env.mjs";

const envFile = loadEnv();
const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error(`DATABASE_URL manque dans ${envFile}.`);
  process.exit(1);
}
const url = new URL(raw);
url.search = "";
console.log(`Base visée : ${url.hostname}:${url.port || 5432}`);

const email = (await ask("Email du compte à marquer « démonstration Apple » : ")).trim().toLowerCase();
const sql = postgres(url.toString(), { prepare: false, max: 1, ssl: false });
try {
  const [row] = await sql`select id, first_name, apple_review from customer where lower(email) = ${email}`;
  if (!row) {
    console.error("Aucune fiche client avec cet email. Créez d'abord le compte dans l'app (inscription).");
    process.exit(1);
  }
  if (row.apple_review) {
    console.log("Ce compte est déjà marqué.");
  } else {
    await sql`update customer set apple_review = true where id = ${row.id}`;
    console.log("Compte marqué : ses RDV n'enverront aucun email, hors Bilan et fidélité, annulables à tout moment.");
  }
} finally {
  await sql.end();
}
