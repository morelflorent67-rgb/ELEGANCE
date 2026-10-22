import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDaySlots } from "../../src/modules/availability";
import { createAppointment } from "../../src/modules/booking";
import { processOutbox, type EmailMessage, type EmailTransport } from "../../src/modules/mail";
import {
  acceptOffer,
  declineOffer,
  joinWaitlist,
  leaveWaitlist,
  listCustomerWaitlist,
  loadOffer,
  processWaitlist,
  type JoinWaitlistInput,
} from "../../src/modules/waitlist";
import { COUPE, ENES, NOW, ORHAN, connectTestDb, createCustomer, paris } from "./helpers";

// R-80 à R-86 : la liste d'attente (D-73, D-99, D-100). Une place libérée est offerte à une seule personne à la
// fois, la première inscrite, et gardée quelques minutes.

const t = connectTestDb();
const TUESDAY = "2026-11-03";
const WEDNESDAY = "2026-11-04";
const SLOT = paris(TUESDAY, "10:00");

let alice: string;
let bruno: string;
let blockerAppointment: string;

beforeEach(async () => {
  tick = 0;
  await t.reset();
  alice = await createCustomer(t.sql, { name: "Alice" });
  bruno = await createCustomer(t.sql, { name: "Bruno" });
});
afterAll(() => t.close());

/** Le salon est plein ce jour-là pour les coiffeurs : une absence couvre toute la journée. */
async function fillDay(date: string, staffIds: string[] = [ORHAN, ENES]) {
  for (const staffId of staffIds) {
    await t.sql`insert into absence (staff_id, starts_at, ends_at, reason)
                values (${staffId}, ${paris(date, "00:00")}, ${paris(date, "23:59")}, 'plein')`;
  }
}

/**
 * Une seule place possible le mardi : Orhan à 10 h, tenue par un RDV qu'on annule ensuite (`free()`). Enes est absent
 * toute la journée, Orhan l'est avant et après le créneau.
 */
async function oneSlotDay() {
  const holder = await createCustomer(t.sql, { name: "Tenant" });
  await fillDay(TUESDAY, [ENES]);
  await t.sql`insert into absence (staff_id, starts_at, ends_at, reason) values
    (${ORHAN}, ${paris(TUESDAY, "00:00")}, ${paris(TUESDAY, "10:00")}, 'avant'),
    (${ORHAN}, ${paris(TUESDAY, "10:30")}, ${paris(TUESDAY, "23:59")}, 'après')`;
  const [row] = await t.sql`
    insert into appointment (customer_id, staff_id, starts_at, ends_at, status, source)
    values (${holder}, ${ORHAN}, ${SLOT}, ${paris(TUESDAY, "10:30")}, 'confirmed', 'salon') returning id`;
  blockerAppointment = row.id as string;
  await t.sql`insert into appointment_item (appointment_id, service_id, name_snapshot, price_cents, duration_min, position)
              values (${blockerAppointment}, ${COUPE}, 'Coupe homme', 1800, 30, 0)`;
}
const free = () => t.sql`update appointment set status = 'cancelled_by_salon' where id = ${blockerAppointment}`;

// Chaque inscription arrive une seconde après la précédente : l'ordre d'inscription est celui de la file.
let tick = 0;
const join = (customerId: string, overrides: Partial<JoinWaitlistInput> = {}) =>
  joinWaitlist(
    t.db,
    { customerId, serviceIds: [COUPE], staffId: "any", days: [TUESDAY], window: "day", ...overrides },
    new Date(NOW.getTime() + tick++ * 1000),
  );
/** Les offres dans l'ordre d'inscription de leur inscrite. */
const offers = () => t.sql`
  select o.* from waitlist_offer o join waitlist_entry e on e.id = o.entry_id order by e.created_at, o.id`;
const offerEmails = () => t.sql`select * from email_outbox where type = 'waitlist_offer' order by created_at`;

