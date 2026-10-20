import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DomainError, type DomainErrorCode } from "../../src/lib/domain-error";
import { createAppointment, type CreateAppointmentInput } from "../../src/modules/booking";
import {
  COLORATION,
  COUPE,
  COUPE_BARBE,
  COUPE_BARBE_FORMATION,
  COUPE_FORMATION,
  ENES,
  KAAN,
  NOW,
  ORHAN,
  SOIN_VISAGE,
  TAHA,
  TAILLAGE_BARBE,
  TRIBAL,
  connectTestDb,
  createCustomer,
  insertAppointment,
  paris,
} from "./helpers";

const t = connectTestDb();
let customerId: string;

beforeEach(async () => {
  await t.reset();
  customerId = await createCustomer(t.sql);
});
afterAll(() => t.close());

const TUESDAY = "2026-11-03";

const book = (overrides: Partial<CreateAppointmentInput> = {}, now: Date = NOW) =>
  createAppointment(
    t.db,
    {
      customerId,
      serviceIds: [COUPE],
      staffId: ORHAN,
      startsAt: paris(TUESDAY, "10:00"),
      source: "online",
      // R-74 : une réservation au salon est signée par un membre de l'équipe.
      ...(overrides.source === "salon" ? { createdByStaffId: ORHAN } : {}),
      ...overrides,
    },
    now,
  );

/** Attend un refus métier avec ce code. */
async function expectRefused(promise: Promise<unknown>, code: DomainErrorCode) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `une erreur « ${code} » était attendue`).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
}

const countAppointments = async () => {
  const [{ n }] = await t.sql`select count(*)::int as n from appointment`;
  return n as number;
};

describe("R-24 : un RDV créé est immédiatement confirmé", () => {
  it("enregistre le RDV au statut « confirmed », avec son origine", async () => {
    const created = await book();
    const [row] =
      await t.sql`select status, source, staff_id from appointment where id = ${created.id}`;
    expect(row).toMatchObject({ status: "confirmed", source: "online", staff_id: ORHAN });
  });

  it("enregistre les heures en UTC : 10 h à Paris = 9 h UTC l'hiver, 8 h UTC l'été", async () => {
    const winter = await book();
    const summer = await book(
      { startsAt: paris("2026-10-24", "10:00") },
      paris("2026-10-20", "08:00"),
    );
    const rows = await t.sql`
      select id, to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as utc from appointment`;
    const utc = Object.fromEntries(rows.map((r) => [r.id, r.utc]));
    expect(utc[winter.id]).toBe("2026-11-03 09:00");
    expect(utc[summer.id]).toBe("2026-10-24 08:00");
  });
});

describe("R-14 et R-16 : prestations à la suite, prix et durée figés", () => {
  it("additionne durées et prix, et enchaîne les prestations dans l'ordre", async () => {
    const created = await book({ serviceIds: [COUPE, TAILLAGE_BARBE], source: "salon" });
    expect(created.durationMinutes).toBe(45);
    expect(created.totalPriceCents).toBe(3000);
    expect(created.endsAt).toEqual(paris(TUESDAY, "10:45"));
    const items = await t.sql`
      select name_snapshot, price_cents, duration_min, position
      from appointment_item where appointment_id = ${created.id} order by position`;
    expect(items.map((i) => i.name_snapshot)).toEqual(["Coupe homme", "Taillage barbe"]);
    expect(items.map((i) => i.price_cents)).toEqual([1800, 1200]);
  });

  it("une hausse de tarif ou le retrait de la prestation ne change pas le RDV existant", async () => {
    const created = await book();
    await t.sql`update service set price_cents = 2200, duration_min = 45, name = 'Coupe 2027', active = false where id = ${COUPE}`;
    const [item] = await t.sql`
      select name_snapshot, price_cents, duration_min from appointment_item where appointment_id = ${created.id}`;
    expect(item).toMatchObject({
      name_snapshot: "Coupe homme",
      price_cents: 1800,
      duration_min: 30,
    });
    const [appt] = await t.sql`select ends_at from appointment where id = ${created.id}`;
    expect(appt.ends_at).toEqual(paris(TUESDAY, "10:30"));
  });

  it("refuse une prestation retirée de la carte pour une nouvelle réservation", async () => {
    await t.sql`update service set active = false where id = ${COUPE}`;
    await expectRefused(book(), "unknown_service");
  });

  it("refuse une demande sans prestation", async () => {
    await expectRefused(book({ serviceIds: [] }), "no_services");
  });
});

