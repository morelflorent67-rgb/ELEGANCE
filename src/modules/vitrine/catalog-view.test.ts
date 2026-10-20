import { describe, expect, it } from "vitest";
import type { CatalogService } from "@/modules/catalog";
import { callOnlyNames, groupCatalog, highlights, joinFr, performerNote } from "./catalog-view";

const svc = (over: Partial<CatalogService> & { name: string }): CatalogService => ({
  id: over.name,
  category: "Coupes",
  priceCents: 1800,
  durationMin: 30,
  performedBy: "barber",
  bookableOnline: true,
  ...over,
});

const carte: CatalogService[] = [
  svc({ name: "Coupe homme" }),
  svc({ name: "Coupe & taille de barbe", priceCents: 2800 }),
  svc({ name: "Coupe, tarif formation", performedBy: "apprentice", durationMin: 45 }),
  svc({ name: "Taillage barbe", category: "Barbe et soin", durationMin: 15 }),
  svc({ name: "Soin du visage à la vapeur", category: "Barbe et soin" }),
  svc({ name: "Tribal", category: "Techniques", bookableOnline: false }),
  svc({ name: "Coloration", category: "Techniques", bookableOnline: false }),
];

describe("groupCatalog : les groupes de la page Prestations", () => {
  it("garde l'ordre de la carte et un identifiant d'ancre lisible", () => {
    const groups = groupCatalog(carte);
    expect(groups.map((g) => [g.title, g.anchor, g.items.length])).toEqual([
      ["Coupes", "coupes", 3],
      ["Barbe et soin", "barbe-et-soin", 2],
      ["Techniques", "techniques", 2],
    ]);
  });

  it("une prestation sans catégorie tombe dans « Autres » (R-17 : rien n'est masqué)", () => {
    const groups = groupCatalog([svc({ name: "Rasage", category: "Autres" })]);
    expect(groups[0].title).toBe("Autres");
  });

  it("la carte vide donne zéro groupe", () => {
    expect(groupCatalog([])).toEqual([]);
  });
});

describe("prestations sur appel (R-17, D-36)", () => {
  it("liste celles qui ne se réservent pas en ligne, avec leur prix et leur durée conservés", () => {
    expect(callOnlyNames(carte)).toEqual(["Tribal", "Coloration"]);
    expect(groupCatalog(carte)[2].items.every((i) => !i.bookableOnline)).toBe(true);
  });
});

describe("highlights : les prestations phares de l'accueil", () => {
  it("prend les trois premières réservables en ligne, réalisées par les coiffeurs", () => {
    expect(highlights(carte).map((s) => s.name)).toEqual([
      "Coupe homme",
      "Coupe & taille de barbe",
      "Taillage barbe",
    ]);
  });

  it("moins de trois prestations : on affiche ce qui existe", () => {
    expect(highlights([carte[0]])).toHaveLength(1);
  });
});

describe("performerNote : qui réalise quoi (R-12)", () => {
  const team = [
    { firstName: "Orhan", role: "barber" as const },
    { firstName: "Enes", role: "barber" as const },
    { firstName: "Kaan", role: "apprentice" as const },
    { firstName: "Taha", role: "apprentice" as const },
  ];

  it("cite les apprentis et les coiffeurs actifs", () => {
    expect(performerNote(team)).toBe(
      "Tarif formation : réalisé par Kaan ou Taha, nos apprentis. Toutes les autres prestations sont réalisées par Orhan ou Enes.",
    );
  });

  it("s'adapte à un seul apprenti, et se tait sans apprenti", () => {
    expect(performerNote([team[0], team[1], team[2]])).toBe(
      "Tarif formation : réalisé par Kaan, notre apprenti. Toutes les autres prestations sont réalisées par Orhan ou Enes.",
    );
    expect(performerNote(team.slice(0, 2))).toBeNull();
  });
});

describe("joinFr", () => {
  it("énumère à la française", () => {
    expect(joinFr([])).toBe("");
    expect(joinFr(["Tribal"])).toBe("Tribal");
    expect(joinFr(["Tribal", "Coloration"])).toBe("Tribal et coloration");
    expect(joinFr(["Tribal", "Coloration", "Lissage brésilien"])).toBe(
      "Tribal, coloration et lissage brésilien",
    );
  });
});
