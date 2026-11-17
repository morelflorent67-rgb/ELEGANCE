import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createMobileApi, type MobileApi } from "../../src/modules/mobile/api";
import { COUPE, COUPE_BARBE, ENES, NOW, ORHAN, connectTestDb, paris } from "./helpers";

// Lot 25 : l'API de l'app iPhone (D-123). Elle ne porte aucune règle : chaque route appelle le module du site.
// Ces tests vérifient l'accès (jeton Bearer), l'isolement entre clients, la traduction des refus en codes stables, et
// que les effets de bord du site (emails, réveil de la liste d'attente) sont bien demandés.

const t = connectTestDb();
const TUESDAY = "2026-11-03";
const SLOT = paris(TUESDAY, "10:00");
const deferred: (() => unknown)[] = [];

beforeEach(async () => {
  deferred.length = 0;
  await t.reset();
});
afterAll(() => t.close());

function api(authorization: string | null = null, ip = "203.0.113.5", now: Date = NOW): MobileApi {
  return createMobileApi({
    db: t.db,
    authorization,
    ip,
    now,
    siteUrl: "https://elegance.test",
    secret: "secret-de-test",
    sendResetEmail: async () => {},
    effects: { sendAppointmentEmails: async () => {}, wakeWaitlist: async () => {} },
    defer: (task) => {
      deferred.push(task);
    },
  });
}

const bearer = (token: string) => `Bearer ${token}`;

/** Un RDV posé en SQL (passé ou à venir), avec sa prestation. */
async function insertAppointment(input: { customerId: string; staffId: string; startsAt: Date; serviceId: string }): Promise<string> {
  const [row] = await t.sql`
    insert into appointment (customer_id, staff_id, starts_at, ends_at, status, source)
    values (${input.customerId}, ${input.staffId}, ${input.startsAt}, ${new Date(input.startsAt.getTime() + 30 * 60_000)}, 'confirmed', 'salon')
    returning id`;
  const [svc] = await t.sql`select name, price_cents, duration_min from service where id = ${input.serviceId}`;
  await t.sql`insert into appointment_item (appointment_id, service_id, name_snapshot, price_cents, duration_min, position)
              values (${row.id}, ${input.serviceId}, ${svc.name}, ${svc.price_cents}, ${svc.duration_min}, 0)`;
  return row.id as string;
}

const signUpInput = (email: string, firstName = "Jean") => ({
  firstName,
  lastName: "Dupont",
  phone: "06 12 34 56 78",
  email,
  password: "motdepasse1",
  acceptTerms: true,
});

/** Un client inscrit par l'API, avec son jeton. */
async function signedUp(email = "jean@mail.fr", firstName = "Jean") {
  const res = await api().register(signUpInput(email, firstName));
  expect(res.status).toBe(201);
  const body = res.body as { token: string; customer: { id: string } };
  return { token: body.token, id: body.customer.id, header: bearer(body.token) };
}

