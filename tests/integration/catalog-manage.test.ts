import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DomainError, type DomainErrorCode } from "../../src/lib/domain-error";
import { createAppointment } from "../../src/modules/booking";
import { loadCatalog, loadStaffChoices } from "../../src/modules/catalog";
import {
  createService,
  listServicesForManager,
  moveService,
  setServiceActive,
  setServiceStaff,
  updateService,
  type ServiceInput,
} from "../../src/modules/catalog/manage";
import {
  COUPE,
  COUPE_FORMATION,
  ENES,
  KAAN,
  NOW,
  ORHAN,
  TAHA,
  TAILLAGE_BARBE,
  connectTestDb,
  createCustomer,
  paris,
} from "./helpers";

const t = connectTestDb();
beforeEach(() => t.reset());
afterAll(() => t.close());

// L'identifiant du compte équipe qui a saisi le code gérant (R-73), écrit au journal.
const MANAGER = "11111111-1111-4111-8111-111111111111";

const BEARD_OIL: ServiceInput = {
  name: "Soin huile de barbe",
  category: "Barbe et soin",
  priceCents: 1500,
  durationMin: 15,
  performedBy: "barber",
  bookableOnline: true,
  staffIds: [ORHAN, ENES],
};

async function expectRefused(promise: Promise<unknown>, code: DomainErrorCode) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `une erreur « ${code} » était attendue`).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
}