describe("R-13 : seuls les coiffeurs habilités réalisent une prestation", () => {
  it("refuse un coiffeur qui n'est pas habilité", async () => {
    await expectRefused(
      book({ serviceIds: [COUPE_FORMATION], staffId: ORHAN }),
      "staff_not_eligible",
    );
    await expectRefused(book({ serviceIds: [COUPE], staffId: KAAN }), "staff_not_eligible");
  });

  it("« Sans préférence » ne choisit qu'un coiffeur habilité", async () => {
    const apprentice = await book({ serviceIds: [COUPE_FORMATION], staffId: "any" });
    expect([KAAN, TAHA]).toContain(apprentice.staffId);
    const barber = await book({
      serviceIds: [COUPE],
      staffId: "any",
      startsAt: paris(TUESDAY, "11:00"),
    });
    expect([ORHAN, ENES]).toContain(barber.staffId);
  });

  it("suit les habilitations de la base : retirer Enes de la coupe le rend inéligible", async () => {
    await t.sql`delete from service_staff where service_id = ${COUPE} and staff_id = ${ENES}`;
    await expectRefused(book({ staffId: ENES }), "staff_not_eligible");
    const created = await book({ staffId: "any" });
    expect(created.staffId).toBe(ORHAN);
  });

  it("exige l'habilitation pour toutes les prestations du RDV", async () => {
    await t.sql`delete from service_staff where service_id = ${TAILLAGE_BARBE} and staff_id = ${ORHAN}`;
    await expectRefused(
      book({ serviceIds: [COUPE, TAILLAGE_BARBE], staffId: ORHAN }),
      "staff_not_eligible",
    );
    const created = await book({ serviceIds: [COUPE, TAILLAGE_BARBE], staffId: "any" });
    expect(created.staffId).toBe(ENES);
  });

  it("ignore un coiffeur désactivé", async () => {
    await t.sql`update staff set active = false where id = ${ORHAN}`;
    await expectRefused(book({ staffId: ORHAN }), "staff_not_eligible");
  });
});

describe("R-17 : les prestations sur appel ne se réservent pas en ligne", () => {
  it("accepte le soin du visage en ligne (D-36)", async () => {
    await book({ serviceIds: [SOIN_VISAGE] });
  });

  it("refuse en ligne la coloration et le tribal, que le salon peut réserver", async () => {
    await expectRefused(book({ serviceIds: [COLORATION] }), "not_bookable_online");
    await expectRefused(book({ serviceIds: [TRIBAL] }), "not_bookable_online");
    await expectRefused(book({ serviceIds: [COUPE, COLORATION] }), "not_bookable_online");
    await book({ serviceIds: [COLORATION], source: "salon" });
  });
});

describe("R-18 : un RDV ne mélange pas prestations coiffeurs et apprentis", () => {
  it("refuse le mélange, en ligne comme au salon", async () => {
    await expectRefused(book({ serviceIds: [COUPE, COUPE_FORMATION] }), "mixed_categories");
    await expectRefused(
      book({
        serviceIds: [COUPE_BARBE_FORMATION, TAILLAGE_BARBE],
        source: "salon",
        staffId: "any",
      }),
      "mixed_categories",
    );
  });

  it("accepte deux prestations d'apprentis", async () => {
    const created = await book({
      serviceIds: [COUPE_FORMATION, COUPE_BARBE_FORMATION],
      staffId: KAAN,
    });
    expect(created.durationMinutes).toBe(90);
  });
});

