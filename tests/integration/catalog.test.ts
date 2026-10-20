import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadCatalog, loadStaffChoices } from "../../src/modules/catalog";
import {
  COLORATION,
  COUPE,
  COUPE_FORMATION,
  ENES,
  KAAN,
  ORHAN,
  TAHA,
  TAILLAGE_BARBE,
  connectTestDb,
} from "./helpers";

const t = connectTestDb();
beforeEach(() => t.reset());
afterAll(() => t.close());

describe("la carte affichée à l'étape 1", () => {
  it("liste les 10 prestations avec prix, durée, catégorie et réservabilité en ligne", async () => {
    const catalog = await loadCatalog(t.db);
    expect(catalog).toHaveLength(10);
    expect(catalog[0]).toMatchObject({
      name: "Coupe homme",
      category: "Coupes",
      priceCents: 1800,
      durationMin: 30,
      performedBy: "barber",
      bookableOnline: true,
    });
    const byName = Object.fromEntries(catalog.map((s) => [s.name, s]));
    expect(byName["Coupe, tarif formation"]).toMatchObject({
      performedBy: "apprentice",
      durationMin: 45,
    });
    expect(byName["Soin du visage à la vapeur"].bookableOnline).toBe(true); // D-36
    expect(byName["Tribal"].bookableOnline).toBe(false); // D-36
    expect(byName["Coloration"].bookableOnline).toBe(false); // R-17 : visible, sur appel
    expect(catalog.filter((s) => !s.bookableOnline).map((s) => s.name)).toEqual([
      "Coloration",
      "Tribal",
      "Défrisage",
      "Lissage brésilien",
    ]);
  });

  it("garde les prestations sur appel dans la carte (R-17)", async () => {
    const names = (await loadCatalog(t.db)).map((s) => s.name);
    expect(names).toContain("Coloration");
    expect(names).toContain("Lissage brésilien");
  });

  it("n'affiche plus une prestation retirée (R-16) et suit les changements de tarif du gérant", async () => {
    await t.sql`update service set active = false where id = ${TAILLAGE_BARBE}`;
    await t.sql`update service set price_cents = 2000 where id = ${COUPE}`;
    const catalog = await loadCatalog(t.db);
    expect(catalog.map((s) => s.name)).not.toContain("Taillage barbe");
    expect(catalog.find((s) => s.id === COUPE)!.priceCents).toBe(2000);
  });

  it("classe les prestations dans l'ordre d'affichage de la base", async () => {
    await t.sql`update service set sort_order = 99 where id = ${COUPE}`;
    expect((await loadCatalog(t.db)).at(-1)!.id).toBe(COUPE);
  });
});

describe("R-13, R-20 : coiffeurs proposés à l'étape « Avec qui ? »", () => {
  it("propose les coiffeurs pour une prestation coiffeur, les apprentis pour un tarif formation", async () => {
    const barbers = await loadStaffChoices(t.db, [COUPE], "online");
    expect(barbers.map((s) => s.id)).toEqual([ORHAN, ENES]);
    expect(barbers.map((s) => s.firstName)).toEqual(["Orhan", "Enes"]);
    const apprentices = await loadStaffChoices(t.db, [COUPE_FORMATION], "online");
    expect(apprentices.map((s) => s.id)).toEqual([KAAN, TAHA]);
    expect(apprentices[0].role).toBe("apprentice");
  });

  it("ne propose que les coiffeurs habilités pour toutes les prestations", async () => {
    await t.sql`delete from service_staff where service_id = ${TAILLAGE_BARBE} and staff_id = ${ORHAN}`;
    const choices = await loadStaffChoices(t.db, [COUPE, TAILLAGE_BARBE], "online");
    expect(choices.map((s) => s.id)).toEqual([ENES]);
  });

  it("ignore un coiffeur désactivé", async () => {
    await t.sql`update staff set active = false where id = ${ENES}`;
    expect((await loadStaffChoices(t.db, [COUPE], "online")).map((s) => s.id)).toEqual([ORHAN]);
  });

  it("refuse en ligne une prestation sur appel (R-17) et le mélange des catégories (R-18)", async () => {
    await expect(loadStaffChoices(t.db, [COLORATION], "online")).rejects.toMatchObject({
      code: "not_bookable_online",
    });
    await expect(loadStaffChoices(t.db, [COUPE, COUPE_FORMATION], "online")).rejects.toMatchObject({
      code: "mixed_categories",
    });
  });
});
