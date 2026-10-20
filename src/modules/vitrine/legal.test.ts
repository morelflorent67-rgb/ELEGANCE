import { describe, expect, it } from "vitest";
import { LEGAL_SLUGS, legalDocument, placeholdersOf } from "./legal";

const rules = {
  changeCutoffHours: 48,
  maxUpcomingPerCustomer: 2,
  noShowBlockThreshold: 2,
  reminderHours: 72,
  reviewInvitations: false,
};

const text = (slug: (typeof LEGAL_SLUGS)[number], r = rules) =>
  legalDocument(slug, r)
    .sections.map((s) => s.body)
    .join("\n");

describe("pages légales : trois documents, un sommaire numéroté", () => {
  it("chaque document a un titre, un libellé d'onglet et des sections numérotées avec ancre", () => {
    for (const slug of LEGAL_SLUGS) {
      const doc = legalDocument(slug, rules);
      expect(doc.title.length).toBeGreaterThan(5);
      expect(doc.tab.length).toBeGreaterThan(3);
      expect(doc.sections.length).toBeGreaterThanOrEqual(5);
      doc.sections.forEach((section, index) => {
        expect(section.num).toBe(String(index + 1).padStart(2, "0"));
        expect(section.id).toBe(`s${section.num}`);
      });
    }
  });
});

describe("les conditions citent les règles du salon, lues dans les réglages", () => {
  it("R-25, R-30, R-32 : 2 rendez-vous à venir, 48 h pour modifier ou annuler", () => {
    const conditions = text("conditions");
    expect(conditions).toContain("au maximum 2 rendez-vous à venir");
    expect(conditions).toContain("jusqu'à 48 h avant son début");
    expect(conditions).toContain("03 88 97 74 68");
  });

  it("un réglage différent change le texte (pas de chiffre en dur)", () => {
    const conditions = text("conditions", {
      ...rules,
      changeCutoffHours: 24,
      maxUpcomingPerCustomer: 3,
      noShowBlockThreshold: 3,
    });
    expect(conditions).toContain("au maximum 3 rendez-vous à venir");
    expect(conditions).toContain("jusqu'à 24 h avant son début");
    expect(conditions).toContain("3 rendez-vous non honorés");
    expect(conditions).not.toContain("48 h");
  });

  it("R-52 : le blocage est décidé par le gérant, jamais automatique (D-35)", () => {
    expect(text("conditions")).toMatch(/peut décider de suspendre/);
  });

  it("D-07 : le paiement se fait sur place, aucun paiement en ligne n'est évoqué", () => {
    const conditions = text("conditions");
    expect(conditions).toContain("sur place");
    expect(conditions).not.toMatch(/paiement en ligne/i);
  });

  it("R-17, D-19 : les prestations sur appel se réservent par téléphone", () => {
    expect(text("conditions")).toMatch(/sur appel/);
  });
});

describe("la politique de confidentialité décrit ce que le site fait vraiment", () => {
  const privacy = text("confidentialite");

  it("données collectées (R-70) et mot de passe jamais lisible", () => {
    for (const word of ["prénom", "nom", "téléphone", "email", "mot de passe"]) {
      expect(privacy).toContain(word);
    }
    expect(privacy).toMatch(/jamais lisible/);
  });

  it("D-43 : la suppression du compte efface l'identité et garde les rendez-vous passés sans identité", () => {
    expect(privacy).toMatch(/effacés/);
    expect(privacy).toMatch(/sans aucune information/);
  });

  it("R-61 : le rappel part 72 h avant, lu dans les réglages", () => {
    expect(privacy).toContain("3 jours");
    const other = text("confidentialite", { ...rules, reminderHours: 48 });
    expect(other).toContain("2 jours");
  });

  it("R-64 : l'invitation à donner son avis n'est citée que si le salon l'a lancée", () => {
    expect(privacy).not.toContain("donner votre avis");
    const launched = text("confidentialite", { ...rules, reviewInvitations: true });
    expect(launched).toContain("le lendemain d'un rendez-vous, une invitation à donner votre avis");
    expect(launched).toContain("permet de ne plus en recevoir");
  });

  it("cookies : seulement les cookies nécessaires, ni publicité ni mesure d'audience", () => {
    expect(privacy).toMatch(/cookies nécessaires/);
    expect(privacy).toMatch(/ni publicité ni mesure d'audience|aucun cookie publicitaire/i);
  });

  it("les prestataires sont nommés : hébergement, base de données, emails", () => {
    for (const name of ["Vercel", "Supabase", "Brevo"]) expect(privacy).toContain(name);
  });
});

describe("placeholdersOf : ce que le salon doit encore fournir", () => {
  it("liste les champs entre crochets, sans doublon, pour tous les documents", () => {
    const missing = placeholdersOf(rules);
    expect(missing).toContain("[Forme juridique]");
    expect(missing).toContain("[Numéro de SIRET]");
    expect(new Set(missing).size).toBe(missing.length);
  });
});
