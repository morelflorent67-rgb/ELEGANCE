// Prépare l'adresse de connexion Postgres.
// L'intégration Vercel ↔ Supabase ajoute des paramètres (sslmode, supa=…) que postgres-js enverrait
// au serveur comme réglages et qui feraient échouer la connexion : on les retire, et on fixe le SSL
// nous-mêmes (exigé sauf pour une base locale).
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

// Le pooler Supabase écoute en mode transaction sur 6543 et en mode session sur 5432. En mode transaction, des
// requêtes envoyées à la suite sur une même connexion (ce que fait postgres-js dès que plusieurs requêtes partent en
// même temps) restent bloquées jusqu'au délai maximal : c'était la lenteur de la tablette (lot 8, docs/decisions.md).
// Le mode session donne à chaque connexion sa propre session Postgres : même adresse, autre port.
const SUPABASE_POOLER = /\.pooler\.supabase\.com$/;
const TRANSACTION_PORT = "6543";
const SESSION_PORT = "5432";

/**
 * Réglages du client postgres-js. En mode session, chaque connexion ouverte occupe une session Postgres, en nombre
 * limité pour tout le projet (une quinzaine sur l'offre gratuite) : peu de connexions par instance, refermées après
 * 20 s sans requête (une fonction Vercel en pause ne les garde pas), et un échec de connexion signalé au bout de 10 s
 * plutôt que 30. `prepare: false` reste compatible avec le mode transaction.
 */
export const CLIENT_OPTIONS = {
  prepare: false,
  max: 3,
  idle_timeout: 20,
  connect_timeout: 10,
} as const;

export function connectionOptions(rawUrl: string): { url: string; ssl: "require" | false } {
  const parsed = new URL(rawUrl);
  parsed.search = "";
  if (SUPABASE_POOLER.test(parsed.hostname) && parsed.port === TRANSACTION_PORT) {
    parsed.port = SESSION_PORT;
  }
  return { url: parsed.toString(), ssl: LOCAL_HOSTS.has(parsed.hostname) ? false : "require" };
}
