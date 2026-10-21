import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DomainError, type DomainErrorCode } from "../../src/lib/domain-error";
import { normalizePhone } from "../../src/lib/phone";
import { createMemoryDriver, resetMemoryAuth } from "../../src/modules/auth/memory-driver";
import { createAppointment } from "../../src/modules/booking";
import { registerCustomer } from "../../src/modules/customers/accounts";
import { applyImport } from "../../src/modules/customers/import-apply";
import { parseCsv, planImport } from "../../src/modules/customers/import-file";
import {
  createSalonCustomer,
  mergeCustomers,
  updateSalonCustomer,
} from "../../src/modules/customers/salon-customers";
import { loadCustomerFile, searchCustomers } from "../../src/modules/customers/staff-view";
import { processOutbox, type EmailMessage } from "../../src/modules/mail";
import { loadDayPlanning } from "../../src/modules/planning";
import { COUPE, NOW, ORHAN, connectTestDb, createCustomer, paris } from "./helpers";

// Lot 10 : clients sans compte (D-70). Fiches créées à la tablette (D-76), import du fichier du salon (D-77),
// rattachement et fusion (D-79), « Pour qui ? » (R-28, D-80), emails aux fiches sans compte (D-78, D-81).

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
  expect(error).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
}

const lina = {
  firstName: "Lina",
  lastName: "Martin",
  phone: "06 11 22 33 44",
  email: "",
};

async function created(fields: Record<string, unknown> = lina): Promise<string> {
  const result = await createSalonCustomer(t.db, fields, { samePhoneConfirmed: true }, NOW);
  if (!result.ok) throw new Error(`fiche refusée : ${JSON.stringify(result)}`);
  return result.customerId;
}

const book = (
  customerId: string,
  overrides: Partial<Parameters<typeof createAppointment>[1]> = {},
) =>
  createAppointment(
    t.db,
    {
      customerId,
      serviceIds: [COUPE],
      staffId: ORHAN,
      startsAt: paris("2026-11-10", "10:00"),
      source: "salon",
      createdByStaffId: ORHAN,
      ...overrides,
    },
    NOW,
  );

function fakeTransport() {
  const sent: EmailMessage[] = [];
  return { transport: { send: async (m: EmailMessage) => void sent.push(m) }, sent };
}
const mailOptions = { baseUrl: "https://exemple.fr", secret: "secret-de-test" };

// ---------------------------------------------------------------------------------------------------------------

