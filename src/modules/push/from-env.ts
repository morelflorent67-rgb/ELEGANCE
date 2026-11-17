import { createApnsTransport } from "./apns";
import type { PushTransport } from "./transport";

/**
 * Le transport APNs de la production, ou rien tant que la clé n'est pas posée sur le serveur : sans clé, aucune
 * notification ne part et tout le reste (emails, RDV) fonctionne comme avant. Variables : `APNS_KEY` (contenu du `.p8`),
 * `APNS_KEY_ID`, `APNS_TEAM_ID` ; `APNS_SANDBOX=true` seulement pour une version de développement.
 */
export function pushFromEnv(): PushTransport | undefined {
  const { APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID, APNS_SANDBOX } = process.env;
  if (!APNS_KEY || !APNS_KEY_ID || !APNS_TEAM_ID) return undefined;
  return createApnsTransport({
    key: APNS_KEY,
    keyId: APNS_KEY_ID,
    teamId: APNS_TEAM_ID,
    topic: "fr.elegancestrasbourg.app",
    production: APNS_SANDBOX !== "true",
  });
}
