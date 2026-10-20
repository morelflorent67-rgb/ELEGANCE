import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createMemoryDriver,
  memoryAuthState,
  resetMemoryAuth,
} from "../../src/modules/auth/memory-driver";
import {
  currentCustomer,
  loginCustomer,
  registerCustomer,
  type CustomerProfile,
} from "../../src/modules/customers/accounts";
import {
  anonymizeCustomer,
  changePassword,
  deleteAccount,
  hasImminentAppointment,
  updateProfile,
} from "../../src/modules/customers/profile";
import { createAppointment } from "../../src/modules/booking";
import { COUPE, NOW, ORHAN, connectTestDb, insertAppointment, paris } from "./helpers";

const t = connectTestDb();

function newBrowser() {
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

const signUp = {
  firstName: "Thomas",
  lastName: "Durand",
  phone: "06 12 34 56 78",
  email: "thomas.durand@exemple.fr",
  password: "motdepasse",
  acceptTerms: true,
};
const ctx = { ip: "1.2.3.4", now: NOW };

let browser: ReturnType<typeof newBrowser>;
let me: CustomerProfile;

async function register(overrides: Partial<typeof signUp> = {}) {
  const driver = newBrowser();
  const result = await registerCustomer(t.db, driver, { ...signUp, ...overrides }, ctx);
  if (!result.ok) throw new Error("inscription impossible dans le test");
  return { driver, customer: result.customer };
}

beforeEach(async () => {
  await t.reset();
  resetMemoryAuth();
  ({ driver: browser, customer: me } = await register());
});
afterAll(() => t.close());

const profile = (overrides: Record<string, string> = {}) => ({
  firstName: "Thomas",
  lastName: "Durand",
  phone: "06 12 34 56 78",
  email: "thomas.durand@exemple.fr",
  ...overrides,
});

describe("R-76 : Mes informations — coordonnées", () => {
  it("modifie prénom, nom et téléphone (normalisé) sans demander de mot de passe", async () => {
    const result = await updateProfile(
      t.db,
      browser,
      me.id,
      profile({ firstName: "Tom", lastName: "Dupont", phone: "07 11 22 33 44" }),
      ctx,
    );
    expect(result).toMatchObject({
      ok: true,
      customer: { firstName: "Tom", lastName: "Dupont", phone: "+33711223344" },
    });
    const [row] = await t.sql`select first_name, last_name, phone from customer`;
    expect(row).toMatchObject({ first_name: "Tom", last_name: "Dupont", phone: "+33711223344" });
  });

  it("R-70 : exige prénom, nom, téléphone valide et email valide, un message par champ", async () => {
    const result = await updateProfile(
      t.db,
      browser,
      me.id,
      profile({ firstName: "", lastName: " ", phone: "abc", email: "pas-un-email" }),
      ctx,
    );
    expect(result).toMatchObject({
      ok: false,
      error: "invalid",
      fieldErrors: {
        firstName: "Indiquez votre prénom.",
        lastName: "Indiquez votre nom.",
        phone: "Ce numéro de téléphone ne semble pas valide.",
        email: "Cette adresse email ne semble pas valide.",
      },
    });
  });

  it("changer d'email demande le mot de passe actuel", async () => {
    const result = await updateProfile(
      t.db,
      browser,
      me.id,
      profile({ email: "nouveau@exemple.fr" }),
      ctx,
    );
    expect(result).toMatchObject({
      ok: false,
      error: "invalid",
      fieldErrors: { currentPassword: expect.stringContaining("mot de passe actuel") },
    });
    const [row] = await t.sql`select email from customer`;
    expect(row.email).toBe("thomas.durand@exemple.fr");
  });

  it("refuse un mauvais mot de passe : ni la fiche ni la connexion ne changent", async () => {
    const result = await updateProfile(
      t.db,
      browser,
      me.id,
      profile({ email: "nouveau@exemple.fr", currentPassword: "mauvais" }),
      ctx,
    );
    expect(result).toEqual({ ok: false, error: "wrong_password" });
    expect(memoryAuthState.users.has("thomas.durand@exemple.fr")).toBe(true);
    expect(memoryAuthState.users.has("nouveau@exemple.fr")).toBe(false);
  });

  it("change l'email de la fiche ET de la connexion : on se reconnecte avec la nouvelle adresse", async () => {
    const result = await updateProfile(
      t.db,
      browser,
      me.id,
      profile({ email: "Nouveau@Exemple.fr", currentPassword: "motdepasse" }),
      ctx,
    );
    expect(result).toMatchObject({ ok: true, customer: { email: "nouveau@exemple.fr" } });
    const other = newBrowser();
    const old = await loginCustomer(
      t.db,
      other,
      { email: "thomas.durand@exemple.fr", password: "motdepasse" },
      ctx,
    );
    expect(old).toMatchObject({ ok: false, error: "invalid_credentials" });
    const fresh = await loginCustomer(
      t.db,
      other,
      { email: "nouveau@exemple.fr", password: "motdepasse" },
      ctx,
    );
    expect(fresh).toMatchObject({ ok: true, customer: { id: me.id } });
  });

  it("refuse une adresse déjà utilisée par un autre compte", async () => {
    await register({ email: "autre@exemple.fr" });
    const result = await updateProfile(
      t.db,
      browser,
      me.id,
      profile({ email: "autre@exemple.fr", currentPassword: "motdepasse" }),
      ctx,
    );
    expect(result).toEqual({ ok: false, error: "email_taken" });
    expect(memoryAuthState.users.has("thomas.durand@exemple.fr")).toBe(true);
  });

  it("limite les essais de mot de passe (10 par 15 minutes)", async () => {
    const attempt = () =>
      updateProfile(
        t.db,
        browser,
        me.id,
        profile({ email: "nouveau@exemple.fr", currentPassword: "mauvais" }),
        ctx,
      );
    for (let i = 0; i < 10; i++) {
      expect(await attempt()).toEqual({ ok: false, error: "wrong_password" });
    }
    expect(await attempt()).toMatchObject({ ok: false, error: "rate_limited" });
  });

  it("écrit au journal le nom des champs modifiés, jamais leurs valeurs", async () => {
    await updateProfile(t.db, browser, me.id, profile({ lastName: "Martin" }), ctx);
    const rows = await t.sql`select * from audit_log where action = 'customer.updated'`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor_type: "customer", actor_id: me.id });
    expect(rows[0].after).toEqual({ fields: ["lastName"] });
    expect(JSON.stringify(rows[0])).not.toContain("Martin");
  });

  it("ne touche pas la fiche d'un autre client", async () => {
    const { customer: other } = await register({ email: "autre@exemple.fr" });
    await updateProfile(t.db, browser, me.id, profile({ firstName: "Tom" }), ctx);
    const [row] = await t.sql`select first_name from customer where id = ${other.id}`;
    expect(row.first_name).toBe("Thomas");
  });
});

