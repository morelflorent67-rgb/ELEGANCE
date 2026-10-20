import { describe, expect, it } from "vitest";
import { renderReviewInvitationEmail, type ReviewInvitationData } from "./review-invitation";

const base: ReviewInvitationData = {
  firstName: "Thomas",
  startsAt: new Date("2026-10-24T08:00:00Z"), // samedi 24 octobre 2026, 10 h à Paris
  items: [{ name: "Coupe & taille de barbe" }],
  staffFirstName: "Orhan",
  reviewUrl: "https://share.google/abc",
  rebookUrl: "https://exemple.fr/reservation?reprendre=abc",
  unsubscribeUrl: "https://exemple.fr/avis/desinscription?c=1&t=jeton",
  logoUrl: "https://exemple.fr/email/logo.png",
};

describe("email d'invitation à un avis (R-64)", () => {
  it("reprend l'objet, l'aperçu et le contenu de la maquette", () => {
    const email = renderReviewInvitationEmail(base);
    expect(email.subject).toBe("Merci de votre visite, Thomas");
    expect(email.preheader).toBe(
      "Comment s'est passé votre rendez-vous avec Orhan ? 30 secondes suffisent.",
    );
    expect(email.html).toContain("Merci de votre visite");
    expect(email.html).toContain("Comment s&#39;est passé votre rendez-vous avec Orhan ?");
    expect(email.html).toContain("Samedi 24 octobre · Coupe &amp; taille de barbe.");
    expect(email.html).toContain("Laisser un avis");
    expect(email.html).toContain("Reprendre le même RDV");
    expect(email.html).toContain("Déjà envie de revenir ?");
  });

  it("n'a plus la grille de notes de 1 à 5 : un seul bouton vers la page d'avis", () => {
    const { html } = renderReviewInvitationEmail(base);
    expect(html).not.toContain("Votre note");
    expect(html).not.toContain("Décevant");
    expect(html).not.toContain("1 sur 5");
    expect(html.match(/href="https:\/\/share\.google\/abc"/g)).toHaveLength(1);
  });

  it("propose de ne plus recevoir ces invitations, avec un lien propre", () => {
    const { html, text } = renderReviewInvitationEmail(base);
    expect(html).toContain("Ne plus recevoir ces invitations");
    expect(html).toContain('href="https://exemple.fr/avis/desinscription?c=1&amp;t=jeton"');
    expect(text).toContain("https://exemple.fr/avis/desinscription?c=1&t=jeton");
  });

  it("se lit sans prénom et protège le HTML", () => {
    expect(renderReviewInvitationEmail({ ...base, firstName: null }).subject).toBe(
      "Merci de votre visite",
    );
    const { html } = renderReviewInvitationEmail({ ...base, firstName: "<b>x</b>" });
    expect(html).not.toContain("<b>x</b>");
  });

  it("cite plusieurs prestations", () => {
    const { html } = renderReviewInvitationEmail({
      ...base,
      items: [{ name: "Coupe homme" }, { name: "Taillage barbe" }],
    });
    expect(html).toContain("Coupe homme + Taillage barbe");
  });
});