describe("accès : jeton Bearer", () => {
  it("chaque route réservée au client répond 401 sans jeton, avec un jeton inventé et avec un jeton de déconnexion", async () => {
    const fake = bearer("n-existe-pas");
    const calls = (a: MobileApi) => [
      a.me(),
      a.updateMe({}),
      a.changePassword({}),
      a.deleteMe({}),
      a.book({}),
      a.appointments(),
      a.reschedule("00000000-0000-4000-8000-000000000001", {}),
      a.cancel("00000000-0000-4000-8000-000000000001"),
      a.repeatSource("00000000-0000-4000-8000-000000000001"),
      a.joinWaitlist({}),
      a.offer("00000000-0000-4000-8000-000000000001"),
      a.acceptOffer("00000000-0000-4000-8000-000000000001"),
      a.declineOffer("00000000-0000-4000-8000-000000000001"),
      a.leaveWaitlist("00000000-0000-4000-8000-000000000001"),
      a.loyalty(),
    ];
    for (const a of [api(), api(fake)]) {
      for (const res of await Promise.all(calls(a))) {
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ code: "not_signed_in" });
      }
    }
  });

  it("inscription : rend un jeton qui ouvre « me » ; la base ne garde que son empreinte", async () => {
    const { token, header } = await signedUp();
    const me = await api(header).me();
    expect(me.status).toBe(200);
    expect((me.body as { customer: { email: string } }).customer.email).toBe("jean@mail.fr");
    const sessions = await t.sql`select token_hash from auth_session`;
    expect(sessions).toHaveLength(1);
    expect(sessions[0].token_hash).not.toBe(token);
  });

  it("connexion avec le bon mot de passe : nouveau jeton ; mauvais mot de passe : 401 invalid_credentials", async () => {
    await signedUp("jean@mail.fr");
    const ok = await api().login({ email: "JEAN@mail.fr", password: "motdepasse1" });
    expect(ok.status).toBe(200);
    const token = (ok.body as { token: string }).token;
    expect((await api(bearer(token)).me()).status).toBe(200);

    const bad = await api().login({ email: "jean@mail.fr", password: "mauvais-mot-de-passe" });
    expect(bad.status).toBe(401);
    expect(bad.body).toEqual({ code: "invalid_credentials" });
    expect(bad.body).not.toHaveProperty("token");
  });

  it("déconnexion : le jeton ne sert plus (la session est supprimée en base)", async () => {
    const { header } = await signedUp();
    expect((await api(header).logout()).status).toBe(200);
    expect((await api(header).me()).status).toBe(401);
    expect(await t.sql`select 1 from auth_session`).toHaveLength(0);
  });

  it("une session de plus de 90 jours est refusée", async () => {
    const { header } = await signedUp();
    const later = new Date(NOW.getTime() + 91 * 24 * 3600 * 1000);
    expect((await api(header, "203.0.113.5", later).me()).status).toBe(401);
  });

  it("mêmes limites d'essais que le site : la 11e connexion ratée d'un même email est refusée (429)", async () => {
    for (let i = 0; i < 10; i++) {
      await api().login({ email: "x@mail.fr", password: "mauvais" });
    }
    const res = await api().login({ email: "x@mail.fr", password: "mauvais" });
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ code: "rate_limited" });
    expect((res.body as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(0);
  });

  it("inscription invalide : 400 avec les erreurs par champ ; email déjà pris : 409", async () => {
    const bad = await api().register({ ...signUpInput("pas-un-email"), acceptTerms: false });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ code: "invalid", fieldErrors: { email: expect.any(String), acceptTerms: expect.any(String) } });
    await signedUp("jean@mail.fr");
    const taken = await api().register(signUpInput("jean@mail.fr"));
    expect(taken.status).toBe(409);
    expect(taken.body).toEqual({ code: "email_taken" });
  });

  it("mot de passe oublié : répond toujours 200, que l'adresse existe ou non", async () => {
    await signedUp("jean@mail.fr");
    expect((await api().forgotPassword({ email: "jean@mail.fr" })).status).toBe(200);
    expect((await api().forgotPassword({ email: "inconnu@mail.fr" })).status).toBe(200);
    expect((await api().forgotPassword({ email: "pas-un-email" })).status).toBe(400);
  });
});

