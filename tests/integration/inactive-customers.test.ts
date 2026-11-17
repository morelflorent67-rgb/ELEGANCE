import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { INACTIVITY_YEARS, findInactiveCustomers, purgeInactiveCustomers } from "../../src/modules/customers/inactive";
import { NOW, ORHAN, connectTestDb, insertAppointment, paris } from "./helpers";

// R-101 : un compte ou une fiche sans RDV ni connexion depuis 3 ans est supprimé (identité effacée, RDV gardés sans identité).

const t = connectTestDb();

const deleted: string[] = [];
const driver = {
  async deleteUser(id: string) {
    deleted.push(id);
  },
};

beforeEach(async () => {
  await t.reset();
  deleted.length = 0;
});
afterAll(() => t.close());

const yearsAgo = (years: number, extraDays = 0) => {
  const d = new Date(NOW);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() - extraDays);
  return d;
};

async function makeCustomer(opts: { createdAt: Date; withoutAccount?: boolean; email?: string }) {
  const authId = opts.withoutAccount ? null : crypto.randomUUID();
  const email = opts.email ?? `c-${crypto.randomUUID()}@example.com`;
  if (authId) {
    await t.sql`insert into auth_user (id, email, password_hash) values (${authId}, ${email}, 'x')`;
  }
  const [row] = await t.sql`
    insert into customer (first_name, last_name, phone, email, auth_user_id, origin, created_at)
    values ('Test', 'Client', '+33600000000', ${email}, ${authId}, ${opts.withoutAccount ? "salon" : "account"}, ${opts.createdAt})
    returning id`;
  return { id: row.id as string, authId };
}

const anonymized = async (id: string) =>
  (await t.sql`select anonymized_at, first_name, email from customer where id = ${id}`)[0];

describe("R-101 : fiches inactives depuis 3 ans", () => {
  it("la durée est de 3 ans", () => {
    expect(INACTIVITY_YEARS).toBe(3);
  });

  it("supprime un compte créé il y a plus de 3 ans, sans RDV ni connexion", async () => {
    const old = await makeCustomer({ createdAt: yearsAgo(3, 1) });
    const result = await purgeInactiveCustomers(t.db, driver, NOW);
    expect(result.purged).toBe(1);
    const row = await anonymized(old.id);
    expect(row.anonymized_at).not.toBeNull();
    expect(row.first_name).toBeNull();
    expect(row.email).toBeNull();
    expect(deleted).toEqual([old.authId]);
  });

  it("garde un compte plus récent que 3 ans", async () => {
    const recent = await makeCustomer({ createdAt: yearsAgo(3, -1) });
    expect((await purgeInactiveCustomers(t.db, driver, NOW)).purged).toBe(0);
    expect((await anonymized(recent.id)).anonymized_at).toBeNull();
    expect(deleted).toEqual([]);
  });

  it("un RDV récent compte comme une activité, même sur un vieux compte", async () => {
    const c = await makeCustomer({ createdAt: yearsAgo(5) });
    await insertAppointment(t.sql, {
      customerId: c.id,
      staffId: ORHAN,
      startsAt: paris("2026-06-01", "10:00"),
      endsAt: paris("2026-06-01", "10:30"),
      status: "honored",
    });
    expect(await findInactiveCustomers(t.db, NOW)).toEqual([]);
  });

  it("un RDV à venir est une activité", async () => {
    const c = await makeCustomer({ createdAt: yearsAgo(5) });
    await insertAppointment(t.sql, {
      customerId: c.id,
      staffId: ORHAN,
      startsAt: paris("2026-11-20", "10:00"),
      endsAt: paris("2026-11-20", "10:30"),
    });
    expect(await findInactiveCustomers(t.db, NOW)).toEqual([]);
  });

  it("une connexion récente compte comme une activité", async () => {
    const c = await makeCustomer({ createdAt: yearsAgo(5) });
    await t.sql`insert into auth_session (token_hash, user_id, expires_at, created_at)
                values ('h1', ${c.authId}, ${paris("2027-01-01", "10:00")}, ${paris("2026-10-01", "10:00")})`;
    expect(await findInactiveCustomers(t.db, NOW)).toEqual([]);
  });

  it("un RDV vieux de plus de 3 ans ne protège pas la fiche, et reste gardé sans identité", async () => {
    const c = await makeCustomer({ createdAt: yearsAgo(6) });
    await insertAppointment(t.sql, {
      customerId: c.id,
      staffId: ORHAN,
      startsAt: yearsAgo(4),
      endsAt: new Date(yearsAgo(4).getTime() + 30 * 60_000),
      status: "honored",
    });
    expect((await purgeInactiveCustomers(t.db, driver, NOW)).purged).toBe(1);
    const [appt] = await t.sql`select customer_id from appointment where customer_id = ${c.id}`;
    expect(appt).toBeDefined();
    expect((await anonymized(c.id)).email).toBeNull();
  });

  it("la dernière visite du fichier repris compte comme une activité", async () => {
    const c = await makeCustomer({ createdAt: yearsAgo(5), withoutAccount: true });
    await t.sql`update customer set legacy_last_visit_on = '2026-05-01' where id = ${c.id}`;
    expect(await findInactiveCustomers(t.db, NOW)).toEqual([]);
  });

  it("supprime aussi une fiche sans compte inactive (aucun compte de connexion à supprimer)", async () => {
    const c = await makeCustomer({ createdAt: yearsAgo(4), withoutAccount: true });
    expect((await purgeInactiveCustomers(t.db, driver, NOW)).purged).toBe(1);
    expect((await anonymized(c.id)).anonymized_at).not.toBeNull();
    expect(deleted).toEqual([]);
  });

  it("ne touche pas aux comptes de l'équipe, et ne repasse pas sur une fiche déjà supprimée", async () => {
    const staffId = crypto.randomUUID();
    await t.sql`insert into auth_user (id, email, password_hash, role) values (${staffId}, 'equipe@example.com', 'x', 'staff')`;
    await t.sql`insert into customer (first_name, email, auth_user_id, created_at)
                values ('Equipe', 'equipe@example.com', ${staffId}, ${yearsAgo(5)})`;
    expect(await findInactiveCustomers(t.db, NOW)).toEqual([]);

    await makeCustomer({ createdAt: yearsAgo(5) });
    expect((await purgeInactiveCustomers(t.db, driver, NOW)).purged).toBe(1);
    expect((await purgeInactiveCustomers(t.db, driver, NOW)).purged).toBe(0);
  });

  it("l'entrée du journal porte le motif « inactive » et l'auteur « system », sans donnée personnelle", async () => {
    const c = await makeCustomer({ createdAt: yearsAgo(4) });
    await purgeInactiveCustomers(t.db, driver, NOW);
    const [log] = await t.sql`
      select actor_type, after from audit_log where action = 'customer.deleted' and entity_id = ${c.id}`;
    expect(log.actor_type).toBe("system");
    expect(log.after.reason).toBe("inactive");
    expect(JSON.stringify(log.after)).not.toContain("@");
  });
});
