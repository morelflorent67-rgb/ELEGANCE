import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DomainError, type DomainErrorCode } from "../../src/lib/domain-error";
import { getSlotsForRange } from "../../src/modules/availability";
import {
  cancelAppointment,
  createAppointment,
  loadChangeableAppointment,
  rescheduleAppointment,
} from "../../src/modules/booking";
import {
  COUPE,
  COUPE_FORMATION,
  ENES,
  KAAN,
  NOW,
  ORHAN,
  connectTestDb,
  createCustomer,
  paris,
} from "./helpers";

const t = connectTestDb();
let customerId: string;

beforeEach(async () => {
  await t.reset();
  customerId = await createCustomer(t.sql);
  // Scénarios écrits avec les délais d'origine (48 h, 72 h) : ils vérifient que le délai vient du réglage. Les valeurs
  // actuelles (1 h et 24 h, D-63 et D-64) ont leurs propres tests.
  await t.sql`update salon_settings set change_cutoff_hours = 48, reminder_hours = 72`;
});
afterAll(() => t.close());

// Le RDV de référence : mardi 10 novembre 2026, 10 h. Sa date limite de modification est le dimanche 8 novembre, 10 h.
const DAY = "2026-11-10";
const START = paris(DAY, "10:00");
const DEADLINE = paris("2026-11-08", "10:00");

const book = (overrides: Partial<Parameters<typeof createAppointment>[1]> = {}, now = NOW) =>
  createAppointment(
    t.db,
    {
      customerId,
      serviceIds: [COUPE],
      staffId: ORHAN,
      startsAt: START,
      source: "online",
      ...overrides,
    },
    now,
  );

async function expectRefused(promise: Promise<unknown>, code: DomainErrorCode) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `une erreur « ${code} » était attendue`).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
}

const status = async (id: string) =>
  (await t.sql`select status from appointment where id = ${id}`)[0].status as string;
const outbox = (type: string) => t.sql`select * from email_outbox where type = ${type}`;
const audit = (action: string) => t.sql`select * from audit_log where action = ${action}`;

describe("R-30, D-63 : avec le réglage du salon, le client annule ou déplace jusqu'à 1 h avant", () => {
  const ONE_HOUR_BEFORE = paris(DAY, "09:00");
  const useSalonSetting = () => t.sql`update salon_settings set change_cutoff_hours = default`;

  it("annule à 1 h pile, refuse une milliseconde après", async () => {
    await useSalonSetting();
    const late = await book();
    await expectRefused(
      cancelAppointment(
        t.db,
        { customerId, appointmentId: late.id },
        new Date(ONE_HOUR_BEFORE.getTime() + 1),
      ),
      "change_too_late",
    );
    await expect(
      cancelAppointment(t.db, { customerId, appointmentId: late.id }, ONE_HOUR_BEFORE),
    ).resolves.toEqual({ alreadyCancelled: false });
  });

  it("déplace le jour même, jusqu'à 1 h avant", async () => {
    await useSalonSetting();
    const created = await book();
    const moved = await rescheduleAppointment(
      t.db,
      { customerId, appointmentId: created.id, staffId: ORHAN, startsAt: paris(DAY, "15:00") },
      paris(DAY, "08:30"),
    );
    expect(moved).toMatchObject({ changed: true });
  });
});

