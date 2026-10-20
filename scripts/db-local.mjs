// Base Postgres locale de développement, sans Docker : vrais binaires Postgres fournis par
// le paquet embedded-postgres, pilotés avec pg_ctl.
// Usage : node scripts/db-local.mjs start | stop | status | reset
import { execFileSync, execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PORT = 54322;
const DATA_DIR = resolve(".local-db");
const LOG_FILE = join(DATA_DIR, "server.log");

// Les binaires vivent dans un paquet propre à la plateforme, visible seulement depuis embedded-postgres.
const platform = { win32: "windows", darwin: "darwin", linux: "linux" }[process.platform];
const fromEmbedded = createRequire(fileURLToPath(import.meta.resolve("embedded-postgres")));
const binaries = await import(
  pathToFileURL(fromEmbedded.resolve(`@embedded-postgres/${platform}-${process.arch}`)).href
);
const exe = (name) => binaries[name];

const run = (name, args) => execFileSync(exe(name), args, { stdio: "inherit" });
// Le serveur démarré en tâche de fond ne doit pas hériter de notre sortie, sinon il la garde ouverte.
const runDetached = (name, args) => execFileSync(exe(name), args, { stdio: "ignore" });
const isRunning = () => {
  try {
    execFileSync(exe("pg_ctl"), ["-D", DATA_DIR, "status"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const commands = {
  start() {
    if (isRunning()) return console.log(`La base tourne déjà (port ${PORT}).`);
    if (!existsSync(join(DATA_DIR, "PG_VERSION"))) {
      console.log("Première initialisation de la base locale…");
      run("initdb", ["-D", DATA_DIR, "-U", "postgres", "-A", "trust", "-E", "UTF8"]);
    }
    runDetached("pg_ctl", [
      "-D",
      DATA_DIR,
      "-l",
      LOG_FILE,
      "-w",
      "-o",
      `-p ${PORT} -c listen_addresses=127.0.0.1`,
      "start",
    ]);
    execSync("pnpm exec drizzle-kit migrate", { stdio: "inherit" });
    console.log(`Base prête : postgresql://postgres@127.0.0.1:${PORT}/postgres`);
  },
  stop() {
    if (!isRunning()) return console.log("La base est déjà arrêtée.");
    run("pg_ctl", ["-D", DATA_DIR, "-m", "fast", "-w", "stop"]);
  },
  status() {
    console.log(isRunning() ? `La base tourne (port ${PORT}).` : "La base est arrêtée.");
  },
  reset() {
    commands.stop();
    rmSync(DATA_DIR, { recursive: true, force: true });
    console.log("Base locale supprimée.");
    commands.start();
  },
};

const command = commands[process.argv[2]];
if (!command) {
  console.error("Usage : node scripts/db-local.mjs start | stop | status | reset");
  process.exit(1);
}
command();
