import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DomainError, type DomainErrorCode } from "../../src/lib/domain-error";
import {
  addMemoryStaff,
  createMemoryDriver,
  memoryAuthState,
  resetMemoryAuth,
} from "../../src/modules/auth/memory-driver";
import { createAppointment } from "../../src/modules/booking";
import { registerCustomer } from "../../src/modules/customers/accounts";
import {
  deleteCustomerAsManager,
  listFlaggedCustomers,
  loadCustomerFile,
  searchCustomers,
  setOnlineBookingBlocked,
} from "../../src/modules/customers/staff-view";
import { setManagerCode, unlockManager } from "../../src/modules/staff/manager";
import {
  COUPE,
  ENES,
  NOW,
  ORHAN,
  connectTestDb,
  createCustomer,
  insertAppointment,
  paris,
} from "./helpers";

const t = connectTestDb();

beforeEach(async () => {
  await t.reset();
  resetMemoryAuth();
});
afterAll(() => t.close());

async function expectRefused(promise: Promise<unknown>, code: DomainErrorCode) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `une erreur « ${code} » était attendue`).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
}

const STAFF_USER = "00000000-0000-4000-8000-0000000000e1";

describe("R-73 : les fonctions gérant demandent un code", () => {
  it("accepte le bon code et refuse un mauvais", async () => {
    await setManagerCode(t.db, "246810");
    expect(
      await unlockManager(t.db, { code: "246810", staffUserId: STAFF_USER, now: NOW }),
    ).toEqual({
      ok: true,
    });
    expect(
      await unlockManager(t.db, { code: "246811", staffUserId: STAFF_USER, now: NOW }),
    ).toEqual({
      ok: false,
      error: "wrong_code",
    });
    expect(await unlockManager(t.db, { code: "abc", staffUserId: STAFF_USER, now: NOW })).toEqual({
      ok: false,
      error: "wrong_code",
    });
  });

  it("garde le code chiffré en base, jamais en clair", async () => {
    await setManagerCode(t.db, "246810");
    const [row] = await t.sql`select manager_pin_hash from salon_settings`;
    expect(row.manager_pin_hash).toMatch(/^scrypt\$/);
    expect(row.manager_pin_hash).not.toContain("246810");
  });

  it("refuse tout tant qu'aucun code n'est défini", async () => {
    expect(
      await unlockManager(t.db, { code: "000000", staffUserId: STAFF_USER, now: NOW }),
    ).toEqual({
      ok: false,
      error: "not_configured",
    });
  });

  it("refuse de définir un code qui n'a pas 6 chiffres", async () => {
    await expect(setManagerCode(t.db, "1234")).rejects.toThrow();
    await expect(setManagerCode(t.db, "12345a")).rejects.toThrow();
    const [row] = await t.sql`select manager_pin_hash from salon_settings`;
    expect(row.manager_pin_hash).toBeNull();
  });

  it("bloque la saisie après trop d'essais, même avec le bon code, puis la rouvre", async () => {
    await setManagerCode(t.db, "246810");
    let last;
    for (let i = 0; i < 9; i++) {
      last = await unlockManager(t.db, { code: "000000", staffUserId: STAFF_USER, now: NOW });
    }
    expect(last).toMatchObject({ ok: false, error: "rate_limited" });
    expect(
      await unlockManager(t.db, { code: "246810", staffUserId: STAFF_USER, now: NOW }),
    ).toMatchObject({ ok: false, error: "rate_limited" });
    const later = new Date(NOW.getTime() + 16 * 60_000);
    expect(
      await unlockManager(t.db, { code: "246810", staffUserId: STAFF_USER, now: later }),
    ).toEqual({ ok: true });
  });

  it("change de code : l'ancien ne marche plus", async () => {
    await setManagerCode(t.db, "246810");
    await setManagerCode(t.db, "135790");
    expect(
      await unlockManager(t.db, { code: "246810", staffUserId: STAFF_USER, now: NOW }),
    ).toMatchObject({ ok: false, error: "wrong_code" });
    expect(
      await unlockManager(t.db, { code: "135790", staffUserId: STAFF_USER, now: NOW }),
    ).toEqual({
      ok: true,
    });
  });
});

