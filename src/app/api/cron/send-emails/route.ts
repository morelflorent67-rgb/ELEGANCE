import { connection } from "next/server";
import { db } from "@/db/client";
import { appSecret, cronSecret, siteUrl } from "@/lib/env";
import { processOutbox } from "@/modules/mail";
import { scheduleReviewInvitations } from "@/modules/mail/review-invitations";
import { transportFromEnv } from "@/modules/mail/transport-from-env";
import { scheduleWinbackEmails } from "@/modules/mail/winback";
import { processWaitlist } from "@/modules/waitlist";

// Passage du cron : fait avancer la liste d'attente (offres expirées, places à proposer, D-100), programme les
// invitations à un avis du lendemain (R-64) et les relances (D-74), puis envoie les emails dus (rappels R-61,
// invitations) et reprend ceux en échec passager (principe 7). Appelé par le cron de Vercel, qui envoie
// « Authorization: Bearer <CRON_SECRET> ».
export async function GET(request: Request) {
  await connection();
  const secret = cronSecret();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Non autorisé.", { status: 401 });
  }
  const database = db();
  const waitlist = await processWaitlist(database);
  const reviewInvitations = await scheduleReviewInvitations(database);
  const winback = await scheduleWinbackEmails(database);
  const result = await processOutbox(database, {
    transport: transportFromEnv(),
    baseUrl: siteUrl(),
    secret: appSecret(),
    limit: 200,
  });
  return Response.json({
    ...result,
    reviewInvitations,
    winback,
    waitlistOffers: waitlist.offers.length,
    waitlistExpired: waitlist.expired,
  });
}
