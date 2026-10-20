import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";

// Variables lues à la demande, pas à l'import : le build d'une page statique n'en a pas besoin.
// Plusieurs groupes : une fonction qui n'utilise que la base n'exige pas les clés Supabase.
const databaseSchema = z.object({
  DATABASE_URL: z.string().min(1),
});

const supabaseSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
});

const mailSchema = z.object({
  EMAIL_TRANSPORT: z.enum(["brevo", "log"]).optional(),
  BREVO_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.email().optional(),
  EMAIL_FROM_NAME: z.string().min(1).optional(),
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
export const mailEnv = () => read(mailSchema);

/**
 * Secret qui signe les liens sans connexion (agenda, désinscription). APP_SECRET s'il existe ; sinon dérivé de
 * la clé secrète Supabase, déjà présente en production : rien de plus à configurer.
 */
export function appSecret(): string {
  if (process.env.APP_SECRET) return process.env.APP_SECRET;
  const base = process.env.SUPABASE_SECRET_KEY;
  if (!base) throw new Error("APP_SECRET ou SUPABASE_SECRET_KEY est requis pour signer les liens.");
  return createHmac("sha256", base).update("elegance-strasbourg/app-secret/v1").digest("hex");
}

/** Secret du cron d'envoi des emails ; absent : la route refuse tout appel. */
export const cronSecret = (): string | undefined => process.env.CRON_SECRET || undefined;

/** Adresse publique du site, pour les liens des emails. SITE_URL d'abord, puis l'adresse Vercel, puis le local. */
export function siteUrl(): string {
  const configured = process.env.SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}
