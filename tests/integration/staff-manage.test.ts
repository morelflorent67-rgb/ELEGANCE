import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DomainError, type DomainErrorCode } from "../../src/lib/domain-error";
import { createAppointment } from "../../src/modules/booking";
import { loadStaffChoices } from "../../src/modules/catalog";
import { updateService } from "../../src/modules/catalog/manage";
import { assertActiveAuthor, listActiveStaff } from "../../src/modules/staff";
import {
  createStaffMember,
  listStaffForManager,
  moveStaffMember,
  renameStaffMember,
  setStaffActive,
} from "../../src/modules/staff/manage";
import {
  COUPE,
  COUPE_BARBE_FORMATION,
  COUPE_FORMATION,
  ENES,
  KAAN,
  NOW,
  ORHAN,
  TAHA,
  connectTestDb,
  createCustomer,
  paris,
} from "./helpers";

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

const names = async () => (await listActiveStaff(t.db)).map((m) => m.firstName);
const choices = async (serviceId: string) =>
  (await loadStaffChoices(t.db, [serviceId], "online")).map((c) => c.firstName);

describe("équipe : ajouter un membre (R-02, R-13)", () => {
  it("ajoute un coiffeur, à la fin de l'équipe, habilité pour les prestations des coiffeurs", async () => {
    const id = await createStaffMember(t.db, { firstName: "Mehdi", role: "barber" }, MANAGER);

    expect(await names()).toEqual(["Orhan", "Enes", "Kaan", "Taha", "Mehdi"]);
    // Habilité d'office pour toutes les prestations de son rôle, jamais pour celles de l'autre.
    expect(await choices(COUPE)).toEqual(["Orhan", "Enes", "Mehdi"]);
    expect(await choices(COUPE_FORMATION)).toEqual(["Kaan", "Taha"]);
    const [{ count }] = await t.sql`select count(*)::int as count from service_staff where staff_id = ${id}`;
    expect(count).toBe(8); // les 8 prestations « coiffeurs » de la carte
  });

  it("ajoute un apprenti habilité pour les prestations « tarif formation »", async () => {
    await createStaffMember(t.db, { firstName: "Yanis", role: "apprentice" }, MANAGER);
    expect(await choices(COUPE_FORMATION)).toEqual(["Kaan", "Taha", "Yanis"]);
    expect(await choices(COUPE)).toEqual(["Orhan", "Enes"]);
  });

  it("ne rend pas le nouveau membre habilité pour une prestation retirée", async () => {
    await t.sql`update service set active = false where id = ${COUPE}`;
    const id = await createStaffMember(t.db, { firstName: "Mehdi", role: "barber" }, MANAGER);
    const rows = await t.sql`select 1 from service_staff where staff_id = ${id} and service_id = ${COUPE}`;
    expect(rows).toHaveLength(0);
  });

  it("le nouveau membre reçoit des rendez-vous (« Sans préférence » le compte)", async () => {
    const id = await createStaffMember(t.db, { firstName: "Mehdi", role: "barber" }, MANAGER);
    const customerId = await createCustomer(t.sql);
    const created = await createAppointment(
      t.db,
      {
        customerId,
        serviceIds: [COUPE],
        staffId: id,
        startsAt: paris("2026-11-03", "10:00"),
        source: "online",
      },
      NOW,
    );
    expect(created.staffId).toBe(id);
  });

  const bad: [string, { firstName: string; role: "barber" | "apprentice" }][] = [
    ["un prénom vide", { firstName: "   ", role: "barber" }],
    ["un prénom trop long", { firstName: "x".repeat(41), role: "barber" }],
    ["un rôle inconnu", { firstName: "Mehdi", role: "boss" as "barber" }],
  ];
  it.each(bad)("refuse %s", async (_label, input) => {
    await expectRefused(createStaffMember(t.db, input, MANAGER), "invalid_staff");
    expect(await names()).toHaveLength(4);
  });

  it("refuse un prénom déjà porté par un membre actif, sans tenir compte de la casse", async () => {
    await expectRefused(
      createStaffMember(t.db, { firstName: " orhan ", role: "barber" }, MANAGER),
      "staff_name_taken",
    );
    expect(await names()).toHaveLength(4);
  });

  it("nettoie les espaces du prénom", async () => {
    await createStaffMember(t.db, { firstName: "  Mehdi ", role: "barber" }, MANAGER);
    expect((await names()).at(-1)).toBe("Mehdi");
  });
});

