import { eq } from "drizzle-orm";
import type { Database } from "@/db/types";
import { salonSettings } from "@/db/schema";
import { hitRateLimit } from "@/modules/security/rate-limit";
import { MANAGER_CODE_PATTERN, hashManagerCode, verifyManagerCodeHash } from "./manager-code";

// Code gérant (R-73, D-53) : stocké haché dans les réglages du salon, saisi sur la tablette. La saisie est limitée en
// essais par compte équipe : un code à 6 chiffres ne tient que si on ne peut pas tous les essayer.

const ATTEMPTS = { limit: 8, windowSeconds: 900 } as const;

export type UnlockResult =
  | { ok: true }
  | { ok: false; error: "wrong_code" | "not_configured" }
  | { ok: false; error: "rate_limited"; retryAfterSeconds: number };

/** Vérifie le code gérant saisi. Un bon code ne prouve rien tant que l'appelant n'a pas posé la preuve (`manager-unlock`). */
export async function unlockManager(
  db: Database,
  input: { code: string; staffUserId: string; now?: Date },
): Promise<UnlockResult> {
  const limit = await hitRateLimit(db, `manager-code:${input.staffUserId}`, ATTEMPTS, input.now);
  if (!limit.allowed) {
    return { ok: false, error: "rate_limited", retryAfterSeconds: limit.retryAfterSeconds };
  }
  const [settings] = await db
    .select({ hash: salonSettings.managerPinHash })
    .from(salonSettings)
    .limit(1);
  if (!settings?.hash) return { ok: false, error: "not_configured" };
  if (!MANAGER_CODE_PATTERN.test(input.code)) return { ok: false, error: "wrong_code" };
  return verifyManagerCodeHash(input.code, settings.hash)
    ? { ok: true }
    : { ok: false, error: "wrong_code" };
}

/** Définit ou remplace le code gérant (script `pnpm manager:set-code`). */
export async function setManagerCode(db: Database, code: string): Promise<void> {
  if (!MANAGER_CODE_PATTERN.test(code)) throw new Error("Le code gérant doit avoir 6 chiffres.");
  await db
    .update(salonSettings)
    .set({ managerPinHash: hashManagerCode(code) })
    .where(eq(salonSettings.id, true));
}
