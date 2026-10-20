import { sql } from "drizzle-orm";
import type { Database } from "@/db/types";

export interface RateLimitResult {
  allowed: boolean;
  /** Secondes avant la fin de la fenêtre, quand l'essai est refusé. */
  retryAfterSeconds: number;
}

/**
 * Limite le nombre d'essais par clé (adresse IP, email…) sur une fenêtre de temps.
 * Une seule requête atomique : deux essais simultanés ne peuvent pas passer le compteur.
 * Les essais refusés comptent aussi, pour décourager l'insistance.
 */
export async function hitRateLimit(
  db: Database,
  key: string,
  options: { limit: number; windowSeconds: number },
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const windowEnd = new Date(now.getTime() + options.windowSeconds * 1000);
  const rows = await db.execute<{ count: number; window_ends_at: Date }>(sql`
    insert into rate_limit (key, count, window_ends_at)
    values (${key}, 1, ${windowEnd.toISOString()}::timestamptz)
    on conflict (key) do update set
      count = case when rate_limit.window_ends_at <= ${now.toISOString()}::timestamptz then 1 else rate_limit.count + 1 end,
      window_ends_at = case when rate_limit.window_ends_at <= ${now.toISOString()}::timestamptz
                            then ${windowEnd.toISOString()}::timestamptz else rate_limit.window_ends_at end
    returning count, window_ends_at`);

  const row = rows[0];
  const count = Number(row.count);
  const endsAt = new Date(row.window_ends_at);
  const allowed = count <= options.limit;
  return {
    allowed,
    retryAfterSeconds: allowed
      ? 0
      : Math.max(1, Math.ceil((endsAt.getTime() - now.getTime()) / 1000)),
  };
}
