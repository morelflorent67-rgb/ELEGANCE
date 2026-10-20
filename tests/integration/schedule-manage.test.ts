import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DomainError, type DomainErrorCode } from "../../src/lib/domain-error";
import { getSlotsForRange } from "../../src/modules/availability";
import {
  addClosure,
  listClosures,
  loadWeekHours,
  removeClosure,
  setOpeningHours,
  type WeekHours,
} from "../../src/modules/schedule/manage";
import { COUPE, NOW, connectTestDb } from "./helpers";

const t = connectTestDb();
beforeEach(() => t.reset());
afterAll(() => t.close());

const MANAGER = "11111111-1111-4111-8111-111111111111";

async function expectRefused(promise: Promise<unknown>, code: DomainErrorCode) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `une erreur « ${code} » était attendue`).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
}

const DAY = { morning: { opensAt: "10:00", closesAt: "12:00" }, afternoon: { opensAt: "13:00", closesAt: "19:00" } };
const OPEN_DAY = [DAY.morning, DAY.afternoon];

/** Les horaires de départ : mardi (2) à samedi (6), 10 h–12 h et 13 h–19 h (R-01). */
const seedWeek = (): WeekHours => ({
  1: [],
  2: OPEN_DAY,
  3: OPEN_DAY,
  4: OPEN_DAY,
  5: OPEN_DAY,
  6: OPEN_DAY,
  7: [],
});

const clock = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
});

/** Créneaux en ligne d'une coupe sur un jour donné, « sans préférence ». */
async function day(date: string) {
  const [result] = await getSlotsForRange(t.db, {
    from: date,
    days: 1,
    serviceIds: [COUPE],
    staffId: "any",
    audience: "online",
    now: NOW,
  });
  return { closed: result.closed, times: result.slots.map((s) => clock.format(s.startsAt)) };
}

const MONDAY = "2026-11-09"; // lundi : fermé au départ
const TUESDAY = "2026-11-03";
const WEDNESDAY = "2026-11-04";
const SATURDAY = "2026-11-07";

