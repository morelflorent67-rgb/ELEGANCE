import { describe, expect, it } from "vitest";
import {
  formatHour,
  formatRanges,
  groupWeekHours,
  hoursSummary,
  schemaOpeningHours,
  weekRows,
  type WeekHours,
} from "./hours";

const day = [
  { opensAt: "10:00", closesAt: "12:00" },
  { opensAt: "13:00", closesAt: "19:00" },
];
// R-01 : mardi → samedi, 10 h–12 h et 13 h–19 h.
const standard: WeekHours = { 1: [], 2: day, 3: day, 4: day, 5: day, 6: day, 7: [] };

describe("formatHour / formatRanges", () => {
  it("écrit l'heure à la française", () => {
    expect(formatHour("10:00")).toBe("10 h");
    expect(formatHour("09:00")).toBe("9 h");
    expect(formatHour("18:30")).toBe("18 h 30");
    expect(formatHour("12:15")).toBe("12 h 15");
  });

  it("écrit les plages d'une journée, la pause est le trou (R-01)", () => {
    expect(formatRanges(day)).toEqual(["10 h – 12 h", "13 h – 19 h"]);
    expect(formatRanges([])).toEqual([]);
  });
});

describe("groupWeekHours : le résumé des horaires (R-01, R-03)", () => {
  it("regroupe mardi à samedi et les jours fermés", () => {
    expect(groupWeekHours(standard)).toEqual([
      { label: "Mardi – samedi", closed: false, ranges: ["10 h – 12 h", "13 h – 19 h"] },
      { label: "Dimanche, lundi", closed: true, ranges: [] },
    ]);
  });

  it("suit les horaires saisis par le gérant : un samedi différent sort de la plage", () => {
    const saturdayShort = { ...standard, 6: [{ opensAt: "10:00", closesAt: "17:00" }] };
    expect(groupWeekHours(saturdayShort)).toEqual([
      { label: "Mardi – vendredi", closed: false, ranges: ["10 h – 12 h", "13 h – 19 h"] },
      { label: "Samedi", closed: false, ranges: ["10 h – 17 h"] },
      { label: "Dimanche, lundi", closed: true, ranges: [] },
    ]);
  });

  it("nomme deux jours consécutifs avec une virgule et rassemble les jours identiques non consécutifs", () => {
    const week: WeekHours = { ...standard, 3: [], 5: [] };
    const rows = groupWeekHours(week);
    expect(rows[0].label).toBe("Mardi, jeudi, samedi");
    const twoDays: WeekHours = { 1: day, 2: day, 3: [], 4: [], 5: [], 6: [], 7: [] };
    expect(groupWeekHours(twoDays)[0].label).toBe("Lundi, mardi");
  });

  it("tout fermé : une seule ligne fermée", () => {
    const closed: WeekHours = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
    expect(groupWeekHours(closed)).toEqual([
      { label: "Dimanche, lundi, mardi, mercredi, jeudi, vendredi, samedi", closed: true, ranges: [] },
    ]);
  });
});

describe("weekRows : les sept jours", () => {
  it("liste lundi à dimanche, fermé quand il n'y a pas de plage", () => {
    const rows = weekRows(standard);
    expect(rows.map((r) => r.label)).toEqual([
      "Lundi",
      "Mardi",
      "Mercredi",
      "Jeudi",
      "Vendredi",
      "Samedi",
      "Dimanche",
    ]);
    expect(rows[0]).toMatchObject({ closed: true, ranges: [] });
    expect(rows[1]).toMatchObject({ closed: false, ranges: ["10 h – 12 h", "13 h – 19 h"] });
  });
});

describe("schemaOpeningHours : données structurées pour les moteurs de recherche", () => {
  it("une entrée par jour et par plage, en heures de Paris", () => {
    const spec = schemaOpeningHours(standard);
    expect(spec).toHaveLength(10);
    expect(spec[0]).toEqual({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: "https://schema.org/Tuesday",
      opens: "10:00",
      closes: "12:00",
    });
    expect(spec.some((s) => s.dayOfWeek.endsWith("Monday"))).toBe(false);
  });
});

describe("hoursSummary", () => {
  it("une ligne lisible pour le menu", () => {
    expect(hoursSummary(standard)).toBe("Mardi – samedi · 10 h – 12 h, 13 h – 19 h");
    const closed: WeekHours = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
    expect(hoursSummary(closed)).toBe("Fermé");
  });
});