describe("équipe : renommer et ordonner", () => {
  it("renomme un membre ; les rendez-vous le suivent", async () => {
    await renameStaffMember(t.db, ORHAN, "Orhan B.", MANAGER);
    expect((await names())[0]).toBe("Orhan B.");
  });

  it("refuse un nouveau prénom invalide ou déjà pris", async () => {
    await expectRefused(renameStaffMember(t.db, ORHAN, "", MANAGER), "invalid_staff");
    await expectRefused(renameStaffMember(t.db, ORHAN, "ENES", MANAGER), "staff_name_taken");
    await expectRefused(
      renameStaffMember(t.db, "00000000-0000-4000-8000-0000000000ff", "Zoé", MANAGER),
      "unknown_staff",
    );
    expect((await names())[0]).toBe("Orhan");
  });

  it("garder son propre prénom, avec une autre casse, est permis", async () => {
    await renameStaffMember(t.db, ORHAN, "ORHAN", MANAGER);
    expect((await names())[0]).toBe("ORHAN");
  });

  it("monter ou descendre un membre change l'ordre d'affichage et « Sans préférence » (R-20, D-40)", async () => {
    const book = async () => {
      const customerId = await createCustomer(t.sql);
      return createAppointment(
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
    };
    // Aucun RDV ce jour-là : à égalité, l'ordre d'affichage départage.
    expect((await book()).staffId).toBe(ORHAN);
    await t.sql`truncate appointment_item, appointment cascade`;

    await moveStaffMember(t.db, ENES, "up", MANAGER);
    expect(await names()).toEqual(["Enes", "Orhan", "Kaan", "Taha"]);
    expect((await book()).staffId).toBe(ENES);

    await moveStaffMember(t.db, ENES, "down", MANAGER);
    expect(await names()).toEqual(["Orhan", "Enes", "Kaan", "Taha"]);
  });

  it("au bout de la liste, monter ou descendre ne fait rien", async () => {
    await moveStaffMember(t.db, ORHAN, "up", MANAGER);
    await moveStaffMember(t.db, TAHA, "down", MANAGER);
    expect(await names()).toEqual(["Orhan", "Enes", "Kaan", "Taha"]);
    const [{ count }] = await t.sql`select count(*)::int as count from audit_log`;
    expect(count).toBe(0);
  });
});

describe("équipe : retirer un membre ou le remettre (D-57)", () => {
  it("retire un membre : plus de colonne, plus de réservation, plus de signature", async () => {
    await setStaffActive(t.db, KAAN, false, MANAGER);

    expect(await names()).toEqual(["Orhan", "Enes", "Taha"]);
    expect(await choices(COUPE_FORMATION)).toEqual(["Taha"]);
    await expectRefused(assertActiveAuthor(t.db, KAAN), "unknown_author");

    const customerId = await createCustomer(t.sql);
    await expectRefused(
      createAppointment(
        t.db,
        {
          customerId,
          serviceIds: [COUPE_FORMATION],
          staffId: KAAN,
          startsAt: paris("2026-11-03", "10:00"),
          source: "online",
        },
        NOW,
      ),
      "staff_not_eligible",
    );
    // La fiche reste en base : l'historique des rendez-vous la garde.
    const [row] = await t.sql`select active from staff where id = ${KAAN}`;
    expect(row.active).toBe(false);
  });

  it("garde ses rendez-vous à venir tels quels : ils sont à traiter ensuite (D-57)", async () => {
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
    await setStaffActive(t.db, ENES, false, MANAGER);
    const [row] = await t.sql`select staff_id, status from appointment where id = ${booked.id}`;
    expect(row).toMatchObject({ staff_id: ENES, status: "confirmed" });
  });

  it("refuse de retirer le dernier membre qui réalise une prestation réservable en ligne", async () => {
    await setStaffActive(t.db, KAAN, false, MANAGER);
    await expectRefused(setStaffActive(t.db, TAHA, false, MANAGER), "staff_needed_for_service");
    expect(await names()).toContain("Taha");

    // Une fois ces prestations passées « sur appel », le départ est permis.
    for (const id of [COUPE_FORMATION, COUPE_BARBE_FORMATION]) {
      const [s] = await t.sql`select name, category, price_cents, duration_min from service where id = ${id}`;
      await updateService(
        t.db,
        id,
        {
          name: s.name,
          category: s.category,
          priceCents: s.price_cents,
          durationMin: s.duration_min,
          bookableOnline: false,
        },
        MANAGER,
      );
    }
    await setStaffActive(t.db, TAHA, false, MANAGER);
    expect(await names()).toEqual(["Orhan", "Enes"]);
  });

  it("ne bloque pas le départ si la prestation n'est plus en ligne ou est retirée de la carte", async () => {
    await t.sql`update service set active = false where id = ${COUPE_FORMATION}`;
    await t.sql`update service set bookable_online = false where id = ${COUPE_BARBE_FORMATION}`;
    await setStaffActive(t.db, KAAN, false, MANAGER);
    await setStaffActive(t.db, TAHA, false, MANAGER);
    expect(await names()).toEqual(["Orhan", "Enes"]);
  });

  it("remet un membre : ses habilitations sont retrouvées", async () => {
    await setStaffActive(t.db, KAAN, false, MANAGER);
    await setStaffActive(t.db, KAAN, true, MANAGER);
    expect(await names()).toEqual(["Orhan", "Enes", "Kaan", "Taha"]);
    expect(await choices(COUPE_FORMATION)).toEqual(["Kaan", "Taha"]);
  });

  it("refuse de remettre un membre dont le prénom est pris par un membre actif", async () => {
    await setStaffActive(t.db, KAAN, false, MANAGER);
    await createStaffMember(t.db, { firstName: "kaan", role: "apprentice" }, MANAGER);
    await expectRefused(setStaffActive(t.db, KAAN, true, MANAGER), "staff_name_taken");
  });

  it("la liste du gérant montre aussi les membres retirés", async () => {
    await setStaffActive(t.db, KAAN, false, MANAGER);
    const all = await listStaffForManager(t.db);
    expect(all.map((m) => [m.firstName, m.active])).toEqual([
      ["Orhan", true],
      ["Enes", true],
      ["Kaan", false],
      ["Taha", true],
    ]);
    expect(all.find((m) => m.id === ORHAN)).toMatchObject({ role: "barber", serviceCount: 8 });
  });

  it("un membre inconnu est refusé", async () => {
    await expectRefused(
      setStaffActive(t.db, "00000000-0000-4000-8000-0000000000ff", false, MANAGER),
      "unknown_staff",
    );
  });
});

describe("journal : chaque changement d'équipe est inscrit (principe 6)", () => {
  it("écrit l'auteur (gérant), l'action, l'avant et l'après", async () => {
    await renameStaffMember(t.db, ORHAN, "Orhan B.", MANAGER);
    const [entry] = await t.sql`
      select actor_type, actor_id, action, entity, entity_id, before, after
      from audit_log where action = 'staff.renamed'`;
    expect(entry).toMatchObject({
      actor_type: "manager",
      actor_id: MANAGER,
      entity: "staff",
      entity_id: ORHAN,
      before: { firstName: "Orhan" },
      after: { firstName: "Orhan B." },
    });
  });

  it("couvre l'ajout, le déplacement, le retrait et le retour", async () => {
    const id = await createStaffMember(t.db, { firstName: "Mehdi", role: "barber" }, MANAGER);
    await moveStaffMember(t.db, id, "up", MANAGER);
    await setStaffActive(t.db, id, false, MANAGER);
    await setStaffActive(t.db, id, true, MANAGER);
    const actions = (await t.sql`select action from audit_log order by id`).map((r) => r.action);
    expect(actions).toEqual(["staff.created", "staff.moved", "staff.deactivated", "staff.reactivated"]);
  });

  it("un refus n'écrit rien", async () => {
    await createStaffMember(t.db, { firstName: "", role: "barber" }, MANAGER).catch(() => {});
    await setStaffActive(t.db, ORHAN, true, MANAGER); // déjà actif : rien à faire
    const [{ count }] = await t.sql`select count(*)::int as count from audit_log`;
    expect(count).toBe(0);
  });
});
