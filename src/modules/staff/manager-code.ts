import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Code gérant (R-73, D-53) : 6 chiffres, stocké haché dans `salon_settings.manager_pin_hash`. Le hachage est lent et
// salé : même avec une copie de la base, retrouver les 10^6 codes possibles demande un vrai effort (et la saisie sur
// la tablette est limitée en essais, voir `unlockManager`).

export const MANAGER_CODE_PATTERN = /^\d{6}$/;

const KEY_LENGTH = 32;
const COST = 16384; // N de scrypt

/** « scrypt$N$sel$hachage », en base64url. */
export function hashManagerCode(code: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(code, salt, KEY_LENGTH, { N: COST });
  return `scrypt$${COST}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

/** Vrai si `code` correspond au hachage stocké. Un hachage abîmé ou absent ne correspond à rien. */
export function verifyManagerCodeHash(code: string, stored: string): boolean {
  const [scheme, cost, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !cost || !salt || !hash) return false;
  try {
    const expected = Buffer.from(hash, "base64url");
    const actual = scryptSync(code, Buffer.from(salt, "base64url"), expected.length, {
      N: Number(cost),
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
