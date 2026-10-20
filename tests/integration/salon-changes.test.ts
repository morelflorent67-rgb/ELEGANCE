import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DomainError, type DomainErrorCode } from "../../src/lib/domain-error";
import {
  cancelAppointment,
  createAppointment,
  loadSalonMovable,
  markNoShow,
  rescheduleAppointment,
  salonCancelAppointment,
  salonRescheduleAppointment,
  undoNoShow,
} from "../../src/modules/booking";
import {
  COUPE,
  ENES,
  NOW,
  ORHAN,
  TAHA,
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

// « Maintenant » : lundi 2 novembre 2026, 8 h. Mardi 3, 10 h est dans 26 h : trop tard pour le client (48 h), pas pour le salon.
const TUESDAY = "2026-11-03";

async function expectRefused(promise: Promise<unknown>, code: DomainErrorCode) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `une erreur « ${code} » était attendue`).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
}

const book = (overrides: Partial<Parameters<typeof createAppointment>[1]> = {}, now = NOW) =>
  createAppointment(
    t.db,
    {
      customerId,
      serviceIds: [COUPE],
      staffId: ORHAN,
      startsAt: paris(TUESDAY, "10:00"),
      source: "online",
      ...overrides,
    },
    now,
  );

const status = async (id: string) =>
  (await t.sql`select status from appointment where id = ${id}`)[0].status as string;
const outbox = (type: string) => t.sql`select * from email_outbox where type = ${type}`;
const audit = (action: string) => t.sql`select * from audit_log where action = ${action}`;

describe("R-33 : le salon annule à tout moment, et le client en est prévenu", () => {
  it("annule un RDV que le client ne peut plus annuler (moins de 48 h)", async () => {
    const created = await book();
    await expectRefused(
      cancelAppointment(t.db, { customerId, appointmentId: created.id }, NOW),
      "change_too_late",
    );

    const result = await salonCancelAppointment(
      t.db,
      { appointmentId: created.id, authorStaffId: ENES },
      NOW,
    );
    expect(result).toEqual({ alreadyCancelled: false });
    expect(await status(created.id)).toBe("cancelled_by_salon");
  });

  it("met l'email d'annulation en file, marqué « décidé par le salon »", async () => {
    const created = await book();
    await salonCancelAppointment(t.db, { appointmentId: created.id, authorStaffId: ENES }, NOW);
    const mails = await outbox("cancellation");
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({
      status: "pending",
      appointment_id: created.id,
      dedupe_key: `cancellation:${created.id}`,
      payload: { by: "salon" },
    });
  });

  it("libère le créneau", async () => {
    const created = await book();
    await salonCancelAppointment(t.db, { appointmentId: created.id, authorStaffId: ENES }, NOW);
    const other = await createCustomer(t.sql);
    await book({ customerId: other });
  });

  it("annule aussi un RDV en cours, mais pas un RDV terminé", async () => {
    const inProgress = paris(TUESDAY, "10:00");
    const created = await book();
    const during = new Date(inProgress.getTime() + 10 * 60_000);
    await salonCancelAppointment(t.db, { appointmentId: created.id, authorStaffId: ENES }, during);
    expect(await status(created.id)).toBe("cancelled_by_salon");

    const other = await createCustomer(t.sql);
    const finished = await book({ customerId: other });
    const after = new Date(inProgress.getTime() + 30 * 60_000); // 10 h 30 : fini
    await expectRefused(
      salonCancelAppointment(t.db, { appointmentId: finished.id, authorStaffId: ENES }, after),
      "appointment_over",
    );
    expect(await status(finished.id)).toBe("confirmed");
  });

  it("rejouer l'annulation ne renvoie pas un second email", async () => {
    const created = await book();
    await salonCancelAppointment(t.db, { appointmentId: created.id, authorStaffId: ENES }, NOW);
    const again = await salonCancelAppointment(
      t.db,
      { appointmentId: created.id, authorStaffId: ENES },
      NOW,
    );
    expect(again).toEqual({ alreadyCancelled: true });
    expect(await outbox("cancellation")).toHaveLength(1);
    expect(await audit("appointment.cancelled")).toHaveLength(1);
  });

  it("refuse un RDV déjà annulé par le client", async () => {
    const early = paris("2026-11-10", "10:00"); // à plus de 48 h : le client peut annuler
    const created = await book({ startsAt: early });
    await cancelAppointment(t.db, { customerId, appointmentId: created.id }, NOW);
    await expectRefused(
      salonCancelAppointment(t.db, { appointmentId: created.id, authorStaffId: ENES }, NOW),
      "not_modifiable",
    );
  });

  it("refuse un RDV inconnu", async () => {
    await expectRefused(
      salonCancelAppointment(
        t.db,
        { appointmentId: "00000000-0000-4000-8000-0000000000ff", authorStaffId: ENES },
        NOW,
      ),
      "appointment_not_found",
    );
  });
});

