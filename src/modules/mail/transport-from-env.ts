import "server-only";
import { mailEnv } from "@/lib/env";
import { createBrevoTransport, createLogTransport, type EmailTransport } from "./transport";
import { SALON } from "@/lib/salon";

/**
 * Transport choisi par l'environnement : Brevo si la clé et l'expéditeur sont configurés, sinon le « journal »
 * (aucun email ne part : développement, tests, site de démonstration sans compte Brevo).
 */
export function transportFromEnv(): EmailTransport {
  const env = mailEnv();
  const wantBrevo = env.EMAIL_TRANSPORT ? env.EMAIL_TRANSPORT === "brevo" : !!env.BREVO_API_KEY;
  if (!wantBrevo) return createLogTransport();
  if (!env.BREVO_API_KEY || !env.EMAIL_FROM) {
    throw new Error("Transport Brevo demandé : BREVO_API_KEY et EMAIL_FROM sont requis.");
  }
  return createBrevoTransport({
    apiKey: env.BREVO_API_KEY,
    fromEmail: env.EMAIL_FROM,
    fromName: env.EMAIL_FROM_NAME ?? SALON.name,
  });
}
