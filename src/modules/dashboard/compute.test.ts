import { describe, expect, it } from "vitest";
import { computeDashboard, type DashboardAppointment, type DashboardStaff } from "./compute";

// R-53 : le chiffre d'affaires indicatif additionne les RDV honorés à leur prix figé, ajustable à la clôture.
// R-51 : une fois passé, un RDV est honoré par défaut.

const NOW = new Date("2026-10-20T14:00:00Z"); // mardi 20 octobre, 16 h à Paris
const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 9, 20, hour, minute));

const team: DashboardStaff[] = [
  { id: "orhan", firstName: "Orhan", role: "barber" },
  { id: "enes", firstName: "Enes", role: "barber" },
  { id: "kaan", firstName: "Kaan", role: "apprentice" },
];

let counter = 0;
function appt(overrides: Partial<DashboardAppointment> = {}): DashboardAppointment {
  counter++;
  return {
    id: `a${counter}`,
    staffId: "orhan",
    status: "confirmed",
    source: "online",
    startsAt: at(8),
    endsAt: at(8, 30),
    priceCents: 2800,
    adjustedAmountCents: null,
    ...overrides,
  };
}

describe("R-53 : chiffre d'affaires indicatif", () => {
  it("additionne les RDV terminés au prix figé, sans rien enregistrer (R-51)", () => {
    const totals = computeDashboard([appt(), appt({ priceCents: 1800 })], team, NOW);
    expect(totals.revenueCents).toBe(4600);
  });

  it("ne compte pas un RDV à venir ni un RDV en cours", () => {
    const totals = computeDashboard(
      [
        appt({ startsAt: at(17), endsAt: at(17, 30) }), // à venir
        appt({ startsAt: at(13, 45), endsAt: at(14, 15) }), // en cours
      ],
      team,
      NOW,
    );
    expect(totals.revenueCents).toBe(0);
    expect(totals.appointmentCount).toBe(2);
  });

  it("ne compte pas les lapins ni les annulations", () => {
    const totals = computeDashboard(
      [
        appt(),
        appt({ status: "no_show" }),
        appt({ status: "cancelled_by_customer" }),
        appt({ status: "cancelled_by_salon" }),
      ],
      team,
      NOW,
    );
    expect(totals.revenueCents).toBe(2800);
  });

  it("compte un RDV enregistré « honoré » en base", () => {
    expect(computeDashboard([appt({ status: "honored" })], team, NOW).revenueCents).toBe(2800);
  });

  it("R-53 : le montant ajusté remplace le prix figé, y compris à 0 €", () => {
    const totals = computeDashboard(
      [appt({ adjustedAmountCents: 2000 }), appt({ adjustedAmountCents: 0 }), appt()],
      team,
      NOW,
    );
    expect(totals.revenueCents).toBe(2000 + 0 + 2800);
    expect(totals.adjustedCount).toBe(2);
  });

  it("un montant ajusté sur un RDV non honoré ne compte pas", () => {
    expect(
      computeDashboard([appt({ status: "no_show", adjustedAmountCents: 5000 })], team, NOW)
        .revenueCents,
    ).toBe(0);
  });
});

describe("tableau de bord : rendez-vous et lapins", () => {
  it("compte les rendez-vous non annulés, en ligne et au salon", () => {
    const totals = computeDashboard(
      [
        appt(),
        appt({ source: "salon" }),
        appt({ source: "salon", status: "no_show" }),
        appt({ status: "cancelled_by_customer" }),
        appt({ startsAt: at(17), endsAt: at(17, 30) }), // à venir : compte comme rendez-vous
      ],
      team,
      NOW,
    );
    expect(totals.appointmentCount).toBe(4);
    expect(totals.onlineCount).toBe(2);
    expect(totals.salonCount).toBe(2);
    expect(totals.noShowCount).toBe(1);
  });

  it("détaille par membre, dans l'ordre de l'équipe, y compris celui sans RDV", () => {
    const totals = computeDashboard(
      [
        appt({ staffId: "orhan" }),
        appt({ staffId: "orhan", priceCents: 1800 }),
        appt({ staffId: "kaan", priceCents: 1000 }),
        appt({ staffId: "kaan", status: "no_show" }),
      ],
      team,
      NOW,
    );
    expect(totals.perStaff).toEqual([
      {
        id: "orhan",
        firstName: "Orhan",
        role: "barber",
        appointments: 2,
        revenueCents: 4600,
        noShows: 0,
      },
      {
        id: "enes",
        firstName: "Enes",
        role: "barber",
        appointments: 0,
        revenueCents: 0,
        noShows: 0,
      },
      {
        id: "kaan",
        firstName: "Kaan",
        role: "apprentice",
        appointments: 2,
        revenueCents: 1000,
        noShows: 1,
      },
    ]);
  });

  it("le total des lignes par membre égale le total général", () => {
    const list = [appt(), appt({ staffId: "enes" }), appt({ staffId: "kaan", status: "no_show" })];
    const totals = computeDashboard(list, team, NOW);
    expect(totals.perStaff.reduce((n, s) => n + s.appointments, 0)).toBe(totals.appointmentCount);
    expect(totals.perStaff.reduce((n, s) => n + s.revenueCents, 0)).toBe(totals.revenueCents);
    expect(totals.perStaff.reduce((n, s) => n + s.noShows, 0)).toBe(totals.noShowCount);
  });

  it("une période vide donne des zéros", () => {
    const totals = computeDashboard([], team, NOW);
    expect(totals).toMatchObject({ revenueCents: 0, appointmentCount: 0, noShowCount: 0 });
    expect(totals.perStaff).toHaveLength(3);
  });
});
