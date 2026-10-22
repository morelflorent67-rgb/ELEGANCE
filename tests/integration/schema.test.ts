import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { connectTestDb, createCustomer, ENES, ORHAN, paris } from "./helpers";

const t = connectTestDb();
beforeEach(() => t.reset());
afterAll(() => t.close());

describe("principe 5 : aucun accès direct depuis le navigateur", () => {
  it("active la sécurité par ligne sur toutes les tables du schéma public", async () => {
    const tables = await t.sql`
      select c.relname as name, c.relrowsecurity as rls
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname`;
    expect(tables.map((r) => r.name)).toEqual([
      "absence",
      "appointment",
      "appointment_item",
      "appointment_series",
      "audit_log",
      "closure",
      "customer",
      "email_outbox",
      "opening_hours",
      "payment",
      "rate_limit",
      "salon_settings",
      "service",
      "service_staff",
      "staff",
      "waitlist_entry",
      "waitlist_offer",
    ]);
    expect(tables.filter((r) => !r.rls).map((r) => r.name)).toEqual([]);
  });

  it("ne définit aucune politique d'accès : tout accès public est refusé par défaut", async () => {
    const policies = await t.sql`select 1 from pg_policies where schemaname = 'public'`;
    expect(policies).toHaveLength(0);
  });
});

describe("données de départ (la carte, l'équipe, les horaires sont en base)", () => {
  it("pose les 4 membres, les 10 prestations et les horaires de R-01", async () => {
    const [{ n: members }] = await t.sql`select count(*)::int as n from staff`;
    const [{ n: services }] = await t.sql`select count(*)::int as n from service`;
    const hours = await t.sql`
      select weekday, opens_at::text as o, closes_at::text as c from opening_hours order by weekday, opens_at`;
    expect(members).toBe(4);
    expect(services).toBe(10);
    expect(hours).toHaveLength(10); // 5 jours × 2 plages
    expect(hours[0]).toMatchObject({ weekday: 2, o: "10:00:00", c: "12:00:00" });
    expect(hours.at(-1)).toMatchObject({ weekday: 6, o: "13:00:00", c: "19:00:00" });
  });

  it("applique les corrections de la passation design : soin en ligne, tribal sur appel", async () => {
    const rows = await t.sql`
      select name, bookable_online from service where name in ('Soin du visage à la vapeur', 'Tribal')`;
    const online = Object.fromEntries(rows.map((r) => [r.name, r.bookable_online]));
    expect(online["Soin du visage à la vapeur"]).toBe(true);
    expect(online["Tribal"]).toBe(false);
  });

  it("est rejouable sans rien écraser de ce que le gérant a modifié", async () => {
    await t.sql`update service set price_cents = 2000 where name = 'Coupe homme'`;
    await t.sql`delete from opening_hours where weekday = 6`;
    const { readFileSync } = await import("node:fs");
    await t.sql.unsafe(readFileSync("src/db/seed.sql", "utf8"));
    const [coupe] = await t.sql`select price_cents from service where name = 'Coupe homme'`;
    expect(coupe.price_cents).toBe(2000);
    const saturday = await t.sql`select 1 from opening_hours where weekday = 6`;
    expect(saturday).toHaveLength(0);
  });
});

describe("R-10 : une prestation a une durée en multiple de 15 minutes et un prix", () => {
  it("refuse une durée qui n'est pas un multiple de 15", async () => {
    await expect(
      t.sql`insert into service (name, price_cents, duration_min, performed_by) values ('X', 1000, 20, 'barber')`,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      t.sql`insert into service (name, price_cents, duration_min, performed_by) values ('X', 1000, 0, 'barber')`,
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("accepte 15, 45 et 60 minutes", async () => {
    for (const minutes of [15, 45, 60]) {
      await t.sql`insert into service (name, price_cents, duration_min, performed_by) values (${"Test " + minutes}, 1000, ${minutes}, 'barber')`;
    }
  });
});

describe("R-07 : pas de client sans rendez-vous", () => {
  it("refuse un RDV sans client", async () => {
    await expect(
      t.sql`insert into appointment (customer_id, staff_id, starts_at, ends_at, source)
            values (null, ${ORHAN}, ${paris("2026-11-03", "10:00")}, ${paris("2026-11-03", "10:30")}, 'salon')`,
    ).rejects.toMatchObject({ code: "23502" });
  });
});

describe("R-16 : une prestation retirée reste visible dans l'historique", () => {
  it("interdit de supprimer une prestation déjà réservée (on la désactive)", async () => {
    const customerId = await createCustomer(t.sql);
    const [appt] = await t.sql`
      insert into appointment (customer_id, staff_id, starts_at, ends_at, source)
      values (${customerId}, ${ENES}, ${paris("2026-11-03", "10:00")}, ${paris("2026-11-03", "10:30")}, 'salon')
      returning id`;
    await t.sql`
      insert into appointment_item (appointment_id, service_id, name_snapshot, price_cents, duration_min, position)
      select ${appt.id}, id, name, price_cents, duration_min, 0 from service where name = 'Coupe homme'`;
    await expect(t.sql`delete from service where name = 'Coupe homme'`).rejects.toMatchObject({
      code: "23503",
    });
  });
});

describe("réglages du salon : une seule ligne", () => {
  it("refuse une seconde ligne de réglages", async () => {
    await expect(t.sql`insert into salon_settings (id) values (false)`).rejects.toMatchObject({
      code: "23514",
    });
  });

  it("porte les valeurs du dossier projet, avec les demandes du salon du 21 octobre 2026 (D-63 à D-66)", async () => {
    const [s] = await t.sql`select * from salon_settings`;
    expect(s).toMatchObject({
      timezone: "Europe/Paris",
      min_notice_minutes: 60,
      max_horizon_days: 42,
      online_slot_step_minutes: 30,
      salon_slot_step_minutes: 30,
      change_cutoff_hours: 1,
      max_upcoming_per_customer: 5,
      no_show_block_threshold: 2,
      reminder_hours: 24,
    });
  });
});
