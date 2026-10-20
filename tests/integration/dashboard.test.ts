import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DomainError, type DomainErrorCode } from "../../src/lib/domain-error";
import {
  adjustAppointmentAmount,
  createAppointment,
  markNoShow,
  salonCancelAppointment,
} from "../../src/modules/booking";
import { loadDashboard } from "../../src/modules/dashboard";
import { setStaffActive } from "../../src/modules/staff/manage";
import {
  COUPE,
  COUPE_BARBE,
  ENES,
  KAAN,
  NOW,
  ORHAN,
  TAILLAGE_BARBE,
  connectTestDb,
  createCustomer,
  paris,
} from "./helpers";

// R-53 : le chiffre d'affaires indicatif additionne les RDV honorés à leur prix figé, ajustable à la clôture.
// R-54 : toute correction de montant est inscrite au journal. R-55 : ce chiffre sert de repère, la caisse fait foi.

const t = connectTestDb();
let customerId: string;

beforeEach(async () => {
  await t.reset();
  customerId = await createCustomer(t.sql, { name: "Thomas" });
  // Le salon est limité à 2 RDV à venir par client (D-41) : ces scénarios en posent davantage pour un seul client.
  await t.sql`update salon_settings set max_upcoming_per_customer = 50`;
});
afterAll(() => t.close());

/** Samedi 7 novembre 2026, 18 h : tous les RDV de mardi à samedi 17 h 30 sont terminés. */
const SATURDAY_EVENING = paris("2026-11-07", "18:00");

const book = (
  date: string,
  time: string,
  options: {
    staffId?: string;
    serviceIds?: string[];
    customer?: string;
    source?: "online" | "salon";
    bookedAt?: Date;
  } = {},
) =>
  createAppointment(
    t.db,
    {
      customerId: options.customer ?? customerId,
      serviceIds: options.serviceIds ?? [COUPE_BARBE],
      staffId: options.staffId ?? ORHAN,
      startsAt: paris(date, time),
      source: options.source ?? "salon",
      ...((options.source ?? "salon") === "salon" ? { createdByStaffId: ENES } : {}),
    },
    options.bookedAt ?? NOW,
  );

const day = (date: string, now: Date = SATURDAY_EVENING) =>
  loadDashboard(t.db, { kind: "day", date }, now);

async function expectRefused(promise: Promise<unknown>, code: DomainErrorCode) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `une erreur « ${code} » était attendue`).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
}