describe("R-26, D-76 : le salon crée une fiche pour une personne sans compte", () => {
  it("prénom, nom et téléphone suffisent ; la fiche n'a pas de compte et l'email est facultatif", async () => {
    const id = await created();
    const [row] = await t.sql`select * from customer where id = ${id}`;
    expect(row).toMatchObject({
      first_name: "Lina",
      last_name: "Martin",
      phone: "+33611223344",
      email: null,
      auth_user_id: null,
      origin: "salon",
    });
    const [audit] = await t.sql`select * from audit_log where action = 'customer.created'`;
    expect(audit.entity_id).toBe(id);
    // Le journal ne garde aucune donnée personnelle.
    expect(JSON.stringify(audit.after)).not.toMatch(/Lina|Martin|0611|611223344/);
  });

  it("exige prénom, nom et téléphone valide, un message par champ", async () => {
    const result = await createSalonCustomer(t.db, {
      firstName: " ",
      lastName: "",
      phone: "12",
      email: "pas-un-email",
    });
    expect(result).toEqual({
      ok: false,
      error: "invalid",
      fieldErrors: {
        firstName: "Indiquez le prénom.",
        lastName: "Indiquez le nom.",
        phone: "Ce numéro de téléphone ne semble pas valide.",
        email: "Cette adresse email ne semble pas valide.",
      },
    });
    const [{ n }] = await t.sql`select count(*)::int as n from customer`;
    expect(n).toBe(0);
  });

  it("refuse un email déjà pris par une autre fiche (sans tenir compte de la casse) et nomme cette fiche", async () => {
    const first = await created({ ...lina, email: "lina@exemple.fr" });
    const result = await createSalonCustomer(t.db, {
      ...lina,
      firstName: "Autre",
      phone: "0699999999",
      email: "LINA@exemple.fr",
    });
    expect(result).toEqual({
      ok: false,
      error: "email_taken",
      existing: { id: first, name: "Lina Martin", hasAccount: false },
    });
  });

  it("signale une fiche au même numéro, puis crée quand même si on le confirme (une famille partage un numéro)", async () => {
    const mother = await created();
    const asked = await createSalonCustomer(t.db, { ...lina, firstName: "Sami" });
    expect(asked).toEqual({
      ok: false,
      error: "phone_exists",
      existing: [{ id: mother, name: "Lina Martin", hasAccount: false }],
    });
    const confirmed = await createSalonCustomer(
      t.db,
      { ...lina, firstName: "Sami" },
      { samePhoneConfirmed: true },
    );
    expect(confirmed.ok).toBe(true);
  });

  it("le salon réserve pour cette fiche ; la recherche la trouve, marquée sans compte et sans email", async () => {
    const id = await created();
    await book(id);
    const [hit] = await searchCustomers(t.db, "lina", NOW);
    expect(hit).toMatchObject({
      id,
      name: "Lina Martin",
      hasAccount: false,
      hasEmail: false,
      upcoming: 1,
    });
    // Sans email, rien n'entre dans la file d'envoi.
    const [{ n }] = await t.sql`select count(*)::int as n from email_outbox`;
    expect(n).toBe(0);
    // Le planning dit « sans compte » et « sans email » : la tablette n'annonce pas d'email.
    const day = await loadDayPlanning(t.db, "2026-11-10", NOW);
    const appt = day.columns.flatMap((c) => c.appointments)[0];
    expect(appt).toMatchObject({ customerName: "Lina Martin", hasAccount: false, hasEmail: false });
  });

  it("une fiche sans compte ne réserve pas en ligne : elle n'a pas de session (le parcours en ligne exige un compte)", async () => {
    const account = await createCustomer(t.sql);
    const [{ auth_user_id }] = await t.sql`select auth_user_id from customer where id = ${account}`;
    expect(auth_user_id).not.toBeNull();
    const id = await created();
    const [row] = await t.sql`select auth_user_id from customer where id = ${id}`;
    expect(row.auth_user_id).toBeNull();
  });
});

describe("D-76 : l'équipe corrige une fiche sans compte", () => {
  it("change prénom, nom, téléphone et email, signé d'un prénom, sans valeur au journal", async () => {
    const id = await created();
    const result = await updateSalonCustomer(
      t.db,
      {
        customerId: id,
        authorStaffId: ORHAN,
        fields: { ...lina, phone: "0711223344", email: "lina@exemple.fr" },
      },
      NOW,
    );
    expect(result).toEqual({ ok: true, customerId: id });
    const [row] = await t.sql`select phone, email from customer where id = ${id}`;
    expect(row).toEqual({ phone: "+33711223344", email: "lina@exemple.fr" });
    const [audit] = await t.sql`select * from audit_log where action = 'customer.updated'`;
    expect(audit).toMatchObject({ actor_type: "staff", actor_id: ORHAN });
    expect(audit.after).toEqual({ changed: ["phone", "email"] });
  });

  it("exige l'auteur (R-74) et refuse une fiche qui a un compte : son titulaire la gère", async () => {
    const id = await created();
    await expectRefused(
      updateSalonCustomer(t.db, { customerId: id, authorStaffId: null, fields: lina }),
      "author_required",
    );
    const account = await createCustomer(t.sql);
    await expectRefused(
      updateSalonCustomer(t.db, { customerId: account, authorStaffId: ORHAN, fields: lina }),
      "customer_has_account",
    );
  });

  it("refuse l'email d'une autre fiche", async () => {
    await created({ ...lina, email: "pris@exemple.fr" });
    const id = await created({ ...lina, firstName: "Sami", phone: "0600000001" });
    const result = await updateSalonCustomer(t.db, {
      customerId: id,
      authorStaffId: ORHAN,
      fields: { ...lina, firstName: "Sami", phone: "0600000001", email: "pris@exemple.fr" },
    });
    expect(result).toMatchObject({ ok: false, error: "email_taken" });
  });
});

