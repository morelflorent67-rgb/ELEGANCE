import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getNextAvailableDay, getSlotsForRange } from "../../src/modules/availability";
import { hitRateLimit } from "../../src/modules/security/rate-limit";
import { COUPE, ENES, NOW, ORHAN, connectTestDb, paris } from "./helpers";

const t = connectTestDb();
beforeEach(() => t.reset());
afterAll(() => t.close());

const range = (options: Partial<Parameters<typeof getSlotsForRange>[1]> = {}) =>
  getSlotsForRange(t.db, {
    from: "2026-11-02",
    days: 7,
    serviceIds: [COUPE],
    staffId: "any",
    audience: "online",
    now: NOW,
    ...options,
  });

describe("créneaux sur plusieurs jours", () => {
  it("rend une entrée par jour, vide le lundi et le dimanche (R-01)", async () => {
    const days = await range();
    expect(days.map((d) => d.date)).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
    ]);
    expect(days.map((d) => d.slots.length > 0)).toEqual([
      false,
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
  });

  it("donne les mêmes créneaux que le calcul d'un seul jour", async () => {
    const [monday, tuesday] = await range({ days: 2 });
    expect(monday.slots).toEqual([]);
    expect(tuesday.slots[0].startsAt).toEqual(paris("2026-11-03", "10:00"));
    expect(tuesday.slots.at(-1)!.startsAt).toEqual(paris("2026-11-03", "18:30"));
  });

  it("tient compte des RDV et des fermetures d'un jour précis", async () => {
    await t.sql`insert into closure (starts_on, ends_on) values ('2026-11-04', '2026-11-04')`;
    const customer = await t.sql`insert into customer (email) values ('a@b.fr') returning id`;
    await t.sql`insert into appointment (customer_id, staff_id, starts_at, ends_at, source) values
      (${customer[0].id}, ${ORHAN}, ${paris("2026-11-03", "10:00")}, ${paris("2026-11-03", "10:30")}, 'salon'),
      (${customer[0].id}, ${ENES}, ${paris("2026-11-03", "10:00")}, ${paris("2026-11-03", "10:30")}, 'salon')`;
    const days = await range();
    expect(days[1].slots[0].startsAt).toEqual(paris("2026-11-03", "10:30"));
    expect(days[2].slots).toEqual([]);
  });

  it("jours hors délai : rien au-delà de 6 semaines en ligne (R-06)", async () => {
    const days = await range({ from: "2026-12-14", days: 4 }); // lun. 14 → jeu. 17 déc. ; limite : mar. 15 à 8 h
    expect(days.every((d) => d.slots.length === 0)).toBe(true);
  });
});

describe("prochaine disponibilité", () => {
  it("trouve le premier jour avec un créneau", async () => {
    const next = await getNextAvailableDay(t.db, {
      from: "2026-11-02",
      serviceIds: [COUPE],
      staffId: "any",
      audience: "online",
      now: NOW,
    });
    expect(next?.date).toBe("2026-11-03");
  });

  it("saute les jours fermés ou complets", async () => {
    await t.sql`insert into closure (starts_on, ends_on) values ('2026-11-03', '2026-11-04')`;
    const next = await getNextAvailableDay(t.db, {
      from: "2026-11-02",
      serviceIds: [COUPE],
      staffId: "any",
      audience: "online",
      now: NOW,
    });
    expect(next?.date).toBe("2026-11-05");
  });

  it("rend null quand rien n'est libre dans la période", async () => {
    await t.sql`insert into closure (starts_on, ends_on) values ('2026-11-02', '2026-12-31')`;
    const next = await getNextAvailableDay(t.db, {
      from: "2026-11-02",
      serviceIds: [COUPE],
      staffId: "any",
      audience: "online",
      now: NOW,
      searchDays: 30,
    });
    expect(next).toBeNull();
  });
});

describe("limitation d'essais", () => {
  const opts = { limit: 3, windowSeconds: 60 };

  it("autorise jusqu'à la limite puis refuse, avec le délai d'attente", async () => {
    const now = new Date("2026-11-03T10:00:00Z");
    for (let i = 0; i < 3; i++) {
      expect((await hitRateLimit(t.db, "login:1.2.3.4", opts, now)).allowed).toBe(true);
    }
    const refused = await hitRateLimit(t.db, "login:1.2.3.4", opts, now);
    expect(refused).toEqual({ allowed: false, retryAfterSeconds: 60 });
  });

  it("repart de zéro quand la fenêtre est passée", async () => {
    const start = new Date("2026-11-03T10:00:00Z");
    for (let i = 0; i < 4; i++) await hitRateLimit(t.db, "login:1.2.3.4", opts, start);
    const later = new Date(start.getTime() + 61_000);
    expect((await hitRateLimit(t.db, "login:1.2.3.4", opts, later)).allowed).toBe(true);
  });

  it("compte chaque clé séparément", async () => {
    const now = new Date("2026-11-03T10:00:00Z");
    for (let i = 0; i < 4; i++) await hitRateLimit(t.db, "login:1.1.1.1", opts, now);
    expect((await hitRateLimit(t.db, "login:2.2.2.2", opts, now)).allowed).toBe(true);
  });

  it("tient sous des essais simultanés : jamais plus que la limite", async () => {
    const now = new Date("2026-11-03T10:00:00Z");
    const results = await Promise.all(
      Array.from({ length: 10 }, () => hitRateLimit(t.db, "signup:9.9.9.9", opts, now)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
  });
});