describe("R-11 : le gérant ajoute, modifie et retire des prestations", () => {
  it("ajoute une prestation : elle apparaît dans la carte, à la fin, avec ses coiffeurs habilités", async () => {
    const id = await createService(t.db, BEARD_OIL, MANAGER);

    const catalog = await loadCatalog(t.db);
    expect(catalog).toHaveLength(11);
    expect(catalog.at(-1)).toMatchObject({
      id,
      name: "Soin huile de barbe",
      category: "Barbe et soin",
      priceCents: 1500,
      durationMin: 15,
      performedBy: "barber",
      bookableOnline: true,
    });

    // R-13 : la nouvelle prestation se réserve avec ses coiffeurs habilités, pas avec les autres.
    const choices = await loadStaffChoices(t.db, [id], "online");
    expect(choices.map((c) => c.firstName)).toEqual(["Orhan", "Enes"]);
  });

  it("une prestation ajoutée se réserve vraiment, avec prix et durée figés", async () => {
    const id = await createService(t.db, BEARD_OIL, MANAGER);
    const customerId = await createCustomer(t.sql);
    const created = await createAppointment(
      t.db,
      {
        customerId,
        serviceIds: [id],
        staffId: ORHAN,
        startsAt: paris("2026-11-03", "10:00"),
        source: "online",
      },
      NOW,
    );
    expect(created.totalPriceCents).toBe(1500);
    expect(created.durationMinutes).toBe(15);
  });

  it("modifie le prix et la durée sans toucher aux rendez-vous déjà pris (R-16)", async () => {
    const customerId = await createCustomer(t.sql);
    const booked = await createAppointment(
      t.db,
      {
        customerId,
        serviceIds: [COUPE],
        staffId: ORHAN,
        startsAt: paris("2026-11-03", "10:00"),
        source: "online",
      },
      NOW,
    );

    await updateService(
      t.db,
      COUPE,
      { name: "Coupe homme", category: "Coupes", priceCents: 2000, durationMin: 45, bookableOnline: true },
      MANAGER,
    );

    expect((await loadCatalog(t.db)).find((s) => s.id === COUPE)).toMatchObject({
      priceCents: 2000,
      durationMin: 45,
    });
    // Le RDV déjà pris garde le prix et la durée du jour de la réservation.
    const [item] = await t.sql`
      select price_cents, duration_min, name_snapshot from appointment_item where appointment_id = ${booked.id}`;
    expect(item).toMatchObject({ price_cents: 1800, duration_min: 30, name_snapshot: "Coupe homme" });
    const [row] = await t.sql`select starts_at, ends_at from appointment where id = ${booked.id}`;
    expect((row.ends_at as Date).getTime() - (row.starts_at as Date).getTime()).toBe(30 * 60_000);
  });

  it("renommer une prestation ne change pas le nom gardé dans les anciens rendez-vous (R-16)", async () => {
    const customerId = await createCustomer(t.sql);
    const booked = await createAppointment(
      t.db,
      {
        customerId,
        serviceIds: [COUPE],
        staffId: ORHAN,
        startsAt: paris("2026-11-03", "10:00"),
        source: "online",
      },
      NOW,
    );
    await updateService(
      t.db,
      COUPE,
      { name: "Coupe signature", category: "Coupes", priceCents: 1800, durationMin: 30, bookableOnline: true },
      MANAGER,
    );
    const [item] = await t.sql`select name_snapshot from appointment_item where appointment_id = ${booked.id}`;
    expect(item.name_snapshot).toBe("Coupe homme");
  });

  it("retire une prestation : elle quitte la carte, pas la base, et ne se réserve plus (R-16)", async () => {
    const customerId = await createCustomer(t.sql);
    const booked = await createAppointment(
      t.db,
      {
        customerId,
        serviceIds: [TAILLAGE_BARBE],
        staffId: ORHAN,
        startsAt: paris("2026-11-03", "10:00"),
        source: "online",
      },
      NOW,
    );

    await setServiceActive(t.db, TAILLAGE_BARBE, false, MANAGER);

    expect((await loadCatalog(t.db)).map((s) => s.id)).not.toContain(TAILLAGE_BARBE);
    // La ligne existe toujours : l'historique du RDV reste lisible.
    const [still] = await t.sql`select active from service where id = ${TAILLAGE_BARBE}`;
    expect(still.active).toBe(false);
    const [item] = await t.sql`select name_snapshot from appointment_item where appointment_id = ${booked.id}`;
    expect(item.name_snapshot).toBe("Taillage barbe");

    await expectRefused(
      createAppointment(
        t.db,
        {
          customerId,
          serviceIds: [TAILLAGE_BARBE],
          staffId: ORHAN,
          startsAt: paris("2026-11-03", "11:00"),
          source: "online",
        },
        NOW,
      ),
      "unknown_service",
    );
  });

  it("remet une prestation retirée dans la carte, à sa place", async () => {
    await setServiceActive(t.db, TAILLAGE_BARBE, false, MANAGER);
    await setServiceActive(t.db, TAILLAGE_BARBE, true, MANAGER);
    const names = (await loadCatalog(t.db)).map((s) => s.name);
    expect(names).toContain("Taillage barbe");
    expect(names.indexOf("Taillage barbe")).toBe(4); // 5ᵉ de la carte d'origine
  });

  it("passe une prestation en « sur appel » : elle reste affichée mais ne se réserve plus en ligne (R-17)", async () => {
    await updateService(
      t.db,
      COUPE,
      { name: "Coupe homme", category: "Coupes", priceCents: 1800, durationMin: 30, bookableOnline: false },
      MANAGER,
    );
    const coupe = (await loadCatalog(t.db)).find((s) => s.id === COUPE)!;
    expect(coupe.bookableOnline).toBe(false);
    await expectRefused(loadStaffChoices(t.db, [COUPE], "online"), "not_bookable_online");
    // Le salon, lui, peut encore la réserver.
    expect((await loadStaffChoices(t.db, [COUPE], "salon")).length).toBeGreaterThan(0);
  });

  it("déplace une prestation dans la carte, vers le haut ou vers le bas", async () => {
    await moveService(t.db, TAILLAGE_BARBE, "up", MANAGER);
    let names = (await loadCatalog(t.db)).map((s) => s.name);
    expect(names.slice(2, 6)).toEqual([
      "Coupe, tarif formation",
      "Taillage barbe",
      "Coupe & taille de barbe, tarif formation",
      "Soin du visage à la vapeur",
    ]);

    await moveService(t.db, TAILLAGE_BARBE, "down", MANAGER);
    await moveService(t.db, TAILLAGE_BARBE, "down", MANAGER);
    names = (await loadCatalog(t.db)).map((s) => s.name);
    expect(names.indexOf("Taillage barbe")).toBe(5);

    // Monter la première ou descendre la dernière ne fait rien et ne casse rien.
    await moveService(t.db, COUPE, "up", MANAGER);
    expect((await loadCatalog(t.db))[0].id).toBe(COUPE);
  });

  it("la liste du gérant montre aussi les prestations retirées", async () => {
    await setServiceActive(t.db, TAILLAGE_BARBE, false, MANAGER);
    const managed = await listServicesForManager(t.db);
    expect(managed).toHaveLength(10);
    expect(managed.find((s) => s.id === TAILLAGE_BARBE)).toMatchObject({ active: false });
  });
});

