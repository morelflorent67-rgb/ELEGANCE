import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import {
  isLastWeekdayOfMonth,
  monthlyModesFor,
  occurrence,
  occurrencesBetween,
  planSeries,
  ruleFits,
  ruleLabel,
  seriesLimit,
  startInstant,
  weekdayRank,
  type PlannedDate,
  type RepeatRule,
  type SeriesEnd,
} from "./recurrence";
import { ENES, ORHAN, at, busy, makeSnapshot } from "./test-fixtures";

const NOW = at("2026-11-02", "08:00");
const weekly = (intervalWeeks: 1 | 2 | 3 | 4): RepeatRule => ({
  frequency: "weekly",
  intervalWeeks,
});
const monthly = (monthlyMode: "day_of_month" | "weekday_rank" | "last_weekday"): RepeatRule => ({
  frequency: "monthly",
  monthlyMode,
});
const dates = (list: { date: string | null }[]) => list.map((o) => o.date);
const paris = (instant: Date) =>
  DateTime.fromJSDate(instant, { zone: "Europe/Paris" }).toFormat("yyyy-MM-dd HH:mm");

function plan(
  overrides: Partial<Parameters<typeof planSeries>[1]> = {},
  snapshot = makeSnapshot(),
): PlannedDate[] {
  // Mardi 3 novembre 2026, 10 h, chez Orhan.
  return planSeries(snapshot, {
    anchor: "2026-11-03",
    rule: weekly(1),
    after: "2026-11-03",
    time: "10:00",
    durationMinutes: 30,
    staffIds: [ORHAN],
    end: { kind: "count", total: 4 } satisfies SeriesEnd,
    alreadyPlanned: 1,
    limit: seriesLimit("2026-11-03"),
    now: NOW,
    ...overrides,
  }).dates;
}

describe("D-71 : toutes les 1, 2, 3 ou 4 semaines", () => {
  it("avance du nombre de semaines demandé", () => {
    expect(dates(occurrencesBetween("2026-11-03", weekly(1), "2026-11-03", "2026-11-24"))).toEqual([
      "2026-11-10",
      "2026-11-17",
      "2026-11-24",
    ]);
    expect(dates(occurrencesBetween("2026-11-03", weekly(3), "2026-11-03", "2026-12-31"))).toEqual([
      "2026-11-24",
      "2026-12-15",
    ]);
    expect(occurrence("2026-11-03", weekly(4), 2).date).toBe("2026-12-29");
  });

  it("refuse un intervalle hors de 1 à 4 semaines", () => {
    expect(ruleFits("2026-11-03", { frequency: "weekly", intervalWeeks: 5 as 4 })).toBe(false);
    expect(ruleFits("2026-11-03", weekly(2))).toBe(true);
  });
});

describe("D-85 : chaque mois, même date ou même jour", () => {
  it("même date : un mois sans ce jour n'a pas de date (le 31)", () => {
    const list = occurrencesBetween(
      "2026-10-31",
      monthly("day_of_month"),
      "2026-10-31",
      "2027-03-31",
    );
    expect(list.map((o) => [o.month, o.date])).toEqual([
      ["2026-11", null],
      ["2026-12", "2026-12-31"],
      ["2027-01", "2027-01-31"],
      ["2027-02", null],
      ["2027-03", "2027-03-31"],
    ]);
  });

  it("même jour : le 2e mardi de chaque mois", () => {
    expect(weekdayRank("2026-11-10")).toBe(2);
    expect(
      dates(occurrencesBetween("2026-11-10", monthly("weekday_rank"), "2026-11-10", "2027-02-28")),
    ).toEqual(["2026-12-08", "2027-01-12", "2027-02-09"]);
  });

  it("dernier jour : le dernier mardi de chaque mois", () => {
    expect(isLastWeekdayOfMonth("2026-11-24")).toBe(true);
    expect(
      dates(occurrencesBetween("2026-11-24", monthly("last_weekday"), "2026-11-24", "2027-03-31")),
    ).toEqual(["2026-12-29", "2027-01-26", "2027-02-23", "2027-03-30"]);
  });

  it("propose « même jour » du 1er au 4e, et « dernier » seulement pour le dernier", () => {
    expect(monthlyModesFor("2026-11-10")).toEqual(["day_of_month", "weekday_rank"]);
    expect(monthlyModesFor("2026-11-24")).toEqual(["day_of_month", "weekday_rank", "last_weekday"]);
    // Mardi 29 décembre 2026 : 5e mardi, ne se répète que comme « dernier mardi ».
    expect(monthlyModesFor("2026-12-29")).toEqual(["day_of_month", "last_weekday"]);
    expect(ruleFits("2026-12-29", monthly("weekday_rank"))).toBe(false);
  });

  it("nomme la règle comme la tablette l'affiche", () => {
    expect(ruleLabel("2026-11-03", weekly(1))).toBe("Chaque semaine");
    expect(ruleLabel("2026-11-03", weekly(2))).toBe("Toutes les 2 semaines");
    expect(ruleLabel("2026-11-10", monthly("day_of_month"))).toBe("Chaque mois, le 10");
    expect(ruleLabel("2026-12-01", monthly("day_of_month"))).toBe("Chaque mois, le 1er");
    expect(ruleLabel("2026-11-10", monthly("weekday_rank"))).toBe("Chaque mois, le 2e mardi");
    expect(ruleLabel("2026-11-24", monthly("last_weekday"))).toBe("Chaque mois, le dernier mardi");
  });
});

