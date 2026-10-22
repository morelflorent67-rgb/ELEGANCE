import "server-only";
import { inArray } from "drizzle-orm";
import type { Database } from "@/db/types";
import { emailOutbox } from "@/db/schema";
import { appSecret, siteUrl } from "@/lib/env";
import { processOutbox } from "@/modules/mail/worker";
import { transportFromEnv } from "@/modules/mail/transport-from-env";
import { processWaitlist } from "./process";

/**
 * Fait avancer la liste d'attente puis envoie tout de suite les emails des offres faites (D-100), à lancer APRÈS la
 * réponse (`after`) chaque fois qu'une place a pu se libérer. Ne lève jamais d'erreur : le cron reprend le traitement et
 * les envois en échec.
 */
export async function wakeWaitlist(db: Database): Promise<void> {
  try {
    const run = await processWaitlist(db);
    if (run.offers.length === 0) return;
    const rows = await db
      .select({ id: emailOutbox.id })
      .from(emailOutbox)
      .where(
        inArray(
          emailOutbox.dedupeKey,
          run.offers.map((o) => `waitlist-offer:${o.offerId}`),
        ),
      );
    await processOutbox(db, {
      transport: transportFromEnv(),
      baseUrl: siteUrl(),
      secret: appSecret(),
      ids: rows.map((r) => r.id),
    });
  } catch (error) {
    console.error("Liste d'attente : traitement impossible, le cron le reprendra :", error);
  }
}