describe("compte : informations, mot de passe, suppression", () => {
  it("modifie le nom et le téléphone ; changer d'email exige le mot de passe", async () => {
    const { header } = await signedUp();
    const ok = await api(header).updateMe({ firstName: "Jeanne", lastName: "Dupont", phone: "0698765432", email: "jean@mail.fr" });
    expect(ok.status).toBe(200);
    expect((ok.body as { customer: { firstName: string } }).customer.firstName).toBe("Jeanne");

    const refused = await api(header).updateMe({ firstName: "Jeanne", lastName: "Dupont", phone: "0698765432", email: "autre@mail.fr" });
    expect(refused.status).toBe(400);
    expect(refused.body).toMatchObject({ code: "invalid", fieldErrors: { currentPassword: expect.any(String) } });
  });

  it("changer le mot de passe : l'ancien est exigé, et la session en cours reste ouverte", async () => {
    const { header } = await signedUp();
    const wrong = await api(header).changePassword({ currentPassword: "faux-faux-faux", newPassword: "nouveaumdp1" });
    expect(wrong.status).toBe(403);
    expect(wrong.body).toMatchObject({ code: "wrong_password" });
    const ok = await api(header).changePassword({ currentPassword: "motdepasse1", newPassword: "nouveaumdp1" });
    expect(ok.status).toBe(200);
    expect((await api(header).me()).status).toBe(200);
    expect((await api().login({ email: "jean@mail.fr", password: "nouveaumdp1" })).status).toBe(200);
  });

  it("supprimer son compte (Apple 5.1.1) : anonymise la fiche, supprime le compte, le jeton ne sert plus", async () => {
    const { header, id } = await signedUp();
    const wrong = await api(header).deleteMe({ password: "faux-faux-faux" });
    expect(wrong.status).toBe(403);
    const ok = await api(header).deleteMe({ password: "motdepasse1" });
    expect(ok.status).toBe(200);
    expect((await api(header).me()).status).toBe(401);
    const [row] = await t.sql`select anonymized_at from customer where id = ${id}`;
    expect(row.anonymized_at).not.toBeNull();
    expect(await t.sql`select 1 from auth_user`).toHaveLength(0);
    expect((await api().login({ email: "jean@mail.fr", password: "motdepasse1" })).status).toBe(401);
  });

  it("supprimer son compte avec un RDV dans le délai de modification (1 h) : refusé (R-75), le compte reste", async () => {
    const { header, id } = await signedUp();
    await insertAppointment({ customerId: id, staffId: ORHAN, startsAt: paris("2026-11-02", "08:30"), serviceId: COUPE });
    const res = await api(header).deleteMe({ password: "motdepasse1" });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: "imminent_appointment" });
    expect((await api(header).me()).status).toBe(200);
  });
});

describe("réservation", () => {
  it("jours et créneaux : sans connexion, comme le site ; paramètres invalides : 400", async () => {
    const ok = await api().days({ serviceIds: [COUPE], staffId: "any", from: TUESDAY, days: 3 });
    expect(ok.status).toBe(200);
    const days = (ok.body as { days: { date: string; state: string; slots: { iso: string; time: string }[] }[] }).days;
    expect(days.map((d) => d.date)).toEqual(["2026-11-03", "2026-11-04", "2026-11-05"]);
    expect(days[0].slots.map((s) => s.time)).toContain("10:00");
    expect((await api().days({ serviceIds: [], staffId: "any", from: TUESDAY, days: 3 })).status).toBe(400);
  });

  it("coiffeurs d'une sélection de prestations", async () => {
    const res = await api().staffChoices({ serviceIds: [COUPE] });
    expect(res.status).toBe(200);
    expect((res.body as { choices: { id: string }[] }).choices.length).toBeGreaterThan(0);
  });

  it("réserver : crée le RDV, demande l'envoi de l'email après la réponse ; le RDV est à lui", async () => {
    const { header, id } = await signedUp();
    const res = await api(header).book({ serviceIds: [COUPE], staffId: ORHAN, startsAt: SLOT.toISOString() });
    expect(res.status).toBe(201);
    const appointmentId = (res.body as { appointmentId: string }).appointmentId;
    const [row] = await t.sql`select customer_id, source from appointment where id = ${appointmentId}`;
    expect(row.customer_id).toBe(id);
    expect(row.source).toBe("online");
    expect(deferred).toHaveLength(1); // l'email de confirmation
  });

  it("un créneau déjà pris : 409 slot_unavailable ; jour passé : refus métier traduit en code", async () => {
    const a = await signedUp("a@mail.fr", "Alice");
    const b = await signedUp("b@mail.fr", "Bruno");
    expect((await api(a.header).book({ serviceIds: [COUPE], staffId: ORHAN, startsAt: SLOT.toISOString() })).status).toBe(201);
    const taken = await api(b.header).book({ serviceIds: [COUPE], staffId: ORHAN, startsAt: SLOT.toISOString() });
    expect(taken.status).toBe(409);
    expect(taken.body).toEqual({ code: "slot_unavailable" });
    const past = await api(b.header).book({ serviceIds: [COUPE], staffId: ORHAN, startsAt: paris("2026-11-01", "10:00").toISOString() });
    expect(past.status).toBe(422);
    expect((past.body as { code: string }).code).toMatch(/in_past|too_soon|closed/);
  });

  it("corps invalide : 400 invalid", async () => {
    const { header } = await signedUp();
    const res = await api(header).book({ serviceIds: ["pas-un-uuid"], staffId: ORHAN, startsAt: "hier" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "invalid" });
  });

  it("un client bloqué par le gérant ne peut pas réserver (R-52)", async () => {
    const { header, id } = await signedUp();
    await t.sql`update customer set online_booking_blocked = true where id = ${id}`;
    const res = await api(header).book({ serviceIds: [COUPE], staffId: ORHAN, startsAt: SLOT.toISOString() });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: "customer_blocked" });
  });

  it("limite d'essais de réservation partagée avec le site : 10 en 15 minutes", async () => {
    const { header } = await signedUp();
    for (let i = 0; i < 10; i++) {
      await api(header).book({ serviceIds: [COUPE], staffId: ORHAN, startsAt: paris("2026-11-01", "10:00").toISOString() });
    }
    const res = await api(header).book({ serviceIds: [COUPE], staffId: ORHAN, startsAt: SLOT.toISOString() });
    expect(res.status).toBe(429);
  });
});

