import "server-only";
import { mailEnv } from "@/lib/env";
import { SALON } from "@/lib/salon";
import {
  createBrevoTransport,
  createLogTransport,
  EmailSendError,
  type EmailTransport,
} from "./transport";

/**
 * Transport choisi par l'environnement : Brevo si la clé et l'expéditeur sont configurés, sinon le « journal »
 * (aucun email ne part : développement, tests, aperçus).
 * En production sans Brevo, un transport « journal » marquerait les emails comme envoyés alors que rien ne part :
 * on refuse plutôt l'envoi. L'email reste en file, repris par le cron, et le problème se voit dans la base.
 */
export function transportFromEnv(): EmailTransport {
  const env = mailEnv();
  const wantBrevo = env.EMAIL_TRANSPORT ? env.EMAIL_TRANSPORT === "brevo" : !!env.BREVO_API_KEY;
  if (!wantBrevo) {
    if (process.env.VERCEL_ENV === "production") {
      return {
        async send() {
          throw new EmailSendError("Brevo n'est pas configuré (BREVO_API_KEY, EMAIL_FROM).", false);
        },
      };
    }
    return createLogTransport();
  }
  if (!env.BREVO_API_KEY || !env.EMAIL_FROM) {
    throw new Error("Transport Brevo demandé : BREVO_API_KEY et EMAIL_FROM sont requis.");
  }
  return createBrevoTransport({
    apiKey: env.BREVO_API_KEY,
    fromEmail: env.EMAIL_FROM,
    fromName: env.EMAIL_FROM_NAME ?? SALON.name,
  });
}