describe("R-30 : annuler jusqu'à 48 h avant le début (délai réglé à 48 h)", () => {
  it("annule un RDV, libère le créneau, écrit au journal et met l'email d'annulation en file", async () => {
    const created = await book();
    const result = await cancelAppointment(t.db, { customerId, appointmentId: created.id }, NOW);
    expect(result).toEqual({ alreadyCancelled: false });
    expect(await status(created.id)).toBe("cancelled_by_customer");

    const mails = await outbox("cancellation");
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({
      status: "pending",
      appointment_id: created.id,
      dedupe_key: `cancellation:${created.id}`,
    });

    const [entry] = await audit("appointment.cancelled");
    expect(entry).toMatchObject({
      actor_type: "customer",
      actor_id: customerId,
      entity: "appointment",
      entity_id: created.id,
    });

    // Le créneau est libre : un autre client peut le prendre.
    const other = await createCustomer(t.sql);
    await expect(
      createAppointment(
        t.db,
        {
          customerId: other,
          serviceIds: [COUPE],
          staffId: ORHAN,
          startsAt: START,
          source: "online",
        },
        NOW,
      ),
    ).resolves.toBeTruthy();
  });

  it("accepte l'annulation à la seconde près de la limite (48 h pile)", async () => {
    const created = await book();
    await expect(
      cancelAppointment(t.db, { customerId, appointmentId: created.id }, DEADLINE),
    ).resolves.toEqual({ alreadyCancelled: false });
  });

  it("R-31 : refuse une milliseconde après la limite, et le RDV reste confirmé", async () => {
    const created = await book();
    await expectRefused(
      cancelAppointment(
        t.db,
        { customerId, appointmentId: created.id },
        new Date(DEADLINE.getTime() + 1),
      ),
      "change_too_late",
    );
    expect(await status(created.id)).toBe("confirmed");
    expect(await outbox("cancellation")).toHaveLength(0);
    expect(await audit("appointment.cancelled")).toHaveLength(0);
  });

  it("le délai vient du réglage en base, pas du code", async () => {
    const created = await book();
    await t.sql`update salon_settings set change_cutoff_hours = 24`;
    // 40 h avant : refusé à 48 h, accepté à 24 h.
    await expect(
      cancelAppointment(
        t.db,
        { customerId, appointmentId: created.id },
        new Date(START.getTime() - 40 * 3_600_000),
      ),
    ).resolves.toEqual({ alreadyCancelled: false });
  });

  it("R-32 : un RDV pris moins de 48 h avant son début ne s'annule pas en ligne, même tout de suite", async () => {
    const bookedAt = paris("2026-11-09", "10:00"); // 24 h avant
    const created = await book({}, bookedAt);
    await expectRefused(
      cancelAppointment(t.db, { customerId, appointmentId: created.id }, bookedAt),
      "change_too_late",
    );
    expect(await status(created.id)).toBe("confirmed");
  });

  it("refuse un RDV qui n'est plus confirmé (honoré, non venu)", async () => {
    const created = await book();
    await t.sql`update appointment set status = 'honored' where id = ${created.id}`;
    await expectRefused(
      cancelAppointment(t.db, { customerId, appointmentId: created.id }, NOW),
      "not_modifiable",
    );
  });

  it("répond « introuvable » pour le RDV d'un autre client, sans rien révéler", async () => {
    const created = await book();
    const stranger = await createCustomer(t.sql);
    await expectRefused(
      cancelAppointment(t.db, { customerId: stranger, appointmentId: created.id }, NOW),
      "appointment_not_found",
    );
    await expectRefused(
      cancelAppointment(t.db, { customerId, appointmentId: crypto.randomUUID() }, NOW),
      "appointment_not_found",
    );
    expect(await status(created.id)).toBe("confirmed");
  });

  it("annuler deux fois, même en même temps, n'envoie qu'un seul email", async () => {
    const created = await book();
    const results = await Promise.all([
      cancelAppointment(t.db, { customerId, appointmentId: created.id }, NOW),
      cancelAppointment(t.db, { customerId, appointmentId: created.id }, NOW),
    ]);
    expect(results.filter((r) => !r.alreadyCancelled)).toHaveLength(1);
    expect(await outbox("cancellation")).toHaveLength(1);
    expect(await audit("appointment.cancelled")).toHaveLength(1);
  });

  it("R-25 : un RDV annulé ne compte plus parmi les RDV à venir", async () => {
    await t.sql`update salon_settings set max_upcoming_per_customer = 2`; // limite abaissée pour le scénario
    const first = await book({ startsAt: paris("2026-11-10", "10:00") });
    await book({ startsAt: paris("2026-11-11", "10:00") });
    await expectRefused(book({ startsAt: paris("2026-11-12", "10:00") }), "too_many_upcoming");
    await cancelAppointment(t.db, { customerId, appointmentId: first.id }, NOW);
    await expect(book({ startsAt: paris("2026-11-12", "10:00") })).resolves.toBeTruthy();
  });
});

