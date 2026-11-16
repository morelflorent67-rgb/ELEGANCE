import "server-only";
import { z } from "zod";

// Variables lues à la demande, pas à l'import : le build d'une page statique n'en a pas besoin.
// Plusieurs groupes : une fonction qui n'utilise que la base n'exige pas les clés des emails.
const databaseSchema = z.object({
  DATABASE_URL: z.string().min(1),
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

export const databaseEnv = () => read(databaseSchema);
export const mailEnv = () => read(mailSchema);

/** Secret qui signe les liens sans connexion (agenda, désinscription) et le code gérant : `APP_SECRET`, obligatoire. */
export function appSecret(): string {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("APP_SECRET est requis pour signer les liens.");
  return secret;
}

/** Secret du cron d'envoi des emails ; absent : la route refuse tout appel. */
export const cronSecret = (): string | undefined => process.env.CRON_SECRET || undefined;

/** Adresse publique du site, pour les liens des emails : `SITE_URL`, sinon l'adresse locale. */
export function siteUrl(): string {
  const configured = process.env.SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  return "http://localhost:3000";
}
