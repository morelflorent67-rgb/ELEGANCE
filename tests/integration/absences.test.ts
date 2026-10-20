import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DomainError, type DomainErrorCode } from "../../src/lib/domain-error";
import {
  declareAbsence,
  deleteAbsence,
  listAbsences,
  type AbsenceInput,
} from "../../src/modules/absences";
import { getSlotsForRange } from "../../src/modules/availability";
import { setStaffActive } from "../../src/modules/staff/manage";
import { COUPE, ENES, KAAN, NOW, ORHAN, connectTestDb, paris } from "./helpers";

const t = connectTestDb();
beforeEach(() => t.reset());
afterAll(() => t.close());

/** L'auteur de l'action (R-74) : un membre actif de l'équipe, choisi sur la tablette. */
const AUTHOR = ENES;

async function expectRefused(promise: Promise<unknown>, code: DomainErrorCode) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `une erreur « ${code} » était attendue`).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
}

const absence = (input: Partial<AbsenceInput> = {}, now: Date = NOW) =>
  declareAbsence(
    t.db,
    { staffId: ORHAN, startDate: "2026-11-03", endDate: "2026-11-03", ...input },
    AUTHOR,
    now,
  );

const clock = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
});

/** Créneaux en ligne d'une coupe ce jour-là, pour un coiffeur précis ou « sans préférence ». */
async function times(staffId: string, date = "2026-11-03") {
  const [day] = await getSlotsForRange(t.db, {
    from: date,
    days: 1,
    serviceIds: [COUPE],
    staffId,
    audience: "online",
    now: NOW,
  });
  return day.slots.map((s) => clock.format(s.startsAt));
}

const stored = async (id: string) => {
  const [row] = await t.sql`select staff_id, starts_at, ends_at, reason from absence where id = ${id}`;
  return row;
};

describe("R-40 : une absence couvre quelques heures, une journée ou une période, avec un motif", () => {
  it("quelques heures : de 14 h à 16 h le mardi", async () => {
    const { id } = await absence({ startTime: "14:00", endTime: "16:00", reason: "Rendez-vous médical" });
    const row = await stored(id);
    expect(row.staff_id).toBe(ORHAN);
    expect(row.starts_at).toEqual(paris("2026-11-03", "14:00"));
    expect(row.ends_at).toEqual(paris("2026-11-03", "16:00"));
    expect(row.reason).toBe("Rendez-vous médical");
  });

  it("une journée : du début à la fin du jour, heure de Paris", async () => {
    const { id } = await absence();
    const row = await stored(id);
    expect(row.starts_at).toEqual(paris("2026-11-03", "00:00"));
    expect(row.ends_at).toEqual(paris("2026-11-04", "00:00"));
  });

  it("une période : de la première à la dernière journée incluse", async () => {
    const { id } = await absence({ startDate: "2026-11-03", endDate: "2026-11-06" });
    const row = await stored(id);
    expect(row.starts_at).toEqual(paris("2026-11-03", "00:00"));
    expect(row.ends_at).toEqual(paris("2026-11-07", "00:00"));
  });

  it("le dimanche du changement d'heure dure 25 heures : les bornes suivent l'heure de Paris", async () => {
    const { id } = await absence({ startDate: "2026-10-25", endDate: "2026-10-25" }, paris("2026-10-20", "08:00"));
    const row = await stored(id);
    expect((row.ends_at as Date).getTime() - (row.starts_at as Date).getTime()).toBe(25 * 3_600_000);
  });

  it("le motif est facultatif et se nettoie", async () => {
    const a = await absence({ reason: "   " });
    expect((await stored(a.id)).reason).toBeNull();
    const b = await absence({ reason: "  Congé  " });
    expect((await stored(b.id)).reason).toBe("Congé");
  });

  const bad: [string, Partial<AbsenceInput>][] = [
    ["une fin avant le début", { startDate: "2026-11-05", endDate: "2026-11-04" }],
    ["une date inexistante", { startDate: "2026-13-40", endDate: "2026-13-40" }],
    ["une date mal écrite", { startDate: "3 novembre", endDate: "3 novembre" }],
    ["des heures sur plusieurs jours", { endDate: "2026-11-04", startTime: "14:00", endTime: "16:00" }],
    ["une heure de fin avant le début", { startTime: "16:00", endTime: "14:00" }],
    ["des heures identiques", { startTime: "14:00", endTime: "14:00" }],
    ["une heure hors de la grille de 15 minutes", { startTime: "14:10", endTime: "16:00" }],
    ["une heure de début sans heure de fin", { startTime: "14:00" }],
    ["une heure de fin sans heure de début", { endTime: "16:00" }],
    ["un motif trop long", { reason: "x".repeat(81) }],
    ["une période de plus de 400 jours", { startDate: "2026-11-03", endDate: "2028-01-01" }],
  ];
  it.each(bad)("refuse %s, sans rien écrire", async (_label, change) => {
    await expectRefused(absence(change), "invalid_absence");
    expect(await t.sql`select 1 from absence`).toHaveLength(0);
    expect(await t.sql`select 1 from audit_log`).toHaveLength(0);
  });

  it("refuse une absence entièrement passée", async () => {
    await expectRefused(
      absence({ startDate: "2026-11-02", endDate: "2026-11-02", startTime: "08:00", endTime: "09:00" }, paris("2026-11-02", "09:00")),
      "absence_in_past",
    );
  });

  it("accepte une absence qui a déjà commencé (en cours)", async () => {
    await absence(
      { startDate: "2026-11-02", endDate: "2026-11-02", startTime: "08:00", endTime: "12:00" },
      paris("2026-11-02", "09:00"),
    );
    expect(await t.sql`select 1 from absence`).toHaveLength(1);
  });

  it("refuse un membre inconnu ou retiré de l'équipe", async () => {
    await expectRefused(absence({ staffId: "00000000-0000-4000-8000-0000000000ff" }), "unknown_staff");
    await setStaffActive(t.db, KAAN, false, "11111111-1111-4111-8111-111111111111");
    await expectRefused(absence({ staffId: KAAN }), "unknown_staff");
  });

  it("exige un auteur de l'équipe (R-74)", async () => {
    const input = { staffId: ORHAN, startDate: "2026-11-03", endDate: "2026-11-03" };
    await expectRefused(declareAbsence(t.db, input, "", NOW), "author_required");
    await expectRefused(
      declareAbsence(t.db, input, "00000000-0000-4000-8000-0000000000ff", NOW),
      "unknown_author",
    );
    expect(await t.sql`select 1 from absence`).toHaveLength(0);
  });
});

