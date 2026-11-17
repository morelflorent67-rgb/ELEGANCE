import { sql } from "drizzle-orm";
import type { Database } from "@/db/types";
import type { AuthDriver } from "@/modules/auth/types";
import { anonymizeCustomer } from "./profile";

// Conservation des données (R-101, D-121) : un compte, ou une fiche créée par le salon, sans rendez-vous ni connexion
// depuis 3 ans est supprimé comme à la demande du client (R-75) : identité effacée, RDV passés gardés sans identité.
// Ce que dit la page de confidentialité ; le délai vit ici, en un seul endroit.

export const INACTIVITY_YEARS = 3;

/** Au plus ce nombre de fiches par passage : le cron repasse le lendemain, un gros retard ne bloque rien. */
const BATCH = 50;

function cutoffOf(now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - INACTIVITY_YEARS);
  return cutoff;
}

/**
 * Fiches inactives : la dernière activité est la plus récente de la création de la fiche, du dernier RDV (même annulé :
 * le client a bien réservé), de la dernière connexion et de la dernière visite du fichier repris. Un RDV à venir est
 * une activité. Les comptes de l'équipe ne sont pas des fiches client.
 */
export async function findInactiveCustomers(db: Database, now: Date, limit = BATCH): Promise<string[]> {
  const cutoff = cutoffOf(now).toISOString();
  const rows = await db.execute<{ id: string }>(sql`
    select c.id
    from customer c
    where c.anonymized_at is null
      and not exists (select 1 from auth_user u where u.id = c.auth_user_id and u.role = 'staff')
      and greatest(
            c.created_at,
            coalesce((select max(a.starts_at) from appointment a where a.customer_id = c.id), 'epoch'::timestamptz),
            coalesce((select max(s.created_at) from auth_session s where s.user_id = c.auth_user_id), 'epoch'::timestamptz),
            coalesce(c.legacy_last_visit_on::timestamptz, 'epoch'::timestamptz)
          ) < ${cutoff}::timestamptz
    order by c.created_at
    limit ${limit}`);
  return rows.map((r) => r.id);
}

/** Supprime les fiches inactives. Idempotent. Retourne le nombre de fiches supprimées (jamais leurs données). */
export async function purgeInactiveCustomers(
  db: Database,
  driver: Pick<AuthDriver, "deleteUser">,
  now: Date = new Date(),
): Promise<{ purged: number }> {
  const ids = await findInactiveCustomers(db, now);
  let purged = 0;
  for (const customerId of ids) {
    try {
      const { authUserId } = await anonymizeCustomer(
        db,
        { customerId, actor: { type: "system", id: null }, onImminent: "cancel", reason: "inactive" },
        now,
      );
      if (authUserId) await driver.deleteUser(authUserId);
      purged += 1;
    } catch (error) {
      // Une fiche qui résiste (concurrence, base) n'empêche pas les autres ; elle sera reprise demain.
      console.error("purge des fiches inactives : fiche ignorée", error);
    }
  }
  return { purged };
}
