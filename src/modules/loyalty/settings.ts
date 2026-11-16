import { eq } from "drizzle-orm";
import type { Database } from "@/db/types";
import { salonSettings } from "@/db/schema";
import { recordAudit } from "@/modules/audit/record";

/**
 * Active ou désactive le programme (gérant). Désactivé, plus aucun point ne se gagne ni ne se dépense ; les points déjà
 * gagnés restent. Réactivé, le décompte repart de ce moment : les RDV passés pendant l'arrêt ne rapportent rien.
 */
export async function setLoyaltyEnabled(
  db: Database,
  enabled: boolean,
  actorId: string,
  now: Date = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx.select({ enabled: salonSettings.loyaltyEnabled }).from(salonSettings).for("update");
    if (!row || row.enabled === enabled) return;
    await tx
      .update(salonSettings)
      .set(enabled ? { loyaltyEnabled: true, loyaltyStartedAt: now } : { loyaltyEnabled: false })
      .where(eq(salonSettings.id, true));
    await recordAudit(
      tx,
      {
        actorType: "manager",
        actorId,
        action: enabled ? "loyalty.enabled" : "loyalty.disabled",
        entity: "salon_settings",
        entityId: "salon",
        before: { enabled: row.enabled },
        after: { enabled },
      },
      now,
    );
  });
}
