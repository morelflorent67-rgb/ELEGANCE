import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { Database } from "@/db/types";
import { emailOutbox } from "@/db/schema";

// État de la file d'envoi pour la surveillance (/api/health, lot 8). Aucune donnée personnelle : des nombres.

/**
 * Un email dû depuis plus longtemps n'est pas parti alors qu'il aurait dû (cron arrêté, Brevo injoignable, clé
 * retirée). 1 h : le minuteur du serveur appelle le cron chaque minute, un email dû part en quelques minutes.
 */
export const OVERDUE_AFTER_HOURS = 1;
const FAILED_WINDOW_DAYS = 7;

export interface OutboxHealth {
  /** Emails dus depuis plus de OVERDUE_AFTER_HOURS, hors emails retenus pour le gérant (R-43). */
  overdue: number;
  /** Emails abandonnés (adresse refusée, essais épuisés), créés ces 7 derniers jours. */
  failedLastWeek: number;
}

export async function outboxHealth(db: Database, now: Date = new Date()): Promise<OutboxHealth> {
  const overdueBefore = new Date(now.getTime() - OVERDUE_AFTER_HOURS * 3_600_000);
  const failedSince = new Date(now.getTime() - FAILED_WINDOW_DAYS * 24 * 3_600_000);
  const count = sql<number>`count(*)::int`;
  const [[overdue], [failed]] = await Promise.all([
    db
      .select({ n: count })
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.status, "pending"),
          eq(emailOutbox.heldForManager, false),
          lt(emailOutbox.nextAttemptAt, overdueBefore),
        ),
      ),
    db
      .select({ n: count })
      .from(emailOutbox)
      .where(and(eq(emailOutbox.status, "failed"), gte(emailOutbox.createdAt, failedSince))),
  ]);
  return { overdue: overdue?.n ?? 0, failedLastWeek: failed?.n ?? 0 };
}