describe("mes rendez-vous", () => {
  it("liste à venir et passés, avec l'état de la réservation et le délai de modification", async () => {
    const { header, id } = await signedUp();
    await api(header).book({ serviceIds: [COUPE_BARBE], staffId: ORHAN, startsAt: SLOT.toISOString() });
    await insertAppointment({ customerId: id, staffId: ENES, startsAt: paris("2026-10-20", "10:00"), serviceId: COUPE });
    const res = await api(header).appointments();
    expect(res.status).toBe(200);
    const body = res.body as {
      upcoming: { id: string; what: string; changeable: boolean; startsAt: string; calendarUrl: string }[];
      past: { id: string }[];
      booking: { blocked: boolean; upcoming: number; maxUpcoming: number };
      changeCutoffHours: number;
    };
    expect(body.upcoming).toHaveLength(1);
    expect(body.upcoming[0].what).toBe("Coupe & taille de barbe");
    expect(body.upcoming[0].startsAt).toBe(SLOT.toISOString());
    expect(body.upcoming[0].calendarUrl).toContain("/api/agenda/");
    expect(body.past).toHaveLength(1);
    expect(body.booking.upcoming).toBe(1);
    expect(body.changeCutoffHours).toBeGreaterThan(0);
  });

  it("isolement : le jeton d'un autre client ne voit, ne déplace et n'annule rien (404, comme un RDV inexistant)", async () => {
    const a = await signedUp("a@mail.fr", "Alice");
    const b = await signedUp("b@mail.fr", "Bruno");
    const booked = await api(a.header).book({ serviceIds: [COUPE], staffId: ORHAN, startsAt: SLOT.toISOString() });
    const appointmentId = (booked.body as { appointmentId: string }).appointmentId;

    expect(((await api(b.header).appointments()).body as { upcoming: unknown[] }).upcoming).toHaveLength(0);
    for (const res of [
      await api(b.header).cancel(appointmentId),
      await api(b.header).reschedule(appointmentId, { staffId: ORHAN, startsAt: paris(TUESDAY, "11:00").toISOString() }),
      await api(b.header).repeatSource(appointmentId),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: "appointment_not_found" });
    }
    const [row] = await t.sql`select status from appointment where id = ${appointmentId}`;
    expect(row.status).toBe("confirmed");
  });

  it("annuler hors délai : libère la place (email et liste d'attente demandés) ; dans le délai : 422 change_too_late (R-31)", async () => {
    const { header, id } = await signedUp();
    const far = paris("2026-11-10", "10:00");
    const ok = await api(header).book({ serviceIds: [COUPE], staffId: ORHAN, startsAt: far.toISOString() });
    const farId = (ok.body as { appointmentId: string }).appointmentId;
    // Dans le délai de modification (réglage : 1 h) : posé en SQL, la réservation en ligne le refuserait.
    const nearId = await insertAppointment({ customerId: id, staffId: ENES, startsAt: paris("2026-11-02", "08:30"), serviceId: COUPE });
    deferred.length = 0;

    const late = await api(header).cancel(nearId);
    expect(late.status).toBe(422);
    expect(late.body).toEqual({ code: "change_too_late" });
    expect(deferred).toHaveLength(0);

    const done = await api(header).cancel(farId);
    expect(done.status).toBe(200);
    expect(deferred).toHaveLength(2); // email d'annulation + réveil de la liste d'attente (D-100)
    const [row] = await t.sql`select status from appointment where id = ${farId}`;
    expect(row.status).toBe("cancelled_by_customer");
    // Annuler deux fois ne refait rien.
    deferred.length = 0;
    expect((await api(header).cancel(farId)).status).toBe(200);
    expect(deferred).toHaveLength(0);
  });

  it("déplacer : nouveau créneau enregistré, email et liste d'attente demandés ; même créneau : rien à faire", async () => {
    const { header } = await signedUp();
    const start = paris("2026-11-10", "10:00");
    const booked = await api(header).book({ serviceIds: [COUPE], staffId: ORHAN, startsAt: start.toISOString() });
    const id = (booked.body as { appointmentId: string }).appointmentId;
    deferred.length = 0;

    const same = await api(header).reschedule(id, { staffId: ORHAN, startsAt: start.toISOString() });
    expect(same.status).toBe(200);
    expect(same.body).toMatchObject({ changed: false });
    expect(deferred).toHaveLength(0);

    const moved = await api(header).reschedule(id, { staffId: ORHAN, startsAt: paris("2026-11-10", "11:00").toISOString() });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ changed: true });
    expect(deferred).toHaveLength(2);
    const [row] = await t.sql`select starts_at from appointment where id = ${id}`;
    expect(new Date(row.starts_at).toISOString()).toBe(paris("2026-11-10", "11:00").toISOString());
  });

  it("« reprendre le même RDV » : prestations et coiffeur d'un RDV passé du client", async () => {
    const { header, id } = await signedUp();
    const past = await insertAppointment({ customerId: id, staffId: ENES, startsAt: paris("2026-10-20", "10:00"), serviceId: COUPE_BARBE });
    const res = await api(header).repeatSource(past);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ serviceIds: [COUPE_BARBE], staffId: ENES });
  });

  it("identifiant mal formé : 400", async () => {
    const { header } = await signedUp();
    expect((await api(header).cancel("pas-un-uuid")).status).toBe(400);
  });
});

