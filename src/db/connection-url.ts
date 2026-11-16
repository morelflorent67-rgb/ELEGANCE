// Prépare l'adresse de connexion Postgres : retire les paramètres d'URL que postgres-js enverrait au serveur comme
// réglages, et fixe le SSL nous-mêmes (exigé sauf pour une base locale : sur le serveur, la base écoute en local).
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Réglages du client postgres-js. Le serveur du site est permanent (plus de fonctions éphémères) : un petit nombre de
 * connexions durables suffit (10), refermées après 20 s sans requête, et un échec de connexion est signalé au bout
 * de 10 s. `prepare: false` reste compatible avec un éventuel pooler.
 */
export const CLIENT_OPTIONS = {
  prepare: false,
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
} as const;

export function connectionOptions(rawUrl: string): { url: string; ssl: "require" | false } {
  const parsed = new URL(rawUrl);
  // « sslmode=disable » écrit explicitement : base d'un conteneur sur le réseau privé du serveur (D-119), pas de SSL.
  const sslDisabled = parsed.searchParams.get("sslmode") === "disable";
  parsed.search = "";
  return { url: parsed.toString(), ssl: sslDisabled || LOCAL_HOSTS.has(parsed.hostname) ? false : "require" };
}
