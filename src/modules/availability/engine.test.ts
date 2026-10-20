import { describe, expect, it } from "vitest";
import { checkSlot, pickStaff, slotsForDay } from "./engine";
import { ENES, KAAN, ORHAN, TAHA, at, busy, makeSnapshot } from "./test-fixtures";
import type { Audience } from "./types";

// « Maintenant » commun : lundi 2 novembre 2026, 8 h à Paris.
const NOW = at("2026-11-02", "08:00");
const BARBERS = [ORHAN, ENES];

const clock = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
});
const times = (slots: { startsAt: Date }[]) => slots.map((s) => clock.format(s.startsAt));

const day = (
  date: string,
  options: Partial<Parameters<typeof slotsForDay>[1]> = {},
  snapshot = makeSnapshot(),
) =>
  slotsForDay(snapshot, {
    date,
    durationMinutes: 30,
    staffIds: BARBERS,
    audience: "online",
    now: NOW,
    ...options,
  });

describe("R-01 : jours et plages d'ouverture", () => {
  it("propose des créneaux du mardi au samedi seulement", () => {
    expect(day("2026-11-02")).toEqual([]); // lundi
    expect(day("2026-11-08")).toEqual([]); // dimanche
    for (const date of ["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"]) {
      expect(day(date).length).toBeGreaterThan(0);
    }
  });

  it("commence à 10 h et ne propose rien entre 12 h et 13 h", () => {
    const list = times(day("2026-11-03"));
    expect(list[0]).toBe("10:00");
    expect(list).toContain("11:30");
    expect(list).not.toContain("12:00");
    expect(list).not.toContain("12:30");
    expect(list).toContain("13:00");
  });
});

describe("R-02 : tous les coiffeurs suivent les mêmes horaires", () => {
  it("rend libres les quatre membres sur le même créneau, chacun dans sa catégorie", () => {
    const [barbers] = day("2026-11-03");
    const [apprentices] = day("2026-11-03", { staffIds: [KAAN, TAHA] });
    expect(barbers.staffIds).toEqual([ORHAN, ENES]);
    expect(apprentices.staffIds).toEqual([KAAN, TAHA]);
    expect(barbers.startsAt).toEqual(apprentices.startsAt);
  });
});

describe("R-03 : fermetures et horaires modifiables", () => {
  it("n'offre rien un jour de fermeture exceptionnelle", () => {
    const snapshot = makeSnapshot({ closures: [{ startsOn: "2026-11-11", endsOn: "2026-11-11" }] });
    expect(day("2026-11-11", {}, snapshot)).toEqual([]);
    expect(day("2026-11-12", {}, snapshot).length).toBeGreaterThan(0);
  });

  it("couvre une période, bornes incluses", () => {
    const snapshot = makeSnapshot({ closures: [{ startsOn: "2026-12-22", endsOn: "2026-12-24" }] });
    // Mode salon : sans délai maximum, seule la fermeture peut expliquer l'absence de créneau.
    const salon = { audience: "salon" as const };
    for (const date of ["2026-12-22", "2026-12-23", "2026-12-24"]) {
      expect(day(date, salon, snapshot)).toEqual([]);
      expect(day(date, salon).length).toBeGreaterThan(0); // témoin : sans fermeture, il y en a
    }
    expect(day("2026-12-25", salon, snapshot).length).toBeGreaterThan(0);
  });

  it("suit les horaires donnés par la base, sans valeur en dur", () => {
    const snapshot = makeSnapshot({
      openingHours: [{ weekday: 1, opensAt: "14:00", closesAt: "16:00" }],
    });
    expect(times(day("2026-11-02", { now: at("2026-10-30", "08:00") }, snapshot))).toEqual([
      "14:00",
      "14:30",
      "15:00",
      "15:30",
    ]);
    expect(day("2026-11-03", {}, snapshot)).toEqual([]);
  });
});

describe("R-04 : pas de la grille, plafond de 19 h et pause", () => {
  it("en ligne, les départs tombent toutes les 30 minutes", () => {
    const list = times(day("2026-11-03"));
    expect(list.every((t) => t.endsWith(":00") || t.endsWith(":30"))).toBe(true);
    expect(list).not.toContain("10:15");
  });

  it("au salon, les départs tombent toutes les 15 minutes", () => {
    const list = times(day("2026-11-03", { audience: "salon" }));
    expect(list).toContain("10:15");
    expect(list).toContain("10:45");
  });

  it("le pas vient des réglages", () => {
    const snapshot = makeSnapshot();
    snapshot.settings.onlineSlotStepMinutes = 15;
    expect(times(day("2026-11-03", {}, snapshot))).toContain("10:15");
  });

  it("un RDV ne chevauche jamais la pause de midi", () => {
    const salon = times(day("2026-11-03", { audience: "salon", durationMinutes: 45 }));
    expect(salon).toContain("11:15"); // finit à 12 h pile
    expect(salon).not.toContain("11:30"); // finirait à 12 h 15
    const online = times(day("2026-11-03", { durationMinutes: 45 }));
    expect(online).toContain("11:00");
    expect(online).not.toContain("11:30");
  });

  it("un RDV finit au plus tard à 19 h", () => {
    const list = times(day("2026-11-03", { durationMinutes: 60 }));
    expect(list).toContain("18:00");
    expect(list).not.toContain("18:30");
  });
});

