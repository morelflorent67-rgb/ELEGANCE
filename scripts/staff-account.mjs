// Crée (ou réinitialise) le compte « équipe » de la tablette du salon sur le projet Supabase (R-72, D-50).
// Le compte porte le rôle « staff » dans app_metadata, que personne ne peut se donner seul.
// Usage : pnpm staff:account. L'email et le mot de passe se tapent ici, le mot de passe sans s'afficher.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { ask } from "./lib/ask.mjs";

config({ path: ".env.local", quiet: true });

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("SUPABASE_URL et SUPABASE_SECRET_KEY sont requis dans .env.local.");
  process.exit(1);
}
console.log(`Projet visé : ${new URL(url).hostname}`);

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

const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });

// Un compte existe déjà avec cette adresse ? On le met à jour au lieu d'échouer.
const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) {
  console.error("Impossible de lire les comptes :", listError.message);
  process.exit(1);
}
const existing = list.users.find((u) => u.email?.toLowerCase() === email);

if (existing) {
  if (existing.app_metadata?.role === "customer") {
    console.error("Cette adresse appartient à un compte client. Choisissez une autre adresse pour la tablette.");
    process.exit(1);
  }
  const { error } = await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
    app_metadata: { ...existing.app_metadata, role: "staff" },
  });
  if (error) {
    console.error("Mise à jour impossible :", error.message);
    process.exit(1);
  }
  console.log("Compte équipe mis à jour (nouveau mot de passe).");
} else {
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "staff" },
  });
  if (error) {
    console.error("Création impossible :", error.message);
    process.exit(1);
  }
  console.log("Compte équipe créé.");
}
console.log("Sur la tablette : ouvrez /equipe/connexion et connectez-vous une seule fois.");
