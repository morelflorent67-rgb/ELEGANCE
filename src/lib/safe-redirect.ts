/**
 * Destination de retour après connexion (paramètre « next ») : uniquement un chemin du site.
 * Refuse les adresses complètes, les « // » (qui désignent un autre site) et les barres obliques inverses.
 */
export function safeNext(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}