describe("R-05 : le dernier départ découle de la durée", () => {
  const last = (durationMinutes: number, audience: Audience) =>
    times(day("2026-11-03", { durationMinutes, audience })).at(-1);

  it("en ligne (grille de 30 min)", () => {
    expect(last(30, "online")).toBe("18:30");
    expect(last(45, "online")).toBe("18:00");
    expect(last(15, "online")).toBe("18:30");
  });

  it("au salon (grille de 15 min)", () => {
    expect(last(15, "salon")).toBe("18:45");
    expect(last(30, "salon")).toBe("18:30");
    expect(last(45, "salon")).toBe("18:15");
  });
});

describe("R-06 : délais de réservation en ligne", () => {
  const check = (startsAt: Date, now: Date, audience: Audience = "online") =>
    checkSlot(makeSnapshot(), {
      staffId: ORHAN,
      startsAt,
      durationMinutes: 30,
      audience,
      now,
    });

  it("refuse moins d'une heure avant le RDV, accepte une heure pile", () => {
    const now = at("2026-11-03", "09:30");
    expect(check(at("2026-11-03", "10:00"), now)).toEqual({ ok: false, reason: "too_soon" });
    expect(check(at("2026-11-03", "10:30"), now)).toEqual({ ok: true });
  });

  it("refuse plus de 6 semaines à l'avance, accepte 42 jours pile", () => {
    const now = at("2026-11-03", "10:00");
    expect(check(at("2026-12-15", "10:00"), now)).toEqual({ ok: true });
    expect(check(at("2026-12-15", "10:30"), now)).toEqual({ ok: false, reason: "too_far" });
    expect(check(at("2026-12-16", "10:00"), now)).toEqual({ ok: false, reason: "too_far" });
  });

  it("lit le délai dans les réglages", () => {
    const snapshot = makeSnapshot();
    snapshot.settings.minNoticeMinutes = 120;
    expect(
      checkSlot(snapshot, {
        staffId: ORHAN,
        startsAt: at("2026-11-03", "11:00"),
        durationMinutes: 30,
        audience: "online",
        now: at("2026-11-03", "09:30"),
      }),
    ).toEqual({ ok: false, reason: "too_soon" });
  });

  it("le salon n'est pas soumis aux délais (R-27), sauf pour le passé", () => {
    const now = at("2026-11-03", "10:10");
    expect(check(at("2026-11-03", "10:00"), now, "salon")).toEqual({
      ok: false,
      reason: "in_past",
    });
    expect(check(at("2026-11-03", "10:15"), now, "salon")).toEqual({ ok: true });
    expect(check(at("2027-01-12", "10:00"), now, "salon")).toEqual({ ok: true });
  });

  it("le salon reste soumis aux horaires, à la grille et aux fermetures", () => {
    const now = at("2026-11-02", "08:00");
    expect(check(at("2026-11-08", "10:00"), now, "salon")).toEqual({ ok: false, reason: "closed" });
    expect(check(at("2026-11-03", "10:10"), now, "salon")).toEqual({
      ok: false,
      reason: "off_grid",
    });
    expect(check(at("2026-11-03", "19:00"), now, "salon")).toEqual({
      ok: false,
      reason: "outside_hours",
    });
  });
});

describe("R-21 et R-22 : un coiffeur libre sur toute la durée", () => {
  it("un RDV occupe le coiffeur pendant toute sa durée", () => {
    const snapshot = makeSnapshot({ appointments: [busy(ORHAN, "2026-11-03", "10:00", "11:00")] });
    const slots = day("2026-11-03", {}, snapshot);
    expect(slots[0].staffIds).toEqual([ENES]); // 10:00
    expect(slots[1].staffIds).toEqual([ENES]); // 10:30
    expect(slots[2].staffIds).toEqual([ORHAN, ENES]); // 11:00
  });

  it("deux RDV qui se suivent sans trou ne se chevauchent pas", () => {
    const snapshot = makeSnapshot({ appointments: [busy(ORHAN, "2026-11-03", "10:00", "10:30")] });
    expect(
      checkSlot(snapshot, {
        staffId: ORHAN,
        startsAt: at("2026-11-03", "10:30"),
        durationMinutes: 30,
        audience: "online",
        now: NOW,
      }),
    ).toEqual({ ok: true });
  });

  it("aucun créneau pendant une absence, même partiellement recouvert", () => {
    const snapshot = makeSnapshot({ absences: [busy(ENES, "2026-11-03", "14:00", "16:00")] });
    const slots = day("2026-11-03", { audience: "salon" }, snapshot);
    const staffAt = (t: string) => slots.find((s) => clock.format(s.startsAt) === t)!.staffIds;
    expect(staffAt("13:15")).toEqual([ORHAN, ENES]); // finit à 13:45
    expect(staffAt("13:45")).toEqual([ORHAN]); // 13:45–14:15 recouvre l'absence
    expect(staffAt("15:45")).toEqual([ORHAN]);
    expect(staffAt("16:00")).toEqual([ORHAN, ENES]);
  });

  it("une prestation longue occupe le coiffeur toute la durée (coloration, R-21)", () => {
    const snapshot = makeSnapshot({ appointments: [busy(ORHAN, "2026-11-03", "14:00", "15:30")] });
    const slots = day("2026-11-03", {}, snapshot);
    for (const t of ["14:00", "14:30", "15:00"]) {
      expect(slots.find((s) => clock.format(s.startsAt) === t)!.staffIds).toEqual([ENES]);
    }
    expect(slots.find((s) => clock.format(s.startsAt) === "15:30")!.staffIds).toEqual([
      ORHAN,
      ENES,
    ]);
  });

  it("l'absence d'un autre coiffeur ne gêne pas", () => {
    const snapshot = makeSnapshot({ absences: [busy(KAAN, "2026-11-03", "10:00", "19:00")] });
    expect(day("2026-11-03", {}, snapshot)[0].staffIds).toEqual([ORHAN, ENES]);
  });

  it("n'offre aucun créneau quand tous les coiffeurs sont pris", () => {
    const snapshot = makeSnapshot({
      appointments: [
        busy(ORHAN, "2026-11-03", "10:00", "10:30"),
        busy(ENES, "2026-11-03", "10:00", "10:30"),
      ],
    });
    expect(times(day("2026-11-03", {}, snapshot))[0]).toBe("10:30");
  });
});

