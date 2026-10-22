import { describe, expect, it } from "vitest";
import { renderWinbackEmail, type WinbackData } from "./winback";

const base: WinbackData = {
  firstName: "Thomas",
  lastVisit: new Date("2026-09-05T08:00:00Z"), // samedi 5 septembre 2026
  items: [{ name: "Coupe & taille de barbe" }],
  totalPriceCents: 2800,
  staffFirstName: "Orhan",
  bookUrl: "https://exemple.fr/reservation",
  rebookUrl: "https://exemple.fr/reservation?reprendre=abc",
  unsubscribeUrl: "https://exemple.fr/relance/desinscription?c=1&t=jeton",
  logoUrl: "https://exemple.fr/email/logo.png",
};

describe("email « Nous serions ravis de vous revoir » (D-74)", () => {
  it("reprend l'objet et le contenu de la maquette", () => {
    const email = renderWinbackEmail(base);
    expect(email.subject).toBe("Nous serions ravis de vous revoir, Thomas");
    expect(email.html).toContain("Nous serions ravis de vous revoir.");
    expect(email.html).toContain("votre dernière visite remonte au samedi 5 septembre");
    expect(email.html).toContain("Coupe &amp; taille de barbe");
    expect(email.html).toContain("avec Orhan · 28 €");
  });

  it("a un seul bouton « Réserver à nouveau » et le lien « Reprendre le même RDV », sans horaires proposés", () => {
    const { html, text } = renderWinbackEmail(base);
    expect(html).toContain("Réserver à nouveau");
    expect(html).toContain('href="https://exemple.fr/reservation?reprendre=abc"');
    expect(html).not.toContain("Prochains horaires");
    expect(text).toContain("Réserver à nouveau : https://exemple.fr/reservation");
  });

  it("propose de ne plus recevoir ces messages, avec un lien propre", () => {
    const { html, text } = renderWinbackEmail(base);
    expect(html).toContain("Ne plus recevoir ces messages");
    expect(html).toContain('href="https://exemple.fr/relance/desinscription?c=1&amp;t=jeton"');
    expect(text).toContain("https://exemple.fr/relance/desinscription?c=1&t=jeton");
  });

  it("se lit sans prénom et protège le HTML", () => {
    expect(renderWinbackEmail({ ...base, firstName: null }).subject).toBe(
      "Nous serions ravis de vous revoir",
    );
    expect(renderWinbackEmail({ ...base, firstName: "<b>x</b>" }).html).not.toContain("<b>x</b>");
  });
});
