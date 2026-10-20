// Applique les migrations à la base distante (Supabase). Lit REMOTE_DATABASE_URL dans .env.local.
// N'affiche jamais le mot de passe. Les migrations déjà appliquées sont ignorées.
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });

const raw = process.env.REMOTE_DATABASE_URL;
if (!raw || raw.includes("[YOUR-PASSWORD]")) {
  console.error("REMOTE_DATABASE_URL manque dans .env.local (ou contient encore [YOUR-PASSWORD]).");
  process.exit(1);
}

const parsed = new URL(raw);
parsed.search = "";
console.log(
  `Base visée : ${parsed.hostname}:${parsed.port || 5432} (utilisateur ${parsed.username})`,
);

const sql = postgres(parsed.toString(), { prepare: false, max: 1, ssl: "require" });
try {
  const [{ version }] = await sql`select version()`;
  console.log(version);
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  const ext = await sql`select extname from pg_extension where extname = 'btree_gist'`;
  console.log(
    ext.length ? "Migrations appliquées. btree_gist actif." : "ATTENTION : btree_gist absent.",
  );
} finally {
  await sql.end();
}
