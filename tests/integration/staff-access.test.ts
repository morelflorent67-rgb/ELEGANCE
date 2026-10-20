import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  addMemoryStaff,
  createMemoryDriver,
  resetMemoryAuth,
} from "../../src/modules/auth/memory-driver";
import { currentCustomer, registerCustomer } from "../../src/modules/customers/accounts";
import { currentStaffUser, listActiveStaff, loginStaff } from "../../src/modules/staff";
import { NOW, ORHAN, connectTestDb } from "./helpers";

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

const ctx = { ip: "1.2.3.4", now: NOW };
const customerSignUp = {
  firstName: "Thomas",
  lastName: "Durand",
  phone: "06 12 34 56 78",
  email: "thomas@exemple.fr",
  password: "motdepasse",
  acceptTerms: true,
};
const team = { email: "equipe@salon.fr", password: "mot-de-passe-equipe" };

beforeEach(async () => {
  await t.reset();
  resetMemoryAuth();
});
afterAll(() => t.close());

describe("R-72 : la tablette reste connectée en mode équipe", () => {
  it("le compte équipe se connecte et reste reconnu à chaque requête", async () => {
    addMemoryStaff(team.email, team.password);
    const browser = newBrowser();
    expect(await currentStaffUser(browser)).toBeNull();

    const result = await loginStaff(
      t.db,
      browser,
      { email: "Equipe@Salon.fr", password: team.password },
      ctx,
    );
    expect(result).toMatchObject({ ok: true, user: { email: team.email, role: "staff" } });
    expect(await currentStaffUser(browser)).toMatchObject({ email: team.email });
  });

  it("refuse un mauvais mot de passe, avec le même message qu'un email inconnu", async () => {
    addMemoryStaff(team.email, team.password);
    const browser = newBrowser();
    const wrong = await loginStaff(t.db, browser, { email: team.email, password: "faux" }, ctx);
    const unknown = await loginStaff(
      t.db,
      browser,
      { email: "inconnu@salon.fr", password: "faux" },
      ctx,
    );
    expect(wrong).toEqual({ ok: false, error: "invalid_credentials" });
    expect(unknown).toEqual(wrong);
    expect(await currentStaffUser(browser)).toBeNull();
  });

  it("un compte client ne donne jamais accès à la tablette, même avec le bon mot de passe", async () => {
    const browser = newBrowser();
    await registerCustomer(t.db, browser, customerSignUp, ctx);
    expect(await currentStaffUser(browser)).toBeNull(); // connecté comme client : pas équipe

    const other = newBrowser();
    const result = await loginStaff(
      t.db,
      other,
      { email: "thomas@exemple.fr", password: "motdepasse" },
      ctx,
    );
    expect(result).toEqual({ ok: false, error: "invalid_credentials" });
    expect(await currentStaffUser(other)).toBeNull();
    // La session ouverte le temps de vérifier le rôle a été refermée.
    expect(await other.currentUser()).toBeNull();
  });

  it("le compte équipe n'ouvre pas l'espace client", async () => {
    addMemoryStaff(team.email, team.password);
    const browser = newBrowser();
    await loginStaff(t.db, browser, team, ctx);
    expect(await currentCustomer(t.db, browser)).toBeNull();
  });

  it("limite les essais de connexion, même pour le bon mot de passe ensuite", async () => {
    addMemoryStaff(team.email, team.password);
    const browser = newBrowser();
    let last;
    for (let i = 0; i < 11; i++) {
      last = await loginStaff(t.db, browser, { email: team.email, password: "faux" }, ctx);
    }
    expect(last).toMatchObject({ ok: false, error: "rate_limited" });
    expect(await loginStaff(t.db, browser, team, ctx)).toMatchObject({
      ok: false,
      error: "rate_limited",
    });
  });

  it("une session fermée ne donne plus rien", async () => {
    addMemoryStaff(team.email, team.password);
    const browser = newBrowser();
    await loginStaff(t.db, browser, team, ctx);
    await browser.signOut();
    expect(await currentStaffUser(browser)).toBeNull();
  });
});

describe("R-74 : les noms proposés pour signer une action", () => {
  it("liste l'équipe active dans l'ordre d'affichage", async () => {
    const members = await listActiveStaff(t.db);
    expect(members.map((m) => m.firstName)).toEqual(["Orhan", "Enes", "Kaan", "Taha"]);
    expect(members[0].id).toBe(ORHAN);
  });

  it("n'inclut pas un membre désactivé", async () => {
    await t.sql`update staff set active = false where first_name = 'Taha'`;
    expect((await listActiveStaff(t.db)).map((m) => m.firstName)).not.toContain("Taha");
  });
});
