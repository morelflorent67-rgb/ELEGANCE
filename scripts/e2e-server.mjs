// Serveur des tests de bout en bout : une base Postgres temporaire (migrée et garnie des données de départ),
// l'authentification en mémoire, puis le site en version de production. Tout s'arrête avec Playwright.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const DB_PORT = 54399;
const SITE_PORT = 3100;
const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`;

const dir = mkdtempSync(join(tmpdir(), "elegance-e2e-db-"));
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: "postgres",
  password: "postgres",
  port: DB_PORT,
  persistent: false,
  onLog: () => {},
  onError: () => {},
});

let site;
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  site?.kill();
  await pg.stop().catch(() => {});
  rmSync(dir, { recursive: true, force: true });
  process.exit(code);
}
for (const signal of ["SIGINT", "SIGTERM", "SIGBREAK"]) process.on(signal, () => stop(0));

await pg.initialise();
await pg.start();

const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
await client.unsafe(readFileSync("src/db/seed.sql", "utf8"));
await client.end();

const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  AUTH_DRIVER: "memory", // refusé sur Vercel, voir src/modules/auth/index.ts
  AUTH_MEMORY_STAFF: "equipe@elegance.test:mot-de-passe-equipe", // compte de la tablette, en mémoire seulement
  APP_SECRET: "secret-des-tests-de-bout-en-bout",
  EMAIL_TRANSPORT: "log", // aucun email ne part
  SITE_URL: `http://127.0.0.1:${SITE_PORT}`,
  // Aucune clé Supabase réelle ne doit servir ici, même si un fichier .env.local en contient.
  SUPABASE_URL: "http://127.0.0.1:1",
  SUPABASE_PUBLISHABLE_KEY: "test",
  SUPABASE_SECRET_KEY: "test",
  NEXT_TELEMETRY_DISABLED: "1",
};

const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextBin, ...args], { env, stdio: "inherit" });
    child.on("exit", (code) =>
      code === 0 ? resolve(child) : reject(new Error(`next ${args[0]} : code ${code}`)),
    );
    if (args[0] === "start") site = child;
  });

try {
  await run(["build"]);
  const started = run(["start", "-p", String(SITE_PORT), "-H", "127.0.0.1"]);
  await started;
  await stop(0);
} catch (error) {
  console.error(error);
  await stop(1);
}
