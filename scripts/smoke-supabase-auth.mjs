// Contrôle manuel de l'authentification Supabase réelle (la CI ne peut pas le faire : pas de Supabase en local).
// Crée un compte jetable sur le projet de test, vérifie les comportements dont dépend src/modules/auth/supabase-driver.ts,
// puis supprime le compte. N'affiche aucune clé. Usage : pnpm smoke:auth
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

config({ path: ".env.local", quiet: true });

const url = process.env.SUPABASE_URL;
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !publishable || !secret) {
  console.error(
    "SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY et SUPABASE_SECRET_KEY sont requis dans .env.local.",
  );
  process.exit(1);
}
console.log(`Projet visé : ${new URL(url).hostname}`);

const options = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url, secret, options);
const anon = createClient(url, publishable, options);

const email = `smoke-${randomUUID().slice(0, 8)}@example.com`;
const password = "motdepasse-de-controle";
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "OK    " : "ÉCHEC "} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
};

let userId;
try {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "customer" },
  });
  userId = created.data.user?.id;
  check(
    "création d'un compte avec email confirmé",
    !created.error && !!userId,
    created.error?.message,
  );

  const duplicate = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  check(
    "un email déjà pris renvoie un code reconnu (email_exists)",
    duplicate.error?.code === "email_exists" ||
      /already|registered|exists/i.test(duplicate.error?.message ?? ""),
    `code : ${duplicate.error?.code ?? "aucune erreur"}`,
  );

  const weak = await admin.auth.admin.createUser({
    email: `weak-${email}`,
    password: "abc",
    email_confirm: true,
  });
  check(
    "un mot de passe trop court est refusé avec un code reconnu (weak_password)",
    weak.error?.code === "weak_password" || /password/i.test(weak.error?.message ?? ""),
    `code : ${weak.error?.code ?? "aucune erreur"}`,
  );
  if (weak.data?.user) await admin.auth.admin.deleteUser(weak.data.user.id);

  const wrong = await anon.auth.signInWithPassword({ email, password: "mauvais-mot-de-passe" });
  check(
    "un mauvais mot de passe renvoie invalid_credentials",
    wrong.error?.code === "invalid_credentials",
    `code : ${wrong.error?.code}`,
  );

  const unknown = await anon.auth.signInWithPassword({ email: `inconnu-${email}`, password });
  check(
    "un email inconnu renvoie la même erreur",
    unknown.error?.code === "invalid_credentials",
    `code : ${unknown.error?.code}`,
  );

  const login = await anon.auth.signInWithPassword({ email, password });
  check(
    "connexion avec la clé publique",
    !login.error && !!login.data.session,
    login.error?.message,
  );

  const me = await anon.auth.getUser(login.data.session?.access_token);
  check("getUser() vérifie le jeton et rend le bon compte", me.data.user?.id === userId);
  check(
    "le rôle « customer » est dans app_metadata",
    me.data.user?.app_metadata?.role === "customer",
  );

  // Lot 3 : changement d'adresse par l'API d'administration (src/modules/auth/supabase-driver.ts, updateEmail).
  const newEmail = `moved-${email}`;
  const changed = await admin.auth.admin.updateUserById(userId, {
    email: newEmail,
    email_confirm: true,
  });
  check("changement d'email par l'administration", !changed.error, changed.error?.message);
  const withNew = await anon.auth.signInWithPassword({ email: newEmail, password });
  check(
    "connexion avec la nouvelle adresse",
    !withNew.error && !!withNew.data.session,
    withNew.error?.message,
  );
  const withOld = await anon.auth.signInWithPassword({ email, password });
  check(
    "l'ancienne adresse ne marche plus",
    withOld.error?.code === "invalid_credentials",
    `code : ${withOld.error?.code}`,
  );

  const other = await admin.auth.admin.createUser({
    email: `other-${email}`,
    password,
    email_confirm: true,
  });
  const clash = await admin.auth.admin.updateUserById(other.data.user.id, {
    email: newEmail,
    email_confirm: true,
  });
  // Supabase refuse sans code reconnaissable (« Error updating user ») : le code traite ce cas comme une erreur
  // générale, le cas normal étant déjà intercepté par la vérification de la fiche client.
  check("prendre l'adresse d'un autre compte est refusé", !!clash.error, clash.error?.message);
  const holders = await admin.auth.admin.listUsers({ perPage: 200 });
  check(
    "aucun doublon d'adresse n'a été créé",
    holders.data.users.filter((u) => u.email === newEmail).length === 1,
  );
  if (other.data?.user) await admin.auth.admin.deleteUser(other.data.user.id);
} finally {
  if (userId) {
    const removed = await admin.auth.admin.deleteUser(userId);
    check("suppression du compte jetable", !removed.error, removed.error?.message);
  }
}

console.log(
  failures === 0
    ? "\nAuthentification Supabase : tout est conforme."
    : `\n${failures} contrôle(s) en échec.`,
);
process.exit(failures === 0 ? 0 : 1);
