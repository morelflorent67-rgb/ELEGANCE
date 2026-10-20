import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { TestProject } from "vitest/node";

// Fournit à chaque test une base Postgres réelle, migrations appliquées :
// - en intégration continue, le service Postgres désigné par TEST_DATABASE_URL ;
// - sinon, une instance temporaire démarrée ici, supprimée à la fin (aucun Docker, aucune installation).
// La base de développement (DATABASE_URL) n'est jamais utilisée par les tests.

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });

async function applyMigrations(url: string) {
  const client = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  } finally {
    await client.end();
  }
}

export default async function setup(project: TestProject) {
  const external = process.env.TEST_DATABASE_URL;
  if (external) {
    await applyMigrations(external);
    project.provide("databaseUrl", external);
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), "elegance-test-db-"));
  const port = await freePort();
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
  await applyMigrations(url);
  project.provide("databaseUrl", url);

  return async () => {
    await pg.stop();
    rmSync(dir, { recursive: true, force: true });
  };
}