describe("D-79 : rattachement à l'inscription, par l'email", () => {
  const browser = () => {
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
  };
  const signUp = (email: string, phone = "06 55 55 55 55") =>
    registerCustomer(
      t.db,
      browser(),
      {
        firstName: "Lina",
        lastName: "Martin-Durand",
        phone,
        email,
        password: "motdepasse",
        acceptTerms: true,
      },
      { ip: "1.2.3.4", now: NOW },
    );

  it("une fiche sans compte au même email devient le compte, avec ses RDV, et prend les coordonnées saisies", async () => {
    const id = await created({ ...lina, email: "lina@exemple.fr" });
    await book(id);
    const result = await signUp("Lina@Exemple.fr");
    expect(result).toMatchObject({ ok: true, customer: { id, lastName: "Martin-Durand" } });
    const rows = await t.sql`select id, auth_user_id, phone, origin from customer`;
    expect(rows).toHaveLength(1);
    expect(rows[0].auth_user_id).not.toBeNull();
    expect(rows[0]).toMatchObject({ phone: "+33655555555", origin: "salon" });
    const [{ n }] =
      await t.sql`select count(*)::int as n from appointment where customer_id = ${id}`;
    expect(n).toBe(1);
    const [audit] = await t.sql`select * from audit_log where action = 'customer.account_linked'`;
    expect(audit.entity_id).toBe(id);
  });

  it("le même numéro seul ne rattache rien : une nouvelle fiche est créée, et les deux se signalent", async () => {
    const id = await created({ ...lina, phone: "06 55 55 55 55" });
    const result = await signUp("autre@exemple.fr");
    expect(result.ok).toBe(true);
    const [{ n }] = await t.sql`select count(*)::int as n from customer`;
    expect(n).toBe(2);
    const file = await loadCustomerFile(t.db, id);
    expect(file?.samePhone).toHaveLength(1);
    expect(file?.samePhone[0].hasAccount).toBe(true);
  });

  it("un email qui a déjà un compte reste refusé", async () => {
    expect((await signUp("lina@exemple.fr")).ok).toBe(true);
    expect(await signUp("lina@exemple.fr")).toEqual({ ok: false, error: "email_taken" });
  });
});

describe("D-79 : le gérant fusionne deux fiches de la même personne", () => {
  it("les RDV passent sur la fiche gardée, qui complète ses champs ; l'autre disparaît", async () => {
    const keep = await created();
    const gone = await created({ ...lina, email: "lina@exemple.fr" });
    await book(gone);
    await t.sql`update customer set legacy_visits = 4, legacy_last_visit_on = '2025-03-01' where id = ${gone}`;

    expect(
      await mergeCustomers(t.db, { keepId: keep, mergeId: gone, actorId: "gerant" }, NOW),
    ).toEqual({
      keptId: keep,
    });
    const rows = await t.sql`select id, email, legacy_visits from customer`;
    expect(rows).toEqual([{ id: keep, email: "lina@exemple.fr", legacy_visits: 4 }]);
    const [{ n }] =
      await t.sql`select count(*)::int as n from appointment where customer_id = ${keep}`;
    expect(n).toBe(1);
    const [audit] = await t.sql`select * from audit_log where action = 'customer.merged'`;
    expect(audit).toMatchObject({ actor_type: "manager", entity_id: keep });
    expect(audit.after).toEqual({ mergedId: gone, movedAppointments: 1 });
  });

  it("la fiche qui a un compte reste toujours ; deux comptes ne se fusionnent pas", async () => {
    const salon = await created();
    const account = await createCustomer(t.sql);
    expect(await mergeCustomers(t.db, { keepId: salon, mergeId: account, actorId: null })).toEqual({
      keptId: account,
    });
    const other = await createCustomer(t.sql);
    await expectRefused(
      mergeCustomers(t.db, { keepId: account, mergeId: other, actorId: null }),
      "customers_both_have_accounts",
    );
  });
});