describe("R-10 : nom, durée en multiple de 15 minutes, prix", () => {
  const bad: [string, Partial<ServiceInput>][] = [
    ["un nom vide", { name: "   " }],
    ["un nom trop long", { name: "x".repeat(81) }],
    ["une durée qui n'est pas un multiple de 15", { durationMin: 20 }],
    ["une durée nulle", { durationMin: 0 }],
    ["une durée négative", { durationMin: -15 }],
    ["une durée de plus de 8 heures", { durationMin: 495 }],
    ["un prix négatif", { priceCents: -100 }],
    ["un prix qui n'est pas en centimes entiers", { priceCents: 12.5 }],
    ["un prix absurde", { priceCents: 10_000_000 }],
  ];

  it.each(bad)("refuse %s", async (_label, change) => {
    await expectRefused(createService(t.db, { ...BEARD_OIL, ...change }, MANAGER), "invalid_service");
    await expectRefused(
      updateService(
        t.db,
        COUPE,
        { name: "Coupe homme", category: "Coupes", priceCents: 1800, durationMin: 30, bookableOnline: true, ...change },
        MANAGER,
      ),
      "invalid_service",
    );
    // Rien n'a été écrit.
    expect(await loadCatalog(t.db)).toHaveLength(10);
    expect((await loadCatalog(t.db)).find((s) => s.id === COUPE)).toMatchObject({
      priceCents: 1800,
      durationMin: 30,
    });
  });

  it("accepte un prix gratuit et des durées de 15 minutes à 8 heures", async () => {
    await createService(t.db, { ...BEARD_OIL, name: "Offert", priceCents: 0, durationMin: 480 }, MANAGER);
    expect((await loadCatalog(t.db)).at(-1)).toMatchObject({ priceCents: 0, durationMin: 480 });
  });

  it("nettoie les espaces du nom et de la catégorie", async () => {
    await createService(t.db, { ...BEARD_OIL, name: "  Soin  ", category: "  Barbe et soin " }, MANAGER);
    expect((await loadCatalog(t.db)).at(-1)).toMatchObject({ name: "Soin", category: "Barbe et soin" });
  });

  it("refuse une prestation inconnue", async () => {
    await expectRefused(
      updateService(
        t.db,
        "00000000-0000-4000-8000-0000000000ff",
        { name: "x", category: null, priceCents: 100, durationMin: 15, bookableOnline: true },
        MANAGER,
      ),
      "unknown_service",
    );
    await expectRefused(setServiceActive(t.db, "00000000-0000-4000-8000-0000000000ff", false, MANAGER), "unknown_service");
  });
});

