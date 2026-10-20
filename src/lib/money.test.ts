import { describe, expect, it } from "vitest";
import { centsToEuroInput, parseEuros } from "./money";

describe("saisie d'un prix en euros (R-10)", () => {
  it.each([
    ["18", 1800],
    ["18,50", 1850],
    ["18.5", 1850],
    ["18,05", 1805],
    [" 12 € ", 1200],
    ["0", 0],
    ["0,99", 99],
    ["1 250", 125000],
  ])("lit « %s » comme %i centimes", (text, cents) => {
    expect(parseEuros(text)).toBe(cents);
  });

  it.each(["", "abc", "-5", "12,345", "1,2,3", "12e3", "€"])("refuse « %s »", (text) => {
    expect(parseEuros(text)).toBeNull();
  });

  it("réécrit des centimes pour un champ de saisie, sans symbole", () => {
    expect(centsToEuroInput(1800)).toBe("18");
    expect(centsToEuroInput(1850)).toBe("18,50");
    expect(centsToEuroInput(5)).toBe("0,05");
    expect(parseEuros(centsToEuroInput(1805))).toBe(1805);
  });
});
