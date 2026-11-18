import { describe, expect, it } from "vitest";
import { SALON, SUPPORT_EMAIL } from "@/lib/salon";
import { helpSections } from "./help";

const rules = {
  changeCutoffHours: 1,
  maxUpcomingPerCustomer: 5,
  noShowBlockThreshold: 2,
  reminderHours: 24,
  reviewInvitations: false,
  waitlistHoldMinutes: 15,
  winbackAfterDays: 15,
  loyaltyEnabled: true,
  loyaltyThreshold: 100,
};

const all = (r = rules) =>
  helpSections(r)
    .map((s) => `${s.title}\n${s.body}`)
    .join("\n");

// Page d'assistance exigée par Apple (fiche App Store) : contact, suppression du compte, questions courtes.
describe("page d'aide", () => {
  it("donne l'adresse d'assistance, le téléphone et l'adresse du salon", () => {
    const text = all();
    expect(SUPPORT_EMAIL).toBe("contact@elegance-strasbourg.fr");
    expect(text).toContain(SUPPORT_EMAIL);
    expect(text).toContain(SALON.phoneDisplay);
    expect(text).toContain(SALON.street);
  });

  it("explique comment supprimer son compte, dans l'app et sur le site (Apple 5.1.1)", () => {
    const section = helpSections(rules).find((s) => /supprimer/i.test(s.title));
    expect(section).toBeDefined();
    expect(section!.body).toContain("Mon compte");
    expect(section!.body).toContain("Supprimer mon compte");
  });

  it("lit le délai de modification et la place gardée dans les réglages, jamais en dur", () => {
    const strict = all({ ...rules, changeCutoffHours: 48, waitlistHoldMinutes: 20 });
    expect(strict).toContain("48 h");
    expect(strict).toContain("20 minutes");
    expect(all()).toContain("une heure");
  });

  it("n'a aucun champ entre crochets à compléter", () => {
    expect(all().match(/\[[^\]]+\]/g)).toBeNull();
  });
});
