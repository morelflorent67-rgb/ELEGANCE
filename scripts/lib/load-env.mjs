// Charge les variables d'environnement des scripts : `.env.production` sur le serveur (s'il existe),
// sinon `.env.local` sur le poste de développement. Les scripts visent toujours la base de `DATABASE_URL`.
import { config } from "dotenv";
import { existsSync } from "node:fs";

export function loadEnv() {
  const file = existsSync(".env.production") ? ".env.production" : ".env.local";
  config({ path: file, quiet: true });
  return file;
}
