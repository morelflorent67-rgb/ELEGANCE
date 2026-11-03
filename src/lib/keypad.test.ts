import { describe, expect, it } from "vitest";
import { pressKey, type KeypadKey } from "./keypad";

const type = (keys: KeypadKey[], from = "") => keys.reduce((text, key) => pressKey(text, key), from);

describe("pavé numérique de l'encaissement libre (R-94)", () => {
  it("compose un montant en euros", () => {
    expect(type(["1", "8"])).toBe("18");
    expect(type(["1", "8", ",", "5"])).toBe("18,5");
    expect(type(["2", "0", ",", "5", "0"])).toBe("20,50");
  });

  it("ne garde qu'une virgule et deux décimales", () => {
    expect(type(["1", ",", ",", "5"])).toBe("1,5");
    expect(type(["1", ",", "2", "5", "9"])).toBe("1,25");
  });

  it("une virgule seule devient « 0, » et un zéro de tête s'efface", () => {
    expect(type([","])).toBe("0,");
    expect(type(["0", "7"])).toBe("7");
  });

  it("limite la longueur et efface chiffre par chiffre", () => {
    expect(type(["1", "2", "3", "4", "5", "6", "7", "8"])).toBe("1234567");
    expect(type(["1", "8", "⌫"])).toBe("1");
    expect(type(["⌫"])).toBe("");
  });
});