describe("R-20 : « Sans préférence »", () => {
  it("choisit le coiffeur qui a le moins de RDV ce jour-là", () => {
    const appointments = [
      busy(ORHAN, "2026-11-03", "10:00", "10:30"),
      busy(ORHAN, "2026-11-03", "11:00", "11:30"),
      busy(ENES, "2026-11-03", "10:30", "11:00"),
    ];
    expect(pickStaff([ORHAN, ENES], appointments, "2026-11-03", "Europe/Paris")).toBe(ENES);
  });

  it("à égalité, prend le premier dans l'ordre d'affichage", () => {
    expect(pickStaff([ORHAN, ENES], [], "2026-11-03", "Europe/Paris")).toBe(ORHAN);
    expect(pickStaff([ENES, ORHAN], [], "2026-11-03", "Europe/Paris")).toBe(ENES);
  });

  it("ne compte que les RDV du jour concerné, à l'heure de Paris", () => {
    const appointments = [
      busy(ORHAN, "2026-11-04", "10:00", "10:30"),
      busy(ORHAN, "2026-11-04", "11:00", "11:30"),
    ];
    expect(pickStaff([ORHAN, ENES], appointments, "2026-11-03", "Europe/Paris")).toBe(ORHAN);
  });

  it("un RDV tard le soir à Paris compte pour le bon jour, même si l'UTC change de date", () => {
    // 18 h 30 à Paris : le jour reste le même en UTC. Test de principe sur une heure proche de minuit locale.
    const lateOrhan = {
      staffId: ORHAN,
      startsAt: new Date("2026-11-03T22:30:00Z"), // 23 h 30 à Paris
      endsAt: new Date("2026-11-03T23:00:00Z"),
    };
    expect(pickStaff([ORHAN, ENES], [lateOrhan], "2026-11-03", "Europe/Paris")).toBe(ENES);
    expect(pickStaff([ORHAN, ENES], [lateOrhan], "2026-11-04", "Europe/Paris")).toBe(ORHAN);
  });
});

describe("heures stockées en UTC, calculées à Paris (changements d'heure)", () => {
  const firstSlot = (date: string, now: Date) =>
    slotsForDay(makeSnapshot(), {
      date,
      durationMinutes: 30,
      staffIds: [ORHAN],
      audience: "salon",
      now,
    })[0];

  it("10 h à Paris vaut 8 h UTC en heure d'été et 9 h UTC en heure d'hiver", () => {
    const now = new Date("2026-10-20T10:00:00Z");
    // Samedi 24 octobre 2026 : dernier jour d'heure d'été (UTC+2).
    expect(firstSlot("2026-10-24", now).startsAt.toISOString()).toBe("2026-10-24T08:00:00.000Z");
    // Mardi 27 octobre 2026 : heure d'hiver (UTC+1), le dimanche 25 a changé l'heure.
    expect(firstSlot("2026-10-27", now).startsAt.toISOString()).toBe("2026-10-27T09:00:00.000Z");
  });

  it("même chose au passage vers l'heure d'été, fin mars 2027", () => {
    const now = new Date("2027-03-01T10:00:00Z");
    expect(firstSlot("2027-03-27", now).startsAt.toISOString()).toBe("2027-03-27T09:00:00.000Z");
    expect(firstSlot("2027-03-30", now).startsAt.toISOString()).toBe("2027-03-30T08:00:00.000Z");
  });

  it("le dimanche du changement d'heure reste fermé", () => {
    expect(day("2026-10-25", { now: at("2026-10-20", "10:00") })).toEqual([]);
  });
});