describe("R-12 et R-13 : chaque prestation indique les coiffeurs habilités", () => {
  it("remplace la liste des habilités : le choix « Avec qui ? » suit", async () => {
    expect((await loadStaffChoices(t.db, [COUPE], "online")).map((c) => c.firstName)).toEqual(["Orhan", "Enes"]);

    await setServiceStaff(t.db, COUPE, [ORHAN], MANAGER);
    expect((await loadStaffChoices(t.db, [COUPE], "online")).map((c) => c.firstName)).toEqual(["Orhan"]);

    await setServiceStaff(t.db, COUPE, [ENES, ORHAN], MANAGER);
    expect((await loadStaffChoices(t.db, [COUPE], "online")).map((c) => c.firstName)).toEqual(["Orhan", "Enes"]);
  });

  it("un coiffeur retiré de la liste ne reçoit plus « Sans préférence » pour cette prestation", async () => {
    await setServiceStaff(t.db, COUPE, [ORHAN], MANAGER);
    const customerId = await createCustomer(t.sql);
    const created = await createAppointment(
      t.db,
      {
        customerId,
        serviceIds: [COUPE],
        staffId: "any",
        startsAt: paris("2026-11-03", "10:00"),
        source: "online",
      },
      NOW,
    );
    expect(created.staffId).toBe(ORHAN);
  });

  it("refuse de réserver chez un coiffeur qui n'est plus habilité", async () => {
    await setServiceStaff(t.db, COUPE, [ORHAN], MANAGER);
    const customerId = await createCustomer(t.sql);
    await expectRefused(
      createAppointment(
        t.db,
        {
          customerId,
          serviceIds: [COUPE],
          staffId: ENES,
          startsAt: paris("2026-11-03", "10:00"),
          source: "online",
        },
        NOW,
      ),
      "staff_not_eligible",
    );
  });

  it("ne laisse habiliter que les membres du rôle de la prestation (R-12, R-18)", async () => {
    await expectRefused(setServiceStaff(t.db, COUPE, [ORHAN, KAAN], MANAGER), "staff_role_mismatch");
    await expectRefused(setServiceStaff(t.db, COUPE_FORMATION, [TAHA, ORHAN], MANAGER), "staff_role_mismatch");
    await expectRefused(
      createService(t.db, { ...BEARD_OIL, staffIds: [ORHAN, TAHA] }, MANAGER),
      "staff_role_mismatch",
    );
    // Rien n'a changé.
    expect((await loadStaffChoices(t.db, [COUPE], "online")).map((c) => c.firstName)).toEqual(["Orhan", "Enes"]);
    expect((await loadCatalog(t.db)).length).toBe(10);
  });

  it("refuse un membre inconnu", async () => {
    await expectRefused(
      setServiceStaff(t.db, COUPE, [ORHAN, "00000000-0000-4000-8000-0000000000ff"], MANAGER),
      "unknown_staff",
    );
  });

  it("refuse de laisser une prestation réservable en ligne sans aucun coiffeur", async () => {
    await expectRefused(setServiceStaff(t.db, COUPE, [], MANAGER), "no_staff_for_service");
    await expectRefused(createService(t.db, { ...BEARD_OIL, staffIds: [] }, MANAGER), "no_staff_for_service");
    expect((await loadStaffChoices(t.db, [COUPE], "online")).length).toBe(2);
  });

  it("accepte une prestation sur appel, ou retirée, sans coiffeur", async () => {
    await createService(t.db, { ...BEARD_OIL, bookableOnline: false, staffIds: [] }, MANAGER);
    await setServiceActive(t.db, COUPE, false, MANAGER);
    await setServiceStaff(t.db, COUPE, [], MANAGER);
    const managed = await listServicesForManager(t.db);
    expect(managed.find((s) => s.id === COUPE)!.staffIds).toEqual([]);
  });

  it("refuse de passer en ligne une prestation sans coiffeur habilité", async () => {
    const id = await createService(t.db, { ...BEARD_OIL, bookableOnline: false, staffIds: [] }, MANAGER);
    await expectRefused(
      updateService(
        t.db,
        id,
        { name: "Soin", category: null, priceCents: 1500, durationMin: 15, bookableOnline: true },
        MANAGER,
      ),
      "no_staff_for_service",
    );
  });

  it("remettre en carte une prestation sans coiffeur habilité est refusé si elle est réservable en ligne", async () => {
    await setServiceActive(t.db, COUPE, false, MANAGER);
    await setServiceStaff(t.db, COUPE, [], MANAGER);
    await expectRefused(setServiceActive(t.db, COUPE, true, MANAGER), "no_staff_for_service");
  });

  it("garde les rendez-vous existants quand une habilitation est retirée (ils seront signalés à traiter, D-57)", async () => {
    const customerId = await createCustomer(t.sql);
    const booked = await createAppointment(
      t.db,
      {
        customerId,
        serviceIds: [COUPE],
        staffId: ENES,
        startsAt: paris("2026-11-03", "10:00"),
        source: "online",
      },
      NOW,
    );
    await setServiceStaff(t.db, COUPE, [ORHAN], MANAGER);
    const [row] = await t.sql`select staff_id, status from appointment where id = ${booked.id}`;
    expect(row).toMatchObject({ staff_id: ENES, status: "confirmed" });
  });

  it("« Modifier » enregistre champs et habilités ensemble : la règle se juge sur l'état final", async () => {
    // Passer « sur appel » en vidant la liste, en une seule fois.
    await updateService(
      t.db,
      COUPE,
      { name: "Coupe homme", category: "Coupes", priceCents: 1800, durationMin: 30, bookableOnline: false, staffIds: [] },
      MANAGER,
    );
    expect((await listServicesForManager(t.db)).find((s) => s.id === COUPE)).toMatchObject({
      bookableOnline: false,
      staffIds: [],
    });
    // Puis repasser en ligne en donnant un coiffeur, en une seule fois.
    await updateService(
      t.db,
      COUPE,
      { name: "Coupe homme", category: "Coupes", priceCents: 1800, durationMin: 30, bookableOnline: true, staffIds: [ENES] },
      MANAGER,
    );
    expect((await loadStaffChoices(t.db, [COUPE], "online")).map((c) => c.firstName)).toEqual(["Enes"]);
  });

  it("si une partie de « Modifier » est refusée, rien n'est enregistré", async () => {
    await expectRefused(
      updateService(
        t.db,
        COUPE,
        { name: "Coupe homme", category: "Coupes", priceCents: 2500, durationMin: 30, bookableOnline: true, staffIds: [KAAN] },
        MANAGER,
      ),
      "staff_role_mismatch",
    );
    expect((await loadCatalog(t.db)).find((s) => s.id === COUPE)!.priceCents).toBe(1800);
    const [{ count }] = await t.sql`select count(*)::int as count from audit_log`;
    expect(count).toBe(0);
  });

  it("la liste du gérant propose, pour chaque prestation, les membres actifs de son rôle", async () => {
    const managed = await listServicesForManager(t.db);
    const coupe = managed.find((s) => s.id === COUPE)!;
    expect(coupe.staffIds.sort()).toEqual([ENES, ORHAN].sort());
    expect(coupe.candidates.map((c) => c.firstName)).toEqual(["Orhan", "Enes"]);
    const formation = managed.find((s) => s.id === COUPE_FORMATION)!;
    expect(formation.candidates.map((c) => c.firstName)).toEqual(["Kaan", "Taha"]);
  });
});