describe("inscription (R-80)", () => {
  it("est refusée s'il reste une place qui convient : le client peut la réserver", async () => {
    await expect(join(alice)).rejects.toMatchObject({ code: "slots_available" });
  });

  it("est acceptée quand le jour est complet, et garde les prestations, le coiffeur, les jours et la plage", async () => {
    await fillDay(TUESDAY);
    const { entryId } = await join(alice, { staffId: ORHAN, window: "morning" });
    const [entry] = await t.sql`select * from waitlist_entry where id = ${entryId}`;
    expect(entry).toMatchObject({ staff_id: ORHAN, window: "morning", status: "active" });
    expect(entry.service_ids).toEqual([COUPE]);
    expect(entry.days).toHaveLength(1);
  });

  it("ne regarde que la plage voulue : matin complet mais après-midi libre, le matin est accepté", async () => {
    for (const staffId of [ORHAN, ENES]) {
      await t.sql`insert into absence (staff_id, starts_at, ends_at, reason)
                  values (${staffId}, ${paris(TUESDAY, "00:00")}, ${paris(TUESDAY, "12:00")}, 'matin')`;
    }
    await expect(join(alice, { window: "afternoon" })).rejects.toMatchObject({ code: "slots_available" });
    await expect(join(alice, { window: "morning" })).resolves.toBeTruthy();
    await expect(join(bruno, { window: "day" })).rejects.toMatchObject({ code: "slots_available" });
  });

  it("accepte plusieurs jours, mais refuse si l'un d'eux a une place", async () => {
    await fillDay(TUESDAY);
    await expect(join(alice, { days: [TUESDAY, WEDNESDAY] })).rejects.toMatchObject({
      code: "slots_available",
    });
    await fillDay(WEDNESDAY);
    await expect(join(alice, { days: [TUESDAY, WEDNESDAY] })).resolves.toBeTruthy();
  });

  it("refuse un jour passé, hors de l'horizon de réservation, ou aucun jour", async () => {
    await expect(join(alice, { days: ["2026-11-01"] })).rejects.toMatchObject({ code: "invalid_waitlist" });
    await expect(join(alice, { days: ["2027-03-03"] })).rejects.toMatchObject({ code: "invalid_waitlist" });
    await expect(join(alice, { days: [] })).rejects.toMatchObject({ code: "invalid_waitlist" });
  });

  it("refuse un client bloqué en ligne et plus de 5 inscriptions en cours", async () => {
    await fillDay(TUESDAY);
    const blocked = await createCustomer(t.sql, { blocked: true });
    await expect(join(blocked)).rejects.toMatchObject({ code: "customer_blocked" });
    for (let i = 0; i < 5; i++) await join(alice);
    await expect(join(alice)).rejects.toMatchObject({ code: "waitlist_full" });
  });
});

describe("place libérée (R-81)", () => {
  it("est offerte à la première inscrite seulement, et jamais proposée à deux personnes à la fois", async () => {
    await oneSlotDay();
    await join(alice);
    await join(bruno);
    expect((await processWaitlist(t.db, NOW)).offers).toHaveLength(0); // rien n'est libre

    await free();
    const run = await processWaitlist(t.db, NOW);
    expect(run.offers).toHaveLength(1);
    const rows = await offers();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ customer_id: alice, staff_id: ORHAN, status: "pending" });
    expect(rows[0].starts_at).toEqual(SLOT);

    // Rejouer le passage ne change rien : Bruno attend, Alice n'a pas deux offres.
    expect((await processWaitlist(t.db, NOW)).offers).toHaveLength(0);
    expect(await offers()).toHaveLength(1);
  });

  it("garde la place waitlist_hold_minutes (réglage) et met l'email dans la file", async () => {
    await oneSlotDay();
    await join(alice);
    await t.sql`update salon_settings set waitlist_hold_minutes = 20`;
    await free();
    await processWaitlist(t.db, NOW);
    const [offer] = await offers();
    expect(offer.expires_at).toEqual(new Date(NOW.getTime() + 20 * 60_000));
    const emails = await offerEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0].payload).toEqual({ offerId: offer.id });
  });

  it("respecte le coiffeur voulu et la plage voulue", async () => {
    await oneSlotDay();
    await join(alice, { staffId: ENES, window: "day" }).catch(() => undefined); // Enes est absent : inscription possible
    await join(bruno, { staffId: ORHAN, window: "afternoon" });
    await free();
    await processWaitlist(t.db, NOW);
    // Alice veut Enes (absent), Bruno veut l'après-midi alors que la place est à 10 h : personne.
    expect(await offers()).toHaveLength(0);
  });

  it("l'email « Une place s'est libérée » part avec le lien de l'offre", async () => {
    await oneSlotDay();
    await join(alice);
    await free();
    await processWaitlist(t.db, NOW);
    const sent: EmailMessage[] = [];
    const transport: EmailTransport = { send: async (m) => void sent.push(m) };
    await processOutbox(t.db, { transport, baseUrl: "https://exemple.fr", secret: "s", now: NOW });
    const mail = sent.find((m) => m.subject.startsWith("Une place s'est libérée"));
    expect(mail).toBeTruthy();
    const [offer] = await offers();
    expect(mail!.html).toContain(`https://exemple.fr/attente/${offer.id}`);
    expect(mail!.subject).toContain("10:00");
  });
});