describe("R-76 : Mes informations — mot de passe", () => {
  it("change le mot de passe : le nouveau fonctionne, l'ancien non", async () => {
    const result = await changePassword(
      t.db,
      browser,
      me.id,
      { currentPassword: "motdepasse", newPassword: "nouveau-mot-de-passe" },
      ctx,
    );
    expect(result).toEqual({ ok: true });
    const other = newBrowser();
    expect(
      await loginCustomer(t.db, other, { email: me.email, password: "nouveau-mot-de-passe" }, ctx),
    ).toMatchObject({ ok: true });
    expect(
      await loginCustomer(t.db, newBrowser(), { email: me.email, password: "motdepasse" }, ctx),
    ).toMatchObject({ ok: false, error: "invalid_credentials" });
    expect(
      await t.sql`select 1 from audit_log where action = 'customer.password_changed'`,
    ).toHaveLength(1);
  });

  it("refuse un mauvais mot de passe actuel, un nouveau trop court, et des champs vides", async () => {
    expect(
      await changePassword(
        t.db,
        browser,
        me.id,
        { currentPassword: "mauvais", newPassword: "nouveau-mot-de-passe" },
        ctx,
      ),
    ).toEqual({ ok: false, error: "wrong_password" });
    expect(
      await changePassword(
        t.db,
        browser,
        me.id,
        { currentPassword: "motdepasse", newPassword: "court" },
        ctx,
      ),
    ).toMatchObject({
      ok: false,
      error: "invalid",
      fieldErrors: { newPassword: "8 caractères minimum." },
    });
    expect(await changePassword(t.db, browser, me.id, {}, ctx)).toMatchObject({
      ok: false,
      error: "invalid",
      fieldErrors: { currentPassword: expect.any(String), newPassword: expect.any(String) },
    });
  });
});

