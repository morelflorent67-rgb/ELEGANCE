import "server-only";
import { z } from "zod";

// Variables lues à la demande, pas à l'import : le build d'une page statique n'en a pas besoin.
const serverSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (!cached) {
    const parsed = serverSchema.safeParse(process.env);
    if (!parsed.success) {
      const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Variables d'environnement manquantes ou invalides : ${missing}`);
    }
    cached = parsed.data;
  }
  return cached;
}
