import { describe, expect, it } from "vitest";
import {
  capitalize,
  formatDay,
  formatDayShort,
  formatDayWithYear,
  formatDuration,
  formatPrice,
  formatTime,
  parisDate,
} from "./format";

describe("formats d'affichage", () => {
  it("prix", () => {
    expect(formatPrice(2800)).toBe("28 €");
    expect(formatPrice(1250)).toBe("12,50 €");
    expect(formatPrice(0)).toBe("0 €");
  });

  it("durée", () => {
    expect(formatDuration(15)).toBe("15 min");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(75)).toBe("1 h 15");
    expect(formatDuration(90)).toBe("1 h 30");
  });

  it("heure et jour à l'heure de Paris, été comme hiver", () => {
    expect(formatTime(new Date("2026-11-03T09:00:00Z"))).toBe("10:00"); // hiver
    expect(formatTime(new Date("2026-10-24T08:00:00Z"))).toBe("10:00"); // été
    expect(formatDay(new Date("2026-10-24T08:00:00Z"))).toBe("samedi 24 octobre");
    expect(capitalize(formatDay(new Date("2026-10-24T08:00:00Z")))).toBe("Samedi 24 octobre");
    expect(formatDayWithYear(new Date("2026-10-24T08:00:00Z"))).toBe("samedi 24 octobre 2026");
    expect(formatDayShort(new Date("2026-10-24T08:00:00Z"))).toBe("sam. 24 oct.");
  });

  it("le jour de Paris n'est pas celui d'UTC tard le soir", () => {
    expect(parisDate(new Date("2026-11-03T22:30:00Z"))).toBe("2026-11-03"); // 23 h 30 à Paris
    expect(parisDate(new Date("2026-11-03T23:30:00Z"))).toBe("2026-11-04"); // 0 h 30 à Paris
  });
});
