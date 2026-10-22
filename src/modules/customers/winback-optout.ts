import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/types";
import { customer } from "@/db/schema";
import { recordAudit } from "@/modules/audit/record";

/**
 * « Ne plus recevoir ces messages » (R-88, D-74) : le client ne reçoit plus « Nous serions ravis de vous revoir ». Les
 * emails de ses rendez-vous continuent. Rejouer la demande, ou la faire pour une fiche inconnue, ne fait rien.
 * `optedOut` faux rétablit les relances (réservé à un futur écran du compte).
 */
export async function setWinbackOptOut(
  db: Database,
  customerId: string,
  optedOut: boolean,
): Promise<void> {
  await db.transaction(async (tx) => {
    const changed = await tx
      .update(customer)
      .set({ winbackOptOut: optedOut })
      .where(and(eq(customer.id, customerId), eq(customer.winbackOptOut, !optedOut)))
      .returning({ id: customer.id });
    if (changed.length === 0) return;
    await recordAudit(tx, {
      actorType: "customer",
      actorId: customerId,
      action: "customer.winback_opt_out",
      entity: "customer",
      entityId: customerId,
      before: { winbackOptOut: !optedOut },
      after: { winbackOptOut: optedOut },
    });
  });
}
