import { describe, expect, it } from "vitest";
import { checkSlot } from "./engine";
import { ENES, ORHAN, at, makeSnapshot } from "./test-fixtures";

// R-82 : une place gardée pour la liste d'attente (D-100) n'est pas réservable en ligne par un autre client.
const NOW = at("2026-11-02", "08:00");
const held = [
  { staffId: ORHAN, startsAt: at("2026-11-03", "10:00"), endsAt: at("2026-11-03", "10:30") },
];
const snapshot = () => ({ ...makeSnapshot(), holds: held });
const base = { durationMinutes: 30, audience: "online" as const, now: NOW };

describe("place gardée pour la liste d'attente (R-82)", () => {
  it("bloque la réservation en ligne, pour ce coiffeur et ce créneau seulement", () => {
    expect(
      checkSlot(snapshot(), { staffId: ORHAN, startsAt: at("2026-11-03", "10:00"), ...base }),
    ).toEqual({ ok: false, reason: "held" });
    expect(
      checkSlot(snapshot(), { staffId: ENES, startsAt: at("2026-11-03", "10:00"), ...base }),
    ).toEqual({ ok: true });
    expect(
      checkSlot(snapshot(), { staffId: ORHAN, startsAt: at("2026-11-03", "10:30"), ...base }),
    ).toEqual({ ok: true });
  });

  it("ne bloque pas le salon", () => {
    const result = checkSlot(snapshot(), {
      staffId: ORHAN,
      startsAt: at("2026-11-03", "10:00"),
      ...base,
      audience: "salon",
    });
    expect(result).toEqual({ ok: true });
  });

  it("refuse aussi une prestation longue qui chevauche la place gardée", () => {
    const result = checkSlot(snapshot(), {
      staffId: ORHAN,
      startsAt: at("2026-11-03", "10:00"),
      ...base,
      durationMinutes: 60,
    });
    expect(result).toEqual({ ok: false, reason: "held" });
  });

  it("sans place gardée, rien ne change", () => {
    expect(
      checkSlot(makeSnapshot(), { staffId: ORHAN, startsAt: at("2026-11-03", "10:00"), ...base }),
    ).toEqual({ ok: true });
  });
});
