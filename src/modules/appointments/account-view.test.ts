import { describe, expect, it } from "vitest";
import type { AppointmentView } from "./queries";
import { pastView, splitAppointments, upcomingView } from "./account-view";

const appointment = (overrides: Partial<AppointmentView> = {}): AppointmentView => ({
  id: "a1",
  startsAt: new Date("2026-11-07T09:00:00Z"), // samedi 7 novembre 2026, 10 h à Paris
  endsAt: new Date("2026-11-07T09:30:00Z"),
  status: "confirmed",
  createdAt: new Date("2026-10-20T10:00:00Z"),
  staffFirstName: "Orhan",
  note: null,
  items: [{ name: "Coupe & taille de barbe", priceCents: 2800, durationMin: 30 }],
  totalPriceCents: 2800,
  durationMinutes: 30,
  ...overrides,
});

const NOW = new Date("2026-10-20T10:00:00Z"); // mardi 20 octobre 2026, 12 h à Paris

describe("R-30, R-31 : délai de modification affiché sur chaque RDV", () => {
  it("donne la date limite quand le RDV est encore modifiable en ligne", () => {
    const view = upcomingView(appointment(), NOW, 48);
    expect(view.changeable).toBe(true);
    expect(view.deadlineLabel).toBe("jeudi 5 novembre, 10:00");
    expect(view.relative).toBe("Dans 18 jours");
    expect(view.dayLabel).toBe("Samedi 7 novembre");
    expect(view.staffLabel).toBe("avec Orhan");
  });

  it("est modifiable à la seconde près de la limite, plus une milliseconde après", () => {
    const a = appointment();
    const deadline = new Date(a.startsAt.getTime() - 48 * 3_600_000);
    expect(upcomingView(a, deadline, 48).changeable).toBe(true);
    const late = upcomingView(a, new Date(deadline.getTime() + 1), 48);
    expect(late.changeable).toBe(false);
    expect(late.deadlineLabel).toBeNull();
  });

  it("R-32 : un RDV pris pour dans moins de 48 h n'est pas modifiable dès sa création", () => {
    const soon = appointment({
      startsAt: new Date("2026-10-21T12:30:00Z"),
      endsAt: new Date("2026-10-21T13:00:00Z"),
    });
    expect(upcomingView(soon, NOW, 48).changeable).toBe(false);
  });

  it("suit le réglage de délai plutôt qu'un nombre fixe", () => {
    const a = appointment();
    const at40h = new Date(a.startsAt.getTime() - 40 * 3_600_000);
    expect(upcomingView(a, at40h, 48).changeable).toBe(false);
    expect(upcomingView(a, at40h, 24).changeable).toBe(true);
  });

  it("annonce aujourd'hui et demain en toutes lettres, sans « Dans N jours »", () => {
    const tomorrow = appointment({
      startsAt: new Date("2026-10-21T12:30:00Z"),
      endsAt: new Date("2026-10-21T13:00:00Z"),
    });
    const view = upcomingView(tomorrow, NOW, 48);
    expect(view.dayLabel).toBe("Demain · mercredi 21 octobre");
    expect(view.time).toBe("14:30");
    expect(view.relative).toBeNull();
    const today = appointment({
      startsAt: new Date("2026-10-20T15:00:00Z"),
      endsAt: new Date("2026-10-20T15:30:00Z"),
    });
    expect(upcomingView(today, NOW, 48).dayLabel).toBe("Aujourd'hui · mardi 20 octobre");
  });

  it("compte les jours à l'heure de Paris, y compris autour du changement d'heure", () => {
    const afterDst = appointment({
      startsAt: new Date("2026-10-26T09:00:00Z"), // lundi 26 octobre, 10 h (heure d'hiver)
      endsAt: new Date("2026-10-26T09:30:00Z"),
    });
    expect(upcomingView(afterDst, NOW, 48).relative).toBe("Dans 6 jours");
  });
});

describe("R-76 : « À venir » et « Passés »", () => {
  const upcoming = appointment({ id: "up" });
  const later = appointment({
    id: "later",
    startsAt: new Date("2026-11-20T09:00:00Z"),
    endsAt: new Date("2026-11-20T09:30:00Z"),
  });
  const done = appointment({
    id: "done",
    status: "honored",
    startsAt: new Date("2026-10-10T08:30:00Z"),
    endsAt: new Date("2026-10-10T09:00:00Z"),
  });
  const cancelledFuture = appointment({ id: "cancelled", status: "cancelled_by_customer" });

  it("classe les RDV confirmés non terminés en « À venir », du plus proche au plus lointain", () => {
    const { upcoming: up } = splitAppointments([later, upcoming, done, cancelledFuture], NOW);
    expect(up.map((a) => a.id)).toEqual(["up", "later"]);
  });

  it("met dans « Passés » les RDV terminés et les RDV annulés, le plus récent d'abord", () => {
    const { past } = splitAppointments([done, upcoming, cancelledFuture], NOW);
    expect(past.map((a) => a.id)).toEqual(["cancelled", "done"]);
  });

  it("un RDV en cours n'est pas encore passé", () => {
    const ongoing = appointment({
      id: "now",
      startsAt: new Date("2026-10-20T09:45:00Z"),
      endsAt: new Date("2026-10-20T10:15:00Z"),
    });
    expect(splitAppointments([ongoing], NOW).upcoming.map((a) => a.id)).toEqual(["now"]);
  });

  it("résume un RDV passé, et marque les annulations", () => {
    expect(pastView(done)).toEqual({
      id: "done",
      whenLabel: "Samedi 10 octobre · 10:30",
      summary: "Coupe & taille de barbe · 28 € · avec Orhan",
      cancelled: false,
      statusLabel: null,
    });
    expect(pastView(cancelledFuture)).toMatchObject({ cancelled: true, statusLabel: "Annulé" });
    expect(pastView({ ...done, status: "cancelled_by_salon" }).statusLabel).toBe(
      "Annulé par le salon",
    );
  });

  it("ne montre jamais « Non venu » au client", () => {
    const view = pastView({ ...done, status: "no_show" });
    expect(view.statusLabel).toBeNull();
    expect(view.cancelled).toBe(false);
  });

  it("additionne plusieurs prestations dans le résumé", () => {
    const view = pastView(
      appointment({
        items: [
          { name: "Coupe homme", priceCents: 1800, durationMin: 30 },
          { name: "Taillage barbe", priceCents: 1200, durationMin: 15 },
        ],
        totalPriceCents: 3000,
      }),
    );
    expect(view.summary).toBe("Coupe homme + Taillage barbe · 30 € · avec Orhan");
  });
});
