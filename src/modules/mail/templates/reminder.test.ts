import { describe, expect, it } from "vitest";
import { renderReminderEmail, type ReminderData } from "./reminder";

const base: ReminderData = {
  firstName: "Thomas",
  startsAt: new Date("2026-10-24T08:00:00Z"), // samedi 24 octobre 2026, 10 h à Paris
  items: [{ name: "Coupe & taille de barbe", durationMin: 30, priceCents: 2800 }],
  totalPriceCents: 2800,
  durationMinutes: 30,
  staffFirstName: "Orhan",
  daysAway: 3,
  changeDeadline: new Date("2026-10-22T08:00:00Z"), // jeudi 22 octobre, 10 h
  changeableOnline: true,
  manageUrl: "https://exemple.fr/compte/rendez-vous",
  logoUrl: "https://exemple.fr/email/logo.png",
};

describe("email de rappel (R-61)", () => {
  it("reprend l'objet, l'aperçu et le contenu de la maquette", () => {
    const email = renderReminderEmail(base);
    expect(email.subject).toBe("Rappel : votre rendez-vous samedi à 10:00");
    expect(email.preheader).toBe("Modifiable en ligne jusqu'à jeudi 10:00");
    expect(email.html).toContain("Dans 3 jours");
    expect(email.html).toContain("Votre rendez-vous approche, Thomas.");
    expect(email.html).toContain("On vous attend samedi au salon.");
    expect(email.html).toContain("Samedi 24 octobre 2026");
    expect(email.html).toContain("10:00");
    expect(email.html).toContain("Coupe &amp; taille de barbe · 30 min");
    expect(email.html).toContain("28 €");
    expect(email.html).toContain("avec Orhan");
    expect(email.html).toContain("162 route de Bischwiller, 67300 Schiltigheim");
    expect(email.html).toContain("Gérer mon rendez-vous");
    expect(email.html).toContain('href="https://exemple.fr/compte/rendez-vous"');
    expect(email.html).toContain("Itinéraire");
  });

  it("donne la date limite de modification en ligne (R-61)", () => {
    const email = renderReminderEmail(base);
    expect(email.html).toContain("jeudi 22 octobre, 10:00");
    expect(email.html).toContain("appelez le 03 88 97 74 68");
    expect(email.text).toContain("jeudi 22 octobre, 10:00");
  });

  it("renvoie au salon quand la date limite est passée (R-30, R-32)", () => {
    const email = renderReminderEmail({ ...base, changeableOnline: false });
    expect(email.html).not.toContain("jusqu&#39;au");
    expect(email.html).toContain("appelez le salon au 03 88 97 74 68");
    expect(email.html).not.toContain("Modifiez ou annulez en ligne");
    expect(email.preheader).toBe("On vous attend samedi à 10:00");
  });

  it("dit le délai réel : demain, aujourd'hui, dans N jours", () => {
    expect(renderReminderEmail({ ...base, daysAway: 1 }).html).toContain("Demain");
    expect(renderReminderEmail({ ...base, daysAway: 0 }).html).toContain("Aujourd&#39;hui");
    expect(renderReminderEmail({ ...base, daysAway: 2 }).html).toContain("Dans 2 jours");
  });

  it("se lit sans prénom et protège le HTML", () => {
    expect(renderReminderEmail({ ...base, firstName: null }).html).toContain(
      "Votre rendez-vous approche.",
    );
    const { html } = renderReminderEmail({ ...base, firstName: "<b>x</b>" });
    expect(html).not.toContain("<b>x</b>");
  });

  it("additionne plusieurs prestations dans le texte brut", () => {
    const { text, html } = renderReminderEmail({
      ...base,
      items: [
        { name: "Coupe homme", durationMin: 30, priceCents: 1800 },
        { name: "Taillage barbe", durationMin: 15, priceCents: 1200 },
      ],
      totalPriceCents: 3000,
      durationMinutes: 45,
    });
    expect(html).toContain("Total · 45 min");
    expect(text).toContain("Total : 30 € · 45 min");
  });
});

describe("D-81 : rappel d'une fiche sans compte", () => {
  it("invite à créer son compte, renvoie au salon pour les changements et ne promet rien en ligne", () => {
    const email = renderReminderEmail({
      ...base,
      hasAccount: false,
      signupUrl: "https://exemple.fr/inscription",
      forName: "Lina",
    });
    expect(email.preheader).toBe("On vous attend samedi à 10:00");
    expect(email.html).toContain("Créer mon compte");
    expect(email.html).toContain('href="https://exemple.fr/inscription"');
    expect(email.html).not.toContain("Gérer mon rendez-vous");
    expect(email.text).toContain("Pour tout changement, appelez le salon : 03 88 97 74 68.");
    expect(email.text).not.toContain("Modifiez ou annulez en ligne");
    expect(email.html).toContain("Pour Lina<br>avec Orhan");
  });

  it("D-78 : la mention d'origine de l'adresse n'apparaît que lorsqu'elle est due", () => {
    expect(renderReminderEmail(base).text).not.toContain("fichier clients du salon");
    const first = renderReminderEmail({ ...base, originNotice: true });
    expect(first.text).toContain("Vos coordonnées viennent du fichier clients du salon");
    expect(first.html).toContain("Vos coordonnées viennent du fichier clients du salon");
  });
});
