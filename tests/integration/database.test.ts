import { afterAll, describe, expect, inject, it } from "vitest";
import postgres from "postgres";

const sql = postgres(inject("databaseUrl"), { max: 1 });

afterAll(async () => {
  await sql.end();
});

describe("base de données", () => {
  it("répond", async () => {
    const [row] = await sql`select 1 as ok`;
    expect(row.ok).toBe(1);
  });

  it("a l'extension btree_gist, requise par la contrainte anti-chevauchement (R-23)", async () => {
    const rows = await sql`select 1 from pg_extension where extname = 'btree_gist'`;
    expect(rows).toHaveLength(1);
  });

  it("refuse deux plages qui se chevauchent pour un même membre, accepte les plages contiguës", async () => {
    await sql`create temp table slot (staff int, starts_at timestamptz, ends_at timestamptz,
      exclude using gist (staff with =, tstzrange(starts_at, ends_at) with &&))`;
    await sql`insert into slot values (1, '2026-11-03 10:00+01', '2026-11-03 10:30+01')`;
    await expect(
      sql`insert into slot values (1, '2026-11-03 10:15+01', '2026-11-03 10:45+01')`,
    ).rejects.toMatchObject({ code: "23P01" });
    await sql`insert into slot values (2, '2026-11-03 10:15+01', '2026-11-03 10:45+01')`;
    await sql`insert into slot values (1, '2026-11-03 10:30+01', '2026-11-03 11:00+01')`;
  });
});
