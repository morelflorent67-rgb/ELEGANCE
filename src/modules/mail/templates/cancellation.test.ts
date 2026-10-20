import { describe, expect, it } from "vitest";
import { renderCancellationEmail, type CancellationData } from "./cancellation";

const base: CancellationData = {
  firstName: "Thomas",
  startsAt: new Date("2026-10-24T08:00:00Z"), // samedi 24 octobre 2026, 10 h à Paris
  items: [{ name: "Coupe & taille de barbe", durationMin: 30, priceCents: 2800 }],
  staffFirstName: "Orhan",
  bookUrl: "https://exemple.fr/reservation",
  logoUrl: "https://exemple.fr/email/logo.png",
};

describe("email d'annulation (R-30)", () => {
  it("reprend l'objet, l'aperçu et le contenu de la maquette", () => {
    const email = renderCancellationEmail(base);
    expect(email.subject).toBe("Votre rendez-vous du samedi 24 octobre est annulé");
    expect(email.preheader).toBe("Envie d'un autre créneau ? Réservez en quelques secondes.");
    expect(email.html).toContain("Votre rendez-vous est annulé.");
    expect(email.html).toContain("Merci de nous avoir prévenus, Thomas");
    expect(email.html).toContain("Samedi 24 octobre 2026 · 10:00");
    expect(email.html).toContain("Coupe &amp; taille de barbe · 28 € · avec Orhan");
    expect(email.html).toContain("Reprendre rendez-vous");
    expect(email.html).toContain('href="https://exemple.fr/reservation"');
    expect(email.html).toContain("Appelez-nous au 03 88 97 74 68");
  });

  it("se lit sans prénom et protège le HTML", () => {
    expect(renderCancellationEmail({ ...base, firstName: null }).html).toContain(
      "Merci de nous avoir prévenus : le créneau",
    );
    const { html } = renderCancellationEmail({ ...base, firstName: "<b>x</b>" });
    expect(html).not.toContain("<b>x</b>");
  });

  it("additionne les prix de plusieurs prestations", () => {
    const { text } = renderCancellationEmail({
      ...base,
      items: [
        { name: "Coupe homme", durationMin: 30, priceCents: 1800 },
        { name: "Taillage barbe", durationMin: 15, priceCents: 1200 },
      ],
    });
    expect(text).toContain("Coupe homme + Taillage barbe · 30 € · avec Orhan (45 min)");
  });
});

describe("email d'annulation décidée par le salon (R-33, R-63, D-52)", () => {
  const salon = { ...base, cancelledBy: "salon" as const };

  it("confirme l'échange et présente des excuses, sans remercier le client de nous avoir prévenus", () => {
    const email = renderCancellationEmail(salon);
    expect(email.html).toContain(
      "Thomas, suite à notre échange, nous avons annulé votre rendez-vous.",
    );
    expect(email.html).toContain("Toutes nos excuses");
    expect(email.html).not.toContain("Merci de nous avoir prévenus");
    expect(email.text).toContain("suite à notre échange");
  });

  it("ne dit pas « vous n'êtes pas à l'origine de cette annulation » : le client a été appelé", () => {
    const email = renderCancellationEmail(salon);
    expect(email.html).not.toContain("origine");
    expect(email.html).toContain("Appelez-nous au 03 88 97 74 68");
  });

  it("se lit sans prénom", () => {
    const email = renderCancellationEmail({ ...salon, firstName: null });
    expect(email.html).toContain("Suite à notre échange, nous avons annulé");
  });

  it("garde l'objet, le créneau et le lien pour reprendre rendez-vous", () => {
    const email = renderCancellationEmail(salon);
    expect(email.subject).toBe("Votre rendez-vous du samedi 24 octobre est annulé");
    expect(email.html).toContain("Samedi 24 octobre 2026 · 10:00");
    expect(email.html).toContain('href="https://exemple.fr/reservation"');
  });
});