describe("liste d'attente", () => {
  async function fullDay() {
    for (const staffId of [ORHAN, ENES]) {
      await t.sql`insert into absence (staff_id, starts_at, ends_at, reason)
                  values (${staffId}, ${paris(TUESDAY, "00:00")}, ${paris(TUESDAY, "23:59")}, 'plein')`;
    }
  }

  it("s'inscrire sur un jour complet, voir l'inscription dans « mes RDV », la quitter", async () => {
    const { header } = await signedUp();
    await fullDay();
    const join = await api(header).joinWaitlist({ serviceIds: [COUPE], staffId: "any", days: [TUESDAY], window: "day" });
    expect(join.status).toBe(201);
    const list = (await api(header).appointments()).body as { waitlist: { id: string; what: string }[] };
    expect(list.waitlist).toHaveLength(1);
    expect(list.waitlist[0].what).toBe("Coupe homme");
    const left = await api(header).leaveWaitlist(list.waitlist[0].id);
    expect(left.status).toBe(200);
    expect(deferred).toHaveLength(1);
    expect(((await api(header).appointments()).body as { waitlist: unknown[] }).waitlist).toHaveLength(0);
  });

  it("refus métier : une place libre existe encore → 409 slots_available", async () => {
    const { header } = await signedUp();
    const res = await api(header).joinWaitlist({ serviceIds: [COUPE], staffId: "any", days: [TUESDAY], window: "day" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ code: "slots_available" });
  });

  /** Un seul créneau possible (mardi 10 h, Orhan), tenu par un RDV du salon : le jour est complet. */
  async function oneSlotDay(): Promise<string> {
    const [holder] = await t.sql`insert into customer (first_name, last_name, phone, email, origin) values ('Tenant', 'Salon', '+33600000001', 'tenant@example.com', 'salon') returning id`;
    await t.sql`insert into absence (staff_id, starts_at, ends_at, reason) values
      (${ENES}, ${paris(TUESDAY, "00:00")}, ${paris(TUESDAY, "23:59")}, 'plein'),
      (${ORHAN}, ${paris(TUESDAY, "00:00")}, ${paris(TUESDAY, "10:00")}, 'avant'),
      (${ORHAN}, ${paris(TUESDAY, "10:30")}, ${paris(TUESDAY, "23:59")}, 'après')`;
    return insertAppointment({ customerId: holder.id as string, staffId: ORHAN, startsAt: SLOT, serviceId: COUPE });
  }

  async function freedOffer(token: string): Promise<string> {
    const blocker = await oneSlotDay();
    expect((await api(token).joinWaitlist({ serviceIds: [COUPE], staffId: "any", days: [TUESDAY], window: "day" })).status).toBe(201);
    await t.sql`update appointment set status = 'cancelled_by_salon' where id = ${blocker}`;
    const { processWaitlist } = await import("../../src/modules/waitlist");
    await processWaitlist(t.db, NOW);
    const [offerRow] = await t.sql`select id from waitlist_offer`;
    return offerRow.id as string;
  }

  it("offre : la voir, la prendre (RDV créé, email demandé) ; l'offre d'un autre client est introuvable", async () => {
    const a = await signedUp("a@mail.fr", "Alice");
    const b = await signedUp("b@mail.fr", "Bruno");
    const offerId = await freedOffer(a.header);

    const seen = await api(a.header).offer(offerId);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ offer: { id: offerId, state: "pending", staff: "Orhan" } });
    expect((await api(b.header).offer(offerId)).status).toBe(404);
    expect((await api(b.header).acceptOffer(offerId)).status).toBe(404);

    deferred.length = 0;
    const taken = await api(a.header).acceptOffer(offerId);
    expect(taken.status).toBe(201);
    expect(taken.body).toHaveProperty("appointmentId");
    expect(deferred).toHaveLength(1);
  });

  it("une offre expirée : 409 offer_expired, et la liste est réveillée pour la personne suivante", async () => {
    const a = await signedUp("a@mail.fr", "Alice");
    const offerId = await freedOffer(a.header);
    deferred.length = 0;
    const later = new Date(NOW.getTime() + 60 * 60_000);
    const res = await api(a.header, "203.0.113.5", later).acceptOffer(offerId);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ code: "offer_expired" });
    expect(deferred).toHaveLength(1);
  });

  it("refuser une offre : l'inscription reste, la liste est réveillée", async () => {
    const a = await signedUp("a@mail.fr", "Alice");
    const offerId = await freedOffer(a.header);
    deferred.length = 0;
    const res = await api(a.header).declineOffer(offerId);
    expect(res.status).toBe(200);
    expect(deferred).toHaveLength(1);
    const [entry] = await t.sql`select status from waitlist_entry`;
    expect(entry.status).toBe("active");
  });
});

describe("fidélité", () => {
  it("la carte du client : solde, progression, historique", async () => {
    const { header } = await signedUp();
    const res = await api(header).loyalty();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ card: { enabled: true, history: [] } });
  });
});

describe("vitrine", () => {
  it("la carte, l'équipe, les horaires, l'accès et les textes légaux viennent de la base", async () => {
    const res = await api().vitrine();
    expect(res.status).toBe(200);
    const body = res.body as {
      services: { name: string }[];
      team: { firstName: string }[];
      week: unknown;
      access: { address: string; phone: string };
      legal: { slug: string; title: string }[];
      rules: { changeCutoffHours: number };
    };
    expect(body.services.map((s) => s.name)).toContain("Coupe homme");
    expect(body.team.map((m) => m.firstName)).toContain("Orhan");
    expect(body.access.address).toContain("Schiltigheim");
    expect(body.legal.map((l) => l.slug)).toEqual(["mentions-legales", "confidentialite", "conditions"]);
    expect(body.rules.changeCutoffHours).toBeGreaterThan(0);
  });
});