describe("R-26 : le salon ne réserve que pour un client qui a un compte", () => {
  const input = (customerId: string) => ({
    customerId,
    serviceIds: [COUPE],
    staffId: ORHAN,
    startsAt: paris("2026-11-03", "10:00"),
    source: "salon" as const,
    createdByStaffId: ENES,
  });

  it("refuse une fiche supprimée (anonymisée)", async () => {
    const id = await createCustomer(t.sql);
    await t.sql`update customer set first_name = null, last_name = null, phone = null, email = null, anonymized_at = now() where id = ${id}`;
    await expectRefused(createAppointment(t.db, input(id), NOW), "customer_has_no_account");
  });

  it("refuse un client inconnu : le salon ne crée pas de client", async () => {
    await expectRefused(
      createAppointment(t.db, input("00000000-0000-4000-8000-0000000000ff"), NOW),
      "unknown_customer",
    );
  });

  it("la recherche ne propose que des clients inscrits, jamais une fiche supprimée", async () => {
    const live = await createCustomer(t.sql, { name: "Thomas" });
    const gone = await createCustomer(t.sql, { name: "Thomas" });
    await t.sql`update customer set first_name = null, last_name = null, phone = null, email = null, anonymized_at = now() where id = ${gone}`;
    const found = await searchCustomers(t.db, "thomas", NOW);
    expect(found.map((c) => c.id)).toEqual([live]);
  });
});

describe("recherche d'un client (maquette « Réserver »)", () => {
  async function client(first: string, last: string, phone: string) {
    const [row] = await t.sql`
      insert into customer (first_name, last_name, phone, email)
      values (${first}, ${last}, ${phone}, ${`${first}.${last}@exemple.fr`.toLowerCase()})
      returning id`;
    return row.id as string;
  }

  it("trouve par nom, prénom ou téléphone, sans tenir compte des accents ni de la casse", async () => {
    const thomas = await client("Thomas", "Durand", "+33612345678");
    await client("Julien", "Durieux", "+33645000021");
    await client("Éric", "Martin", "+33699887766");

    expect((await searchCustomers(t.db, "durand", NOW)).map((c) => c.id)).toEqual([thomas]);
    expect((await searchCustomers(t.db, "THOMAS durand", NOW)).map((c) => c.id)).toEqual([thomas]);
    expect((await searchCustomers(t.db, "06 12 34", NOW)).map((c) => c.id)).toEqual([thomas]);
    expect((await searchCustomers(t.db, "+33612", NOW)).map((c) => c.id)).toEqual([thomas]);
    expect((await searchCustomers(t.db, "eric", NOW)).map((c) => c.name)).toEqual(["Éric Martin"]);
    expect((await searchCustomers(t.db, "du", NOW)).map((c) => c.name).sort()).toEqual([
      "Julien Durieux",
      "Thomas Durand",
    ]);
  });

  it("n'affiche que la fin du téléphone et jamais l'email, avant d'ouvrir la fiche", async () => {
    await client("Thomas", "Durand", "+33612345678");
    const [found] = await searchCustomers(t.db, "durand", NOW);
    expect(found.maskedPhone).toBe("06 •• •• •• 78");
    expect(JSON.stringify(found)).not.toContain("exemple.fr");
    expect(JSON.stringify(found)).not.toContain("12 34 56");
  });

  it("exige au moins 2 caractères et limite le nombre de réponses", async () => {
    for (let i = 0; i < 12; i++) await client("Karim", `Dumas${i}`, `+3367000000${i % 10}`);
    expect(await searchCustomers(t.db, "k", NOW)).toEqual([]);
    expect(await searchCustomers(t.db, "  ", NOW)).toEqual([]);
    expect(await searchCustomers(t.db, "karim", NOW)).toHaveLength(8);
  });

  it("indique le dernier RDV passé et les RDV à venir", async () => {
    const id = await client("Thomas", "Durand", "+33612345678");
    await insertAppointment(t.sql, {
      customerId: id,
      staffId: ORHAN,
      startsAt: paris("2026-10-10", "10:30"),
      endsAt: paris("2026-10-10", "11:00"),
    });
    await insertAppointment(t.sql, {
      customerId: id,
      staffId: ORHAN,
      startsAt: paris("2026-11-10", "10:00"),
      endsAt: paris("2026-11-10", "10:30"),
    });
    const [found] = await searchCustomers(t.db, "durand", NOW);
    expect(found.lastVisit?.toISOString()).toBe(paris("2026-10-10", "10:30").toISOString());
    expect(found.upcoming).toBe(1);
  });
});

