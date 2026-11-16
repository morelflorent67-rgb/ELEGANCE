import { config } from "dotenv";
import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Sur le serveur, `.env.production` ; sur le poste de développement, `.env.local`.
config({ path: existsSync(".env.production") ? ".env.production" : ".env.local" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