describe("R-53 : le bilan du jour", () => {
  it("additionne les RDV honorés à leur prix figé et compte rendez-vous, lapins et origines", async () => {
    await book("2026-11-07", "10:00"); // 28 € honoré
    await book("2026-11-07", "11:00", { serviceIds: [COUPE, TAILLAGE_BARBE] }); // 18 + 12 = 30 € honoré
    const lapin = await book("2026-11-07", "13:00", { source: "online" });
    await markNoShow(
      t.db,
      { appointmentId: lapin.id, authorStaffId: ENES },
      paris("2026-11-07", "13:10"),
    );
    await book("2026-11-06", "10:00"); // la veille : hors du jour

    const view = await day("2026-11-07");
    expect(view.totals.revenueCents).toBe(5800);
    expect(view.totals.appointmentCount).toBe(3);
    expect(view.totals.onlineCount).toBe(1);
    expect(view.totals.salonCount).toBe(2);
    expect(view.totals.noShowCount).toBe(1);
  });

  it("garde le prix figé du RDV quand la carte change ensuite (R-16)", async () => {
    await book("2026-11-07", "10:00");
    await t.sql`update service set price_cents = 9900`;
    expect((await day("2026-11-07")).totals.revenueCents).toBe(2800);
  });

  it("ne compte pas encore un RDV à venir ni en cours (R-51)", async () => {
    await book("2026-11-07", "17:00"); // finit à 17 h 30
    const earlier = paris("2026-11-07", "17:10"); // en cours
    expect((await day("2026-11-07", earlier)).totals.revenueCents).toBe(0);
    expect((await day("2026-11-07", earlier)).totals.appointmentCount).toBe(1);
    expect((await day("2026-11-07", paris("2026-11-07", "17:30"))).totals.revenueCents).toBe(2800);
  });

  it("ne compte pas un RDV annulé, ni dans les rendez-vous ni dans le chiffre", async () => {
    const created = await book("2026-11-07", "10:00");
    await salonCancelAppointment(t.db, { appointmentId: created.id, authorStaffId: ENES }, NOW);
    const view = await day("2026-11-07");
    expect(view.totals).toMatchObject({ revenueCents: 0, appointmentCount: 0 });
  });

  it("détaille par membre actif, même sans RDV, dans l'ordre de l'équipe", async () => {
    await book("2026-11-07", "10:00", { staffId: ORHAN });
    await book("2026-11-07", "10:00", { staffId: KAAN, serviceIds: [await apprenticeService()] });
    const { totals } = await day("2026-11-07");
    expect(totals.perStaff.map((s) => [s.firstName, s.appointments])).toEqual([
      ["Orhan", 1],
      ["Enes", 0],
      ["Kaan", 1],
      ["Taha", 0],
    ]);
    expect(totals.perStaff[0]).toMatchObject({ role: "barber", revenueCents: 2800 });
  });

  it("garde le membre retiré de l'équipe qui a des RDV sur la période, mais pas celui sans RDV", async () => {
    await book("2026-11-07", "10:00", { staffId: ENES });
    const manager = "11111111-1111-4111-8111-111111111111";
    await setStaffActive(t.db, ENES, false, manager);
    await setStaffActive(t.db, KAAN, false, manager);
    const { totals } = await day("2026-11-07");
    const names = totals.perStaff.map((s) => s.firstName);
    expect(names).toContain("Enes");
    expect(names).not.toContain("Kaan");
    expect(totals.perStaff.reduce((n, s) => n + s.appointments, 0)).toBe(totals.appointmentCount);
  });
});

async function apprenticeService(): Promise<string> {
  const [row] =
    await t.sql`select id from service where performed_by = 'apprentice' and bookable_online limit 1`;
  return row.id as string;
}

describe("R-53 : la semaine et le mois", () => {
  it("la semaine va du lundi au dimanche (heure de Paris)", async () => {
    await book("2026-11-03", "10:00"); // mardi
    await book("2026-11-07", "10:00"); // samedi
    await book("2026-10-31", "10:00", { bookedAt: paris("2026-10-26", "08:00") }); // samedi précédent
    const week = await loadDashboard(t.db, { kind: "week" }, SATURDAY_EVENING);
    expect(week.period.title).toBe("Semaine du 2 au 8 novembre");
    expect(week.totals.appointmentCount).toBe(2);
    expect(week.totals.revenueCents).toBe(5600);
    const previous = await loadDashboard(
      t.db,
      { kind: "week", date: week.period.prevDate },
      SATURDAY_EVENING,
    );
    expect(previous.totals.appointmentCount).toBe(1);
  });

  it("le mois coupe au 1er : un RDV du 31 octobre appartient à octobre", async () => {
    await book("2026-10-31", "10:00", { bookedAt: paris("2026-10-26", "08:00") });
    await book("2026-11-03", "10:00");
    const november = await loadDashboard(t.db, { kind: "month" }, SATURDAY_EVENING);
    expect(november.period.title).toBe("Novembre 2026");
    expect(november.totals.appointmentCount).toBe(1);
    const october = await loadDashboard(
      t.db,
      { kind: "month", date: november.period.prevDate },
      SATURDAY_EVENING,
    );
    expect(october.period.title).toBe("Octobre 2026");
    expect(october.totals.appointmentCount).toBe(1);
  });
});