describe("R-74 : l'auteur est choisi sur la tablette et inscrit au journal", () => {
  it("inscrit l'annulation au journal avec l'auteur, l'ancien et le nouvel état", async () => {
    const created = await book();
    await salonCancelAppointment(t.db, { appointmentId: created.id, authorStaffId: ENES }, NOW);
    const [entry] = await audit("appointment.cancelled");
    expect(entry).toMatchObject({
      actor_type: "staff",
      actor_id: ENES,
      entity: "appointment",
      entity_id: created.id,
      after: { status: "cancelled_by_salon" },
    });
    expect(entry.before).toMatchObject({ status: "confirmed", staffId: ORHAN });
  });

  it("refuse toute action sans nom, avec un inconnu ou avec un membre désactivé", async () => {
    const created = await book();
    await expectRefused(
      salonCancelAppointment(t.db, { appointmentId: created.id, authorStaffId: "" }, NOW),
      "author_required",
    );
    await expectRefused(
      salonCancelAppointment(
        t.db,
        { appointmentId: created.id, authorStaffId: "00000000-0000-4000-8000-0000000000ff" },
        NOW,
      ),
      "unknown_author",
    );
    await t.sql`update staff set active = false where id = ${TAHA}`;
    await expectRefused(
      salonCancelAppointment(t.db, { appointmentId: created.id, authorStaffId: TAHA }, NOW),
      "unknown_author",
    );
    expect(await status(created.id)).toBe("confirmed");
    expect(await audit("appointment.cancelled")).toHaveLength(0);
  });

  it("une réservation au salon exige un auteur et l'inscrit au journal", async () => {
    await expectRefused(book({ source: "salon" }), "author_required");
    const created = await book({ source: "salon", createdByStaffId: ENES });
    const [row] =
      await t.sql`select source, created_by_staff_id from appointment where id = ${created.id}`;
    expect(row).toMatchObject({ source: "salon", created_by_staff_id: ENES });
    const [entry] = await audit("appointment.created");
    expect(entry).toMatchObject({
      actor_type: "staff",
      actor_id: ENES,
      entity_id: created.id,
    });
  });

  it("une réservation en ligne n'écrit pas d'entrée au nom du salon", async () => {
    await book();
    expect(await audit("appointment.created")).toHaveLength(0);
  });
});

