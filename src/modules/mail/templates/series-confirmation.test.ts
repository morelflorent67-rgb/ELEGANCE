import { describe, expect, it } from "vitest";
import { renderSeriesConfirmationEmail, type SeriesConfirmationData } from "./series-confirmation";

const base: SeriesConfirmationData = {
  firstName: "Thomas",
  ruleLabel: "Toutes les 4 semaines",
  dates: [
    { startsAt: new Date("2026-11-03T09:00:00Z"), staffFirstName: "Orhan" }, // mardi 3 novembre, 10 h
    { startsAt: new Date("2026-12-01T09:00:00Z"), staffFirstName: "Enes" },
  ],
  items: [{ name: "Coupe homme", durationMin: 30, priceCents: 1800 }],
  totalPriceCents: 1800,
  durationMinutes: 30,
  cutoffHours: 1,
  extended: false,
  manageUrl: "https://exemple.fr/compte/rendez-vous",
  calendarUrl: "https://exemple.fr/api/agenda/serie/abc?t=jeton",
  logoUrl: "https://exemple.fr/email/logo.png",
};

describe("D-91 : un seul email pour une série", () => {
  it("liste chaque date avec son coiffeur, la règle et le lien d'agenda de la série", () => {
    const { subject, html, text } = renderSeriesConfirmationEmail(base);
    expect(subject).toBe("Vos 2 rendez-vous sont confirmés");
    expect(text).toContain("- Mardi 3 novembre · 10:00 · avec Orhan");
    expect(text).toContain("- Mardi 1 décembre · 10:00 · avec Enes");
    expect(html).toContain("Toutes les 4 semaines");
    expect(html).toContain("Coupe homme · 30 min · 18 €");
    expect(html).toContain("https://exemple.fr/api/agenda/serie/abc?t=jeton");
    expect(text).toContain("jusqu'à une heure avant");
  });

  it("annonce les nouvelles dates d'une prolongation (D-90)", () => {
    expect(renderSeriesConfirmationEmail({ ...base, extended: true }).subject).toBe(
      "Vos 2 prochains rendez-vous sont réservés",
    );
    expect(
      renderSeriesConfirmationEmail({ ...base, extended: true, dates: base.dates.slice(0, 1) })
        .subject,
    ).toBe("Votre prochain rendez-vous est réservé");
  });

  it("une fiche sans compte est invitée à créer son compte (D-81) ; « Pour qui ? » est rappelé (D-80)", () => {
    const { html, text } = renderSeriesConfirmationEmail({
      ...base,
      hasAccount: false,
      signupUrl: "https://exemple.fr/inscription",
      forName: "Inès",
    });
    expect(html).toContain("Créer mon compte");
    expect(html).not.toContain("Gérer mon rendez-vous");
    expect(text).toContain("Pour Inès");
  });
});
