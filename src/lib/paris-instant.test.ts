import { describe, expect, it } from "vitest";
import { parisInstant } from "./paris-instant";

describe("parisInstant : jour + minute → instant UTC, à l'heure de Paris", () => {
  it("heure d'hiver et heure d'été", () => {
    expect(parisInstant("2026-11-03", 15 * 60 + 30)).toBe("2026-11-03T14:30:00.000Z");
    expect(parisInstant("2026-07-14", 10 * 60)).toBe("2026-07-14T08:00:00.000Z");
  });

  it("suit le changement d'heure du dernier dimanche d'octobre 2026", () => {
    expect(parisInstant("2026-10-24", 10 * 60)).toBe("2026-10-24T08:00:00.000Z");
    expect(parisInstant("2026-10-25", 10 * 60)).toBe("2026-10-25T09:00:00.000Z");
  });

  it("refuse une date ou une minute invalide", () => {
    expect(parisInstant("pas-une-date", 600)).toBeNull();
    expect(parisInstant("2026-11-03", -1)).toBeNull();
    expect(parisInstant("2026-11-03", 24 * 60)).toBeNull();
    expect(parisInstant("2026-11-03", 10.5)).toBeNull();
  });
});