describe("R-52 : lapins et blocage de la réservation en ligne (D-35)", () => {
  const noShow = (customerId: string, day: string) =>
    insertAppointment(t.sql, {
      customerId,
      staffId: ORHAN,
      startsAt: paris(day, "10:00"),
      endsAt: paris(day, "10:30"),
      status: "no_show",
    });

  it("la fiche compte les lapins et rappelle le seuil des réglages", async () => {
    const id = await createCustomer(t.sql);
    await noShow(id, "2026-10-06");
    const file = await loadCustomerFile(t.db, id);
    expect(file).toMatchObject({ noShowCount: 1, blockThreshold: 2, blocked: false });
    expect(file?.canBlock).toBe(false);
  });

  it("n'autorise le blocage qu'à partir du seuil", async () => {
    const id = await createCustomer(t.sql);
    await noShow(id, "2026-10-06");
    await expectRefused(
      setOnlineBookingBlocked(t.db, { customerId: id, blocked: true, actorId: STAFF_USER }, NOW),
      "customer_not_blockable",
    );
    await noShow(id, "2026-10-13");
    const file = await loadCustomerFile(t.db, id);
    expect(file?.canBlock).toBe(true);
    await setOnlineBookingBlocked(
      t.db,
      { customerId: id, blocked: true, actorId: STAFF_USER },
      NOW,
    );
    const [row] = await t.sql`select online_booking_blocked from customer where id = ${id}`;
    expect(row.online_booking_blocked).toBe(true);
  });

  it("lit le seuil dans les réglages", async () => {
    await t.sql`update salon_settings set no_show_block_threshold = 3`;
    const id = await createCustomer(t.sql);
    await noShow(id, "2026-10-06");
    await noShow(id, "2026-10-13");
    await expectRefused(
      setOnlineBookingBlocked(t.db, { customerId: id, blocked: true, actorId: STAFF_USER }, NOW),
      "customer_not_blockable",
    );
  });

  it("un client bloqué ne réserve plus en ligne mais le salon réserve pour lui, puis le gérant le débloque", async () => {
    const id = await createCustomer(t.sql);
    await noShow(id, "2026-10-06");
    await noShow(id, "2026-10-13");
    await setOnlineBookingBlocked(
      t.db,
      { customerId: id, blocked: true, actorId: STAFF_USER },
      NOW,
    );

    const booking = (source: "online" | "salon") =>
      createAppointment(
        t.db,
        {
          customerId: id,
          serviceIds: [COUPE],
          staffId: ORHAN,
          startsAt: paris("2026-11-10", "10:00"),
          source,
          ...(source === "salon" ? { createdByStaffId: ENES } : {}),
        },
        NOW,
      );
    await expectRefused(booking("online"), "customer_blocked");
    await booking("salon");

    await setOnlineBookingBlocked(
      t.db,
      { customerId: id, blocked: false, actorId: STAFF_USER },
      NOW,
    );
    const [row] = await t.sql`select online_booking_blocked from customer where id = ${id}`;
    expect(row.online_booking_blocked).toBe(false);
  });

  it("inscrit le blocage et le déblocage au journal, sans donnée personnelle", async () => {
    const id = await createCustomer(t.sql);
    await noShow(id, "2026-10-06");
    await noShow(id, "2026-10-13");
    await setOnlineBookingBlocked(
      t.db,
      { customerId: id, blocked: true, actorId: STAFF_USER },
      NOW,
    );
    await setOnlineBookingBlocked(
      t.db,
      { customerId: id, blocked: false, actorId: STAFF_USER },
      NOW,
    );
    const entries = await t.sql`select * from audit_log where entity = 'customer' order by id`;
    expect(entries.map((e) => e.action)).toEqual(["customer.blocked", "customer.unblocked"]);
    expect(entries[0]).toMatchObject({
      actor_type: "manager",
      actor_id: STAFF_USER,
      entity_id: id,
      after: { onlineBookingBlocked: true, noShowCount: 2 },
    });
  });

  it("répéter le même blocage n'écrit rien de plus", async () => {
    const id = await createCustomer(t.sql);
    await noShow(id, "2026-10-06");
    await noShow(id, "2026-10-13");
    await setOnlineBookingBlocked(
      t.db,
      { customerId: id, blocked: true, actorId: STAFF_USER },
      NOW,
    );
    await setOnlineBookingBlocked(
      t.db,
      { customerId: id, blocked: true, actorId: STAFF_USER },
      NOW,
    );
    expect(await t.sql`select 1 from audit_log where action = 'customer.blocked'`).toHaveLength(1);
  });

  it("refuse un client inconnu ou supprimé", async () => {
    await expectRefused(
      setOnlineBookingBlocked(
        t.db,
        { customerId: "00000000-0000-4000-8000-0000000000ff", blocked: false, actorId: STAFF_USER },
        NOW,
      ),
      "unknown_customer",
    );
  });
});

