import "server-only";
import { eq } from "drizzle-orm";
import type { Database } from "@/db/types";
import { emailOutbox } from "@/db/schema";
import { appSecret, siteUrl } from "@/lib/env";
import { processOutbox } from "./worker";
import { transportFromEnv } from "./transport-from-env";

/**
 * Envoi immédiat des emails d'un RDV, à lancer APRÈS la réponse au client (`after`).
 * Ne lève jamais d'erreur : en cas d'échec, l'email reste dans la file et le cron le reprend.
 */
export async function sendEmailsForAppointment(db: Database, appointmentId: string): Promise<void> {
  try {
    const rows = await db
      .select({ id: emailOutbox.id })
      .from(emailOutbox)
      .where(eq(emailOutbox.appointmentId, appointmentId));
    if (rows.length === 0) return;
    await processOutbox(db, {
      transport: transportFromEnv(),
      baseUrl: siteUrl(),
      secret: appSecret(),
      ids: rows.map((r) => r.id),
    });
  } catch (error) {
    console.error("Envoi immédiat de l'email impossible, le cron le reprendra :", error);
  }
}