describe("R-01 et R-03 : le gérant modifie les horaires", () => {
  it("lit les horaires de départ : mardi à samedi, avec une pause à midi", async () => {
    expect(await loadWeekHours(t.db)).toEqual(seedWeek());
  });

  it("raccourcir la journée change les créneaux proposés", async () => {
    const week = { ...seedWeek(), 2: [DAY.morning, { opensAt: "13:00", closesAt: "17:00" }] };
    await setOpeningHours(t.db, week, MANAGER);

    const tuesday = await day(TUESDAY);
    expect(tuesday.times.at(-1)).toBe("16:30"); // une coupe de 30 min finit à 17 h
    expect(tuesday.times).not.toContain("17:00");
    // Les autres jours ne bougent pas.
    expect((await day(WEDNESDAY)).times.at(-1)).toBe("18:30");
  });

  it("ouvrir un jour de repos : le lundi se réserve", async () => {
    expect((await day(MONDAY)).closed).toBe(true);
    await setOpeningHours(t.db, { ...seedWeek(), 1: [{ opensAt: "14:00", closesAt: "18:00" }] }, MANAGER);
    const monday = await day(MONDAY);
    expect(monday.closed).toBe(false);
    expect(monday.times[0]).toBe("14:00");
    expect(monday.times.at(-1)).toBe("17:30");
  });

  it("fermer un jour : « Fermé », aucun créneau", async () => {
    await setOpeningHours(t.db, { ...seedWeek(), 6: [] }, MANAGER);
    expect(await day(SATURDAY)).toEqual({ closed: true, times: [] });
  });

  it("une journée sans pause : une seule plage", async () => {
    await setOpeningHours(t.db, { ...seedWeek(), 3: [{ opensAt: "09:00", closesAt: "19:00" }] }, MANAGER);
    const wednesday = await day(WEDNESDAY);
    expect(wednesday.times[0]).toBe("09:00");
    expect(wednesday.times).toContain("12:00"); // plus de pause
    expect(wednesday.times).toContain("12:30");
  });

  it("garde les plages dans l'ordre, quel que soit l'ordre reçu", async () => {
    await setOpeningHours(t.db, { ...seedWeek(), 2: [DAY.afternoon, DAY.morning] }, MANAGER);
    expect((await loadWeekHours(t.db))[2]).toEqual(OPEN_DAY);
  });

  const bad: [string, WeekHours][] = [
    ["une plage qui finit avant de commencer", { 2: [{ opensAt: "12:00", closesAt: "10:00" }] }],
    ["une plage vide", { 2: [{ opensAt: "10:00", closesAt: "10:00" }] }],
    ["deux plages qui se chevauchent", { 2: [{ opensAt: "10:00", closesAt: "13:00" }, DAY.afternoon] }],
    ["deux plages qui se touchent (c'est une seule plage)", { 2: [DAY.morning, { opensAt: "12:00", closesAt: "19:00" }] }],
    ["une heure qui n'est pas sur la grille de 15 minutes", { 2: [{ opensAt: "10:10", closesAt: "12:00" }] }],
    ["une heure mal écrite", { 2: [{ opensAt: "10h", closesAt: "12:00" }] }],
    ["une heure impossible", { 2: [{ opensAt: "10:00", closesAt: "25:00" }] }],
    ["plus de trois plages par jour", { 2: [
      { opensAt: "09:00", closesAt: "10:00" },
      { opensAt: "11:00", closesAt: "12:00" },
      { opensAt: "13:00", closesAt: "14:00" },
      { opensAt: "15:00", closesAt: "16:00" },
    ] }],
  ];

  it.each(bad)("refuse %s, sans rien écrire", async (_label, change) => {
    await expectRefused(setOpeningHours(t.db, { ...seedWeek(), ...change }, MANAGER), "invalid_hours");
    expect(await loadWeekHours(t.db)).toEqual(seedWeek());
    const [{ count }] = await t.sql`select count(*)::int as count from audit_log`;
    expect(count).toBe(0);
  });

  it("refuse une semaine sans aucun jour ouvert (probablement une erreur)", async () => {
    await expectRefused(
      setOpeningHours(t.db, { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] }, MANAGER),
      "invalid_hours",
    );
    expect(await loadWeekHours(t.db)).toEqual(seedWeek());
  });

  it("refuse un jour inconnu", async () => {
    await expectRefused(
      setOpeningHours(t.db, { ...seedWeek(), 8: OPEN_DAY } as unknown as WeekHours, MANAGER),
      "invalid_hours",
    );
  });

  it("les rendez-vous déjà pris ne bougent pas (ils seront à traiter, D-57)", async () => {
    const [customer] = await t.sql`
      insert into customer (first_name, last_name, phone, email) values ('A', 'B', '+33600000000', 'a@b.fr') returning id`;
    await t.sql`
      insert into appointment (customer_id, staff_id, starts_at, ends_at, status, source)
      values (${customer.id}, '00000000-0000-4000-8000-0000000000a1', '2026-11-03T17:30:00Z', '2026-11-03T18:00:00Z', 'confirmed', 'salon')`;
    await setOpeningHours(t.db, { ...seedWeek(), 2: [{ opensAt: "10:00", closesAt: "12:00" }] }, MANAGER);
    const [{ count }] = await t.sql`select count(*)::int as count from appointment where status = 'confirmed'`;
    expect(count).toBe(1);
  });

  it("journal : auteur gérant, avant et après ; rien d'écrit si rien ne change", async () => {
    await setOpeningHours(t.db, seedWeek(), MANAGER);
    expect((await t.sql`select 1 from audit_log`).length).toBe(0);

    await setOpeningHours(t.db, { ...seedWeek(), 6: [{ opensAt: "10:00", closesAt: "17:00" }] }, MANAGER);
    const [entry] = await t.sql`
      select actor_type, actor_id, action, entity, before, after from audit_log`;
    expect(entry).toMatchObject({
      actor_type: "manager",
      actor_id: MANAGER,
      action: "hours.changed",
      entity: "opening_hours",
    });
    expect(entry.before[6]).toEqual(OPEN_DAY);
    expect(entry.after[6]).toEqual([{ opensAt: "10:00", closesAt: "17:00" }]);
  });
});