describe("R-30 : déplacer un RDV jusqu'à 48 h avant le début (délai réglé à 48 h)", () => {
  it("change l'heure et le coiffeur, garde le même RDV, ses prestations et son prix", async () => {
    const created = await book();
    const moved = await rescheduleAppointment(
      t.db,
      {
        customerId,
        appointmentId: created.id,
        staffId: ENES,
        startsAt: paris("2026-11-12", "14:30"),
      },
      NOW,
    );
    expect(moved).toMatchObject({ changed: true, staffId: ENES });
    const rows = await t.sql`select * from appointment`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: created.id, staff_id: ENES, status: "confirmed" });
    expect(rows[0].starts_at).toEqual(paris("2026-11-12", "14:30"));
    expect(rows[0].ends_at).toEqual(paris("2026-11-12", "15:00"));
    const items = await t.sql`select name_snapshot, price_cents from appointment_item`;
    expect(items).toEqual([
      expect.objectContaining({ name_snapshot: "Coupe homme", price_cents: 1800 }),
    ]);
  });

  it("libère l'ancien créneau et prend le nouveau dans la même opération", async () => {
    const created = await book();
    await rescheduleAppointment(
      t.db,
      { customerId, appointmentId: created.id, staffId: ORHAN, startsAt: paris(DAY, "11:00") },
      NOW,
    );
    const other = await createCustomer(t.sql);
    const take = (hour: string) =>
      createAppointment(
        t.db,
        {
          customerId: other,
          serviceIds: [COUPE],
          staffId: ORHAN,
          startsAt: paris(DAY, hour),
          source: "online",
        },
        NOW,
      );
    await expect(take("10:00")).resolves.toBeTruthy(); // l'ancien créneau est libre
    await expectRefused(take("11:00"), "slot_unavailable"); // le nouveau est pris
  });

  it("R-23 : si le nouveau créneau est pris, le RDV reste à son ancien créneau", async () => {
    const created = await book();
    const other = await createCustomer(t.sql);
    await createAppointment(
      t.db,
      {
        customerId: other,
        serviceIds: [COUPE],
        staffId: ORHAN,
        startsAt: paris(DAY, "11:00"),
        source: "online",
      },
      NOW,
    );
    await expectRefused(
      rescheduleAppointment(
        t.db,
        { customerId, appointmentId: created.id, staffId: ORHAN, startsAt: paris(DAY, "11:00") },
        NOW,
      ),
      "slot_unavailable",
    );
    const [row] = await t.sql`select starts_at from appointment where id = ${created.id}`;
    expect(row.starts_at).toEqual(START);
    expect(await outbox("modification")).toHaveLength(0);
  });

  it("R-23 : deux demandes simultanées pour le même créneau, une seule passe", async () => {
    const created = await book();
    const other = await createCustomer(t.sql);
    const otherAppointment = await createAppointment(
      t.db,
      {
        customerId: other,
        serviceIds: [COUPE],
        staffId: ORHAN,
        startsAt: paris(DAY, "15:00"),
        source: "online",
      },
      NOW,
    );
    const slot = paris(DAY, "16:00");
    const results = await Promise.allSettled([
      rescheduleAppointment(
        t.db,
        { customerId, appointmentId: created.id, staffId: ORHAN, startsAt: slot },
        NOW,
      ),
      rescheduleAppointment(
        t.db,
        { customerId: other, appointmentId: otherAppointment.id, staffId: ORHAN, startsAt: slot },
        NOW,
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((rejected.reason as DomainError).code).toBe("slot_unavailable");
  });

  it("un RDV de 45 min peut glisser sur son propre ancien créneau (il ne se bloque pas lui-même)", async () => {
    const created = await book({
      serviceIds: [COUPE_FORMATION],
      staffId: KAAN,
    });
    const moved = await rescheduleAppointment(
      t.db,
      { customerId, appointmentId: created.id, staffId: KAAN, startsAt: paris(DAY, "10:30") },
      NOW,
    );
    expect(moved.endsAt).toEqual(paris(DAY, "11:15"));

    // Les créneaux proposés pour ce déplacement incluent aussi le sien.
    const changeable = await loadChangeableAppointment(t.db, customerId, created.id, NOW);
    const [day] = await getSlotsForRange(t.db, {
      from: DAY,
      days: 1,
      serviceIds: [],
      staffId: KAAN,
      audience: "online",
      now: NOW,
      moving: {
        appointmentId: created.id,
        services: changeable.services,
        durationMinutes: changeable.durationMinutes,
      },
    });
    const times = day.slots.map((s) => s.startsAt.getTime());
    expect(times).toContain(paris(DAY, "10:00").getTime());
    expect(times).toContain(paris(DAY, "10:30").getTime());
  });

  it("contrôle du test précédent : le calcul ordinaire compte bien le RDV comme occupé", async () => {
    const created = await book({ serviceIds: [COUPE_FORMATION], staffId: KAAN });
    const [day] = await getSlotsForRange(t.db, {
      from: DAY,
      days: 1,
      serviceIds: [COUPE_FORMATION],
      staffId: KAAN,
      audience: "online",
      now: NOW,
    });
    const times = day.slots.map((s) => s.startsAt.getTime());
    expect(times).not.toContain(paris(DAY, "10:00").getTime());
    expect(times).not.toContain(paris(DAY, "10:30").getTime());
    expect(created.id).toBeTruthy();
  });

  it("ne fait rien quand le créneau et le coiffeur sont les mêmes : aucun email, aucune trace", async () => {
    const created = await book();
    const result = await rescheduleAppointment(
      t.db,
      { customerId, appointmentId: created.id, staffId: ORHAN, startsAt: START },
      NOW,
    );
    expect(result.changed).toBe(false);
    expect(await outbox("modification")).toHaveLength(0);
    expect(await audit("appointment.rescheduled")).toHaveLength(0);
  });

  it("« Sans préférence » sur le même horaire garde le coiffeur actuel", async () => {
    const created = await book({ staffId: ENES });
    const result = await rescheduleAppointment(
      t.db,
      { customerId, appointmentId: created.id, staffId: "any", startsAt: START },
      NOW,
    );
    expect(result).toMatchObject({ changed: false, staffId: ENES });
  });

  it("met l'email de modification en file avec l'ancien créneau, et écrit au journal", async () => {
    const created = await book();
    await rescheduleAppointment(
      t.db,
      { customerId, appointmentId: created.id, staffId: ENES, startsAt: paris(DAY, "14:30") },
      NOW,
    );
    const [mail] = await outbox("modification");
    expect(mail).toMatchObject({ status: "pending", appointment_id: created.id });
    expect(mail.payload).toEqual({
      previousStartsAt: START.toISOString(),
      previousStaffFirstName: "Orhan",
      startsAt: paris(DAY, "14:30").toISOString(),
      staffFirstName: "Enes",
      changedAt: NOW.toISOString(),
    });
    const [entry] = await audit("appointment.rescheduled");
    expect(entry).toMatchObject({
      actor_type: "customer",
      actor_id: customerId,
      entity_id: created.id,
    });
    expect(entry.before).toMatchObject({ startsAt: START.toISOString(), staffId: ORHAN });
    expect(entry.after).toMatchObject({ staffId: ENES });
  });

  it("plusieurs déplacements du même RDV donnent plusieurs emails distincts", async () => {
    const created = await book();
    for (const hour of ["11:00", "11:30"]) {
      await rescheduleAppointment(
        t.db,
        { customerId, appointmentId: created.id, staffId: ORHAN, startsAt: paris(DAY, hour) },
        NOW,
      );
    }
    expect(await outbox("modification")).toHaveLength(2);
  });

  it("R-31 : refuse après la limite, R-32 : refuse un RDV pris à moins de 48 h", async () => {
    const created = await book();
    await expectRefused(
      rescheduleAppointment(
        t.db,
        { customerId, appointmentId: created.id, staffId: ORHAN, startsAt: paris(DAY, "11:00") },
        new Date(DEADLINE.getTime() + 1),
      ),
      "change_too_late",
    );
    await expect(
      rescheduleAppointment(
        t.db,
        { customerId, appointmentId: created.id, staffId: ORHAN, startsAt: paris(DAY, "11:00") },
        DEADLINE,
      ),
    ).resolves.toMatchObject({ changed: true });

    const late = await book(
      { startsAt: paris("2026-11-11", "10:00") },
      paris("2026-11-10", "09:00"),
    );
    await expectRefused(
      rescheduleAppointment(
        t.db,
        {
          customerId,
          appointmentId: late.id,
          staffId: ORHAN,
          startsAt: paris("2026-11-11", "11:00"),
        },
        paris("2026-11-10", "09:00"),
      ),
      "change_too_late",
    );
  });

  it("autorise un nouveau créneau à moins de 48 h, mais le RDV n'est plus modifiable ensuite", async () => {
    const created = await book();
    const soon = paris("2026-11-03", "10:00"); // demain matin, NOW est lundi 8 h
    await expect(
      rescheduleAppointment(
        t.db,
        { customerId, appointmentId: created.id, staffId: ORHAN, startsAt: soon },
        NOW,
      ),
    ).resolves.toMatchObject({ changed: true });
    await expectRefused(
      rescheduleAppointment(
        t.db,
        { customerId, appointmentId: created.id, staffId: ORHAN, startsAt: paris(DAY, "10:00") },
        NOW,
      ),
      "change_too_late",
    );
    await expectRefused(
      cancelAppointment(t.db, { customerId, appointmentId: created.id }, NOW),
      "change_too_late",
    );
  });

  it("applique les règles d'une réservation au nouveau créneau (fermé, hors horaires, trop tôt, trop tard)", async () => {
    const created = await book();
    const move = (startsAt: Date, now = NOW) =>
      rescheduleAppointment(
        t.db,
        { customerId, appointmentId: created.id, staffId: ORHAN, startsAt },
        now,
      );
    await expectRefused(move(paris("2026-11-16", "10:00")), "closed"); // lundi
    await expectRefused(move(paris(DAY, "12:30")), "outside_hours"); // pause
    await expectRefused(move(paris(DAY, "10:15")), "off_grid"); // pas de 30 min en ligne
    await expectRefused(
      move(paris("2026-11-03", "08:30"), paris("2026-11-02", "08:00")),
      "outside_hours",
    );
    await expectRefused(move(paris("2026-12-29", "10:00")), "too_far"); // au-delà de 6 semaines
    await expectRefused(
      move(paris("2026-11-03", "10:00"), paris("2026-11-03", "09:30")),
      "too_soon",
    );
  });

  it("garde la durée figée du RDV, même si la durée de la prestation a changé depuis (R-16)", async () => {
    const created = await book();
    await t.sql`update service set duration_min = 60 where id = ${COUPE}`;
    const moved = await rescheduleAppointment(
      t.db,
      { customerId, appointmentId: created.id, staffId: ORHAN, startsAt: paris(DAY, "11:00") },
      NOW,
    );
    expect(moved.endsAt).toEqual(paris(DAY, "11:30"));
  });

  it("déplace aussi un RDV dont la prestation a été retirée de la carte depuis (R-16)", async () => {
    const created = await book();
    await t.sql`update service set active = false, bookable_online = false where id = ${COUPE}`;
    await expect(
      rescheduleAppointment(
        t.db,
        { customerId, appointmentId: created.id, staffId: ORHAN, startsAt: paris(DAY, "11:00") },
        NOW,
      ),
    ).resolves.toMatchObject({ changed: true });
  });

  it("R-13 : refuse un coiffeur non habilité pour les prestations du RDV", async () => {
    const created = await book();
    await expectRefused(
      rescheduleAppointment(
        t.db,
        { customerId, appointmentId: created.id, staffId: KAAN, startsAt: paris(DAY, "11:00") },
        NOW,
      ),
      "staff_not_eligible",
    );
  });

  it("répond « introuvable » pour le RDV d'un autre client", async () => {
    const created = await book();
    const stranger = await createCustomer(t.sql);
    await expectRefused(
      rescheduleAppointment(
        t.db,
        {
          customerId: stranger,
          appointmentId: created.id,
          staffId: ORHAN,
          startsAt: paris(DAY, "11:00"),
        },
        NOW,
      ),
      "appointment_not_found",
    );
  });

  it("refuse de déplacer un RDV annulé", async () => {
    const created = await book();
    await cancelAppointment(t.db, { customerId, appointmentId: created.id }, NOW);
    await expectRefused(
      rescheduleAppointment(
        t.db,
        { customerId, appointmentId: created.id, staffId: ORHAN, startsAt: paris(DAY, "11:00") },
        NOW,
      ),
      "not_modifiable",
    );
  });
});

describe("chargement d'un RDV modifiable", () => {
  it("donne les prestations figées et le coiffeur, et refuse selon les mêmes règles", async () => {
    const created = await book();
    const loaded = await loadChangeableAppointment(t.db, customerId, created.id, NOW);
    expect(loaded).toMatchObject({
      id: created.id,
      staffFirstName: "Orhan",
      durationMinutes: 30,
      totalPriceCents: 1800,
    });
    expect(loaded.items.map((i) => i.name)).toEqual(["Coupe homme"]);
    await expectRefused(
      loadChangeableAppointment(t.db, customerId, created.id, new Date(DEADLINE.getTime() + 1)),
      "change_too_late",
    );
    const stranger = await createCustomer(t.sql);
    await expectRefused(
      loadChangeableAppointment(t.db, stranger, created.id, NOW),
      "appointment_not_found",
    );
  });
});
