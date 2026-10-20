import { revokeManagerUnlock } from "../_lib/session";

/**
 * Reverrouille l'espace gérant (D-53). Une route plutôt qu'une action : le navigateur peut l'appeler en partant
 * (`sendBeacon`), et la réponse pose à coup sûr la suppression du cookie. Verrouiller est sans danger : aucune
 * vérification d'accès n'est nécessaire.
 */
export async function POST() {
  await revokeManagerUnlock();
  return new Response(null, { status: 204 });
}