describe("R-33 : le salon modifie à tout moment (jour, heure, coiffeur : D-51)", () => {
  it("déplace un RDV à moins de 48 h, que le client ne pouvait plus déplacer", async () => {
    const created = await book();
    await expectRefused(
      rescheduleAppointment(
        t.db,
        {
          customerId,
          appointmentId: created.id,
          staffId: ORHAN,
          startsAt: paris(TUESDAY, "11:00"),
        },
        NOW,
      ),
      "change_too_late",
    );

    const result = await salonRescheduleAppointment(
      t.db,
      {
        appointmentId: created.id,
        staffId: ENES,
        startsAt: paris(TUESDAY, "11:00"),
        authorStaffId: ORHAN,
      },
      NOW,
    );
    expect(result).toMatchObject({ changed: true, staffId: ENES });
    const [row] =
      await t.sql`select staff_id, starts_at, status from appointment where id = ${created.id}`;
    expect(row.staff_id).toBe(ENES);
    expect(new Date(row.starts_at).toISOString()).toBe(paris(TUESDAY, "11:00").toISOString());
    expect(row.status).toBe("confirmed");
  });

  it("garde les prestations et le prix figés, et le même identifiant", async () => {
    const created = await book();
    await t.sql`update service set price_cents = 9900 where id = ${COUPE}`;
    await salonRescheduleAppointment(
      t.db,
      {
        appointmentId: created.id,
        staffId: ORHAN,
        startsAt: paris(TUESDAY, "14:00"),
        authorStaffId: ENES,
      },
      NOW,
    );
    const items =
      await t.sql`select price_cents from appointment_item where appointment_id = ${created.id}`;
    expect(items).toHaveLength(1);
    expect(items[0].price_cents).toBe(1800);
  });

  it("met l'email de modification en file, marqué « décidé par le salon », et écrit au journal", async () => {
    const created = await book();
    await salonRescheduleAppointment(
      t.db,
      {
        appointmentId: created.id,
        staffId: ORHAN,
        startsAt: paris(TUESDAY, "14:00"),
        authorStaffId: ENES,
      },
      NOW,
    );
    const mails = await outbox("modification");
    expect(mails).toHaveLength(1);
    expect(mails[0].payload).toMatchObject({
      by: "salon",
      previousStartsAt: paris(TUESDAY, "10:00").toISOString(),
      startsAt: paris(TUESDAY, "14:00").toISOString(),
    });
    const [entry] = await audit("appointment.rescheduled");
    expect(entry).toMatchObject({ actor_type: "staff", actor_id: ENES, entity_id: created.id });
  });

  it("applique les mêmes contrôles de créneau : coiffeur occupé, jour fermé, hors horaires", async () => {
    const created = await book();
    const other = await createCustomer(t.sql);
    await book({ customerId: other, staffId: ENES, startsAt: paris(TUESDAY, "11:00") });

    const move = (staffId: string, startsAt: Date) =>
      salonRescheduleAppointment(
        t.db,
        { appointmentId: created.id, staffId, startsAt, authorStaffId: ORHAN },
        NOW,
      );
    await expectRefused(move(ENES, paris(TUESDAY, "11:00")), "slot_unavailable");
    await expectRefused(move(ORHAN, paris("2026-11-09", "10:00")), "closed"); // lundi
    await expectRefused(move(ORHAN, paris(TUESDAY, "19:00")), "outside_hours");
    expect(await status(created.id)).toBe("confirmed");
    expect(await outbox("modification")).toHaveLength(0);
  });

  it("n'applique ni les délais de R-06 ni la grille de 30 minutes, mais refuse le passé (R-27)", async () => {
    const created = await book();
    const now = paris(TUESDAY, "09:55");
    // Dans 5 minutes, sur la grille de 15 minutes du salon.
    const result = await salonRescheduleAppointment(
      t.db,
      {
        appointmentId: created.id,
        staffId: ORHAN,
        startsAt: paris(TUESDAY, "10:15"),
        authorStaffId: ENES,
      },
      now,
    );
    expect(result.changed).toBe(true);
    await expectRefused(
      salonRescheduleAppointment(
        t.db,
        {
          appointmentId: created.id,
          staffId: ORHAN,
          startsAt: paris(TUESDAY, "09:45"),
          authorStaffId: ENES,
        },
        now,
      ),
      "in_past",
    );
  });

  it("ne change rien et n'envoie rien quand le RDV reste au même créneau", async () => {
    const created = await book();
    const result = await salonRescheduleAppointment(
      t.db,
      {
        appointmentId: created.id,
        staffId: ORHAN,
        startsAt: paris(TUESDAY, "10:00"),
        authorStaffId: ENES,
      },
      NOW,
    );
    expect(result.changed).toBe(false);
    expect(await outbox("modification")).toHaveLength(0);
    expect(await audit("appointment.rescheduled")).toHaveLength(0);
  });

  it("refuse un RDV terminé, annulé, ou sans auteur", async () => {
    const created = await book();
    const input = {
      appointmentId: created.id,
      staffId: ORHAN,
      startsAt: paris(TUESDAY, "14:00"),
      authorStaffId: ENES,
    };
    await expectRefused(
      salonRescheduleAppointment(t.db, { ...input, authorStaffId: "" }, NOW),
      "author_required",
    );
    const finished = new Date(paris(TUESDAY, "10:30").getTime() + 1);
    await expectRefused(
      salonRescheduleAppointment(
        t.db,
        { ...input, startsAt: paris("2026-11-04", "10:00") },
        finished,
      ),
      "appointment_over",
    );
    await salonCancelAppointment(t.db, { appointmentId: created.id, authorStaffId: ENES }, NOW);
    await expectRefused(salonRescheduleAppointment(t.db, input, NOW), "not_modifiable");
  });
});

