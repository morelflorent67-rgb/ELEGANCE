import { describe, expect, it } from "vitest";
import type { WeekHours } from "./hours";
import { closureLabel, hoursSentence, openStatus, weekdayOf, zonedNow } from "./status";

const day = [
  { opensAt: "10:00", closesAt: "12:00" },
  { opensAt: "13:00", closesAt: "19:00" },
];
// R-01 : mardi → samedi, 10 h–12 h et 13 h–19 h.
const standard: WeekHours = { 1: [], 2: day, 3: day, 4: day, 5: day, 6: day, 7: [] };

// Jeudi 22 octobre 2026.
const at = (date: string, time: string) => {
  const [h, m] = time.split(":").map(Number);
  return { date, weekday: weekdayOf(date), minutes: h * 60 + m };
};

describe("openStatus : l'état du salon à l'instant (R-01)", () => {
  it("ouvert pendant une plage, avec la reprise après la pause", () => {
    expect(openStatus(standard, [], at("2026-10-22", "10:40"))).toEqual({
      open: true,
      headline: "Ouvert maintenant",
      detail: "Jusqu'à 12 h · reprise à 13 h",
    });
    expect(openStatus(standard, [], at("2026-10-22", "18:59"))).toEqual({
      open: true,
      headline: "Ouvert maintenant",
      detail: "Jusqu'à 19 h",
    });
  });

  it("avant l'ouverture et pendant la pause", () => {
    expect(openStatus(standard, [], at("2026-10-22", "08:00"))).toEqual({
      open: false,
      headline: "Ouvre à 10 h",
      detail: "Aujourd'hui, 10 h – 12 h et 13 h – 19 h",
    });
    expect(openStatus(standard, [], at("2026-10-22", "12:00"))).toEqual({
      open: false,
      headline: "En pause",
      detail: "Réouverture à 13 h",
    });
  });

  it("le soir : ouvre demain ; le samedi soir : ouvre mardi", () => {
    expect(openStatus(standard, [], at("2026-10-22", "19:00")).headline).toBe(
      "Ouvre demain à 10 h",
    );
    const saturday = openStatus(standard, [], at("2026-10-24", "20:00"));
    expect(saturday).toEqual({
      open: false,
      headline: "Ouvre mardi à 10 h",
      detail: "Du mardi au samedi",
    });
    expect(openStatus(standard, [], at("2026-10-26", "11:00")).headline).toBe(
      "Ouvre demain à 10 h",
    );
  });
});

describe("openStatus : fermetures exceptionnelles (R-03)", () => {
  it("un jour de fermeture est fermé toute la journée", () => {
    const closures = [{ startsOn: "2026-10-22", endsOn: "2026-10-22" }];
    expect(openStatus(standard, closures, at("2026-10-22", "10:40"))).toEqual({
      open: false,
      headline: "Ouvre demain à 10 h",
      detail: "Fermeture exceptionnelle aujourd'hui",
    });
  });

  it("le prochain jour ouvert saute la fermeture", () => {
    const closures = [{ startsOn: "2026-10-27", endsOn: "2026-10-31" }];
    expect(openStatus(standard, closures, at("2026-10-24", "20:00")).headline).toBe(
      "Ouvre mardi 3 novembre à 10 h",
    );
  });

  it("aucun jour ouvert : fermé", () => {
    expect(openStatus({}, [], at("2026-10-22", "10:00")).headline).toBe("Fermé");
  });
});

describe("closureLabel et hoursSentence", () => {
  it("nomme la fermeture à venir (R-03)", () => {
    expect(closureLabel({ startsOn: "2026-10-31", endsOn: "2026-10-31" })).toBe(
      "Samedi 31 octobre",
    );
    expect(closureLabel({ startsOn: "2026-12-24", endsOn: "2026-12-26" })).toBe(
      "Du 24 au 26 décembre",
    );
  });

  it("résume la semaine en une phrase (R-01)", () => {
    expect(hoursSentence(standard)).toBe(
      "Du mardi au samedi : 10 h – 12 h et 13 h – 19 h, sur rendez-vous.",
    );
    const saturdayShort: WeekHours = {
      ...standard,
      6: [{ opensAt: "09:00", closesAt: "17:00" }],
    };
    expect(hoursSentence(saturdayShort)).toBe(
      "Mardi – vendredi : 10 h – 12 h et 13 h – 19 h ; Samedi : 9 h – 17 h. Sur rendez-vous.",
    );
  });
});

describe("zonedNow : l'heure de Paris", () => {
  it("passe l'instant UTC à l'heure de Paris, changement d'heure compris", () => {
    // 22 octobre 2026, 8 h 40 UTC = 10 h 40 à Paris (heure d'été).
    expect(zonedNow(new Date("2026-10-22T08:40:00Z"))).toEqual({
      date: "2026-10-22",
      weekday: 4,
      minutes: 640,
    });
    // 27 octobre 2026, 9 h 40 UTC = 10 h 40 à Paris (heure d'hiver).
    expect(zonedNow(new Date("2026-10-27T09:40:00Z")).minutes).toBe(640);
    // 23 h 30 UTC le samedi = dimanche 1 h 30 à Paris.
    expect(zonedNow(new Date("2026-10-24T23:30:00Z")).weekday).toBe(7);
  });
});