describe("R-03 : le gérant déclare les fermetures exceptionnelles", () => {
  it("une fermeture d'un jour ferme ce jour-là, et lui seul", async () => {
    await addClosure(t.db, { startsOn: WEDNESDAY, endsOn: WEDNESDAY, reason: "Jour férié" }, MANAGER, NOW);
    expect(await day(WEDNESDAY)).toEqual({ closed: true, times: [] });
    expect((await day(TUESDAY)).closed).toBe(false);
    expect((await day("2026-11-05")).closed).toBe(false);
  });

  it("une fermeture sur une période ferme tous ses jours, bornes comprises", async () => {
    await addClosure(t.db, { startsOn: "2026-11-04", endsOn: "2026-11-06", reason: "Congés" }, MANAGER, NOW);
    for (const d of ["2026-11-04", "2026-11-05", "2026-11-06"]) {
      expect((await day(d)).closed, d).toBe(true);
    }
    expect((await day(SATURDAY)).closed).toBe(false);
  });

  it("supprimer la fermeture rouvre le salon", async () => {
    const id = await addClosure(t.db, { startsOn: WEDNESDAY, endsOn: WEDNESDAY }, MANAGER, NOW);
    await removeClosure(t.db, id, MANAGER);
    expect((await day(WEDNESDAY)).closed).toBe(false);
  });

  it("liste les fermetures à venir et en cours, dans l'ordre, pas les passées", async () => {
    await addClosure(t.db, { startsOn: "2026-12-24", endsOn: "2026-12-26", reason: "Noël" }, MANAGER, NOW);
    await addClosure(t.db, { startsOn: "2026-11-11", endsOn: "2026-11-11", reason: "Armistice" }, MANAGER, NOW);
    // Une fermeture déjà passée (posée en base) n'est plus listée.
    await t.sql`insert into closure (starts_on, ends_on, reason) values ('2026-10-01', '2026-10-02', 'Passée')`;
    // Une fermeture qui a commencé hier et finit demain est en cours : listée.
    await t.sql`insert into closure (starts_on, ends_on, reason) values ('2026-11-01', '2026-11-03', 'En cours')`;

    const list = await listClosures(t.db, NOW);
    expect(list.map((c) => c.reason)).toEqual(["En cours", "Armistice", "Noël"]);
    expect(list[2]).toMatchObject({ startsOn: "2026-12-24", endsOn: "2026-12-26" });
  });

  it("accepte une fermeture qui commence aujourd'hui, sans motif", async () => {
    await addClosure(t.db, { startsOn: "2026-11-02", endsOn: "2026-11-02" }, MANAGER, NOW);
    expect((await listClosures(t.db, NOW))[0]).toMatchObject({ reason: null });
  });

  const bad: [string, { startsOn: string; endsOn: string; reason?: string }, DomainErrorCode][] = [
    ["une fin avant le début", { startsOn: "2026-11-05", endsOn: "2026-11-04" }, "invalid_closure"],
    ["une date inexistante", { startsOn: "2026-13-40", endsOn: "2026-13-41" }, "invalid_closure"],
    ["une date mal écrite", { startsOn: "5 novembre", endsOn: "5 novembre" }, "invalid_closure"],
    ["un motif trop long", { startsOn: WEDNESDAY, endsOn: WEDNESDAY, reason: "x".repeat(81) }, "invalid_closure"],
    ["une période de plus de 400 jours", { startsOn: "2026-11-04", endsOn: "2028-01-01" }, "invalid_closure"],
    ["une fermeture entièrement passée", { startsOn: "2026-10-20", endsOn: "2026-10-21" }, "closure_in_past"],
  ];
  it.each(bad)("refuse %s", async (_label, input, code) => {
    await expectRefused(addClosure(t.db, input, MANAGER, NOW), code);
    expect(await listClosures(t.db, NOW)).toEqual([]);
  });

  it("supprimer une fermeture inconnue est refusé", async () => {
    await expectRefused(removeClosure(t.db, 9999, MANAGER), "unknown_closure");
  });

  it("journal : ajout et suppression inscrits, auteur gérant", async () => {
    const id = await addClosure(t.db, { startsOn: WEDNESDAY, endsOn: WEDNESDAY, reason: "Jour férié" }, MANAGER, NOW);
    await removeClosure(t.db, id, MANAGER);
    const rows = await t.sql`select actor_type, actor_id, action, entity, entity_id, after, before from audit_log order by id`;
    expect(rows.map((r) => r.action)).toEqual(["closure.added", "closure.removed"]);
    expect(rows[0]).toMatchObject({ actor_type: "manager", actor_id: MANAGER, entity: "closure", entity_id: String(id) });
    expect(rows[0].after).toMatchObject({ startsOn: WEDNESDAY, endsOn: WEDNESDAY, reason: "Jour férié" });
    expect(rows[1].before).toMatchObject({ startsOn: WEDNESDAY });
  });

  it("une fermeture n'annule aucun rendez-vous déjà pris (ils seront à traiter, D-57)", async () => {
    const [customer] = await t.sql`
      insert into customer (first_name, last_name, phone, email) values ('A', 'B', '+33600000000', 'a@b.fr') returning id`;
    await t.sql`
      insert into appointment (customer_id, staff_id, starts_at, ends_at, status, source)
      values (${customer.id}, '00000000-0000-4000-8000-0000000000a1', '2026-11-04T09:00:00Z', '2026-11-04T09:30:00Z', 'confirmed', 'salon')`;
    await addClosure(t.db, { startsOn: WEDNESDAY, endsOn: WEDNESDAY }, MANAGER, NOW);
    const [{ count }] = await t.sql`select count(*)::int as count from appointment where status = 'confirmed'`;
    expect(count).toBe(1);
  });
});
