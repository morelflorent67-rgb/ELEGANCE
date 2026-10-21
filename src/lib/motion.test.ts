import { describe, expect, it } from "vitest";
import { alreadyOnScreen, duration } from "./motion";

describe("motion", () => {
  it("garde les outils de la réservation sous le plafond de 280 ms", () => {
    expect(duration.base).toBeLessThanOrEqual(280);
  });
});

describe("alreadyOnScreen (révélations sans clignotement)", () => {
  const viewport = 844;

  it("reconnaît un élément visible au premier affichage, même en partie", () => {
    expect(alreadyOnScreen({ top: 120, bottom: 300 }, viewport)).toBe(true);
    expect(alreadyOnScreen({ top: 800, bottom: 1200 }, viewport)).toBe(true);
    expect(alreadyOnScreen({ top: -50, bottom: 20 }, viewport)).toBe(true);
  });

  it("laisse l'animation aux éléments plus bas ou déjà dépassés", () => {
    expect(alreadyOnScreen({ top: 844, bottom: 1000 }, viewport)).toBe(false);
    expect(alreadyOnScreen({ top: 1500, bottom: 1700 }, viewport)).toBe(false);
    expect(alreadyOnScreen({ top: -300, bottom: 0 }, viewport)).toBe(false);
  });
});
