import { describe, expect, it } from "vitest";
import { renderPasswordResetEmail } from "./password-reset";

const data = {
  link: "https://exemple.fr/auth/callback?next=/mot-de-passe/nouveau&code=abc_DEF-123",
  logoUrl: "https://exemple.fr/email/logo.png",
};

describe("email de réinitialisation du mot de passe (D-117)", () => {
  it("a un objet clair et dit que le lien est valable 1 heure", () => {
    const email = renderPasswordResetEmail(data);
    expect(email.subject).toBe("Réinitialisez votre mot de passe");
    expect(email.html).toContain("valable 1 heure");
    expect(email.text).toContain("valable 1 heure");
  });

  it("garde le lien tel quel dans le texte et le bouton (esperluette échappée en HTML)", () => {
    const email = renderPasswordResetEmail(data);
    expect(email.text).toContain(data.link);
    expect(email.html).toContain('href="https://exemple.fr/auth/callback?next=/mot-de-passe/nouveau&amp;code=abc_DEF-123"');
  });

  it("rassure quand la demande ne vient pas de la personne", () => {
    expect(renderPasswordResetEmail(data).html).toContain("ignorer cet email");
  });
});
