import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createMemoryDriver,
  memoryAuthState,
  resetMemoryAuth,
} from "../../src/modules/auth/memory-driver";
import {
  currentCustomer,
  customerBookingState,
  loginCustomer,
  registerCustomer,
  requestPasswordReset,
  setNewPassword,
} from "../../src/modules/customers/accounts";
import { createAppointment } from "../../src/modules/booking";
import { COUPE, NOW, ORHAN, connectTestDb, createCustomer, paris } from "./helpers";

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

const valid = {
  firstName: "Thomas",
  lastName: "Durand",
  phone: "06 12 34 56 78",
  email: "Thomas.Durand@Exemple.fr",
  password: "motdepasse",
  acceptTerms: true,
};
const ctx = { ip: "1.2.3.4", now: NOW };

beforeEach(async () => {
  await t.reset();
  resetMemoryAuth();
});
afterAll(() => t.close());

describe("R-70, R-71 : création du compte client", () => {
  it("crée la fiche avec prénom, nom, téléphone, email, et laisse le client connecté", async () => {
    const browser = newBrowser();
    const result = await registerCustomer(t.db, browser, valid, ctx);
    expect(result).toMatchObject({
      ok: true,
      customer: {
        firstName: "Thomas",
        lastName: "Durand",
        phone: "+33612345678", // normalisé
        email: "thomas.durand@exemple.fr", // en minuscules
      },
    });
    const [row] = await t.sql`select auth_user_id, phone, email from customer`;
    expect(row.auth_user_id).not.toBeNull();
    expect(row.phone).toBe("+33612345678");
    const current = await currentCustomer(t.db, browser);
    expect(current?.email).toBe("thomas.durand@exemple.fr");
  });

  it("exige les cinq champs et l'acceptation des conditions, un message par champ", async () => {
    const result = await registerCustomer(t.db, newBrowser(), {}, ctx);
    expect(result).toMatchObject({ ok: false, error: "invalid" });
    const errors = (result as { fieldErrors: Record<string, string> }).fieldErrors;
    expect(Object.keys(errors).sort()).toEqual([
      "acceptTerms",
      "email",
      "firstName",
      "lastName",
      "password",
      "phone",
    ]);
    expect(errors.acceptTerms).toContain("conditions");
  });

  it("refuse un mot de passe de moins de 8 caractères, un téléphone et un email invalides", async () => {
    const result = await registerCustomer(
      t.db,
      newBrowser(),
      { ...valid, password: "court", phone: "123", email: "pas-un-email" },
      ctx,
    );
    const errors = (result as { fieldErrors: Record<string, string> }).fieldErrors;
    expect(errors.password).toBe("8 caractères minimum.");
    expect(errors.phone).toContain("téléphone");
    expect(errors.email).toContain("email");
    expect(await t.sql`select 1 from customer`).toHaveLength(0);
  });

  it("refuse la case des conditions non cochée", async () => {
    const result = await registerCustomer(
      t.db,
      newBrowser(),
      { ...valid, acceptTerms: false },
      ctx,
    );
    expect(result).toMatchObject({ ok: false, error: "invalid" });
    expect(await t.sql`select 1 from customer`).toHaveLength(0);
  });

  it("refuse un email déjà utilisé, sans tenir compte de la casse", async () => {
    await registerCustomer(t.db, newBrowser(), valid, ctx);
    const again = await registerCustomer(
      t.db,
      newBrowser(),
      { ...valid, email: "THOMAS.DURAND@EXEMPLE.FR" },
      ctx,
    );
    expect(again).toEqual({ ok: false, error: "email_taken" });
    expect(await t.sql`select 1 from customer`).toHaveLength(1);
  });

  it("ne laisse aucun compte à moitié créé quand la fiche ne peut pas l'être", async () => {
    // L'email est libre côté fiches mais pris par une autre fiche créée à la même seconde : course simulée.
    const browser = newBrowser();
    await createCustomer(t.sql); // autre client, autre email
    await t.sql`update customer set email = 'thomas.durand@exemple.fr'`;
    const result = await registerCustomer(t.db, browser, valid, ctx);
    expect(result).toEqual({ ok: false, error: "email_taken" });
    expect(memoryAuthState.users.size).toBe(0);
    expect(await currentCustomer(t.db, browser)).toBeNull();
  });

  it("limite les inscriptions répétées depuis une même adresse", async () => {
    let last;
    for (let i = 0; i < 11; i++) {
      last = await registerCustomer(
        t.db,
        newBrowser(),
        { ...valid, email: `client${i}@exemple.fr` },
        ctx,
      );
    }
    expect(last).toMatchObject({ ok: false, error: "rate_limited" });
    expect((last as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe("connexion", () => {
  async function accountAndLogout() {
    const first = newBrowser();
    await registerCustomer(t.db, first, valid, ctx);
    await first.signOut();
  }

  it("connecte avec le bon email et le bon mot de passe, sans tenir compte de la casse de l'email", async () => {
    await accountAndLogout();
    const browser = newBrowser();
    const result = await loginCustomer(
      t.db,
      browser,
      { email: "THOMAS.durand@exemple.fr", password: "motdepasse" },
      ctx,
    );
    expect(result).toMatchObject({ ok: true, customer: { firstName: "Thomas" } });
    expect((await currentCustomer(t.db, browser))?.lastName).toBe("Durand");
  });

  it("donne la même réponse pour un mot de passe faux et un email inconnu", async () => {
    await accountAndLogout();
    const wrong = await loginCustomer(
      t.db,
      newBrowser(),
      { email: valid.email, password: "mauvais-mot-de-passe" },
      ctx,
    );
    const unknown = await loginCustomer(
      t.db,
      newBrowser(),
      { email: "inconnu@exemple.fr", password: "motdepasse" },
      ctx,
    );
    expect(wrong).toEqual({ ok: false, error: "invalid_credentials" });
    expect(unknown).toEqual(wrong);
  });

  it("refuse un compte sans fiche client (compte de l'équipe, par exemple)", async () => {
    const other = newBrowser();
    await other.signUp({ email: "equipe@exemple.fr", password: "motdepasse" });
    await other.signOut();
    const browser = newBrowser();
    const result = await loginCustomer(
      t.db,
      browser,
      { email: "equipe@exemple.fr", password: "motdepasse" },
      ctx,
    );
    expect(result).toEqual({ ok: false, error: "invalid_credentials" });
    expect(await currentCustomer(t.db, browser)).toBeNull();
  });

  it("limite les essais de connexion sur un même email", async () => {
    await accountAndLogout();
    let last;
    for (let i = 0; i < 12; i++) {
      last = await loginCustomer(t.db, newBrowser(), { email: valid.email, password: "faux" }, ctx);
    }
    expect(last).toMatchObject({ ok: false, error: "rate_limited" });
  });

  it("la déconnexion ferme la session", async () => {
    const browser = newBrowser();
    await registerCustomer(t.db, browser, valid, ctx);
    await browser.signOut();
    expect(await currentCustomer(t.db, browser)).toBeNull();
  });

  it("ne reconnaît pas une fiche anonymisée (R-75)", async () => {
    const browser = newBrowser();
    await registerCustomer(t.db, browser, valid, ctx);
    await t.sql`update customer set anonymized_at = now()`;
    expect(await currentCustomer(t.db, browser)).toBeNull();
  });
});

describe("mot de passe oublié (D-42)", () => {
  it("ne révèle pas si l'adresse a un compte : même réponse dans les deux cas", async () => {
    await registerCustomer(t.db, newBrowser(), valid, ctx);
    const known = await requestPasswordReset(
      t.db,
      newBrowser(),
      { email: valid.email },
      "https://x.fr/cb",
      ctx,
    );
    const unknown = await requestPasswordReset(
      t.db,
      newBrowser(),
      { email: "nobody@exemple.fr" },
      "https://x.fr/cb",
      ctx,
    );
    expect(known).toEqual({ ok: true });
    expect(unknown).toEqual({ ok: true });
    expect(memoryAuthState.resets).toHaveLength(1);
  });

  it("permet de choisir un nouveau mot de passe avec le lien reçu, puis de se reconnecter avec", async () => {
    await registerCustomer(t.db, newBrowser(), valid, ctx);
    const browser = newBrowser();
    await requestPasswordReset(t.db, browser, { email: valid.email }, "https://x.fr/cb", ctx);
    const { code } = memoryAuthState.resets[0];
    expect(await browser.exchangeRecoveryCode(code)).toBe(true);
    expect(await setNewPassword(browser, { password: "nouveau-mot-de-passe" })).toEqual({
      ok: true,
    });
    await browser.signOut();

    const old = await loginCustomer(
      t.db,
      newBrowser(),
      { email: valid.email, password: "motdepasse" },
      ctx,
    );
    const fresh = await loginCustomer(
      t.db,
      newBrowser(),
      { email: valid.email, password: "nouveau-mot-de-passe" },
      ctx,
    );
    expect(old).toMatchObject({ ok: false });
    expect(fresh).toMatchObject({ ok: true });
  });

  it("le lien ne sert qu'une fois", async () => {
    await registerCustomer(t.db, newBrowser(), valid, ctx);
    await requestPasswordReset(t.db, newBrowser(), { email: valid.email }, "https://x.fr/cb", ctx);
    const { code } = memoryAuthState.resets[0];
    expect(await newBrowser().exchangeRecoveryCode(code)).toBe(true);
    expect(await newBrowser().exchangeRecoveryCode(code)).toBe(false);
  });

  it("refuse un nouveau mot de passe trop court", async () => {
    const browser = newBrowser();
    await registerCustomer(t.db, browser, valid, ctx);
    expect(await setNewPassword(browser, { password: "court" })).toMatchObject({
      ok: false,
      error: "invalid",
    });
  });

  it("limite les demandes répétées pour une même adresse", async () => {
    let last;
    for (let i = 0; i < 4; i++) {
      last = await requestPasswordReset(
        t.db,
        newBrowser(),
        { email: valid.email },
        "https://x.fr/cb",
        ctx,
      );
    }
    expect(last).toMatchObject({ ok: false, error: "rate_limited" });
  });
});

describe("R-25, R-52 : ce que le client peut faire en ligne", () => {
  it("compte les RDV à venir et rappelle le maximum", async () => {
    const browser = newBrowser();
    const registered = await registerCustomer(t.db, browser, valid, ctx);
    const id = (registered as { customer: { id: string } }).customer.id;
    expect(await customerBookingState(t.db, id, NOW)).toEqual({
      blocked: false,
      upcoming: 0,
      maxUpcoming: 5, // D-66
    });
    await createAppointment(
      t.db,
      {
        customerId: id,
        serviceIds: [COUPE],
        staffId: ORHAN,
        startsAt: paris("2026-11-10", "10:00"),
        source: "online",
      },
      NOW,
    );
    expect((await customerBookingState(t.db, id, NOW)).upcoming).toBe(1);
  });

  it("signale un client bloqué par le gérant", async () => {
    const id = await createCustomer(t.sql, { blocked: true });
    expect((await customerBookingState(t.db, id, NOW)).blocked).toBe(true);
  });
});
