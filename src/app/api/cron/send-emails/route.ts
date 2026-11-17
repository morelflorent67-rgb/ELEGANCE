import { connection } from "next/server";
import { db } from "@/db/client";
import { appSecret, cronSecret, siteUrl } from "@/lib/env";
import { getAuthDriver } from "@/modules/auth";
import { purgeInactiveCustomers } from "@/modules/customers/inactive";
import { hitRateLimit } from "@/modules/security/rate-limit";
import { processOutbox } from "@/modules/mail";
import { scheduleReviewInvitations } from "@/modules/mail/review-invitations";
import { transportFromEnv } from "@/modules/mail/transport-from-env";
import { scheduleWinbackEmails } from "@/modules/mail/winback";
import { pushFromEnv } from "@/modules/push/from-env";
import { processWaitlist } from "@/modules/waitlist";

// Passage du cron : fait avancer la liste d'attente (offres expirées, places à proposer, D-100), programme les
// invitations à un avis du lendemain (R-64) et les relances (D-74), puis envoie les emails dus (rappels R-61,
// invitations) et reprend ceux en échec passager (principe 7). Appelé chaque minute par le minuteur du serveur, qui envoie
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
  // Fiches inactives depuis 3 ans (R-101) : une fois par jour, le cron passe chaque minute.
  const daily = await hitRateLimit(database, "purge-inactive-customers", { limit: 1, windowSeconds: 86_400 });
  const inactive = daily.allowed ? await purgeInactiveCustomers(database, getAuthDriver()) : { purged: 0 };
  const result = await processOutbox(database, {
    transport: transportFromEnv(),
    baseUrl: siteUrl(),
    secret: appSecret(),
    push: pushFromEnv(),
    limit: 200,
  });
  return Response.json({
    ...result,
    reviewInvitations,
    winback,
    inactivePurged: inactive.purged,
    waitlistOffers: waitlist.offers.length,
    waitlistExpired: waitlist.expired,
  });
}
