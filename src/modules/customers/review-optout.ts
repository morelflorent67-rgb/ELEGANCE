import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/types";
import { customer } from "@/db/schema";
import { recordAudit } from "@/modules/audit/record";

/**
 * « Ne plus recevoir ces invitations » (R-64) : le client ne reçoit plus d'invitation à laisser un avis. Les autres
 * emails (confirmation, rappel, modification, annulation) continuent : ils concernent un RDV qu'il a pris. Rejouer la
 * demande, ou la faire pour une fiche inconnue, ne fait rien.
 */
export async function setReviewOptOut(db: Database, customerId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const changed = await tx
      .update(customer)
      .set({ reviewOptOut: true })
      .where(and(eq(customer.id, customerId), eq(customer.reviewOptOut, false)))
      .returning({ id: customer.id });
    if (changed.length === 0) return;
    await recordAudit(tx, {
      actorType: "customer",
      actorId: customerId,
      action: "customer.review_opt_out",
      entity: "customer",
      entityId: customerId,
      before: { reviewOptOut: false },
      after: { reviewOptOut: true },
    });
  });
}
