import { describe, expect, it } from "vitest";
import {
  ECLIPSE,
  FADE_DISTANCE,
  eclipseDepth,
  eclipseDpr,
  eclipseFraming,
  eclipseIsVisible,
  eclipseOpacity,
} from "./eclipse-math";

describe("fond animé : éclipse (D-113)", () => {
  it("est pleinement visible en haut de page et disparaît au bout du défilement prévu", () => {
    expect(eclipseOpacity(0)).toBe(1);
    expect(eclipseOpacity(FADE_DISTANCE / 2)).toBeCloseTo(0.5);
    expect(eclipseOpacity(FADE_DISTANCE)).toBe(0);
    expect(eclipseOpacity(5000)).toBe(0);
    expect(eclipseOpacity(-40)).toBe(1); // rebond de défilement sur iOS
  });

  it("arrête la boucle d'animation quand l'éclipse n'est plus visible", () => {
    expect(eclipseIsVisible(0)).toBe(true);
    expect(eclipseIsVisible(FADE_DISTANCE - 30)).toBe(true);
    expect(eclipseIsVisible(FADE_DISTANCE)).toBe(false);
    expect(eclipseIsVisible(2000)).toBe(false);
  });

  it("monte et grossit légèrement en s'effaçant, sans dépasser", () => {
    expect(eclipseDepth(0)).toEqual({ lift: -0, scale: 1 });
    const end = eclipseDepth(FADE_DISTANCE);
    expect(end.lift).toBeLessThan(0);
    expect(end.scale).toBeGreaterThan(1);
    expect(eclipseDepth(99999)).toEqual(end);
  });

  it("limite la densité de pixels : 1,5 sur téléphone, 1,75 ailleurs", () => {
    expect(eclipseDpr(3, 390)).toBe(ECLIPSE.maxDprPhone);
    expect(eclipseDpr(3, 1440)).toBe(ECLIPSE.maxDprWide);
    expect(eclipseDpr(1, 390)).toBe(1);
    expect(eclipseDpr(0, 390)).toBe(1);
  });

  it("garde un peu de halo à chaque respiration", () => {
    expect(ECLIPSE.breathMin).toBeGreaterThan(0);
  });

  it("cadre l'image d'origine sur téléphone, et centre l'éclipse sur écran large", () => {
    const phone = eclipseFraming(863, 1822);
    expect(phone.scale).toBeCloseTo(1);
    expect(phone.ax).toBeCloseTo(431.5);
    expect(phone.ay).toBeCloseTo(911);
    const wide = eclipseFraming(1600, 900);
    expect(wide.scale).toBeCloseTo(900 / 1480);
    expect(wide.ax).toBeCloseTo(505);
    expect(wide.ay).toBeCloseTo(858);
  });
});
