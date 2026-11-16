// Hachage des mots de passe (D-116) : scrypt de `node:crypto`, aucune dépendance.
// Ce fichier n'importe rien d'autre que Node : `scripts/staff-account.mjs` le charge directement.
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, options: ScryptOptions, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, length, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

/** `scrypt$N$r$p$sel$hash` : les paramètres sont dans la chaîne, on pourra les durcir sans casser les anciens comptes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, { N, r: R, p: P, maxmem: MAX_MEMORY }, KEY_LENGTH);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/** Vrai si le mot de passe correspond. Une chaîne malformée vaut faux, jamais une exception. */
export async function verifyPasswordHash(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [n, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
    if (![n, r, p].every((v) => Number.isInteger(v) && v > 0)) return false;
    const salt = Buffer.from(parts[4], "base64");
    const expected = Buffer.from(parts[5], "base64");
    // Longueur exacte : une clé scrypt plus courte est le début de la longue, un hash tronqué serait accepté.
    if (salt.length === 0 || expected.length !== KEY_LENGTH) return false;
    const key = await derive(password, salt, { N: n, r, p, maxmem: MAX_MEMORY }, expected.length);
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;

/**
 * Hash calculé une fois, vérifié quand l'adresse est inconnue : la réponse prend le même temps qu'avec un vrai compte,
 * sans révéler qu'il n'existe pas.
 */
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword("mot de passe factice, jamais utilisé");
  return dummy;
}
