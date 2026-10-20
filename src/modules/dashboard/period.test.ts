import { describe, expect, it } from "vitest";
import { resolvePeriod } from "./period";

const ZONE = "Europe/Paris";
const utc = (iso: string) => new Date(`${iso}Z`);
// Mardi 20 octobre 2026, 10 h 50 à Paris (heure d'été : 8 h 50 UTC).
const NOW = utc("2026-10-20T08:50:00");

describe("période du bilan : aujourd'hui", () => {
  it("couvre le jour de Paris en cours", () => {
    const p = resolvePeriod("day", undefined, NOW, ZONE);
    expect(p.start.toISOString()).toBe("2026-10-19T22:00:00.000Z"); // minuit à Paris (UTC+2)
    expect(p.end.toISOString()).toBe("2026-10-20T22:00:00.000Z");
    expect(p.title).toBe("Aujourd’hui · mardi 20 octobre");
    expect(p.isCurrent).toBe(true);
    expect(p.date).toBe("2026-10-20");
    expect(p.prevDate).toBe("2026-10-19");
    expect(p.nextDate).toBeNull();
  });

  it("garde le bon jour tard le soir (22 h 30 UTC est déjà le lendemain à Paris)", () => {
    const p = resolvePeriod("day", undefined, utc("2026-10-20T22:30:00"), ZONE);
    expect(p.date).toBe("2026-10-21");
  });

  it("remonte un jour passé, avec son jour suivant", () => {
    const p = resolvePeriod("day", "2026-10-19", NOW, ZONE);
    expect(p.title).toBe("Hier · lundi 19 octobre");
    expect(p.isCurrent).toBe(false);
    expect(p.prevDate).toBe("2026-10-18");
    expect(p.nextDate).toBe("2026-10-20");
    const older = resolvePeriod("day", "2026-10-10", NOW, ZONE);
    expect(older.title).toBe("Samedi 10 octobre");
  });

  it("ne va pas dans le futur : une date à venir ramène à la période en cours", () => {
    expect(resolvePeriod("day", "2026-12-01", NOW, ZONE).date).toBe("2026-10-20");
  });

  it("ignore une date invalide", () => {
    expect(resolvePeriod("day", "n'importe quoi", NOW, ZONE).date).toBe("2026-10-20");
    expect(resolvePeriod("day", "2026-02-31", NOW, ZONE).date).toBe("2026-10-20");
  });

  it("ajoute l'année pour un jour d'une autre année", () => {
    const p = resolvePeriod("day", "2025-12-24", NOW, ZONE);
    expect(p.title).toBe("Mercredi 24 décembre 2025");
  });
});

describe("période du bilan : semaine", () => {
  it("va du lundi au dimanche, et se nomme d'après ses bornes", () => {
    const p = resolvePeriod("week", undefined, NOW, ZONE);
    expect(p.date).toBe("2026-10-19");
    expect(p.title).toBe("Semaine du 19 au 25 octobre");
    expect(p.isCurrent).toBe(true);
    expect(p.start.toISOString()).toBe("2026-10-18T22:00:00.000Z");
    // Le dimanche 25 octobre, la nuit dure 25 h : la semaine finit lundi minuit à Paris, soit 23 h UTC.
    expect(p.end.toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect(p.prevDate).toBe("2026-10-12");
    expect(p.nextDate).toBeNull();
  });

  it("prend n'importe quel jour de la semaine comme repère", () => {
    expect(resolvePeriod("week", "2026-10-14", NOW, ZONE).date).toBe("2026-10-12");
    expect(resolvePeriod("week", "2026-10-18", NOW, ZONE).date).toBe("2026-10-12"); // dimanche
  });

  it("nomme une semaine à cheval sur deux mois", () => {
    const later = utc("2026-11-10T09:00:00");
    const p = resolvePeriod("week", "2026-10-28", later, ZONE);
    expect(p.title).toBe("Semaine du 26 octobre au 1er novembre");
    expect(p.isCurrent).toBe(false);
  });
});

describe("période du bilan : mois", () => {
  it("couvre le mois civil de Paris", () => {
    const p = resolvePeriod("month", undefined, NOW, ZONE);
    expect(p.title).toBe("Octobre 2026");
    expect(p.date).toBe("2026-10-01");
    expect(p.start.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    // Fin au 1er novembre minuit à Paris : le changement d'heure du 25 octobre est passé (UTC+1).
    expect(p.end.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(p.prevDate).toBe("2026-09-01");
    expect(p.nextDate).toBeNull();
  });

  it("remonte les mois, d'une année à l'autre", () => {
    const p = resolvePeriod("month", "2026-01-15", NOW, ZONE);
    expect(p.title).toBe("Janvier 2026");
    expect(p.prevDate).toBe("2025-12-01");
    expect(p.nextDate).toBe("2026-02-01");
  });
});