describe("R-01 à R-06 : le créneau est revérifié à la réservation", () => {
  it("R-01 : refuse un lundi et un dimanche", async () => {
    await expectRefused(book({ startsAt: paris("2026-11-09", "10:00") }), "closed"); // lundi
    await expectRefused(book({ startsAt: paris("2026-11-08", "10:00") }), "closed"); // dimanche
  });

  it("R-03 : refuse un jour de fermeture exceptionnelle déclaré en base", async () => {
    await t.sql`insert into closure (starts_on, ends_on, reason) values ('2026-11-03', '2026-11-03', 'Test')`;
    await expectRefused(book(), "closed");
    await book({ startsAt: paris("2026-11-04", "10:00") });
  });

  it("R-03 : suit des horaires modifiés en base", async () => {
    await t.sql`delete from opening_hours where weekday = 2`;
    await expectRefused(book(), "closed");
  });

  it("R-04 : en ligne, refuse un départ hors de la grille de 30 min ; le salon accepte 15 min", async () => {
    await expectRefused(book({ startsAt: paris(TUESDAY, "10:15") }), "off_grid");
    await book({ startsAt: paris(TUESDAY, "10:15"), source: "salon" });
  });

  it("R-04 : le pas vient des réglages", async () => {
    await t.sql`update salon_settings set online_slot_step_minutes = 15`;
    await book({ startsAt: paris(TUESDAY, "10:15") });
  });

  it("R-04 : refuse un RDV qui chevaucherait la pause de midi ou dépasserait 19 h", async () => {
    await expectRefused(
      book({ serviceIds: [COUPE_FORMATION], staffId: KAAN, startsAt: paris(TUESDAY, "11:30") }),
      "outside_hours",
    );
    await expectRefused(book({ startsAt: paris(TUESDAY, "12:00") }), "outside_hours");
    await expectRefused(book({ startsAt: paris(TUESDAY, "19:00") }), "outside_hours");
  });

  it("R-05 : le dernier départ découle de la durée", async () => {
    await book({ startsAt: paris(TUESDAY, "18:30") }); // 30 min, finit à 19 h
    await expectRefused(
      book({ serviceIds: [COUPE_FORMATION], staffId: KAAN, startsAt: paris(TUESDAY, "18:30") }),
      "outside_hours",
    );
    await book({
      serviceIds: [COUPE_FORMATION],
      staffId: KAAN,
      startsAt: paris(TUESDAY, "18:00"),
    });
  });

  it("R-06 : refuse en ligne à moins d'une heure, accepte une heure pile", async () => {
    const now = paris(TUESDAY, "09:30");
    await expectRefused(book({}, now), "too_soon"); // 10 h : dans 30 min
    await book({ startsAt: paris(TUESDAY, "10:30") }, now); // dans 60 min pile
  });

  it("R-06 : lit le délai dans les réglages", async () => {
    await t.sql`update salon_settings set min_notice_minutes = 120`;
    const now = paris(TUESDAY, "09:30");
    await expectRefused(book({ startsAt: paris(TUESDAY, "11:00") }, now), "too_soon");
    await book({ startsAt: paris(TUESDAY, "11:30") }, now);
  });

  it("R-06 : refuse en ligne au-delà de 6 semaines, accepte 42 jours pile", async () => {
    const now = paris(TUESDAY, "10:00");
    await book({ startsAt: paris("2026-12-15", "10:00") }, now);
    await expectRefused(book({ startsAt: paris("2026-12-15", "10:30") }, now), "too_far");
    await expectRefused(book({ startsAt: paris("2027-01-12", "10:00") }, now), "too_far");
  });

  it("R-27 : le salon n'est pas soumis aux délais, sauf pour le passé", async () => {
    const now = paris(TUESDAY, "10:10");
    await expectRefused(book({ source: "salon" }, now), "in_past"); // 10 h est passé
    await book({ source: "salon", startsAt: paris(TUESDAY, "10:15") }, now); // dans 5 min
    await book({ source: "salon", startsAt: paris("2027-01-12", "10:00") }, now); // dans 10 semaines
  });
});

