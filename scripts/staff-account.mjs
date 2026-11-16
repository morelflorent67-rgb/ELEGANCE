// Crée (ou réinitialise) le compte « équipe » de la tablette du salon dans la base de DATABASE_URL (R-72, D-50).
// Le compte porte le rôle « staff » : personne ne peut se le donner seul.
// Usage : pnpm staff:account. L'email et le mot de passe se tapent ici, le mot de passe sans s'afficher.
import postgres from "postgres";
import { hashPassword } from "../src/modules/auth/password.ts";
import { upsertStaffAccount } from "../src/modules/auth/staff-account.ts";
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

const email = (await ask("Adresse email du compte équipe : ")).toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Cette adresse ne semble pas valide.");
  process.exit(1);
}
const password = await ask("Mot de passe (12 caractères au moins) : ", { hidden: true });
if (password.length < 12) {
  console.error("Le mot de passe doit avoir 12 caractères au moins : la tablette est partagée.");
  process.exit(1);
}
if ((await ask("Retapez le mot de passe : ", { hidden: true })) !== password) {
  console.error("Les deux mots de passe ne sont pas identiques. Rien n'a été créé.");
  process.exit(1);
}

const sql = postgres(url.toString(), { prepare: false, max: 1, ssl: false });
try {
  const result = await upsertStaffAccount(sql, email, await hashPassword(password));
  if (result === "customer_account") {
    console.error("Cette adresse appartient à un compte client. Choisissez une autre adresse pour la tablette.");
    process.exit(1);
  }
  console.log(result === "created" ? "Compte équipe créé." : "Compte équipe mis à jour (nouveau mot de passe).");
} finally {
  await sql.end();
}
console.log("Sur la tablette : ouvrez /equipe/connexion et connectez-vous une seule fois.");