describe("R-51 : un RDV passé est honoré par défaut ; l'équipe signale seulement les lapins", () => {
  const past = { startsAt: paris("2026-11-02", "09:00"), endsAt: paris("2026-11-02", "09:30") };
  const AFTER = paris("2026-11-02", "09:10"); // le RDV de 9 h a commencé

  it("signale un lapin dès l'heure de début, sans attendre la fin", async () => {
    await insertAppointment(t.sql, { customerId, staffId: ORHAN, ...past });
    const [{ id }] = await t.sql`select id from appointment`;
    const result = await markNoShow(t.db, { appointmentId: id, authorStaffId: ENES }, AFTER);
    expect(result).toMatchObject({ alreadyMarked: false, noShowCount: 1 });
    expect(await status(id)).toBe("no_show");
    const [entry] = await audit("appointment.no_show");
    expect(entry).toMatchObject({ actor_type: "staff", actor_id: ENES, entity_id: id });
  });

  it("refuse un lapin avant le début du RDV", async () => {
    await insertAppointment(t.sql, { customerId, staffId: ORHAN, ...past });
    const [{ id }] = await t.sql`select id from appointment`;
    await expectRefused(
      markNoShow(t.db, { appointmentId: id, authorStaffId: ENES }, paris("2026-11-02", "08:59")),
      "not_started",
    );
    expect(await status(id)).toBe("confirmed");
  });

  it("refuse un lapin sans auteur, et sur un RDV annulé", async () => {
    await insertAppointment(t.sql, { customerId, staffId: ORHAN, ...past });
    const [{ id }] = await t.sql`select id from appointment`;
    await expectRefused(
      markNoShow(t.db, { appointmentId: id, authorStaffId: "" }, AFTER),
      "author_required",
    );
    await t.sql`update appointment set status = 'cancelled_by_salon' where id = ${id}`;
    await expectRefused(
      markNoShow(t.db, { appointmentId: id, authorStaffId: ENES }, AFTER),
      "not_modifiable",
    );
  });

  it("rejouer le signalement ne compte pas un lapin de plus", async () => {
    await insertAppointment(t.sql, { customerId, staffId: ORHAN, ...past });
    const [{ id }] = await t.sql`select id from appointment`;
    await markNoShow(t.db, { appointmentId: id, authorStaffId: ENES }, AFTER);
    const again = await markNoShow(t.db, { appointmentId: id, authorStaffId: ENES }, AFTER);
    expect(again).toMatchObject({ alreadyMarked: true, noShowCount: 1 });
    expect(await audit("appointment.no_show")).toHaveLength(1);
  });

  it("corrige une erreur : le lapin se retire, le RDV redevient confirmé", async () => {
    await insertAppointment(t.sql, { customerId, staffId: ORHAN, ...past });
    const [{ id }] = await t.sql`select id from appointment`;
    await markNoShow(t.db, { appointmentId: id, authorStaffId: ENES }, AFTER);
    const result = await undoNoShow(t.db, { appointmentId: id, authorStaffId: ORHAN }, AFTER);
    expect(result).toEqual({ noShowCount: 0 });
    expect(await status(id)).toBe("confirmed");
    const [entry] = await audit("appointment.no_show_undone");
    expect(entry).toMatchObject({ actor_type: "staff", actor_id: ORHAN });
    await expectRefused(
      undoNoShow(t.db, { appointmentId: id, authorStaffId: ORHAN }, AFTER),
      "not_no_show",
    );
  });

  it("le lapin garde le coiffeur occupé (R-23) : on ne peut pas reprendre le créneau", async () => {
    await insertAppointment(t.sql, {
      customerId,
      staffId: ORHAN,
      startsAt: paris(TUESDAY, "10:00"),
      endsAt: paris(TUESDAY, "10:30"),
      status: "no_show",
    });
    const other = await createCustomer(t.sql);
    await expectRefused(
      createAppointment(
        t.db,
        {
          customerId: other,
          serviceIds: [COUPE],
          staffId: ORHAN,
          startsAt: paris(TUESDAY, "10:00"),
          source: "salon",
          createdByStaffId: ENES,
        },
        paris(TUESDAY, "09:00"),
      ),
      "slot_unavailable",
    );
  });
});

describe("RDV que le salon peut encore déplacer", () => {
  it("rend les prestations figées et la durée, à moins de 48 h comme à plus", async () => {
    const created = await book();
    const movable = await loadSalonMovable(t.db, created.id, NOW);
    expect(movable).toMatchObject({ id: created.id, staffId: ORHAN, durationMinutes: 30 });
    expect(movable.services.map((s) => s.id)).toEqual([COUPE]);
  });

  it("refuse un RDV inconnu, annulé ou terminé", async () => {
    const created = await book();
    await expectRefused(
      loadSalonMovable(t.db, "00000000-0000-4000-8000-0000000000ff", NOW),
      "appointment_not_found",
    );
    await expectRefused(
      loadSalonMovable(t.db, created.id, paris(TUESDAY, "10:30")),
      "appointment_over",
    );
    await salonCancelAppointment(t.db, { appointmentId: created.id, authorStaffId: ENES }, NOW);
    await expectRefused(loadSalonMovable(t.db, created.id, NOW), "not_modifiable");
  });
});
