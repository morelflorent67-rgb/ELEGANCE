import { describe, expect, it } from "vitest";
import { summarize, timeOnce, timeRuns } from "./timing";

describe("summarize", () => {
  it("arrondit et donne le minimum, la médiane et le maximum", () => {
    expect(summarize([12.4, 3.6, 250.2])).toEqual({ runs: [12, 4, 250], min: 4, median: 12, max: 250 });
  });

  it("prend la moyenne des deux valeurs du milieu pour un nombre pair", () => {
    expect(summarize([10, 40, 20, 30]).median).toBe(25);
  });

  it("rend des zéros sans mesure", () => {
    expect(summarize([])).toEqual({ runs: [], min: 0, median: 0, max: 0 });
  });
});

describe("timeOnce", () => {
  it("mesure aussi une opération qui échoue", async () => {
    const ms = await timeOnce(async () => {
      throw new Error("injoignable");
    });
    expect(ms).toBeGreaterThanOrEqual(0);
  });
});

describe("timeOnce, délai", () => {
  it("abandonne une opération bloquée au bout du délai", async () => {
    const ms = await timeOnce(() => new Promise(() => {}), 30);
    expect(ms).toBeGreaterThanOrEqual(25);
    expect(ms).toBeLessThan(1_000);
  });

  it("n'insiste pas après un dépassement", async () => {
    let calls = 0;
    const timing = await timeRuns(
      5,
      () => {
        calls++;
        return new Promise(() => {});
      },
      20,
    );
    expect(calls).toBe(1);
    expect(timing.runs).toHaveLength(1);
  });
});

describe("timeRuns", () => {
  it("exécute l'opération le nombre de fois demandé", async () => {
    let calls = 0;
    const timing = await timeRuns(3, async () => {
      calls++;
    });
    expect(calls).toBe(3);
    expect(timing.runs).toHaveLength(3);
  });
});