describe("R-53, R-54 : ajuster le montant à la clôture", () => {
  it("remplace le prix figé dans le chiffre d'affaires et s'inscrit au journal avec l'auteur", async () => {
    const created = await book("2026-11-07", "10:00");
    const result = await adjustAppointmentAmount(
      t.db,
      { appointmentId: created.id, authorStaffId: ENES, amountCents: 2000 },
      SATURDAY_EVENING,
    );
    expect(result).toEqual({ amountCents: 2000, adjusted: true });
    expect((await day("2026-11-07")).totals).toMatchObject({
      revenueCents: 2000,
      adjustedCount: 1,
    });

    const [entry] = await t.sql`
      select actor_type, actor_id, action, entity_id, before, after
      from audit_log where action = 'appointment.amount_adjusted'`;
    expect(entry).toMatchObject({
      actor_type: "staff",
      actor_id: ENES,
      entity_id: created.id,
      before: { amountCents: 2800, adjustedAmountCents: null },
      after: { amountCents: 2000, adjustedAmountCents: 2000 },
    });
  });

  it("accepte 0 € (offert) et chaque correction laisse sa trace", async () => {
    const created = await book("2026-11-07", "10:00");
    const input = { appointmentId: created.id, authorStaffId: ORHAN };
    await adjustAppointmentAmount(t.db, { ...input, amountCents: 0 }, SATURDAY_EVENING);
    await adjustAppointmentAmount(t.db, { ...input, amountCents: 2500 }, SATURDAY_EVENING);
    expect((await day("2026-11-07")).totals.revenueCents).toBe(2500);
    const entries =
      await t.sql`select before, after from audit_log where action = 'appointment.amount_adjusted' order by id`;
    expect(entries).toHaveLength(2);
    expect(entries[1].before).toMatchObject({ amountCents: 0, adjustedAmountCents: 0 });
  });

  it("revient au prix de la carte avec null, et le journal le dit", async () => {
    const created = await book("2026-11-07", "10:00");
    const input = { appointmentId: created.id, authorStaffId: ENES };
    await adjustAppointmentAmount(t.db, { ...input, amountCents: 1000 }, SATURDAY_EVENING);
    const back = await adjustAppointmentAmount(
      t.db,
      { ...input, amountCents: null },
      SATURDAY_EVENING,
    );
    expect(back).toEqual({ amountCents: 2800, adjusted: false });
    expect((await day("2026-11-07")).totals).toMatchObject({
      revenueCents: 2800,
      adjustedCount: 0,
    });
    const [last] =
      await t.sql`select after from audit_log where action = 'appointment.amount_adjusted' order by id desc limit 1`;
    expect(last.after).toMatchObject({ amountCents: 2800, adjustedAmountCents: null });
  });

  it("ne journalise rien quand le montant demandé est déjà le montant du RDV", async () => {
    const created = await book("2026-11-07", "10:00");
    const input = { appointmentId: created.id, authorStaffId: ENES };
    await adjustAppointmentAmount(t.db, { ...input, amountCents: 2800 }, SATURDAY_EVENING); // = prix de la carte
    await adjustAppointmentAmount(t.db, { ...input, amountCents: null }, SATURDAY_EVENING); // déjà au prix
    expect(
      await t.sql`select 1 from audit_log where action = 'appointment.amount_adjusted'`,
    ).toHaveLength(0);
    const [row] =
      await t.sql`select adjusted_amount_cents from appointment where id = ${created.id}`;
    expect(row.adjusted_amount_cents).toBeNull();
  });

  it("exige un auteur de l'équipe (R-74)", async () => {
    const created = await book("2026-11-07", "10:00");
    await expectRefused(
      adjustAppointmentAmount(
        t.db,
        { appointmentId: created.id, authorStaffId: "", amountCents: 1000 },
        SATURDAY_EVENING,
      ),
      "author_required",
    );
    await expectRefused(
      adjustAppointmentAmount(
        t.db,
        {
          appointmentId: created.id,
          authorStaffId: "00000000-0000-4000-8000-00000000dead",
          amountCents: 1000,
        },
        SATURDAY_EVENING,
      ),
      "unknown_author",
    );
  });

  it("refuse un montant négatif, décimal ou démesuré", async () => {
    const created = await book("2026-11-07", "10:00");
    const input = { appointmentId: created.id, authorStaffId: ENES };
    for (const amountCents of [-1, 12.5, 100_001, Number.NaN]) {
      await expectRefused(
        adjustAppointmentAmount(t.db, { ...input, amountCents }, SATURDAY_EVENING),
        "invalid_amount",
      );
    }
  });

  it("n'ajuste qu'un RDV commencé : pas un RDV à venir", async () => {
    const created = await book("2026-11-07", "10:00");
    await expectRefused(
      adjustAppointmentAmount(
        t.db,
        { appointmentId: created.id, authorStaffId: ENES, amountCents: 1000 },
        paris("2026-11-07", "09:00"),
      ),
      "not_started",
    );
  });

  it("n'ajuste ni un lapin ni un RDV annulé", async () => {
    const lapin = await book("2026-11-07", "10:00");
    await markNoShow(
      t.db,
      { appointmentId: lapin.id, authorStaffId: ENES },
      paris("2026-11-07", "10:10"),
    );
    await expectRefused(
      adjustAppointmentAmount(
        t.db,
        { appointmentId: lapin.id, authorStaffId: ENES, amountCents: 1000 },
        SATURDAY_EVENING,
      ),
      "not_modifiable",
    );
    const annule = await book("2026-11-07", "11:00");
    await salonCancelAppointment(t.db, { appointmentId: annule.id, authorStaffId: ENES }, NOW);
    await expectRefused(
      adjustAppointmentAmount(
        t.db,
        { appointmentId: annule.id, authorStaffId: ENES, amountCents: 1000 },
        SATURDAY_EVENING,
      ),
      "not_modifiable",
    );
  });

  it("refuse un RDV inconnu", async () => {
    await expectRefused(
      adjustAppointmentAmount(
        t.db,
        {
          appointmentId: "00000000-0000-4000-8000-00000000dead",
          authorStaffId: ENES,
          amountCents: 1000,
        },
        SATURDAY_EVENING,
      ),
      "appointment_not_found",
    );
  });
});