describe("R-41 : aucun créneau n'est proposé pendant une absence", () => {
  it("quelques heures : les créneaux de ces heures disparaissent, pour ce coiffeur seulement", async () => {
    const before = await times(ORHAN);
    expect(before).toContain("14:00");

    await absence({ startTime: "14:00", endTime: "16:00" });

    const orhan = await times(ORHAN);
    expect(orhan).not.toContain("14:00");
    expect(orhan).not.toContain("15:30");
    expect(orhan).toContain("13:30"); // finit à 14 h pile : libre
    expect(orhan).toContain("16:00");
    expect(await times(ENES)).toContain("14:00"); // son collègue n'est pas touché
  });

  it("une journée : plus aucun créneau, mais « sans préférence » reste ouvert chez le collègue", async () => {
    await absence();
    expect(await times(ORHAN)).toEqual([]);
    expect((await times("any")).length).toBeGreaterThan(0);
  });

  it("supprimer l'absence rend les créneaux", async () => {
    const { id } = await absence();
    await deleteAbsence(t.db, id, AUTHOR, NOW);
    expect((await times(ORHAN)).length).toBeGreaterThan(0);
  });
});

describe("liste et suppression des absences", () => {
  it("liste les absences en cours et à venir, dans l'ordre, avec le prénom", async () => {
    await absence({ startDate: "2026-11-10", endDate: "2026-11-10", reason: "Congé" });
    await absence({ staffId: ENES, startDate: "2026-11-03", endDate: "2026-11-03", startTime: "14:00", endTime: "16:00" });
    // Une absence déjà terminée (posée en base) n'est plus listée.
    await t.sql`
      insert into absence (staff_id, starts_at, ends_at, reason)
      values (${ORHAN}, '2026-10-01T08:00:00Z', '2026-10-01T16:00:00Z', 'Passée')`;

    const list = await listAbsences(t.db, NOW);
    expect(list.map((a) => [a.staffFirstName, a.reason])).toEqual([
      ["Enes", null],
      ["Orhan", "Congé"],
    ]);
    expect(list[0].startsAt).toEqual(paris("2026-11-03", "14:00"));
  });

  it("supprimer une absence inconnue est refusé", async () => {
    await expectRefused(
      deleteAbsence(t.db, "00000000-0000-4000-8000-0000000000ff", AUTHOR, NOW),
      "unknown_absence",
    );
  });

  it("l'absence d'un membre retiré reste listée et supprimable", async () => {
    const { id } = await absence();
    await setStaffActive(t.db, ORHAN, false, "11111111-1111-4111-8111-111111111111");
    expect(await listAbsences(t.db, NOW)).toHaveLength(1);
    await deleteAbsence(t.db, id, AUTHOR, NOW);
    expect(await listAbsences(t.db, NOW)).toHaveLength(0);
  });
});

describe("journal : déclarer et supprimer une absence sont inscrits (R-43, principe 6)", () => {
  it("écrit l'auteur de la tablette, l'action et les bornes", async () => {
    const { id } = await absence({ startTime: "14:00", endTime: "16:00", reason: "Congé" });
    await deleteAbsence(t.db, id, AUTHOR, NOW);
    const rows = await t.sql`
      select actor_type, actor_id, action, entity, entity_id, before, after from audit_log order by id`;
    expect(rows.map((r) => r.action)).toEqual(["absence.declared", "absence.deleted"]);
    expect(rows[0]).toMatchObject({ actor_type: "staff", actor_id: AUTHOR, entity: "absence", entity_id: id });
    expect(rows[0].after).toMatchObject({
      staffId: ORHAN,
      startsAt: paris("2026-11-03", "14:00").toISOString(),
      endsAt: paris("2026-11-03", "16:00").toISOString(),
      reason: "Congé",
    });
    expect(rows[1].before).toMatchObject({ staffId: ORHAN });
  });
});
