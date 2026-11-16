import { describe, expect, it } from "vitest";
import { loyaltyPitch, loyaltyProgress, pointsForItems, visitsToReward } from "./points";

describe("points d'un RDV (R-96)", () => {
  it("additionne les points des prestations", () => {
    expect(pointsForItems([{ loyaltyPoints: 10 }, { loyaltyPoints: 5 }])).toBe(15);
    expect(pointsForItems([])).toBe(0);
  });
});

describe("progression de la carte", () => {
  it("70 points : 7 cases pleines, 30 points à gagner", () => {
    const p = loyaltyProgress(70, 100);
    expect(p.cells.filter((c) => c.fill === 1)).toHaveLength(7);
    expect(p.cells.filter((c) => c.fill === 0)).toHaveLength(3);
    expect(p.pointsToNext).toBe(30);
    expect(p.rewardsAvailable).toBe(0);
  });
  it("une case à moitié pour 5 points", () => {
    const p = loyaltyProgress(25, 100);
    expect(p.cells.map((c) => c.fill).slice(0, 4)).toEqual([1, 1, 0.5, 0]);
  });
  it("100 points : toutes les cases pleines et une coupe offerte", () => {
    const p = loyaltyProgress(100, 100);
    expect(p.cells.every((c) => c.fill === 1)).toBe(true);
    expect(p.rewardsAvailable).toBe(1);
    expect(p.pointsToNext).toBe(0);
  });
  it("au-delà du seuil, les cases restent pleines et les coupes s'accumulent", () => {
    const p = loyaltyProgress(230, 100);
    expect(p.rewardsAvailable).toBe(2);
    expect(p.cells.every((c) => c.fill === 1)).toBe(true);
  });
  it("un solde négatif est ramené à 0", () => {
    expect(loyaltyProgress(-5, 100).balance).toBe(0);
  });
});

describe("textes", () => {
  it("nombre de passages restants", () => {
    expect(visitsToReward(30, 10)).toBe(3);
    expect(visitsToReward(25, 10)).toBe(3);
    expect(visitsToReward(0, 10)).toBe(0);
  });
  it("phrase de présentation", () => {
    expect(loyaltyPitch(100, 10)).toBe("10 passages = une coupe offerte");
    expect(loyaltyPitch(100, 0)).toBeNull();
  });
});
