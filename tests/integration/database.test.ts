import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
const sql = url ? postgres(url, { max: 1 }) : undefined;

afterAll(async () => {
  await sql?.end();
});

describe("base de données", () => {
  it("répond", async () => {
    expect(sql, "DATABASE_URL manquant : lancer la base locale (pnpm db:start)").toBeDefined();
    const [row] = await sql!`select 1 as ok`;
    expect(row.ok).toBe(1);
  });

  it("a l'extension btree_gist, requise par la contrainte anti-chevauchement (R-23)", async () => {
    const rows = await sql!`select 1 from pg_extension where extname = 'btree_gist'`;
    expect(rows).toHaveLength(1);
  });
});
