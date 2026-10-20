import { describe, expect, it } from "vitest";
import { buildIcs } from "./ics";
import { calendarSubject, signToken, verifyToken } from "../security/token";

const event = {
  uid: "appointment-123@elegance-strasbourg",
  startsAt: new Date("2026-11-03T09:00:00Z"),
  endsAt: new Date("2026-11-03T09:30:00Z"),
  summary: "Coupe homme chez Elegance Strasbourg",
  description: "Avec Orhan, paiement sur place.",
  location: "162 route de Bischwiller, 67300 Schiltigheim",
  stamp: new Date("2026-10-20T12:00:00Z"),
};

describe("R-60 : lien « Ajouter à l'agenda »", () => {
  it("produit un fichier d'agenda valide avec les heures en UTC", () => {
    const ics = buildIcs(event);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261103T090000Z");
    expect(ics).toContain("DTEND:20261103T093000Z");
    expect(ics).toContain("DTSTAMP:20261020T120000Z");
    expect(ics).toContain("UID:appointment-123@elegance-strasbourg");
    expect(ics).toContain("SUMMARY:Coupe homme chez Elegance Strasbourg");
    expect(ics).toContain("LOCATION:162 route de Bischwiller\\, 67300 Schiltigheim");
    expect(ics).not.toMatch(/[^\r]\n/); // fins de ligne CRLF uniquement
  });

  it("échappe les caractères spéciaux et replie les lignes de plus de 75 octets", () => {
    const ics = buildIcs({
      ...event,
      description: "Ligne 1\nLigne 2; avec, des virgules ".repeat(4),
    });
    expect(ics).toContain("\\n");
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });

  it("ne coupe jamais un caractère accentué en deux", () => {
    const ics = buildIcs({ ...event, summary: "é".repeat(100) });
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(`SUMMARY:${"é".repeat(100)}`);
  });
});

describe("liens signés sans connexion", () => {
  const secret = "secret-de-test";

  it("accepte le jeton du bon rendez-vous", () => {
    const token = signToken(secret, calendarSubject("abc"));
    expect(verifyToken(secret, calendarSubject("abc"), token)).toBe(true);
  });

  it("refuse le jeton d'un autre rendez-vous, un jeton modifié ou un autre secret", () => {
    const token = signToken(secret, calendarSubject("abc"));
    expect(verifyToken(secret, calendarSubject("abd"), token)).toBe(false);
    expect(verifyToken(secret, calendarSubject("abc"), token + "x")).toBe(false);
    expect(verifyToken(secret, calendarSubject("abc"), "")).toBe(false);
    expect(verifyToken("autre-secret", calendarSubject("abc"), token)).toBe(false);
  });
});

describe("R-30 : un déplacement met à jour l'événement déjà ajouté à l'agenda", () => {
  it("garde le même identifiant et augmente le numéro de version", () => {
    expect(buildIcs(event)).toContain("SEQUENCE:0");
    const moved = buildIcs({ ...event, sequence: 2 });
    expect(moved).toContain("SEQUENCE:2");
    expect(moved).toContain("UID:appointment-123@elegance-strasbourg");
  });
});
