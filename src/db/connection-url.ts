// Prépare l'adresse de connexion Postgres.
// L'intégration Vercel ↔ Supabase ajoute des paramètres (sslmode, supa=…) que postgres-js enverrait
// au serveur comme réglages et qui feraient échouer la connexion : on les retire, et on fixe le SSL
// nous-mêmes (exigé sauf pour une base locale).
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function connectionOptions(rawUrl: string): { url: string; ssl: "require" | false } {
  const parsed = new URL(rawUrl);
  parsed.search = "";
  return { url: parsed.toString(), ssl: LOCAL_HOSTS.has(parsed.hostname) ? false : "require" };
}
