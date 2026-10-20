import { describe, expect, it } from "vitest";
import { MANAGER_CODE_PATTERN, hashManagerCode, verifyManagerCodeHash } from "./manager-code";
import { MANAGER_UNLOCK_MINUTES, isManagerUnlocked, issueManagerUnlock } from "./manager-unlock";

const SECRET = "secret-de-test";
const NOW = new Date("2026-11-02T08:00:00Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

describe("R-73 : le code gérant a 6 chiffres (D-53)", () => {
  it("n'accepte que 6 chiffres", () => {
    expect(MANAGER_CODE_PATTERN.test("123456")).toBe(true);
    for (const bad of ["12345", "1234567", "12345a", "", " 123456", "12 3456"]) {
      expect(MANAGER_CODE_PATTERN.test(bad), bad).toBe(false);
    }
  });

  it("se stocke chiffré : le code n'apparaît pas, et deux hachages du même code diffèrent", () => {
    const first = hashManagerCode("123456");
    const second = hashManagerCode("123456");
    expect(first).not.toContain("123456");
    expect(first).not.toBe(second);
  });

  it("reconnaît le bon code et refuse les autres", () => {
    const stored = hashManagerCode("123456");
    expect(verifyManagerCodeHash("123456", stored)).toBe(true);
    expect(verifyManagerCodeHash("123457", stored)).toBe(false);
    expect(verifyManagerCodeHash("", stored)).toBe(false);
  });

  it("refuse un hachage abîmé sans planter", () => {
    expect(verifyManagerCodeHash("123456", "n'importe quoi")).toBe(false);
    expect(verifyManagerCodeHash("123456", "")).toBe(false);
  });
});

describe("R-73 : l'espace gérant se reverrouille tout seul (D-53)", () => {
  it("reste ouvert 5 minutes", () => {
    expect(MANAGER_UNLOCK_MINUTES).toBe(5);
    const proof = issueManagerUnlock(SECRET, "staff-1", NOW);
    expect(isManagerUnlocked(SECRET, "staff-1", proof, NOW)).toBe(true);
    expect(isManagerUnlocked(SECRET, "staff-1", proof, minutes(4.9))).toBe(true);
    expect(isManagerUnlocked(SECRET, "staff-1", proof, minutes(5))).toBe(false);
    expect(isManagerUnlocked(SECRET, "staff-1", proof, minutes(60))).toBe(false);
  });

  it("une nouvelle preuve prolonge de 5 minutes à partir de la dernière action", () => {
    const later = issueManagerUnlock(SECRET, "staff-1", minutes(4));
    expect(isManagerUnlocked(SECRET, "staff-1", later, minutes(8))).toBe(true);
    expect(isManagerUnlocked(SECRET, "staff-1", later, minutes(9))).toBe(false);
  });

  it("ne vaut que pour le compte équipe qui l'a obtenue", () => {
    const proof = issueManagerUnlock(SECRET, "staff-1", NOW);
    expect(isManagerUnlocked(SECRET, "staff-2", proof, NOW)).toBe(false);
  });

  it("refuse une preuve falsifiée, prolongée à la main, signée avec un autre secret ou absente", () => {
    const proof = issueManagerUnlock(SECRET, "staff-1", NOW);
    const [expiry, signature] = proof.split(".");
    const extended = `${Number(expiry) + 3_600_000}.${signature}`;
    expect(isManagerUnlocked(SECRET, "staff-1", extended, NOW)).toBe(false);
    expect(isManagerUnlocked("autre-secret", "staff-1", proof, NOW)).toBe(false);
    for (const bad of [undefined, "", "abc", "123.", ".abc", `${expiry}.`, `x.${signature}`]) {
      expect(isManagerUnlocked(SECRET, "staff-1", bad, NOW), String(bad)).toBe(false);
    }
  });
});