describe("R-28, D-80 : « Pour qui ? », le prénom d'un proche", () => {
  it("se garde sur le RDV, en ligne comme au salon, et s'affiche au planning ; le RDV reste au titulaire", async () => {
    const holder = await createCustomer(t.sql, { name: "Karim" });
    await book(holder, { source: "online", createdByStaffId: undefined, forName: "  Lina " });
    const day = await loadDayPlanning(t.db, "2026-11-10", NOW);
    const appt = day.columns.flatMap((c) => c.appointments)[0];
    expect(appt).toMatchObject({
      forName: "Lina",
      customerName: "Karim Client",
      customerId: holder,
    });
  });

  it("vide, il n'est pas enregistré ; plus de 40 caractères, il est refusé", async () => {
    const holder = await createCustomer(t.sql);
    const { id } = await book(holder, { forName: "   " });
    const [row] = await t.sql`select for_name from appointment where id = ${id}`;
    expect(row.for_name).toBeNull();
    await expectRefused(
      book(holder, { startsAt: paris("2026-11-10", "11:00"), forName: "x".repeat(41) }),
      "invalid_for_name",
    );
  });
});

describe("D-78, D-81 : emails d'une fiche sans compte", () => {
  it("le bouton invite à créer son compte et les changements passent par le salon ; « Pour qui ? » est rappelé", async () => {
    const id = await created({ ...lina, email: "lina@exemple.fr" });
    await book(id, { forName: "Inès" });
    const { transport, sent } = fakeTransport();
    await processOutbox(t.db, { ...mailOptions, transport, now: NOW });
    const confirmation = sent.find((m) => /confirmé/.test(m.subject))!;
    expect(confirmation.html).toContain("Créer mon compte");
    expect(confirmation.html).toContain("https://exemple.fr/inscription");
    expect(confirmation.html).not.toContain("Gérer mon rendez-vous");
    expect(confirmation.text).toContain("Pour tout changement, appelez le salon");
    expect(confirmation.html).toContain("Pour Inès");
    // Fiche créée au salon : l'adresse a été donnée au comptoir, pas de mention d'origine.
    expect(confirmation.text).not.toContain("fichier clients du salon");
  });

  it("le premier email d'une fiche importée dit d'où vient l'adresse, les suivants non", async () => {
    await applyImport(
      t.sql,
      [
        {
          firstName: "Nora",
          lastName: "Haddad",
          phone: "+33622222222",
          email: "nora@exemple.fr",
          visits: 3,
          lastVisitOn: "2026-05-02",
        },
      ],
      NOW,
    );
    const [{ id }] = await t.sql`select id from customer where email = 'nora@exemple.fr'`;
    const { transport, sent } = fakeTransport();
    await book(id as string);
    await processOutbox(t.db, { ...mailOptions, transport, now: NOW });
    expect(sent.at(-1)!.text).toContain("Vos coordonnées viennent du fichier clients du salon");
    expect(sent.at(-1)!.html).toContain("Vos coordonnées viennent du fichier clients du salon");
    const [row] = await t.sql`select origin_notice_sent_at from customer where id = ${id}`;
    expect(row.origin_notice_sent_at).not.toBeNull();

    await book(id as string, { startsAt: paris("2026-11-12", "10:00") });
    await processOutbox(t.db, { ...mailOptions, transport, now: NOW });
    expect(sent.at(-1)!.text).not.toContain("fichier clients du salon");
  });

  it("un client avec compte garde « Gérer mon rendez-vous »", async () => {
    const account = await createCustomer(t.sql);
    await book(account);
    const { transport, sent } = fakeTransport();
    await processOutbox(t.db, { ...mailOptions, transport, now: NOW });
    expect(sent[0].html).toContain("Gérer mon rendez-vous");
    expect(sent[0].html).not.toContain("Créer mon compte");
  });
});