describe("R-75 : suppression du compte par le client (anonymisation, D-43)", () => {
  const FAR = "2026-11-10"; // plus de 48 h après NOW
  const bookFar = (day = FAR, hour = "10:00") =>
    createAppointment(
      t.db,
      {
        customerId: me.id,
        serviceIds: [COUPE],
        staffId: ORHAN,
        startsAt: paris(day, hour),
        source: "online",
      },
      NOW,
    );

  it("efface nom, téléphone, email et lien avec le compte, et ferme la session", async () => {
    await deleteAccount(t.db, browser, me.id, { password: "motdepasse" }, ctx).then((r) =>
      expect(r).toEqual({ ok: true }),
    );
    const [row] = await t.sql`select * from customer where id = ${me.id}`;
    expect(row).toMatchObject({
      first_name: null,
      last_name: null,
      phone: null,
      email: null,
      auth_user_id: null,
    });
    expect(row.anonymized_at).not.toBeNull();
    expect(await currentCustomer(t.db, browser)).toBeNull();
    expect(memoryAuthState.users.size).toBe(0);
    expect(
      await loginCustomer(t.db, newBrowser(), { email: me.email, password: "motdepasse" }, ctx),
    ).toMatchObject({ ok: false });
  });

  it("garde les RDV passés (statut, prix, coiffeur) sans identité : le chiffre d'affaires reste juste", async () => {
    await insertAppointment(t.sql, {
      customerId: me.id,
      staffId: ORHAN,
      startsAt: paris("2026-10-20", "10:00"),
      endsAt: paris("2026-10-20", "10:30"),
      status: "honored",
    });
    await t.sql`insert into appointment_item (appointment_id, service_id, name_snapshot, price_cents, duration_min, position)
      select id, ${COUPE}, 'Coupe homme', 1800, 30, 0 from appointment`;
    await deleteAccount(t.db, browser, me.id, { password: "motdepasse" }, ctx);
    const [past] = await t.sql`
      select a.status, a.customer_id, i.price_cents from appointment a join appointment_item i on i.appointment_id = a.id`;
    expect(past).toMatchObject({ status: "honored", customer_id: me.id, price_cents: 1800 });
  });

  it("annule les RDV à venir (plus de 48 h) et libère leurs créneaux, sans email d'annulation", async () => {
    const created = await bookFar();
    await deleteAccount(t.db, browser, me.id, { password: "motdepasse" }, ctx);
    const [row] = await t.sql`select status from appointment where id = ${created.id}`;
    expect(row.status).toBe("cancelled_by_customer");
    expect(await t.sql`select 1 from email_outbox where type = 'cancellation'`).toHaveLength(0);

    // Le créneau est libre : un autre client peut le prendre.
    const { customer: other } = await register({ email: "autre@exemple.fr" });
    await expect(
      createAppointment(
        t.db,
        {
          customerId: other.id,
          serviceIds: [COUPE],
          staffId: ORHAN,
          startsAt: paris(FAR, "10:00"),
          source: "online",
        },
        NOW,
      ),
    ).resolves.toBeTruthy();
  });

  it("supprime les emails en attente et efface l'adresse des emails déjà envoyés", async () => {
    const created = await bookFar(); // met l'email de confirmation en file
    const sent = await bookFar("2026-11-11");
    await t.sql`update email_outbox set status = 'sent', sent_at = now() where appointment_id = ${sent.id}`;
    await deleteAccount(t.db, browser, me.id, { password: "motdepasse" }, ctx);
    const rows = await t.sql`select appointment_id, to_email, status from email_outbox`;
    expect(rows).toEqual([{ appointment_id: sent.id, to_email: "", status: "sent" }]);
    expect(created.id).toBeTruthy();
  });

  it("l'adresse redevient libre : on peut recréer un compte avec le même email", async () => {
    await deleteAccount(t.db, browser, me.id, { password: "motdepasse" }, ctx);
    const again = await registerCustomer(t.db, newBrowser(), signUp, ctx);
    expect(again).toMatchObject({ ok: true });
    expect((again as { customer: CustomerProfile }).customer.id).not.toBe(me.id);
  });

  it("R-30 : refuse tant qu'un RDV tombe dans les 48 h, et ne change rien", async () => {
    const soon = await bookFar("2026-11-03"); // demain, NOW est lundi 8 h
    expect(await hasImminentAppointment(t.db, me.id, NOW)).toBe(true);
    const result = await deleteAccount(t.db, browser, me.id, { password: "motdepasse" }, ctx);
    expect(result).toEqual({ ok: false, error: "imminent_appointment" });
    const [row] = await t.sql`select status from appointment where id = ${soon.id}`;
    expect(row.status).toBe("confirmed");
    const [client] = await t.sql`select email, anonymized_at from customer where id = ${me.id}`;
    expect(client).toMatchObject({ email: me.email, anonymized_at: null });
    expect(memoryAuthState.users.size).toBe(1);
  });

  it("refuse même quand un autre RDV, plus lointain, est annulable : tout ou rien", async () => {
    const far = await bookFar();
    await bookFar("2026-11-03");
    const result = await deleteAccount(t.db, browser, me.id, { password: "motdepasse" }, ctx);
    expect(result).toEqual({ ok: false, error: "imminent_appointment" });
    const [row] = await t.sql`select status from appointment where id = ${far.id}`;
    expect(row.status).toBe("confirmed");
  });

  it("accepte à 48 h pile, refuse une milliseconde avant", async () => {
    await bookFar(FAR, "10:00"); // 10 novembre 10 h
    const edge = paris("2026-11-08", "10:00");
    expect(await hasImminentAppointment(t.db, me.id, edge)).toBe(false);
    expect(await hasImminentAppointment(t.db, me.id, new Date(edge.getTime() + 1))).toBe(true);
  });

  it("demande le mot de passe : un mauvais mot de passe ne supprime rien", async () => {
    const result = await deleteAccount(t.db, browser, me.id, { password: "mauvais" }, ctx);
    expect(result).toEqual({ ok: false, error: "wrong_password" });
    expect(await currentCustomer(t.db, browser)).not.toBeNull();
    expect(await deleteAccount(t.db, browser, me.id, {}, ctx)).toMatchObject({
      ok: false,
      error: "invalid",
    });
  });

  it("écrit au journal sans aucune donnée personnelle", async () => {
    await bookFar();
    await deleteAccount(t.db, browser, me.id, { password: "motdepasse" }, ctx);
    const rows = await t.sql`select * from audit_log where action = 'customer.deleted'`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor_type: "customer", actor_id: me.id, entity_id: me.id });
    expect(rows[0].after).toEqual({ cancelledAppointments: 1 });
    expect(JSON.stringify(rows)).not.toContain("Durand");
    expect(JSON.stringify(rows)).not.toContain("exemple.fr");
  });

  it("supprimer deux fois la même fiche est refusé proprement", async () => {
    await deleteAccount(t.db, browser, me.id, { password: "motdepasse" }, ctx);
    expect(await deleteAccount(t.db, browser, me.id, { password: "motdepasse" }, ctx)).toEqual({
      ok: false,
      error: "failed",
    });
  });
});

describe("R-75 : suppression d'une fiche client par le gérant", () => {
  it("anonymise la fiche et annule même les RDV proches (le gérant n'est pas soumis au délai, R-33)", async () => {
    const soon = await createAppointment(
      t.db,
      {
        customerId: me.id,
        serviceIds: [COUPE],
        staffId: ORHAN,
        startsAt: paris("2026-11-03", "10:00"),
        source: "online",
      },
      NOW,
    );
    const result = await anonymizeCustomer(
      t.db,
      { customerId: me.id, actor: { type: "manager", id: null }, onImminent: "cancel" },
      NOW,
    );
    expect(result.cancelledAppointmentIds).toEqual([soon.id]);
    const [row] = await t.sql`select status from appointment where id = ${soon.id}`;
    expect(row.status).toBe("cancelled_by_salon");
    const [client] = await t.sql`select email, first_name, anonymized_at from customer`;
    expect(client).toMatchObject({ email: null, first_name: null });
    expect(client.anonymized_at).not.toBeNull();
    const [entry] = await t.sql`select actor_type from audit_log where action = 'customer.deleted'`;
    expect(entry.actor_type).toBe("manager");
  });
});
