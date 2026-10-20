import { describe, expect, it } from "vitest";
import { formatPhone, maskPhone, normalizePhone } from "./phone";

describe("R-70 : téléphone du compte client", () => {
  it("accepte les numéros français, avec ou sans espaces, et les met en forme internationale", () => {
    for (const input of [
      "06 12 34 56 78",
      "0612345678",
      "06.12.34.56.78",
      "06-12-34-56-78",
      "+33 6 12 34 56 78",
      "+33612345678",
      "0033 6 12 34 56 78",
    ]) {
      expect(normalizePhone(input), input).toBe("+33612345678");
    }
  });

  it("accepte le fixe du salon", () => {
    expect(normalizePhone("03 88 97 74 68")).toBe("+33388977468");
  });

  it("accepte un numéro international en +", () => {
    expect(normalizePhone("+49 151 2345 6789")).toBe("+4915123456789");
  });

  it("refuse ce qui n'est pas un numéro", () => {
    for (const input of [
      "",
      "abc",
      "0612",
      "00612345678",
      "06123456789",
      "+33 6 12",
      "0012345678",
    ]) {
      expect(normalizePhone(input), input).toBeNull();
    }
  });

  it("affiche un numéro français en groupes de deux chiffres", () => {
    expect(formatPhone("+33612345678")).toBe("06 12 34 56 78");
    expect(formatPhone("+4915123456789")).toBe("+4915123456789");
  });
});

describe("R-72 : le téléphone n'est lisible en entier que sur la fiche", () => {
  it("masque un numéro français en gardant le début et la fin", () => {
    expect(maskPhone("+33612345678")).toBe("06 •• •• •• 78");
    expect(maskPhone("+33388977468")).toBe("03 •• •• •• 68");
  });

  it("masque un numéro étranger sans le montrer en entier", () => {
    const masked = maskPhone("+4915123456789");
    expect(masked).toBe("+49 •••• 89");
    expect(masked).not.toContain("1512345");
  });
});
