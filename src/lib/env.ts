import "server-only";
import { z } from "zod";

// Variables lues à la demande, pas à l'import : le build d'une page statique n'en a pas besoin.
// Deux groupes séparés : une fonction qui n'utilise que la base n'exige pas les clés Supabase.
const databaseSchema = z.object({
  DATABASE_URL: z.string().min(1),
});

const supabaseSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
});

function read<T extends z.ZodType>(schema: T, source: unknown = process.env): z.infer<T> {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Variables d'environnement manquantes ou invalides : ${missing}`);
  }
  return parsed.data;
}

// DATABASE_URL en local ; sur Vercel, l'intégration Supabase fournit la même chose sous le nom POSTGRES_URL.
export const databaseEnv = () =>
  read(databaseSchema, { DATABASE_URL: process.env.DATABASE_URL ?? process.env.POSTGRES_URL });
export const supabaseEnv = () => read(supabaseSchema);
