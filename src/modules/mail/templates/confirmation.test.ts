import { describe, expect, it } from "vitest";
import { renderConfirmationEmail, type ConfirmationData } from "./confirmation";

const base: ConfirmationData = {
  firstName: "Thomas",
  startsAt: new Date("2026-10-24T08:00:00Z"), // samedi 24 octobre 2026, 10 h à Paris
  endsAt: new Date("2026-10-24T08:30:00Z"),
  items: [{ name: "Coupe & taille de barbe", durationMin: 30, priceCents: 2800 }],
  totalPriceCents: 2800,
  durationMinutes: 30,
  staffFirstName: "Orhan",
  changeDeadline: new Date("2026-10-22T08:00:00Z"), // jeudi 22 octobre, 10 h
  changeableOnline: true,
  manageUrl: "https://exemple.fr/compte/rendez-vous",
  calendarUrl: "https://exemple.fr/api/agenda/abc?t=jeton",
  logoUrl: "https://exemple.fr/email/logo.png",
};

describe("R-60 : email de confirmation", () => {
  it("reprend l'objet, l'aperçu et le contenu de la maquette", () => {
    const email = renderConfirmationEmail(base);
    expect(email.subject).toBe("Votre rendez-vous du samedi 24 octobre est confirmé");
    expect(email.preheader).toBe("10:00 · Coupe & taille de barbe avec Orhan");
    expect(email.html).toContain("À samedi, Thomas.");
    expect(email.html).toContain("Samedi 24 octobre 2026");
    expect(email.html).toContain("10:00");
    expect(email.html).toContain("Coupe &amp; taille de barbe · 30 min");
    expect(email.html).toContain("28 €");
    expect(email.html).toContain("avec Orhan");
    expect(email.html).toContain("Paiement sur place");
    expect(email.html).toContain("162 route de Bischwiller");
    expect(email.html).toContain("03 88 97 74 68");
  });

  it("donne la date limite de modification (R-30) et le téléphone ensuite (R-31)", () => {
    const { html, text } = renderConfirmationEmail(base);
    expect(html).toContain("jusqu&#39;au jeudi 22 octobre, 10:00");
    expect(text).toContain("jusqu'au jeudi 22 octobre, 10:00. Ensuite : 03 88 97 74 68.");
  });

  it("un RDV pris moins de 48 h avant renvoie directement au salon (R-32)", () => {
    const { html } = renderConfirmationEmail({ ...base, changeableOnline: false });
    expect(html).toContain("Pour tout changement, appelez le salon : 03 88 97 74 68.");
    expect(html).not.toContain("Modifiable ou annulable");
  });

  it("liste chaque prestation et le total quand il y en a plusieurs (R-14)", () => {
    const { html, text } = renderConfirmationEmail({
      ...base,
      items: [
        { name: "Coupe homme", durationMin: 30, priceCents: 1800 },
        { name: "Taillage barbe", durationMin: 15, priceCents: 1200 },
      ],
      totalPriceCents: 3000,
      durationMinutes: 45,
    });
    expect(html).toContain("Coupe homme · 30 min");
    expect(html).toContain("Taillage barbe · 15 min");
    expect(html).toContain("Total · 45 min");
    expect(html).toContain("30 €");
    expect(text).toContain("Total : 30 € · 45 min");
  });

  it("protège le HTML contre un prénom malveillant", () => {
    const { html } = renderConfirmationEmail({ ...base, firstName: '<script>alert("x")</script>' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("n'évoque aucun paiement en ligne (D-34) et contient les deux liens", () => {
    const { html, text } = renderConfirmationEmail(base);
    expect(html).not.toMatch(/payé en ligne|payer en ligne/i);
    expect(html).toContain('href="https://exemple.fr/compte/rendez-vous"');
    expect(html).toContain('href="https://exemple.fr/api/agenda/abc?t=jeton"');
    expect(text).toContain("https://exemple.fr/compte/rendez-vous");
  });

  it("se lit sans prénom", () => {
    expect(renderConfirmationEmail({ ...base, firstName: null }).html).toContain("À samedi.");
  });

  it("utilise le logo en PNG avec la plaque ivoire intégrée, et un thème sombre déclaré", () => {
    const { html } = renderConfirmationEmail(base);
    expect(html).toContain('src="https://exemple.fr/email/logo.png"');
    expect(html).toContain('<meta name="color-scheme" content="dark">');
  });
});