describe("tableau de bord : lapins récents", () => {
  async function noShow(date: string, time: string, customer: string, staffId = ORHAN) {
    const created = await book(date, time, { customer, staffId });
    await markNoShow(
      t.db,
      { appointmentId: created.id, authorStaffId: ENES },
      paris(date, "19:30"),
    );
    return created;
  }

  it("liste les derniers lapins, le plus récent d'abord, avec leur rang pour le client", async () => {
    const adam = await createCustomer(t.sql, { name: "Adam" });
    await noShow("2026-11-03", "10:00", adam);
    await noShow("2026-11-05", "10:00", customerId, ENES);
    await noShow("2026-11-07", "10:00", adam);

    const { recentNoShows } = await day("2026-11-07", paris("2026-11-08", "09:00"));
    expect(recentNoShows.map((n) => [n.customerName, n.ordinal, n.staffFirstName])).toEqual([
      ["Adam C.", 2, "Orhan"],
      ["Thomas C.", 1, "Enes"],
      ["Adam C.", 1, "Orhan"],
    ]);
  });

  it("signale un client bloqué en ligne (R-52) et donne le seuil des réglages", async () => {
    const adam = await createCustomer(t.sql, { name: "Adam", blocked: true });
    await noShow("2026-11-03", "10:00", adam);
    await t.sql`update salon_settings set no_show_block_threshold = 3`;
    const view = await day("2026-11-07", paris("2026-11-08", "09:00"));
    expect(view.recentNoShows[0].blocked).toBe(true);
    expect(view.noShowBlockThreshold).toBe(3);
  });

  it("n'en garde que cinq", async () => {
    for (const [i, time] of ["10:00", "10:30", "11:00", "13:00", "13:30", "14:00"].entries()) {
      await noShow("2026-11-07", time, await createCustomer(t.sql, { name: `Client${i}` }));
    }
    expect((await day("2026-11-07", paris("2026-11-08", "09:00"))).recentNoShows).toHaveLength(5);
  });

  it("n'affiche aucune identité pour une fiche supprimée (D-43)", async () => {
    const adam = await createCustomer(t.sql, { name: "Adam" });
    await noShow("2026-11-03", "10:00", adam);
    await t.sql`update customer set first_name = null, last_name = null, phone = null, email = null, anonymized_at = now() where id = ${adam}`;
    const { recentNoShows } = await day("2026-11-07", paris("2026-11-08", "09:00"));
    expect(recentNoShows[0].customerName).toBe("Client supprimé");
  });

  it("sans lapin, la liste est vide", async () => {
    await book("2026-11-07", "10:00");
    expect((await day("2026-11-07")).recentNoShows).toEqual([]);
  });
});
