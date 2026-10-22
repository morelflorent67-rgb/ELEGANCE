import { describe, expect, it } from "vitest";
import { inWindow } from "./window";

// R-80 : la plage voulue. Matin avant midi, après-midi à partir de midi, heure de Paris.
const at = (iso: string) => new Date(iso);
const ZONE = "Europe/Paris";

describe("plage de la liste d'attente (R-80)", () => {
  it("« matin » : avant midi, heure de Paris", () => {
    expect(inWindow("morning", at("2026-11-03T09:00:00Z"), ZONE)).toBe(true); // 10 h
    expect(inWindow("morning", at("2026-11-03T10:30:00Z"), ZONE)).toBe(true); // 11 h 30
    expect(inWindow("morning", at("2026-11-03T11:00:00Z"), ZONE)).toBe(false); // midi
  });

  it("« après-midi » : à partir de midi", () => {
    expect(inWindow("afternoon", at("2026-11-03T11:00:00Z"), ZONE)).toBe(true);
    expect(inWindow("afternoon", at("2026-11-03T17:30:00Z"), ZONE)).toBe(true);
    expect(inWindow("afternoon", at("2026-11-03T10:30:00Z"), ZONE)).toBe(false);
  });

  it("« journée » : toujours", () => {
    expect(inWindow("day", at("2026-11-03T09:00:00Z"), ZONE)).toBe(true);
    expect(inWindow("day", at("2026-11-03T17:30:00Z"), ZONE)).toBe(true);
  });

  it("suit l'heure d'été : midi à Paris en juillet est 10 h UTC", () => {
    expect(inWindow("afternoon", at("2026-07-03T10:00:00Z"), ZONE)).toBe(true);
    expect(inWindow("morning", at("2026-07-03T09:30:00Z"), ZONE)).toBe(true);
  });
});
