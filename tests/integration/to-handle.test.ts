import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DomainError, type DomainErrorCode } from "../../src/lib/domain-error";
import {
  countAppointmentsToHandle,
  declareAbsence,
  listAppointmentsToHandle,
  listFreeColleagues,
  listHeldEmails,
  needsHold,
  releaseHeldEmails,
} from "../../src/modules/absences";
import {
  createAppointment,
  salonCancelAppointment,
  salonRescheduleAppointment,
} from "../../src/modules/booking";
import { setServiceStaff } from "../../src/modules/catalog/manage";
import { processOutbox, type EmailMessage, type EmailTransport } from "../../src/modules/mail";
import { addClosure, setOpeningHours } from "../../src/modules/schedule/manage";
import { setStaffActive } from "../../src/modules/staff/manage";
import {
  COUPE,
  COUPE_FORMATION,
  ENES,
  KAAN,
  NOW,
  ORHAN,
  TAHA,
  connectTestDb,
  createCustomer,
  paris,
} from "./helpers";

const t = connectTestDb();
let customerId: string;

beforeEach(async () => {
  await t.reset();
  customerId = await createCustomer(t.sql, { name: "Thomas" });
  // Le salon est limité à 2 rendez-vous à venir par client (D-41) : ces scénarios en posent davantage pour un seul client.
  await t.sql`update salon_settings set max_upcoming_per_customer = 50`;
});
afterAll(() => t.close());

const MANAGER = "11111111-1111-4111-8111-111111111111";
const AUTHOR = ENES; // le membre de l'équipe qui signe (R-74)
const TUESDAY = "2026-11-03";
const WEDNESDAY = "2026-11-04";

async function expectRefused(promise: Promise<unknown>, code: DomainErrorCode) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `une erreur « ${code} » était attendue`).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
}

/** Un rendez-vous pris par le salon (grille de 15 minutes). */
const book = (
  time: string,
  staffId: string = ORHAN,
  options: { date?: string; serviceIds?: string[]; customer?: string } = {},
) =>
  createAppointment(
    t.db,
    {
      customerId: options.customer ?? customerId,
      serviceIds: options.serviceIds ?? [COUPE],
      staffId,
      startsAt: paris(options.date ?? TUESDAY, time),
      source: "salon",
      createdByStaffId: AUTHOR,
    },
    NOW,
  );

const absent = (staffId: string, startTime: string, endTime: string, date = TUESDAY) =>
  declareAbsence(t.db, { staffId, startDate: date, endDate: date, startTime, endTime, reason: "Congé" }, AUTHOR, NOW);

const toHandle = () => listAppointmentsToHandle(t.db, NOW);
const ids = async () => (await toHandle()).map((a) => a.id);

