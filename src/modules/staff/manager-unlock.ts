import { signToken, verifyToken } from "@/modules/security/token";

// Preuve que le code gérant a été saisi (R-73, D-53) : un cookie « <expiration>.<signature> » lié au compte équipe de
// la tablette, valable 5 minutes. Chaque action gérant en émet une nouvelle : « 5 minutes après la dernière action ».
// La signature couvre le compte et l'expiration : on ne peut ni la prolonger ni la réutiliser sur un autre compte.

export const MANAGER_UNLOCK_MINUTES = 5;

const subject = (staffUserId: string, expiresAt: number) => `manager:${staffUserId}:${expiresAt}`;

export function issueManagerUnlock(secret: string, staffUserId: string, now: Date): string {
  const expiresAt = now.getTime() + MANAGER_UNLOCK_MINUTES * 60_000;
  return `${expiresAt}.${signToken(secret, subject(staffUserId, expiresAt))}`;
}

export function isManagerUnlocked(
  secret: string,
  staffUserId: string,
  proof: string | undefined,
  now: Date,
): boolean {
  if (!proof) return false;
  const dot = proof.indexOf(".");
  if (dot < 1) return false;
  const expiresAt = Number(proof.slice(0, dot));
  const signature = proof.slice(dot + 1);
  if (!Number.isSafeInteger(expiresAt) || !signature) return false;
  if (now.getTime() >= expiresAt) return false;
  return verifyToken(secret, subject(staffUserId, expiresAt), signature);
}
