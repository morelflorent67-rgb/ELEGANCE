import { describe, expect, it } from "vitest";
import { dropProblem, sameSpot, snapMinute, type DragColumn } from "./drag-move";

// R-95 : glisser-déposer d'un RDV. Ces fonctions annoncent l'endroit où le bloc tombe et s'il est libre ; le serveur
// décide (les refus du serveur sont testés avec `salonRescheduleAppointment`).

const ranges = [
  { from: 10 * 60, to: 12 * 60 },
  { from: 13 * 60, to: 19 * 60 },
];
const columns: DragColumn[] = [
  {
    staffId: "orhan",
    appointments: [
      { id: "a1", startMinute: 10 * 60, endMinute: 10 * 60 + 30 },
      { id: "a2", startMinute: 15 * 60, endMinute: 16 * 60 },
    ],
    absences: [{ startMinute: 17 * 60, endMinute: 18 * 60 }],
  },
  { staffId: "enes", appointments: [], absences: [] },
];
const ask = (staffId: string, startMinute: number, over: { duration?: number; movingId?: string; nowMinute?: number | null } = {}) =>
  dropProblem({
    columns,
    ranges,
    target: { staffId, startMinute },
    duration: over.duration ?? 30,
    movingId: over.movingId ?? "a1",
    nowMinute: over.nowMinute ?? null,
  });

describe("snapMinute : le bloc s'aligne sur la grille", () => {
  const bounds = { min: 600, max: 1140 };
  it("arrondit au créneau le plus proche", () => {
    expect(snapMinute(612, 30, bounds, 30)).toBe(600);
    expect(snapMinute(616, 30, bounds, 30)).toBe(630);
    expect(snapMinute(616, 15, bounds, 30)).toBe(615);
  });
  it("reste dans la journée affichée, le RDV entier compris", () => {
    expect(snapMinute(100, 30, bounds, 30)).toBe(600);
    expect(snapMinute(2000, 30, bounds, 45)).toBe(1095);
  });
});

describe("dropProblem : où le RDV peut tomber", () => {
  it("accepte un créneau libre, dans une autre colonne comme dans la sienne", () => {
    expect(ask("enes", 11 * 60)).toBeNull();
    expect(ask("orhan", 11 * 60 + 30)).toBeNull();
  });

  it("accepte de rester sur place : un RDV ne se gêne pas lui-même", () => {
    expect(ask("orhan", 10 * 60)).toBeNull();
    expect(ask("orhan", 10 * 60 + 15)).toBeNull();
  });

  it("refuse de chevaucher un autre RDV, mais pas de le toucher", () => {
    expect(ask("orhan", 15 * 60 + 30)).toBe("occupied");
    expect(ask("orhan", 14 * 60 + 45)).toBe("occupied");
    expect(ask("orhan", 14 * 60 + 30)).toBeNull(); // finit pile quand l'autre commence
    expect(ask("orhan", 16 * 60)).toBeNull(); // commence pile quand l'autre finit
  });

  it("refuse une absence", () => {
    expect(ask("orhan", 17 * 60 + 30)).toBe("absent");
    expect(ask("enes", 17 * 60 + 30)).toBeNull();
  });

  it("refuse hors des horaires et à cheval sur la pause", () => {
    expect(ask("enes", 9 * 60 + 30)).toBe("closed");
    expect(ask("enes", 12 * 60)).toBe("closed");
    expect(ask("enes", 11 * 60 + 45)).toBe("closed");
    expect(ask("enes", 18 * 60 + 45)).toBe("closed");
    expect(ask("enes", 18 * 60 + 30)).toBeNull();
  });

  it("tient compte de la durée du RDV", () => {
    expect(ask("orhan", 14 * 60 + 30, { duration: 60 })).toBe("occupied");
    expect(ask("enes", 11 * 60 + 30, { duration: 60 })).toBe("closed");
  });

  it("refuse le passé sur le jour courant", () => {
    expect(ask("enes", 11 * 60, { nowMinute: 11 * 60 + 10 })).toBe("past");
    expect(ask("enes", 11 * 60 + 30, { nowMinute: 11 * 60 + 10 })).toBeNull();
  });

  it("refuse un coiffeur inconnu", () => {
    expect(ask("kaan", 11 * 60)).toBe("closed");
  });
});

describe("sameSpot", () => {
  it("reconnaît une position inchangée", () => {
    expect(sameSpot({ staffId: "a", startMinute: 600 }, { staffId: "a", startMinute: 600 })).toBe(true);
    expect(sameSpot({ staffId: "a", startMinute: 600 }, { staffId: "b", startMinute: 600 })).toBe(false);
    expect(sameSpot({ staffId: "a", startMinute: 600 }, { staffId: "a", startMinute: 630 })).toBe(false);
  });
});
