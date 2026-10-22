import { describe, expect, it } from "vitest";
import { dayNames, endTime, nearestSlots, periodsOf } from "./slot-view";

const slots = (...times: string[]) => times.map((time) => ({ time }));

describe("dayNames : la bande de jours (D-96)", () => {
  it("nomme le jour, le mois et le format court", () => {
    expect(dayNames("2026-10-24")).toEqual({
      dow: "sam",
      num: 24,
      month: "octobre",
      year: 2026,
      long: "Samedi 24 octobre",
      short: "Sam. 24 oct.",
    });
    expect(dayNames("2026-12-01").long).toBe("Mardi 1er décembre");
    expect(dayNames("2026-11-02").dow).toBe("lun");
  });
});

describe("periodsOf et endTime (R-04, D-65 : à l'heure et à la demie)", () => {
  it("range les créneaux en matin et après-midi", () => {
    expect(periodsOf(slots("10:00", "11:30", "13:00", "18:30"))).toEqual([
      { label: "Matin", slots: slots("10:00", "11:30") },
      { label: "Après-midi", slots: slots("13:00", "18:30") },
    ]);
    expect(periodsOf(slots("14:00"))).toEqual([{ label: "Après-midi", slots: slots("14:00") }]);
    expect(periodsOf([])).toEqual([]);
  });

  it("calcule l'heure de fin d'après la durée", () => {
    expect(endTime("14:30", 30)).toBe("15:00");
    expect(endTime("18:30", 45)).toBe("19:15");
  });
});

describe("nearestSlots : créneau pris entre-temps (R-23)", () => {
  it("propose les trois horaires libres les plus proches, dans l'ordre", () => {
    expect(
      nearestSlots(slots("10:00", "11:00", "13:00", "14:00", "15:00", "16:00"), "14:30"),
    ).toEqual(slots("13:00", "14:00", "15:00"));
    expect(nearestSlots(slots("10:00"), "14:30")).toEqual(slots("10:00"));
  });
});
