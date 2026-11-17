import type { ApiClient } from "@/api/client";
import type { Vitrine } from "@/api/types";
import { useSession } from "@/session";
import { useLoad, type Loaded } from "@/use-load";

// Carte, équipe, horaires, accès : lus sur le serveur (jamais en dur). Gardés en mémoire cinq minutes, comme le cache
// de la vitrine du site.

let cache: { at: number; data: Vitrine } | null = null;
const TTL = 5 * 60_000;

async function fetchVitrine(api: ApiClient): Promise<Vitrine> {
  if (cache && Date.now() - cache.at < TTL) return cache.data;
  const data = await api.get<Vitrine>("/vitrine");
  cache = { at: Date.now(), data };
  return data;
}

export function useVitrine(): Loaded<Vitrine> {
  const { api } = useSession();
  return useLoad(() => fetchVitrine(api));
}
