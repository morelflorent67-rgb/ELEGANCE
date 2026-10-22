import { connection } from "next/server";
import { db } from "@/db/client";
import { isWebhookSecret, paymentProviderFromEnv } from "@/modules/payments/from-env";
import { settleByReference } from "@/modules/payments";

// Rappel de SumUp quand un encaissement du terminal est terminé (R-91). L'adresse porte un secret ; le contenu de
// l'appel ne sert qu'à retrouver l'encaissement, le résultat est relu chez SumUp avant d'être enregistré.
export async function POST(request: Request, { params }: { params: Promise<{ secret: string }> }) {
  await connection();
  const { secret } = await params;
  if (!isWebhookSecret(secret)) return new Response("Introuvable", { status: 404 });
  const provider = paymentProviderFromEnv();
  if (!provider) return new Response("Terminal non configuré", { status: 503 });

  const body = (await request.json().catch(() => null)) as {
    payload?: { client_transaction_id?: unknown };
    client_transaction_id?: unknown;
  } | null;
  const reference = body?.payload?.client_transaction_id ?? body?.client_transaction_id;
  if (typeof reference !== "string" || reference.length === 0 || reference.length > 100) {
    return new Response("Requête invalide", { status: 400 });
  }
  // Inconnu (rappel arrivé avant l'enregistrement) : 202, la tablette relira le résultat elle-même.
  const settled = await settleByReference(db(), provider, reference);
  return Response.json({ ok: true, known: settled !== null }, { status: settled ? 200 : 202 });
}
