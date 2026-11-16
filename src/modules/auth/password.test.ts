import { describe, expect, it } from "vitest";
import { dummyHash, hashPassword, verifyPasswordHash } from "./password";

describe("mots de passe (D-116)", () => {
  it("un hash vérifie son mot de passe", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(await verifyPasswordHash("correct horse battery", stored)).toBe(true);
  });

  it("un autre mot de passe échoue", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(await verifyPasswordHash("correct horse batterz", stored)).toBe(false);
    expect(await verifyPasswordHash("", stored)).toBe(false);
  });

  it("deux hash du même mot de passe diffèrent (sel)", async () => {
    const a = await hashPassword("même mot de passe");
    const b = await hashPassword("même mot de passe");
    expect(a).not.toBe(b);
  });

  it("le format garde ses paramètres pour pouvoir les durcir plus tard", async () => {
    const stored = await hashPassword("abcdefgh");
    expect(stored.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(stored.split("$")).toHaveLength(6);
  });

  it("une chaîne malformée vaut faux, sans exception", async () => {
    expect(await verifyPasswordHash("x", "")).toBe(false);
    expect(await verifyPasswordHash("x", "scrypt$32768$8$1$abc")).toBe(false);
    expect(await verifyPasswordHash("x", "scrypt$abc$8$1$c2Vs$aGFzaA==")).toBe(false);
    expect(await verifyPasswordHash("x", "bcrypt$10$a$b$c$d")).toBe(false);
    const stored = await hashPassword("abcdefgh");
    expect(await verifyPasswordHash("abcdefgh", stored.slice(0, -6))).toBe(false);
  });

  it("le hash factice sert à égaliser la durée quand l'adresse est inconnue", async () => {
    expect(await verifyPasswordHash("n'importe quoi", await dummyHash())).toBe(false);
  });
});