describe("journal : chaque changement de la carte est inscrit (principe 6)", () => {
  it("écrit l'auteur (gérant), l'action, l'avant et l'après", async () => {
    await updateService(
      t.db,
      COUPE,
      { name: "Coupe homme", category: "Coupes", priceCents: 2000, durationMin: 30, bookableOnline: true },
      MANAGER,
    );
    const [entry] = await t.sql`
      select actor_type, actor_id, action, entity, entity_id, before, after
      from audit_log where action = 'service.updated'`;
    expect(entry).toMatchObject({
      actor_type: "manager",
      actor_id: MANAGER,
      entity: "service",
      entity_id: COUPE,
    });
    expect(entry.before).toMatchObject({ priceCents: 1800 });
    expect(entry.after).toMatchObject({ priceCents: 2000 });
  });

  it("couvre la création, le retrait, la remise en carte, les habilitations et le déplacement", async () => {
    const id = await createService(t.db, BEARD_OIL, MANAGER);
    await setServiceStaff(t.db, id, [ORHAN], MANAGER);
    await moveService(t.db, id, "up", MANAGER);
    await setServiceActive(t.db, id, false, MANAGER);
    await setServiceActive(t.db, id, true, MANAGER);
    const actions = (await t.sql`select action from audit_log order by id`).map((r) => r.action);
    expect(actions).toEqual([
      "service.created",
      "service.staff_changed",
      "service.moved",
      "service.deactivated",
      "service.reactivated",
    ]);
  });

  it("n'écrit rien quand rien ne change", async () => {
    await setServiceStaff(t.db, COUPE, [ORHAN, ENES], MANAGER);
    await updateService(
      t.db,
      COUPE,
      { name: "Coupe homme", category: "Coupes", priceCents: 1800, durationMin: 30, bookableOnline: true },
      MANAGER,
    );
    await setServiceActive(t.db, COUPE, true, MANAGER);
    const [{ count }] = await t.sql`select count(*)::int as count from audit_log`;
    expect(count).toBe(0);
  });

  it("un refus n'écrit rien au journal", async () => {
    await createService(t.db, { ...BEARD_OIL, durationMin: 20 }, MANAGER).catch(() => {});
    const [{ count }] = await t.sql`select count(*)::int as count from audit_log`;
    expect(count).toBe(0);
  });
});
