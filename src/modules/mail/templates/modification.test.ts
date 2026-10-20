import { describe, expect, it } from "vitest";
import { renderModificationEmail, type ModificationData } from "./modification";

const base: ModificationData = {
  firstName: "Thomas",
  startsAt: new Date("2026-10-27T13:30:00Z"), // mardi 27 octobre 2026, 14 h 30 à Paris
  items: [{ name: "Coupe & taille de barbe", durationMin: 30, priceCents: 2800 }],
  totalPriceCents: 2800,
  durationMinutes: 30,
  staffFirstName: "Orhan",
  previousStartsAt: new Date("2026-10-24T08:00:00Z"), // samedi 24 octobre, 10 h
  previousStaffFirstName: null,
  changeDeadline: new Date("2026-10-25T13:30:00Z"),
  changeableOnline: true,
  manageUrl: "https://exemple.fr/compte/rendez-vous",
  calendarUrl: "https://exemple.fr/api/agenda/abc?t=jeton",
  logoUrl: "https://exemple.fr/email/logo.png",
};

describe("email de modification (R-30)", () => {
  it("reprend l'objet, l'aperçu et le contenu de la maquette", () => {
    const email = renderModificationEmail(base);
    expect(email.subject).toBe("Votre rendez-vous est déplacé au mardi 27 octobre");
    expect(email.preheader).toBe("Nouveau créneau : 14:30 avec Orhan");
    expect(email.html).toContain("C&#39;est noté, Thomas.");
    expect(email.html).toContain(
      "Votre rendez-vous a été déplacé. Le précédent créneau est libéré.",
    );
    expect(email.html).toContain("Samedi 24 octobre · 10:00"); // avant
    expect(email.html).toContain("Mardi 27 octobre 2026"); // maintenant
    expect(email.html).toContain("14:30");
    expect(email.html).toContain("Coupe &amp; taille de barbe · 30 min");
    expect(email.html).toContain("28 €");
    expect(email.html).toContain("Gérer mon rendez-vous");
    expect(email.html).toContain("Mettre à jour l&#39;agenda");
  });

  it("indique l'ancien coiffeur seulement quand il a changé", () => {
    expect(renderModificationEmail(base).html).not.toContain("· avec");
    const changed = renderModificationEmail({ ...base, previousStaffFirstName: "Enes" });
    expect(changed.html).toContain("Samedi 24 octobre · 10:00 · avec Enes");
    expect(changed.text).toContain("Avant : Samedi 24 octobre · 10:00 · avec Enes");
  });

  it("donne la date limite si le nouveau créneau reste modifiable, sinon renvoie au salon (R-32)", () => {
    expect(renderModificationEmail(base).html).toContain("jusqu&#39;au dimanche 25 octobre, 14:30");
    const locked = renderModificationEmail({ ...base, changeableOnline: false });
    expect(locked.html).toContain("appelez le salon : 03 88 97 74 68");
    expect(locked.html).not.toContain("Modifiez-le en ligne");
  });

  it("liste le total quand il y a plusieurs prestations (R-14)", () => {
    const { html } = renderModificationEmail({
      ...base,
      items: [
        { name: "Coupe homme", durationMin: 30, priceCents: 1800 },
        { name: "Taillage barbe", durationMin: 15, priceCents: 1200 },
      ],
      totalPriceCents: 3000,
      durationMinutes: 45,
    });
    expect(html).toContain("Total · 45 min");
    expect(html).toContain("30 €");
  });

  it("protège le HTML contre un prénom malveillant et n'évoque aucun paiement en ligne (D-34)", () => {
    const { html } = renderModificationEmail({ ...base, firstName: '<script>alert("x")</script>' });
    expect(html).not.toContain("<script>");
    expect(html).not.toMatch(/payé en ligne|payer en ligne/i);
    expect(html).toContain('href="https://exemple.fr/api/agenda/abc?t=jeton"');
  });
});
