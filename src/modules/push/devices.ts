import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/types";
import { pushDevice } from "@/db/schema";

/** Jeton APNs : 32 octets en hexadécimal (64 caractères), ou plus pour les versions récentes d'iOS. */
const tokenSchema = z.string().regex(/^[0-9a-f]{64,200}$/i);

/**
 * R-102 : l'appareil s'enregistre quand le client accepte les notifications. Un même jeton ne sert qu'un client à la fois :
 * s'il se connecte avec un autre compte sur le même iPhone, le jeton change de propriétaire.
 */
export async function registerDevice(db: Database, customerId: string, raw: unknown): Promise<boolean> {
  const parsed = tokenSchema.safeParse(raw);
  if (!parsed.success) return false;
  const token = parsed.data.toLowerCase();
  await db
    .insert(pushDevice)
    .values({ token, customerId })
    .onConflictDoUpdate({ target: pushDevice.token, set: { customerId, createdAt: new Date() } });
  return true;
}

/** R-102 : à la déconnexion, l'appareil n'est plus rattaché à personne. Sans effet si le jeton est inconnu ou appartient à un autre client. */
export async function unregisterDevice(db: Database, customerId: string, raw: unknown): Promise<void> {
  const parsed = tokenSchema.safeParse(raw);
  if (!parsed.success) return;
  await db
    .delete(pushDevice)
    .where(and(eq(pushDevice.token, parsed.data.toLowerCase()), eq(pushDevice.customerId, customerId)));
}

/** Les jetons d'un client, pour lui écrire. */
export async function devicesOf(db: Database, customerId: string): Promise<string[]> {
  const rows = await db.select({ token: pushDevice.token }).from(pushDevice).where(eq(pushDevice.customerId, customerId));
  return rows.map((r) => r.token);
}
