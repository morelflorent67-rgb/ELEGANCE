import { revalidateTag } from "next/cache";
import { connection } from "next/server";
import { VITRINE_TAG } from "@/modules/vitrine/tag";

// Réservé aux tests de bout en bout (scripts/e2e-server.mjs pose E2E_ROUTES=1) : les tests remettent la base à zéro
// sans passer par une action du gérant, donc sans vider le cache de la vitrine. Introuvable partout ailleurs.
export async function POST() {
  await connection();
  if (process.env.E2E_ROUTES !== "1") return new Response("Introuvable", { status: 404 });
  revalidateTag(VITRINE_TAG, { expire: 0 });
  return Response.json({ ok: true });
}