describe("D-77 : import du fichier du salon", () => {
  const csv = [
    "firstname;lastname;phonenumber;email;countbookings;lastappointmentat;gender;notes",
    "Nora;HADDAD;+33622222222;Nora@Exemple.fr;3;2026-05-02;f;",
    "Yanis;;+33633333333;;12;2025-01-15;m;",
    "Ancien;Client;+33644444444;ancien@exemple.fr;8;2022-01-01;m;",
    "Sans;Contact;;;2;2026-01-01;m;",
  ].join("\r\n");
  const plan = () =>
    planImport(parseCsv(csv), {
      since: "2023-10-21",
      today: "2026-11-02",
      normalizePhone: (p) => normalizePhone(p),
    });

  it("crée des fiches sans compte, avec l'historique repris, sans rien envoyer, et journalise les nombres", async () => {
    const result = await applyImport(t.sql, plan().candidates, NOW);
    expect(result).toEqual({ created: 2, refreshed: 0, completed: 0 });
    const rows = await t.sql`
      select first_name, last_name, phone, email, origin, auth_user_id, legacy_visits,
             to_char(legacy_last_visit_on, 'YYYY-MM-DD') as last_visit
      from customer order by first_name`;
    expect(rows).toEqual([
      {
        first_name: "Nora",
        last_name: "Haddad",
        phone: "+33622222222",
        email: "nora@exemple.fr",
        origin: "import",
        auth_user_id: null,
        legacy_visits: 3,
        last_visit: "2026-05-02",
      },
      {
        first_name: "Yanis",
        last_name: null,
        phone: "+33633333333",
        email: null,
        origin: "import",
        auth_user_id: null,
        legacy_visits: 12,
        last_visit: "2025-01-15",
      },
    ]);
    const [{ n }] = await t.sql`select count(*)::int as n from email_outbox`;
    expect(n).toBe(0);
    const [audit] = await t.sql`select * from audit_log where action = 'customers.imported'`;
    expect(audit.after).toEqual({ created: 2, refreshed: 0, completed: 0 });
  });

  it("se rejoue sans doublon et rafraîchit l'historique avec un export plus récent", async () => {
    await applyImport(t.sql, plan().candidates, NOW);
    const newer = plan().candidates.map((c) =>
      c.firstName === "Nora" ? { ...c, visits: 4, lastVisitOn: "2026-09-01" } : c,
    );
    expect(await applyImport(t.sql, newer, NOW)).toEqual({
      created: 0,
      refreshed: 2,
      completed: 0,
    });
    const [nora] = await t.sql`
      select legacy_visits, to_char(legacy_last_visit_on, 'YYYY-MM-DD') as d from customer where first_name = 'Nora'`;
    expect(nora).toEqual({ legacy_visits: 4, d: "2026-09-01" });
    const [{ n }] = await t.sql`select count(*)::int as n from customer`;
    expect(n).toBe(2);
  });

  it("ne touche ni au nom, ni au téléphone, ni à l'email d'un client déjà inscrit : seul l'historique s'ajoute", async () => {
    const account = await createCustomer(t.sql, { name: "Nora" });
    await t.sql`update customer set email = 'nora@exemple.fr', last_name = 'Haddad-Benali' where id = ${account}`;
    expect(await applyImport(t.sql, plan().candidates, NOW)).toEqual({
      created: 1,
      refreshed: 0,
      completed: 1,
    });
    const [row] =
      await t.sql`select last_name, phone, legacy_visits from customer where id = ${account}`;
    expect(row).toEqual({ last_name: "Haddad-Benali", phone: "+33600000000", legacy_visits: 3 });
  });

  it("reconnaît une fiche par le même numéro et le même prénom quand elle n'a pas d'email", async () => {
    const yanis = await created({
      firstName: "Yanis",
      lastName: "Benali",
      phone: "06 33 33 33 33",
      email: "",
    });
    const result = await applyImport(t.sql, plan().candidates, NOW);
    expect(result).toEqual({ created: 1, refreshed: 0, completed: 1 });
    const [row] = await t.sql`select legacy_visits from customer where id = ${yanis}`;
    expect(row.legacy_visits).toBe(12);
  });

  it("une fiche importée se retrouve à la tablette, avec son historique", async () => {
    await applyImport(t.sql, plan().candidates, NOW);
    const [hit] = await searchCustomers(t.db, "haddad", NOW);
    expect(hit).toMatchObject({ name: "Nora Haddad", hasAccount: false, hasEmail: true });
    const file = await loadCustomerFile(t.db, hit.id);
    expect(file).toMatchObject({ origin: "import", hasAccount: false, legacyVisits: 3 });
  });
});
