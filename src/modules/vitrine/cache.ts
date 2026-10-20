import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db/client";
import { readVitrine, type VitrineData } from "./load";
import { VITRINE_TAG } from "./tag";

// La vitrine lit la base une fois, puis garde la réponse en mémoire : les pages publiques restent rapides même si
// la base est loin. Toute action du gérant (asManager, src/app/equipe/actions.ts) vide ce cache avec
// `updateTag(VITRINE_TAG)` ; à défaut, il se renouvelle seul au bout de 5 minutes.
export async function getVitrine(): Promise<VitrineData> {
  "use cache";
  cacheTag(VITRINE_TAG);
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  return readVitrine(db());
}