describe("R-21 et R-22 : le coiffeur doit être libre sur toute la durée", () => {
  it("refuse un créneau qui recouvre un RDV existant du coiffeur", async () => {
    await book({ serviceIds: [COUPE, COUPE_BARBE] }); // 10 h – 11 h
    await expectRefused(book({ startsAt: paris(TUESDAY, "10:30") }), "slot_unavailable");
    await book({ startsAt: paris(TUESDAY, "11:00") }); // juste après
  });

  it("refuse un créneau qui recouvre une absence", async () => {
    await t.sql`insert into absence (staff_id, starts_at, ends_at, reason)
                values (${ORHAN}, ${paris(TUESDAY, "10:00")}, ${paris(TUESDAY, "12:00")}, 'Test')`;
    await expectRefused(book(), "slot_unavailable");
    await expectRefused(
      book({ source: "salon", startsAt: paris(TUESDAY, "11:30") }),
      "slot_unavailable",
    );
    await book({ startsAt: paris(TUESDAY, "13:00") });
  });

  it("l'absence d'un coiffeur n'empêche pas de réserver un autre coiffeur", async () => {
    await t.sql`insert into absence (staff_id, starts_at, ends_at)
                values (${ORHAN}, ${paris(TUESDAY, "10:00")}, ${paris(TUESDAY, "19:00")})`;
    const created = await book({ staffId: "any" });
    expect(created.staffId).toBe(ENES);
  });

  it("un RDV annulé libère le créneau", async () => {
    const first = await book();
    await t.sql`update appointment set status = 'cancelled_by_customer' where id = ${first.id}`;
    await book();
  });

  it("une coloration occupe le coiffeur toute sa durée (le salon la réserve)", async () => {
    await book({
      serviceIds: [COLORATION, COUPE, COUPE_BARBE],
      source: "salon",
      startsAt: paris(TUESDAY, "14:00"),
    }); // 90 min : 14 h – 15 h 30
    await expectRefused(book({ startsAt: paris(TUESDAY, "15:00") }), "slot_unavailable");
    const other = await book({ startsAt: paris(TUESDAY, "15:00"), staffId: "any" });
    expect(other.staffId).toBe(ENES);
  });
});

describe("R-20 : « Sans préférence »", () => {
  it("attribue le coiffeur qui a le moins de RDV ce jour-là", async () => {
    await book({ staffId: ORHAN, startsAt: paris(TUESDAY, "10:00") });
    const created = await book({ staffId: "any", startsAt: paris(TUESDAY, "14:00") });
    expect(created.staffId).toBe(ENES);
  });

  it("à égalité, prend le premier de l'ordre d'affichage", async () => {
    const created = await book({ staffId: "any" });
    expect(created.staffId).toBe(ORHAN);
  });

  it("propose l'autre coiffeur quand le premier est occupé à cette heure", async () => {
    await book({ staffId: ORHAN });
    const created = await book({ staffId: "any", source: "salon" });
    expect(created.staffId).toBe(ENES);
  });

  it("refuse quand tous les coiffeurs sont pris", async () => {
    const third = await createCustomer(t.sql);
    await book({ staffId: ORHAN });
    await book({ staffId: ENES });
    await expectRefused(book({ staffId: "any", customerId: third }), "slot_unavailable");
  });

  it("le départage compte seulement les RDV du même jour", async () => {
    // Deux autres clients chargent Orhan le mercredi ; le mardi, les deux coiffeurs sont à égalité.
    const [other1, other2] = await Promise.all([createCustomer(t.sql), createCustomer(t.sql)]);
    await book({ customerId: other1, staffId: ORHAN, startsAt: paris("2026-11-04", "10:00") });
    await book({ customerId: other2, staffId: ORHAN, startsAt: paris("2026-11-04", "11:00") });
    const created = await book({ staffId: "any" }); // mardi : égalité à zéro
    expect(created.staffId).toBe(ORHAN);
  });
});