describe("R-42 : à la déclaration, l'app liste les rendez-vous concernés", () => {
  it("sans absence, aucun rendez-vous n'est à traiter", async () => {
    await book("10:00");
    await book("11:00", ENES);
    expect(await toHandle()).toEqual([]);
    expect(await countAppointmentsToHandle(t.db, NOW)).toBe(0);
  });

  it("liste les rendez-vous confirmés du coiffeur absent, dans l'ordre, avec de quoi appeler le client", async () => {
    const late = await book("15:00");
    const early = await book("10:00");
    await book("10:00", ENES); // un collègue : pas touché
    await absent(ORHAN, "00:00", "23:45");

    const list = await toHandle();
    expect(list.map((a) => a.id)).toEqual([early.id, late.id]);
    expect(list[0]).toMatchObject({
      staffId: ORHAN,
      staffFirstName: "Orhan",
      customerId,
      customerName: "Thomas Client",
      phone: "+33600000000",
      services: ["Coupe homme"],
      startsAt: paris(TUESDAY, "10:00"),
      endsAt: paris(TUESDAY, "10:30"),
    });
    expect(list[0].reasons).toEqual([{ kind: "absence", reason: "Congé" }]);
    expect(await countAppointmentsToHandle(t.db, NOW)).toBe(2);
  });

  it("un chevauchement partiel compte, au début comme à la fin de l'absence", async () => {
    const overlapStart = await book("13:45"); // 13:45–14:15 : mord sur le début de l'absence
    const overlapEnd = await book("15:45"); // 15:45–16:15 : mord sur la fin
    await absent(ORHAN, "14:00", "16:00");
    expect(await ids()).toEqual([overlapStart.id, overlapEnd.id]);
  });

  it("un rendez-vous qui touche seulement la borne de l'absence ne compte pas", async () => {
    await book("13:30"); // finit à 14:00 pile, l'absence commence à 14:00
    await book("16:00"); // commence à 16:00 pile, l'absence finit à 16:00
    await absent(ORHAN, "14:00", "16:00");
    expect(await toHandle()).toEqual([]);
  });

  it("ignore les rendez-vous annulés, signalés, honorés ou déjà terminés", async () => {
    const cancelled = await book("10:00");
    const noShow = await book("10:30");
    const honored = await book("11:00");
    const past = await book("15:00");
    await t.sql`update appointment set status = 'cancelled_by_salon' where id = ${cancelled.id}`;
    await t.sql`update appointment set status = 'no_show' where id = ${noShow.id}`;
    await t.sql`update appointment set status = 'honored' where id = ${honored.id}`;
    // Le dernier est déjà terminé : la veille de « maintenant », sous une absence qui l'aurait touché.
    await t.sql`update appointment set starts_at = ${paris("2026-11-01", "10:00")}, ends_at = ${paris("2026-11-01", "10:30")} where id = ${past.id}`;
    await t.sql`
      insert into absence (staff_id, starts_at, ends_at)
      values (${ORHAN}, ${paris("2026-11-01", "00:00")}, ${paris("2026-11-05", "00:00")})`;
    expect(await toHandle()).toEqual([]);
  });

  it("un rendez-vous traité (déplacé ou annulé) quitte la liste", async () => {
    const a = await book("10:00");
    const b = await book("10:30");
    await absent(ORHAN, "00:00", "23:45");

    await salonCancelAppointment(t.db, { appointmentId: a.id, authorStaffId: AUTHOR, holdEmails: true }, NOW);
    expect(await ids()).toEqual([b.id]);

    await salonRescheduleAppointment(
      t.db,
      { appointmentId: b.id, staffId: ENES, startsAt: paris(TUESDAY, "10:30"), authorStaffId: AUTHOR, holdEmails: true },
      NOW,
    );
    expect(await toHandle()).toEqual([]);
  });

  it("supprimer l'absence retire de la liste les rendez-vous qu'elle touchait", async () => {
    await book("10:00");
    const { id } = await absent(ORHAN, "00:00", "23:45");
    expect(await toHandle()).toHaveLength(1);
    await t.sql`delete from absence where id = ${id}`;
    expect(await toHandle()).toEqual([]);
  });
});