describe("place gardée (R-82)", () => {
  it("n'est pas réservable en ligne par un autre client, ni proposée dans ses créneaux, mais le salon peut la prendre", async () => {
    await oneSlotDay();
    await join(alice);
    await free();
    await processWaitlist(t.db, NOW);

    await expect(
      createAppointment(
        t.db,
        { customerId: bruno, serviceIds: [COUPE], staffId: ORHAN, startsAt: SLOT, source: "online" },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "slot_unavailable" });
    const online = await getDaySlots(t.db, {
      date: TUESDAY,
      serviceIds: [COUPE],
      staffId: "any",
      audience: "online",
      now: NOW,
    });
    expect(online).toHaveLength(0);
    const salon = await getDaySlots(t.db, {
      date: TUESDAY,
      serviceIds: [COUPE],
      staffId: "any",
      audience: "salon",
      now: NOW,
    });
    expect(salon.map((s) => s.startsAt)).toEqual([SLOT]);
  });

  it("se libère à la fin du délai", async () => {
    await oneSlotDay();
    await join(alice);
    await free();
    await processWaitlist(t.db, NOW);
    const later = new Date(NOW.getTime() + 16 * 60_000);
    const online = await getDaySlots(t.db, {
      date: TUESDAY,
      serviceIds: [COUPE],
      staffId: "any",
      audience: "online",
      now: later,
    });
    expect(online.map((s) => s.startsAt)).toEqual([SLOT]);
  });
});

describe("prendre la place (R-83)", () => {
  beforeEach(async () => {
    await oneSlotDay();
    await join(alice);
    await free();
    await processWaitlist(t.db, NOW);
  });

  it("crée le RDV par le chemin ordinaire, clôt l'offre et l'inscription, et met la confirmation en file", async () => {
    const [offer] = await offers();
    const created = await acceptOffer(t.db, { customerId: alice, offerId: offer.id }, NOW);
    expect(created.startsAt).toEqual(SLOT);
    expect(created.staffId).toBe(ORHAN);
    const [row] = await t.sql`select * from appointment where id = ${created.id}`;
    expect(row).toMatchObject({ customer_id: alice, source: "online", status: "confirmed" });
    expect((await offers())[0].status).toBe("accepted");
    const [entry] = await t.sql`select status from waitlist_entry`;
    expect(entry.status).toBe("fulfilled");
    const confirmations = await t.sql`select * from email_outbox where type = 'confirmation' and appointment_id = ${created.id}`;
    expect(confirmations).toHaveLength(1);
  });

  it("n'est possible que pour la personne à qui la place est offerte, une seule fois", async () => {
    const [offer] = await offers();
    await expect(acceptOffer(t.db, { customerId: bruno, offerId: offer.id }, NOW)).rejects.toMatchObject({
      code: "offer_not_found",
    });
    await acceptOffer(t.db, { customerId: alice, offerId: offer.id }, NOW);
    await expect(acceptOffer(t.db, { customerId: alice, offerId: offer.id }, NOW)).rejects.toMatchObject({
      code: "offer_closed",
    });
  });

  it("est refusée après le délai : l'offre expire", async () => {
    const [offer] = await offers();
    const late = new Date(NOW.getTime() + 16 * 60_000);
    await expect(acceptOffer(t.db, { customerId: alice, offerId: offer.id }, late)).rejects.toMatchObject({
      code: "offer_expired",
    });
    expect((await offers())[0].status).toBe("expired");
    expect((await loadOffer(t.db, alice, offer.id, late))!.state).toBe("expired");
  });

  it("revérifie la limite de RDV à venir (R-25) et laisse l'offre en cours pour qu'on puisse annuler un RDV", async () => {
    await t.sql`update salon_settings set max_upcoming_per_customer = 1`;
    await t.sql`insert into appointment (customer_id, staff_id, starts_at, ends_at, status, source)
                values (${alice}, ${ENES}, ${paris("2026-11-10", "10:00")}, ${paris("2026-11-10", "10:30")}, 'confirmed', 'salon')`;
    const [offer] = await offers();
    await expect(acceptOffer(t.db, { customerId: alice, offerId: offer.id }, NOW)).rejects.toMatchObject({
      code: "too_many_upcoming",
    });
    expect((await offers())[0].status).toBe("pending");
    await t.sql`update appointment set status = 'cancelled_by_customer' where customer_id = ${alice}`;
    await expect(acceptOffer(t.db, { customerId: alice, offerId: offer.id }, NOW)).resolves.toBeTruthy();
  });

  it("devient « perdue » si le salon a pris la place entre-temps", async () => {
    const [offer] = await offers();
    await createAppointment(
      t.db,
      {
        customerId: bruno,
        serviceIds: [COUPE],
        staffId: ORHAN,
        startsAt: SLOT,
        source: "salon",
        createdByStaffId: ENES,
      },
      NOW,
    );
    await expect(acceptOffer(t.db, { customerId: alice, offerId: offer.id }, NOW)).rejects.toMatchObject({
      code: "slot_unavailable",
    });
    expect((await offers())[0].status).toBe("lost");
    const [entry] = await t.sql`select status from waitlist_entry`;
    expect(entry.status).toBe("active"); // elle reste sur la liste
  });
});

