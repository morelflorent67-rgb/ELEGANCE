import { describe, expect, it } from "vitest";
import type { CatalogService } from "@/modules/catalog";
import { jsonLdScript, salonJsonLd } from "./seo";
import type { VitrineData } from "./load";

const day = [
  { opensAt: "10:00", closesAt: "12:00" },
  { opensAt: "13:00", closesAt: "19:00" },
];
const service = (name: string, priceCents: number): CatalogService => ({
  id: name,
  name,
  category: "Coupes",
  priceCents,
  durationMin: 30,
  performedBy: "barber",
  bookableOnline: true,
});

const data: VitrineData = {
  rules: {
    changeCutoffHours: 48,
    maxUpcomingPerCustomer: 2,
    noShowBlockThreshold: 2,
    reminderHours: 72,
  },
  services: [
    service("Coupe homme", 1800),
    service("Lissage brésilien", 6000),
    service("Tribal", 1000),
  ],
  team: [],
  week: { 1: [], 2: day, 3: day, 4: day, 5: day, 6: day, 7: [] },
  closures: [],
};

describe("salonJsonLd : données structurées du salon (référencement local)", () => {
  const ld = salonJsonLd(data, "https://exemple.fr");

  it("décrit un salon de coiffure avec son adresse et son téléphone", () => {
    expect(ld["@type"]).toBe("HairSalon");
    expect(ld.name).toBe("Elegance Strasbourg");
    expect(ld.url).toBe("https://exemple.fr");
    expect(ld.telephone).toBe("+33388977468");
    expect(ld.address).toEqual({
      "@type": "PostalAddress",
      streetAddress: "162 route de Bischwiller",
      postalCode: "67300",
      addressLocality: "Schiltigheim",
      addressCountry: "FR",
    });
  });

  it("R-01 : les horaires viennent de la base (une entrée par plage)", () => {
    expect(ld.openingHoursSpecification).toHaveLength(10);
  });

  it("les prix de la carte et la fourchette de prix, sans prestation retirée", () => {
    expect(ld.priceRange).toBe("10 € - 60 €");
    const offers = ld.hasOfferCatalog.itemListElement;
    expect(offers.map((o) => o.itemOffered.name)).toEqual([
      "Coupe homme",
      "Lissage brésilien",
      "Tribal",
    ]);
    expect(offers[0]).toMatchObject({ price: "18.00", priceCurrency: "EUR" });
  });

  it("renvoie vers les réseaux du salon", () => {
    expect(ld.sameAs).toEqual([
      "https://www.instagram.com/elegance_strasbourg",
      "https://www.snapchat.com/add/barb.hair",
    ]);
  });

  it("carte vide : pas de fourchette de prix ni de catalogue qui mentent", () => {
    const empty = salonJsonLd({ ...data, services: [] }, "https://exemple.fr");
    expect(empty.priceRange).toBeUndefined();
    expect(empty.hasOfferCatalog.itemListElement).toEqual([]);
  });
});

describe("jsonLdScript", () => {
  it("échappe < pour qu'aucun texte ne puisse fermer la balise script", () => {
    const text = jsonLdScript({ name: "</script><b>" });
    expect(text).not.toContain("<");
    expect(JSON.parse(text)).toEqual({ name: "</script><b>" });
  });
});
