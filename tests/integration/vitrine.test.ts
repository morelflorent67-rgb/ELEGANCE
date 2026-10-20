import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { service, staff } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { addClosure, setOpeningHours } from "../../src/modules/schedule/manage";
import { readVitrine } from "../../src/modules/vitrine/load";
import { groupWeekHours } from "../../src/modules/vitrine/hours";
import { callOnlyNames, groupCatalog } from "../../src/modules/vitrine/catalog-view";
import { KAAN, NOW, SOIN_VISAGE, TRIBAL, connectTestDb } from "./helpers";

const t = connectTestDb();
beforeEach(() => t.reset());
afterAll(() => t.close());

// La vitrine montre la carte, l'équipe et les horaires de la base : la même source que la réservation.
describe("lecture de la vitrine", () => {
  it("la carte de départ : 10 prestations en 3 groupes, soin en ligne et tribal sur appel (D-36)", async () => {
    const data = await readVitrine(t.db, NOW);
    expect(data.services).toHaveLength(10);
    expect(groupCatalog(data.services).map((g) => g.title)).toEqual([
      "Coupes",
      "Barbe et soin",
      "Techniques",
    ]);
    const soin = data.services.find((s) => s.id === SOIN_VISAGE)!;
    const tribal = data.services.find((s) => s.id === TRIBAL)!;
    expect(soin.bookableOnline).toBe(true);
    expect(tribal.bookableOnline).toBe(false);
    expect(callOnlyNames(data.services)).toEqual(["Coloration", "Tribal", "Défrisage", "Lissage brésilien"]);
  });

  it("R-17 : une prestation sur appel garde son prix et sa durée", async () => {
    const { services } = await readVitrine(t.db, NOW);
    const tribal = services.find((s) => s.id === TRIBAL)!;
    expect(tribal.priceCents).toBe(1000);
    expect(tribal.durationMin).toBe(30);
  });

  it("R-16 : une prestation retirée de la carte disparaît de la vitrine", async () => {
    await t.db.update(service).set({ active: false }).where(eq(service.id, SOIN_VISAGE));
    const { services } = await readVitrine(t.db, NOW);
    expect(services).toHaveLength(9);
    expect(services.some((s) => s.id === SOIN_VISAGE)).toBe(false);
  });

  it("l'équipe : seulement les membres actifs, dans l'ordre d'affichage", async () => {
    let { team } = await readVitrine(t.db, NOW);
    expect(team.map((m) => m.firstName)).toEqual(["Orhan", "Enes", "Kaan", "Taha"]);
    await t.db.update(staff).set({ active: false }).where(eq(staff.id, KAAN));
    ({ team } = await readVitrine(t.db, NOW));
    expect(team.map((m) => m.firstName)).toEqual(["Orhan", "Enes", "Taha"]);
  });

  it("R-01 : les horaires de départ sont mardi à samedi, 10 h–12 h et 13 h–19 h", async () => {
    const { week } = await readVitrine(t.db, NOW);
    expect(groupWeekHours(week)).toEqual([
      { label: "Mardi – samedi", closed: false, ranges: ["10 h – 12 h", "13 h – 19 h"] },
      { label: "Dimanche, lundi", closed: true, ranges: [] },
    ]);
  });

  it("R-03 : un changement d'horaires du gérant se voit tout de suite", async () => {
    const { week } = await readVitrine(t.db, NOW);
    const shorter = { ...week, 6: [{ opensAt: "10:00", closesAt: "17:00" }] };
    await setOpeningHours(t.db, shorter, "11111111-1111-4111-8111-111111111111");
    const after = await readVitrine(t.db, NOW);
    expect(groupWeekHours(after.week).map((r) => r.label)).toContain("Samedi");
  });

  it("R-03 : une fermeture exceptionnelle à venir est annoncée, une fermeture passée non", async () => {
    await addClosure(
      t.db,
      { startsOn: "2026-12-24", endsOn: "2026-12-26", reason: "Fêtes" },
      "11111111-1111-4111-8111-111111111111",
      NOW,
    );
    const { closures } = await readVitrine(t.db, NOW);
    expect(closures).toEqual([{ startsOn: "2026-12-24", endsOn: "2026-12-26", reason: "Fêtes" }]);
  });
});
