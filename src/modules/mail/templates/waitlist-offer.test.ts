import { describe, expect, it } from "vitest";
import { renderWaitlistOfferEmail, type WaitlistOfferData } from "./waitlist-offer";

const base: WaitlistOfferData = {
  firstName: "Karim",
  startsAt: new Date("2026-10-24T13:30:00Z"), // samedi 24 octobre 2026, 15 h 30 à Paris
  endsAt: new Date("2026-10-24T14:00:00Z"),
  expiresAt: new Date("2026-10-24T13:07:00Z"),
  holdMinutes: 15,
  items: [{ name: "Coupe & taille de barbe" }],
  totalPriceCents: 2800,
  staffFirstName: "Orhan",
  offerUrl: "https://exemple.fr/attente/abc",
  cutoffHours: 1,
  maxUpcoming: 5,
  logoUrl: "https://exemple.fr/email/logo.png",
};

describe("email « Une place s'est libérée » (D-99, D-100)", () => {
  it("reprend l'objet, l'aperçu et le contenu de la maquette", () => {
    const email = renderWaitlistOfferEmail(base);
    expect(email.subject).toBe("Une place s'est libérée, samedi 24 octobre à 15:30");
    expect(email.preheader).toBe(
      "Gardée pour vous 15 minutes, jusqu'à 15:07. Confirmez en un geste.",
    );
    expect(email.html).toContain("Une place s'est libérée.");
    expect(email.html).toContain("Bonjour Karim, une place vient de se libérer avec Orhan");
    expect(email.html).toContain("Coupe &amp; taille de barbe");
    expect(email.html).toContain("28 €");
    expect(email.html).toContain("Gardée pour vous jusqu&#39;à 15:07");
    expect(email.html).toContain("proposée à la personne suivante");
  });

  it("a un seul grand bouton « Prendre cette place » vers la page de l'offre", () => {
    const { html, text } = renderWaitlistOfferEmail(base);
    expect(html).toContain("Prendre cette place");
    expect(html).toContain("Pas cette fois, je reste sur la liste");
    expect(html).toContain("Quitter la liste d'attente");
    expect(text).toContain("Prendre cette place : https://exemple.fr/attente/abc");
  });

  it("rappelle la limite de rendez-vous à venir et le délai de modification (réglages)", () => {
    const { html } = renderWaitlistOfferEmail({ ...base, maxUpcoming: 3, cutoffHours: 2 });
    expect(html).toContain("jusqu&#39;à 2 h avant");
    expect(html).toContain("3 rendez-vous à venir au maximum");
  });

  it("se lit sans prénom et protège le HTML", () => {
    expect(renderWaitlistOfferEmail({ ...base, firstName: null }).html).toContain(
      "Une place vient de se libérer",
    );
    expect(renderWaitlistOfferEmail({ ...base, firstName: "<b>x</b>" }).html).not.toContain(
      "<b>x</b>",
    );
  });
});
