import { connection } from "next/server";
import { db } from "@/db/client";
import { appSecret, cronSecret, siteUrl } from "@/lib/env";
import { processOutbox } from "@/modules/mail";
import { transportFromEnv } from "@/modules/mail/transport-from-env";

// Reprise des emails en attente ou en échec passager (principe 7). Appelé par le cron de Vercel,
// qui envoie « Authorization: Bearer <CRON_SECRET> ».
export async function GET(request: Request) {
  await connection();
  const secret = cronSecret();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Non autorisé.", { status: 401 });
  }
  const result = await processOutbox(db(), {
    transport: transportFromEnv(),
    baseUrl: siteUrl(),
    secret: appSecret(),
    limit: 50,
  });
  return Response.json(result);
}