describe("la place passe à la suivante (R-84)", () => {
  beforeEach(async () => {
    await oneSlotDay();
    await join(alice);
    await join(bruno);
    await free();
    await processWaitlist(t.db, NOW);
  });

  it("« Pas cette fois » : la suivante reçoit la place, et la même personne ne se la voit pas reproposer", async () => {
    const [first] = await offers();
    await declineOffer(t.db, { customerId: alice, offerId: first.id }, NOW);
    expect((await offers())[0].status).toBe("declined");
    const run = await processWaitlist(t.db, NOW);
    expect(run.offers).toHaveLength(1);
    const rows = await offers();
    expect(rows.map((r) => [r.customer_id, r.status])).toEqual([
      [alice, "declined"],
      [bruno, "pending"],
    ]);
    // Bruno refuse aussi : Alice, qui l'avait déjà refusée, ne la reçoit pas de nouveau.
    await declineOffer(t.db, { customerId: bruno, offerId: rows[1].id }, NOW);
    expect((await processWaitlist(t.db, NOW)).offers).toHaveLength(0);
    // Alice reste sur la liste.
    const lines = await listCustomerWaitlist(t.db, alice, NOW);
    expect(lines).toHaveLength(1);
    expect(lines[0].offer).toBeNull();
  });

  it("délai écoulé sans réponse : l'offre expire et la suivante reçoit la place", async () => {
    const later = new Date(NOW.getTime() + 16 * 60_000);
    const run = await processWaitlist(t.db, later);
    expect(run.expired).toBe(1);
    expect(run.offers).toHaveLength(1);
    const rows = await offers();
    expect(rows.map((r) => [r.customer_id, r.status])).toEqual([
      [alice, "expired"],
      [bruno, "pending"],
    ]);
    expect(await offerEmails()).toHaveLength(2);
  });
});

describe("quitter la liste (R-85)", () => {
  it("retire l'inscription et passe sa place gardée à la suivante", async () => {
    await oneSlotDay();
    const { entryId } = await join(alice);
    await join(bruno);
    await free();
    await processWaitlist(t.db, NOW);
    await leaveWaitlist(t.db, { customerId: alice, entryId });
    const [entry] = await t.sql`select status from waitlist_entry where id = ${entryId}`;
    expect(entry.status).toBe("removed");
    await processWaitlist(t.db, NOW);
    const rows = await offers();
    expect(rows.map((r) => [r.customer_id, r.status])).toEqual([
      [alice, "declined"],
      [bruno, "pending"],
    ]);
  });

  it("ne retire que l'inscription de son propre compte", async () => {
    await fillDay(TUESDAY);
    const { entryId } = await join(alice);
    await expect(leaveWaitlist(t.db, { customerId: bruno, entryId })).rejects.toMatchObject({
      code: "offer_not_found",
    });
  });
});

describe("inscription périmée (R-86)", () => {
  it("se ferme quand tous ses jours sont passés", async () => {
    await fillDay(TUESDAY);
    await join(alice);
    const run = await processWaitlist(t.db, paris("2026-11-04", "09:00"));
    expect(run.closed).toBe(1);
    expect(await listCustomerWaitlist(t.db, alice, NOW)).toHaveLength(0);
  });

  it("ne propose pas une place que le délai minimal de réservation rend déjà impossible", async () => {
    await oneSlotDay();
    await join(alice);
    await free();
    // 9 h 30 : le créneau de 10 h est à moins d'une heure (R-06).
    const run = await processWaitlist(t.db, paris(TUESDAY, "09:30"));
    expect(run.offers).toHaveLength(0);
  });

  it("garde la place au plus jusqu'à la limite de réservation en ligne", async () => {
    await oneSlotDay();
    await join(alice);
    await free();
    const now = paris(TUESDAY, "08:50");
    await processWaitlist(t.db, now);
    const [offer] = await offers();
    expect(offer.expires_at).toEqual(paris(TUESDAY, "09:00")); // 10 h moins 1 h
  });
});
