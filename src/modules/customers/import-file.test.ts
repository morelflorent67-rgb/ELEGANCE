import { describe, expect, it } from "vitest";
import { normalizePhone } from "@/lib/phone";
import { importSince, parseCsv, planImport, tidyName } from "./import-file";

// Faux fichier, données inventées : le vrai fichier du salon n'entre jamais dans le dépôt (D-70).
const HEADER =
  "firstname;lastname;phonenumber;alternatephonenumber;countbookings;lastappointmentat;email;gender;averageexpenseamountcents;address;notes";

const line = (fields: {
  first?: string;
  last?: string;
  phone?: string;
  visits?: string;
  last_visit?: string;
  email?: string;
}) =>
  [
    fields.first ?? "Nora",
    fields.last ?? "Haddad",
    fields.phone ?? "+33622222222",
    "",
    fields.visits ?? "3",
    fields.last_visit ?? "2026-05-02",
    fields.email ?? "",
    "f",
    "2500.0",
    "1 rue Inventée",
    "",
  ].join(";");

const plan = (...lines: string[]) =>
  planImport(parseCsv([HEADER, ...lines].join("\r\n")), {
    since: "2023-10-21",
    today: "2026-10-21",
    normalizePhone,
  });

describe("parseCsv : le format de l'export", () => {
  it("lit les points-virgules, les guillemets, les retours à la ligne et l'indicateur d'encodage", () => {
    const rows = parseCsv('﻿a;b\r\n"x;y";"il dit ""oui"""\r\n"deux\nlignes";\r\n\r\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["x;y", 'il dit "oui"'],
      ["deux\nlignes", ""],
    ]);
  });
});

describe("tidyName : les noms tout en majuscules sont adoucis", () => {
  it.each([
    ["DUPONT", "Dupont"],
    ["JEAN-MARC", "Jean-Marc"],
    ["  Lina  ", "Lina"],
    ["de la Tour", "de la Tour"],
    ["M", "M"],
  ])("%s → %s", (raw, expected) => {
    expect(tidyName(raw)).toBe(expected);
  });
});

describe("D-77 : choix des fiches à importer", () => {
  it("garde prénom, nom, téléphone, email, visites et dernière visite ; rien d'autre", () => {
    const { candidates, report } = plan(line({ email: "Nora@Exemple.fr", last: "HADDAD" }));
    expect(candidates).toEqual([
      {
        firstName: "Nora",
        lastName: "Haddad",
        phone: "+33622222222",
        email: "nora@exemple.fr",
        visits: 3,
        lastVisitOn: "2026-05-02",
      },
    ]);
    expect(report).toMatchObject({ read: 1, kept: 1 });
  });

  it("écarte les clients venus avant la date limite (3 ans)", () => {
    const { candidates, report } = plan(
      line({ last_visit: "2023-10-20" }),
      line({ first: "Sami", phone: "+33633333333", last_visit: "2023-10-21" }),
    );
    expect(candidates.map((c) => c.firstName)).toEqual(["Sami"]);
    expect(report.tooOld).toBe(1);
  });

  it("garde un client avec un téléphone ou un email, écarte celui qui n'a ni l'un ni l'autre", () => {
    const { candidates, report } = plan(
      line({ phone: "", email: "seul.email@exemple.fr" }),
      line({ first: "Sami", phone: "+33633333333", email: "" }),
      line({ first: "Rien", phone: "", email: "" }),
      line({ first: "Faux", phone: "abc", email: "" }),
    );
    expect(candidates.map((c) => c.firstName)).toEqual(["Nora", "Sami"]);
    expect(report).toMatchObject({ noContact: 2, invalidPhones: 1 });
  });

  it("écarte une ligne sans visite ou sans prénom ; un nombre de visites illisible devient inconnu", () => {
    const { candidates, report } = plan(
      line({ last_visit: "" }),
      line({ first: "" }),
      line({ first: "Sami", phone: "+33633333333", visits: "-1" }),
    );
    expect(report.incomplete).toBe(2);
    expect(candidates[0]).toMatchObject({ firstName: "Sami", visits: null });
  });

  it("réunit les doublons : même email, ou même numéro et même prénom ; une famille au même numéro reste séparée", () => {
    const { candidates, report } = plan(
      line({ email: "nora@exemple.fr", visits: "3", last_visit: "2025-01-01" }),
      line({ phone: "", email: "NORA@exemple.fr", visits: "2", last_visit: "2026-02-01" }),
      line({ first: "Sami", phone: "+33644444444", visits: "1" }),
      line({ first: "sámi", last: "", phone: "+33644444444", visits: "1" }),
      line({ first: "Inès", phone: "+33644444444", visits: "5" }),
    );
    expect(report.duplicates).toBe(2);
    expect(candidates).toHaveLength(3);
    expect(candidates[0]).toMatchObject({
      visits: 5,
      lastVisitOn: "2026-02-01",
      email: "nora@exemple.fr",
    });
    expect(candidates.find((c) => c.firstName === "Sami")?.visits).toBe(2);
    expect(candidates.find((c) => c.firstName === "Inès")?.visits).toBe(5);
  });

  it("refuse un fichier qui n'a pas les colonnes attendues", () => {
    expect(() =>
      planImport(parseCsv("nom;tel\r\nA;B"), {
        since: "2023-10-21",
        today: "2026-10-21",
        normalizePhone,
      }),
    ).toThrow(/Colonnes absentes/);
  });

  it("une date à venir est un RDV déjà pris, pas une visite : le client est gardé, sans dernière visite", () => {
    const { candidates } = plan(line({ last_visit: "2027-01-09" }));
    expect(candidates).toHaveLength(1);
    expect(candidates[0].lastVisitOn).toBeNull();
  });

  it("calcule la date limite : 3 ans avant le jour de l'import", () => {
    expect(importSince("2026-10-21")).toBe("2023-10-21");
    expect(importSince("2028-02-29")).toBe("2025-03-01");
  });
});