describe("R-23 : deux réservations simultanées, une seule aboutit", () => {
  it("à la même seconde sur le même coiffeur, l'une réussit et les autres reçoivent « créneau pris »", async () => {
    const others = await Promise.all([
      createCustomer(t.sql),
      createCustomer(t.sql),
      createCustomer(t.sql),
    ]);
    const results = await Promise.allSettled(
      others.map((id) => book({ customerId: id, staffId: ORHAN })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((r) => r.status === "rejected")) {
      expect((r as PromiseRejectedResult).reason).toMatchObject({ code: "slot_unavailable" });
    }
    expect(await countAppointments()).toBe(1);
  });

  it("« Sans préférence » : deux clients simultanés obtiennent deux coiffeurs différents, le troisième est refusé", async () => {
    const others = await Promise.all([
      createCustomer(t.sql),
      createCustomer(t.sql),
      createCustomer(t.sql),
    ]);
    const results = await Promise.allSettled(
      others.map((id) => book({ customerId: id, staffId: "any" })),
    );
    const done = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<
      Awaited<ReturnType<typeof book>>
    >[];
    expect(done).toHaveLength(2);
    expect(new Set(done.map((r) => r.value.staffId))).toEqual(new Set([ORHAN, ENES]));
    const refused = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(refused).toHaveLength(1);
    expect(refused[0].reason).toMatchObject({ code: "slot_unavailable" });
  });
});

describe("R-25 : au plus 2 RDV à venir", () => {
  it("refuse un troisième RDV à venir", async () => {
    await book({ startsAt: paris(TUESDAY, "10:00") });
    await book({ startsAt: paris(TUESDAY, "11:00") });
    await expectRefused(book({ startsAt: paris(TUESDAY, "14:00") }), "too_many_upcoming");
  });

  it("l'annulation d'un RDV libère une place", async () => {
    const first = await book({ startsAt: paris(TUESDAY, "10:00") });
    await book({ startsAt: paris(TUESDAY, "11:00") });
    await t.sql`update appointment set status = 'cancelled_by_customer' where id = ${first.id}`;
    await book({ startsAt: paris(TUESDAY, "14:00") });
  });

  it("un RDV passé ou honoré ne compte pas", async () => {
    await insertAppointment(t.sql, {
      customerId,
      staffId: ORHAN,
      startsAt: paris("2026-10-27", "10:00"),
      endsAt: paris("2026-10-27", "10:30"),
      status: "honored",
    });
    await insertAppointment(t.sql, {
      customerId,
      staffId: ORHAN,
      startsAt: paris("2026-10-28", "10:00"),
      endsAt: paris("2026-10-28", "10:30"),
      status: "no_show",
    });
    await book({ startsAt: paris(TUESDAY, "10:00") });
    await book({ startsAt: paris(TUESDAY, "11:00") });
  });

  it("vaut aussi pour le salon (décision du 20 octobre 2026)", async () => {
    await book({ startsAt: paris(TUESDAY, "10:00"), source: "salon" });
    await book({ startsAt: paris(TUESDAY, "11:00"), source: "salon" });
    await expectRefused(
      book({ startsAt: paris(TUESDAY, "14:00"), source: "salon" }),
      "too_many_upcoming",
    );
  });

  it("tient bon quand le même client envoie trois demandes en même temps", async () => {
    const times = ["10:00", "11:00", "14:00"];
    const results = await Promise.allSettled(
      times.map((time) => book({ startsAt: paris(TUESDAY, time) })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    const refused = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(refused[0].reason).toMatchObject({ code: "too_many_upcoming" });
    expect(await countAppointments()).toBe(2);
  });

  it("lit le plafond dans les réglages", async () => {
    await t.sql`update salon_settings set max_upcoming_per_customer = 1`;
    await book({ startsAt: paris(TUESDAY, "10:00") });
    await expectRefused(book({ startsAt: paris(TUESDAY, "11:00") }), "too_many_upcoming");
  });
});

describe("R-52 : le blocage d'un client concerne la réservation en ligne", () => {
  it("refuse un client bloqué en ligne ; le salon peut réserver pour lui", async () => {
    const blocked = await createCustomer(t.sql, { blocked: true });
    await expectRefused(book({ customerId: blocked }), "customer_blocked");
    await book({ customerId: blocked, source: "salon" });
  });
});

describe("garde-fous", () => {
  it("refuse un client inconnu", async () => {
    await expectRefused(
      book({ customerId: "00000000-0000-4000-8000-0000000000ff" }),
      "unknown_customer",
    );
  });

  it("n'enregistre rien quand la réservation est refusée", async () => {
    await expectRefused(book({ startsAt: paris("2026-11-09", "10:00") }), "closed");
    expect(await countAppointments()).toBe(0);
    const [{ n }] = await t.sql`select count(*)::int as n from appointment_item`;
    expect(n).toBe(0);
  });

  it("enregistre la note au salon et l'auteur d'une réservation au salon", async () => {
    const created = await book({
      source: "salon",
      note: "Pour son fils",
      createdByStaffId: ENES,
      startsAt: paris(TUESDAY, "10:00"),
    });
    const [row] =
      await t.sql`select customer_note, created_by_staff_id from appointment where id = ${created.id}`;
    expect(row).toMatchObject({ customer_note: "Pour son fils", created_by_staff_id: ENES });
  });
});

describe("tarif formation", () => {
  it("réserve un apprenti, avec la durée et le prix de la prestation formation", async () => {
    const created = await book({ serviceIds: [COUPE_FORMATION], staffId: TAHA });
    expect(created.durationMinutes).toBe(45);
    expect(created.totalPriceCents).toBe(1000);
  });
});