describe("D-86 : 6 mois au plus", () => {
  it("s'arrête 6 mois après le premier RDV, même avec une date plus lointaine", () => {
    expect(seriesLimit("2026-11-03")).toBe("2027-05-03");
    expect(seriesLimit("2026-08-31")).toBe("2027-02-28");
    const list = plan({ end: { kind: "until", date: "2027-12-31" } });
    expect(list.at(-1)?.date).toBe("2027-04-27"); // dernier mardi avant le 3 mai 2027
  });

  it("garde la même heure de Paris de part et d'autre du changement d'heure", () => {
    const list = plan({ end: { kind: "until", date: "2027-04-06" } });
    const ok = list.filter((d) => d.ok);
    expect(paris(ok.find((d) => d.date === "2027-03-23")!.startsAt)).toBe("2027-03-23 10:00");
    expect(paris(ok.find((d) => d.date === "2027-03-30")!.startsAt)).toBe("2027-03-30 10:00");
    expect(startInstant("2027-03-30", "10:00", "Europe/Paris").toISOString()).toBe(
      "2027-03-30T08:00:00.000Z",
    );
  });
});

describe("D-84, D-86 : dates sautées", () => {
  it("saute une date de fermeture et la remplace par la suivante pour obtenir N RDV", () => {
    const snapshot = makeSnapshot({ closures: [{ startsOn: "2026-11-17", endsOn: "2026-11-17" }] });
    const list = plan({}, snapshot);
    expect(list.map((d) => [d.date, d.ok ? "ok" : d.reason])).toEqual([
      ["2026-11-10", "ok"],
      ["2026-11-17", "closed"],
      ["2026-11-24", "ok"],
      ["2026-12-01", "ok"],
    ]);
  });

  it("jusqu'à une date : la date sautée n'est pas remplacée", () => {
    const snapshot = makeSnapshot({ closures: [{ startsOn: "2026-11-17", endsOn: "2026-11-17" }] });
    const list = plan({ end: { kind: "until", date: "2026-11-24" } }, snapshot);
    expect(list.filter((d) => d.ok).map((d) => d.date)).toEqual(["2026-11-10", "2026-11-24"]);
  });

  it("coiffeur précis pris ou absent : la date est sautée (« busy »)", () => {
    const snapshot = makeSnapshot({
      appointments: [busy(ENES, "2026-11-10", "10:00", "10:30")],
      absences: [busy(ORHAN, "2026-11-10", "09:00", "19:00")],
    });
    const list = plan({ end: { kind: "count", total: 2 } }, snapshot);
    expect(list[0]).toMatchObject({ date: "2026-11-10", ok: false, reason: "busy" });
    expect(list[1]).toMatchObject({ date: "2026-11-17", ok: true, staffId: ORHAN });
  });

  it("« Sans préférence » : chaque date prend un coiffeur libre, le moins chargé (D-40)", () => {
    const snapshot = makeSnapshot({
      appointments: [
        busy(ORHAN, "2026-11-10", "10:00", "10:30"),
        busy(ENES, "2026-11-17", "14:00", "14:30"),
      ],
    });
    const list = plan({ staffIds: [ORHAN, ENES], end: { kind: "count", total: 3 } }, snapshot);
    expect(list.map((d) => (d.ok ? d.staffId : null))).toEqual([ENES, ORHAN]);
  });

  it("un mois sans 31 est listé et la suite continue", () => {
    const list = plan({
      anchor: "2026-10-31",
      after: "2026-10-31",
      rule: monthly("day_of_month"),
      end: { kind: "count", total: 3 },
      limit: seriesLimit("2026-10-31"),
    });
    // 31 octobre 2026 est un samedi ; le 31 décembre un jeudi, le 31 janvier un dimanche (fermé).
    expect(list.map((d) => [d.date ?? (d.ok ? "" : d.month), d.ok ? "ok" : d.reason])).toEqual([
      ["2026-11", "no_such_day"],
      ["2026-12-31", "ok"],
      ["2027-01-31", "closed"],
      ["2027-02", "no_such_day"],
      ["2027-03-31", "ok"],
    ]);
  });

  it("une prestation qui déborde sur la pause est sautée", () => {
    const list = plan({ time: "11:45", durationMinutes: 30, end: { kind: "count", total: 2 } });
    expect(list[0]).toMatchObject({ ok: false, reason: "outside_hours" });
  });
});