describe("D-57 : le même circuit pour une fermeture, de nouveaux horaires, un départ, une habilitation retirée", () => {
  it("fermeture exceptionnelle : les rendez-vous de ce jour sont à traiter", async () => {
    const a = await book("10:00", ORHAN, { date: WEDNESDAY });
    const b = await book("10:00", ENES, { date: WEDNESDAY });
    await book("10:00", ORHAN, { date: "2026-11-05" });
    await addClosure(t.db, { startsOn: WEDNESDAY, endsOn: WEDNESDAY, reason: "Jour férié" }, MANAGER, NOW);

    const list = await toHandle();
    expect(list.map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
    expect(list[0].reasons).toEqual([{ kind: "closure", reason: "Jour férié" }]);
  });

  it("nouveaux horaires : un rendez-vous hors des plages, ou qui déborde sur la pause, est à traiter", async () => {
    const late = await book("17:45"); // 17:45–18:15
    const morning = await book("11:15"); // 11:15–11:45
    const fine = await book("10:00");
    const range = [{ opensAt: "10:00", closesAt: "12:00" }, { opensAt: "13:00", closesAt: "19:00" }];
    await setOpeningHours(
      t.db,
      {
        1: [],
        2: [
          { opensAt: "10:00", closesAt: "11:30" }, // la pause commence plus tôt
          { opensAt: "13:00", closesAt: "18:00" }, // la fermeture avance d'une heure
        ],
        3: range,
        4: range,
        5: range,
        6: range,
        7: [],
      },
      MANAGER,
    );
    const list = await toHandle();
    expect(list.map((x) => x.id).sort()).toEqual([late.id, morning.id].sort());
    expect(list.every((x) => x.reasons[0].kind === "outside_hours")).toBe(true);
    expect(list.map((x) => x.id)).not.toContain(fine.id);
  });

  it("un jour devenu fermé dans les horaires : ses rendez-vous sont à traiter", async () => {
    const a = await book("10:00");
    const range = [{ opensAt: "10:00", closesAt: "12:00" }, { opensAt: "13:00", closesAt: "19:00" }];
    await setOpeningHours(t.db, { 1: [], 2: [], 3: range, 4: range, 5: range, 6: range, 7: [] }, MANAGER);
    expect(await ids()).toEqual([a.id]);
  });

  it("départ d'un coiffeur : ses rendez-vous à venir sont à traiter, une seule raison", async () => {
    const a = await book("10:00", KAAN, { serviceIds: [COUPE_FORMATION] });
    await setStaffActive(t.db, KAAN, false, MANAGER);
    const [item] = await toHandle();
    expect(item.id).toBe(a.id);
    expect(item.staffFirstName).toBe("Kaan");
    expect(item.reasons).toEqual([{ kind: "staff_left" }]);
  });

  it("habilitation retirée : le rendez-vous de ce coiffeur pour cette prestation est à traiter", async () => {
    const enes = await book("10:00", ENES);
    const orhan = await book("11:00", ORHAN);
    await setServiceStaff(t.db, COUPE, [ORHAN], MANAGER);
    const list = await toHandle();
    expect(list.map((x) => x.id)).toEqual([enes.id]);
    expect(list[0].reasons).toEqual([{ kind: "not_eligible" }]);
    expect(list.map((x) => x.id)).not.toContain(orhan.id);
  });

  it("une prestation retirée de la carte ne rend pas ses rendez-vous « à traiter » (R-16)", async () => {
    await book("10:00");
    await t.sql`update service set active = false where id = ${COUPE}`;
    expect(await toHandle()).toEqual([]);
  });

  it("plusieurs raisons s'additionnent sur un même rendez-vous, sans le doubler", async () => {
    const a = await book("10:00", ORHAN, { date: WEDNESDAY });
    await absent(ORHAN, "00:00", "23:45", WEDNESDAY);
    await addClosure(t.db, { startsOn: WEDNESDAY, endsOn: WEDNESDAY }, MANAGER, NOW);
    const list = await toHandle();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(a.id);
    expect(list[0].reasons.map((r) => r.kind).sort()).toEqual(["absence", "closure"]);
  });
});

describe("R-42 : confier à un collègue, seulement s'il est libre et habilité", () => {
  it("propose le collègue libre sur le même créneau", async () => {
    const a = await book("10:00");
    await absent(ORHAN, "00:00", "23:45");
    expect((await listFreeColleagues(t.db, a.id, NOW)).map((c) => c.firstName)).toEqual(["Enes"]);
  });

  it("ne propose pas un collègue déjà pris, absent, ou non habilité", async () => {
    const a = await book("10:00");
    await absent(ORHAN, "00:00", "23:45");

    await book("10:15", ENES); // 10:15–10:45 chevauche le créneau de 10:00–10:30
    expect(await listFreeColleagues(t.db, a.id, NOW)).toEqual([]);

    await t.sql`delete from appointment where staff_id = ${ENES}`;
    await absent(ENES, "10:00", "11:00");
    expect(await listFreeColleagues(t.db, a.id, NOW)).toEqual([]);

    await t.sql`delete from absence where staff_id = ${ENES}`;
    await setServiceStaff(t.db, COUPE, [ORHAN], MANAGER);
    expect(await listFreeColleagues(t.db, a.id, NOW)).toEqual([]);
  });

  it("reste dans la même catégorie : un apprenti ne propose que l'autre apprenti", async () => {
    const a = await book("10:00", KAAN, { serviceIds: [COUPE_FORMATION] });
    await absent(KAAN, "00:00", "23:45");
    expect((await listFreeColleagues(t.db, a.id, NOW)).map((c) => c.firstName)).toEqual(["Taha"]);
    await absent(TAHA, "09:00", "12:00");
    expect(await listFreeColleagues(t.db, a.id, NOW)).toEqual([]);
  });

  it("un collègue retiré de l'équipe n'est jamais proposé", async () => {
    const a = await book("10:00", KAAN, { serviceIds: [COUPE_FORMATION] });
    await setStaffActive(t.db, TAHA, false, MANAGER);
    await setStaffActive(t.db, KAAN, false, MANAGER).catch(() => {});
    expect(await listFreeColleagues(t.db, a.id, NOW)).toEqual([]);
  });

  it("un jour de fermeture, personne n'est proposé : le créneau n'existe plus", async () => {
    const a = await book("10:00", ORHAN, { date: WEDNESDAY });
    await addClosure(t.db, { startsOn: WEDNESDAY, endsOn: WEDNESDAY }, MANAGER, NOW);
    expect(await listFreeColleagues(t.db, a.id, NOW)).toEqual([]);
  });

  it("confier à un collègue change le coiffeur, garde l'heure, les prestations et le prix (R-16)", async () => {
    const a = await book("10:00");
    await absent(ORHAN, "00:00", "23:45");
    const result = await salonRescheduleAppointment(
      t.db,
      { appointmentId: a.id, staffId: ENES, startsAt: paris(TUESDAY, "10:00"), authorStaffId: AUTHOR, holdEmails: true },
      NOW,
    );
    expect(result).toMatchObject({ changed: true, staffId: ENES });
    const [row] = await t.sql`select staff_id, starts_at, status from appointment where id = ${a.id}`;
    expect(row).toMatchObject({ staff_id: ENES, status: "confirmed" });
    expect(row.starts_at).toEqual(paris(TUESDAY, "10:00"));
    const [item] = await t.sql`select price_cents, duration_min from appointment_item where appointment_id = ${a.id}`;
    expect(item).toMatchObject({ price_cents: 1800, duration_min: 30 });
  });
});

describe("R-43 : aucun message ne part au client sans la confirmation du gérant", () => {
  const options = { baseUrl: "https://exemple.fr", secret: "secret-de-test", now: NOW };

  function recorder() {
    const sent: EmailMessage[] = [];
    const transport: EmailTransport = {
      async send(message) {
        sent.push(message);
      },
    };
    return { transport, sent };
  }

  /** Envoie tout ce que la file a le droit d'envoyer, confirmation du rendez-vous exclue. */
  async function flush() {
    const { transport, sent } = recorder();
    await processOutbox(t.db, { ...options, transport });
    return sent;
  }

  async function treatTwo() {
    const a = await book("10:00");
    const b = await book("11:00");
    await flush(); // les confirmations d'origine
    await absent(ORHAN, "00:00", "23:45");
    await salonCancelAppointment(t.db, { appointmentId: a.id, authorStaffId: AUTHOR, holdEmails: true }, NOW);
    await salonRescheduleAppointment(
      t.db,
      { appointmentId: b.id, staffId: ENES, startsAt: paris(TUESDAY, "11:00"), authorStaffId: AUTHOR, holdEmails: true },
      NOW,
    );
    return { a, b };
  }

  it("les changements s'appliquent tout de suite, mais leurs emails sont retenus", async () => {
    const { a, b } = await treatTwo();
    const [cancelled] = await t.sql`select status from appointment where id = ${a.id}`;
    const [moved] = await t.sql`select staff_id from appointment where id = ${b.id}`;
    expect(cancelled.status).toBe("cancelled_by_salon");
    expect(moved.staff_id).toBe(ENES);

    expect(await flush()).toEqual([]); // ni l'envoi immédiat ni le cron ne les prennent
    const held = await t.sql`select type, held_for_manager, status from email_outbox where held_for_manager`;
    expect(held.map((r) => [r.type, r.status]).sort()).toEqual([["cancellation", "pending"], ["modification", "pending"]]);
  });

  it("liste ce qui attend la confirmation : type, client et créneau", async () => {
    await treatTwo();
    const held = await listHeldEmails(t.db);
    expect(held.map((h) => [h.type, h.customerName, h.startsAt.toISOString()]).sort()).toEqual([
      ["cancellation", "Thomas Client", paris(TUESDAY, "10:00").toISOString()],
      ["modification", "Thomas Client", paris(TUESDAY, "11:00").toISOString()],
    ]);
  });

  it("la confirmation du gérant libère les emails, qui partent alors, avec le texte du salon", async () => {
    const { a, b } = await treatTwo();
    const released = await releaseHeldEmails(t.db, MANAGER, NOW);
    expect(released.appointmentIds.sort()).toEqual([a.id, b.id].sort());
    expect(released.count).toBe(2);

    const sent = await flush();
    expect(sent).toHaveLength(2);
    expect(sent.map((m) => m.subject).sort()).toEqual([
      "Votre rendez-vous du mardi 3 novembre est annulé",
      "Votre rendez-vous est déplacé au mardi 3 novembre",
    ]);
    expect(sent.every((m) => m.html.includes("uite à notre échange"))).toBe(true);
    expect(await listHeldEmails(t.db)).toEqual([]);
  });

  it("la confirmation s'inscrit au journal, sans donnée personnelle", async () => {
    await treatTwo();
    await releaseHeldEmails(t.db, MANAGER, NOW);
    const [entry] = await t.sql`
      select actor_type, actor_id, action, entity, after from audit_log where action = 'emails.released'`;
    expect(entry).toMatchObject({ actor_type: "manager", actor_id: MANAGER, entity: "email_outbox" });
    expect(entry.after).toMatchObject({ count: 2 });
    expect(JSON.stringify(entry.after)).not.toMatch(/@|Thomas|\+33/);
  });

  it("confirmer deux fois n'envoie rien de plus, et sans rien de retenu rien n'est écrit au journal", async () => {
    await treatTwo();
    await releaseHeldEmails(t.db, MANAGER, NOW);
    await flush();
    const again = await releaseHeldEmails(t.db, MANAGER, NOW);
    expect(again).toEqual({ count: 0, appointmentIds: [] });
    expect(await flush()).toEqual([]);
    const rows = await t.sql`select 1 from audit_log where action = 'emails.released'`;
    expect(rows).toHaveLength(1);
  });

  it("sans retenue (hors circuit), le comportement du lot 4 est inchangé : l'email part tout de suite", async () => {
    const a = await book("10:00");
    await flush();
    await salonCancelAppointment(t.db, { appointmentId: a.id, authorStaffId: AUTHOR }, NOW);
    expect(await flush()).toHaveLength(1);
  });

  it("needsHold : vrai pour un rendez-vous à traiter, ou qui a déjà un email retenu ; faux sinon", async () => {
    const a = await book("10:00");
    const b = await book("11:00");
    expect(await needsHold(t.db, a.id, NOW)).toBe(false);

    await absent(ORHAN, "10:00", "10:30");
    expect(await needsHold(t.db, a.id, NOW)).toBe(true);
    expect(await needsHold(t.db, b.id, NOW)).toBe(false);

    // Confié à un collègue : il n'est plus à traiter, mais son email attend encore le gérant.
    await salonRescheduleAppointment(
      t.db,
      { appointmentId: a.id, staffId: ENES, startsAt: paris(TUESDAY, "10:00"), authorStaffId: AUTHOR, holdEmails: true },
      NOW,
    );
    expect(await toHandle()).toEqual([]);
    expect(await needsHold(t.db, a.id, NOW)).toBe(true);

    await releaseHeldEmails(t.db, MANAGER, NOW);
    expect(await needsHold(t.db, a.id, NOW)).toBe(false);
  });

  it("un rendez-vous inconnu : pas de retenue, pas d'erreur", async () => {
    expect(await needsHold(t.db, "00000000-0000-4000-8000-0000000000ff", NOW)).toBe(false);
  });

  it("refuse toujours un traitement sans auteur (R-74), même retenu", async () => {
    const a = await book("10:00");
    await absent(ORHAN, "00:00", "23:45");
    await expectRefused(
      salonCancelAppointment(t.db, { appointmentId: a.id, authorStaffId: "", holdEmails: true }, NOW),
      "author_required",
    );
    expect(await t.sql`select 1 from email_outbox where held_for_manager`).toHaveLength(0);
  });
});