describe("R-75 : le gérant supprime une fiche client", () => {
  function browser() {
    let session: string | undefined;
    return createMemoryDriver({
      get: () => session,
      set: (id) => {
        session = id;
      },
      clear: () => {
        session = undefined;
      },
    });
  }

  it("anonymise la fiche, annule les RDV à venir (même à moins de 48 h) et supprime le compte", async () => {
    const driver = browser();
    const registered = await registerCustomer(
      t.db,
      driver,
      {
        firstName: "Thomas",
        lastName: "Durand",
        phone: "06 12 34 56 78",
        email: "thomas@exemple.fr",
        password: "motdepasse",
        acceptTerms: true,
      },
      { ip: "1.2.3.4", now: NOW },
    );
    if (!registered.ok) throw new Error("inscription impossible");
    const customerId = registered.customer.id;
    const soon = await createAppointment(
      t.db,
      {
        customerId,
        serviceIds: [COUPE],
        staffId: ORHAN,
        startsAt: paris("2026-11-03", "10:00"), // dans 26 h
        source: "online",
      },
      NOW,
    );
    addMemoryStaff("equipe@salon.fr", "mot-de-passe-equipe");
    const teamDriver = browser();
    await teamDriver.signIn({ email: "equipe@salon.fr", password: "mot-de-passe-equipe" });

    await deleteCustomerAsManager(t.db, teamDriver, { customerId, actorId: STAFF_USER }, NOW);

    const [row] = await t.sql`select * from customer where id = ${customerId}`;
    expect(row).toMatchObject({
      first_name: null,
      last_name: null,
      phone: null,
      email: null,
      auth_user_id: null,
    });
    expect(row.anonymized_at).not.toBeNull();
    const [appt] = await t.sql`select status from appointment where id = ${soon.id}`;
    expect(appt.status).toBe("cancelled_by_salon");
    // Le compte de connexion du client n'existe plus.
    expect(memoryAuthState.users.has("thomas@exemple.fr")).toBe(false);
    const [entry] = await t.sql`select * from audit_log where action = 'customer.deleted'`;
    expect(entry).toMatchObject({
      actor_type: "manager",
      actor_id: STAFF_USER,
      entity_id: customerId,
    });
  });

  it("refuse une fiche déjà supprimée", async () => {
    const id = await createCustomer(t.sql);
    await t.sql`update customer set anonymized_at = now() where id = ${id}`;
    await expectRefused(
      deleteCustomerAsManager(t.db, browser(), { customerId: id, actorId: STAFF_USER }, NOW),
      "unknown_customer",
    );
  });
});

describe("R-52 : clients à surveiller dans l'espace gérant", () => {
  const noShow = (customerId: string, day: string) =>
    insertAppointment(t.sql, {
      customerId,
      staffId: ORHAN,
      startsAt: paris(day, "10:00"),
      endsAt: paris(day, "10:30"),
      status: "no_show",
    });

  it("liste les clients au seuil de lapins, le plus de lapins d'abord, et les clients bloqués", async () => {
    const one = await createCustomer(t.sql, { name: "Un" });
    const two = await createCustomer(t.sql, { name: "Deux" });
    const three = await createCustomer(t.sql, { name: "Trois" });
    const blocked = await createCustomer(t.sql, { name: "Bloque", blocked: true });
    await createCustomer(t.sql, { name: "Sage" });
    await noShow(one, "2026-10-06");
    await noShow(two, "2026-10-07");
    await noShow(two, "2026-10-14");
    for (const day of ["2026-10-08", "2026-10-15", "2026-10-21"]) await noShow(three, day);

    const flagged = await listFlaggedCustomers(t.db);
    expect(flagged.map((c) => [c.id, c.noShowCount, c.blocked])).toEqual([
      [three, 3, false],
      [two, 2, false],
      [blocked, 0, true],
    ]);
  });

  it("n'inclut pas une fiche supprimée", async () => {
    const id = await createCustomer(t.sql);
    await noShow(id, "2026-10-06");
    await noShow(id, "2026-10-13");
    await t.sql`update customer set first_name = null, last_name = null, email = null, anonymized_at = now() where id = ${id}`;
    expect(await listFlaggedCustomers(t.db)).toEqual([]);
  });
});

