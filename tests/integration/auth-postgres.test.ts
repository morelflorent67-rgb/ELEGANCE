import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresDriver } from "../../src/modules/auth/postgres-driver";
import type { SessionStore } from "../../src/modules/auth/types";
import { connectTestDb, paris } from "./helpers";

const t = connectTestDb();
beforeEach(() => t.reset());
afterAll(() => t.close());

class FakeStore implements SessionStore {
  value: string | undefined;
  get() {
    return this.value;
  }
  set(sessionId: string) {
    this.value = sessionId;
  }
  clear() {
    this.value = undefined;
  }
}

function setup(start = paris("2026-11-16", "10:00")) {
  const clock = { now: start };
  const sent: { to: string; link: string }[] = [];
  const make = (store = new FakeStore()) => ({
    store,
    driver: createPostgresDriver({
      db: t.db,
      store,
      now: () => clock.now,
      sendResetEmail: async (to, link) => {
        sent.push({ to, link });
      },
    }),
  });
  return { clock, sent, make };
}

const days = (n: number) => n * 24 * 3600 * 1000;
const codeOf = (link: string) => new URL(link).searchParams.get("code")!;

describe("pilote d'authentification Postgres (D-116)", () => {
  it("inscription : ouvre la session, et la base ne garde que l'empreinte du jeton", async () => {
    const { make } = setup();
    const { driver, store } = make();
    const result = await driver.signUp({ email: "jean@mail.fr", password: "motdepasse1" });
    expect(result.ok).toBe(true);
    expect((await driver.currentUser())?.email).toBe("jean@mail.fr");
    expect((await driver.currentUser())?.role).toBe("customer");

    const sessions = await t.sql`select token_hash from auth_session`;
    expect(sessions).toHaveLength(1);
    expect(sessions[0].token_hash).not.toBe(store.value);
    expect(sessions[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    const [user] = await t.sql`select password_hash from auth_user`;
    expect(user.password_hash.startsWith("scrypt$")).toBe(true);
  });

  it("refuse un mot de passe de moins de 8 caractères", async () => {
    const { make } = setup();
    const result = await make().driver.signUp({ email: "a@mail.fr", password: "court" });
    expect(result).toEqual({ ok: false, reason: "weak_password" });
    expect(await t.sql`select 1 from auth_user`).toHaveLength(0);
  });

  it("point 2 : un seul compte pour Jean@Mail.fr et jean@mail.fr, connexion des deux façons", async () => {
    const { make } = setup();
    await make().driver.signUp({ email: "jean@mail.fr", password: "motdepasse1" });
    const again = await make().driver.signUp({ email: "Jean@Mail.fr", password: "autre-mdp-2" });
    expect(again).toEqual({ ok: false, reason: "email_taken" });
    expect(await t.sql`select 1 from auth_user`).toHaveLength(1);

    const a = await make().driver.signIn({ email: "Jean@Mail.fr", password: "motdepasse1" });
    const b = await make().driver.signIn({ email: "jean@mail.fr", password: "motdepasse1" });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it("point 1 : une adresse inconnue répond comme un mauvais mot de passe, en prenant le même temps", async () => {
    const { make } = setup();
    await make().driver.signUp({ email: "jean@mail.fr", password: "motdepasse1" });
    const { driver } = make();

    const t0 = performance.now();
    const wrong = await driver.signIn({ email: "jean@mail.fr", password: "mauvais-mdp" });
    const knownMs = performance.now() - t0;
    const t1 = performance.now();
    const unknown = await driver.signIn({ email: "inconnu@mail.fr", password: "mauvais-mdp" });
    const unknownMs = performance.now() - t1;

    expect(wrong).toEqual({ ok: false, reason: "invalid_credentials" });
    expect(unknown).toEqual({ ok: false, reason: "invalid_credentials" });
    // Un calcul de hash a eu lieu dans les deux cas : l'adresse inconnue n'est pas instantanée.
    expect(knownMs).toBeGreaterThan(20);
    expect(unknownMs).toBeGreaterThan(20);
  });

  it("la session expire après 90 jours et se supprime", async () => {
    const { clock, make } = setup();
    const { driver } = make();
    await driver.signUp({ email: "jean@mail.fr", password: "motdepasse1" });
    clock.now = new Date(clock.now.getTime() + days(91));
    expect(await driver.currentUser()).toBeNull();
    expect(await t.sql`select 1 from auth_session`).toHaveLength(0);
  });

  it("la session est prolongée à 90 jours quand il en reste moins de 60", async () => {
    const { clock, make } = setup();
    const { driver } = make();
    await driver.signUp({ email: "jean@mail.fr", password: "motdepasse1" });

    clock.now = new Date(clock.now.getTime() + days(20)); // il reste 70 jours : rien ne change
    await driver.currentUser();
    const [before] = await t.sql`select expires_at from auth_session`;
    expect(before.expires_at.getTime()).toBe(paris("2026-11-16", "10:00").getTime() + days(90));

    clock.now = new Date(clock.now.getTime() + days(40)); // il reste 30 jours : repoussée
    expect((await driver.currentUser())?.email).toBe("jean@mail.fr");
    const [after] = await t.sql`select expires_at from auth_session`;
    expect(after.expires_at.getTime()).toBe(clock.now.getTime() + days(90));
  });

  it("déconnexion : supprime la session en base et vide le cookie", async () => {
    const { make } = setup();
    const { driver, store } = make();
    await driver.signUp({ email: "jean@mail.fr", password: "motdepasse1" });
    await driver.signOut();
    expect(store.value).toBeUndefined();
    expect(await t.sql`select 1 from auth_session`).toHaveLength(0);
    expect(await driver.currentUser()).toBeNull();
  });

  it("un jeton inventé ne donne aucune session", async () => {
    const { make } = setup();
    const store = new FakeStore();
    store.value = "jeton-invente";
    expect(await make(store).driver.currentUser()).toBeNull();
  });

  describe("réinitialisation du mot de passe (D-117)", () => {
    it("envoie un lien qui garde le chemin et ajoute le code ; ne stocke que l'empreinte", async () => {
      const { make, sent } = setup();
      await make().driver.signUp({ email: "jean@mail.fr", password: "motdepasse1" });
      await make().driver.requestPasswordReset("Jean@Mail.fr", "https://exemple.fr/auth/callback?next=/mot-de-passe/nouveau");
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe("jean@mail.fr");
      expect(sent[0].link).toMatch(/^https:\/\/exemple\.fr\/auth\/callback\?next=\/mot-de-passe\/nouveau&code=[\w-]+$/);
      const [row] = await t.sql`select token_hash from auth_recovery`;
      expect(sent[0].link).not.toContain(row.token_hash);
    });

    it("n'envoie rien pour une adresse inconnue, sans erreur", async () => {
      const { make, sent } = setup();
      await make().driver.requestPasswordReset("inconnu@mail.fr", "https://exemple.fr/cb");
      expect(sent).toHaveLength(0);
      expect(await t.sql`select 1 from auth_recovery`).toHaveLength(0);
    });

    it("un échec d'envoi ne remonte pas (la réponse ne doit rien révéler)", async () => {
      const store = new FakeStore();
      const driver = createPostgresDriver({
        db: t.db,
        store,
        now: () => paris("2026-11-16", "10:00"),
        sendResetEmail: async () => {
          throw new Error("Brevo est en panne");
        },
      });
      await driver.signUp({ email: "jean@mail.fr", password: "motdepasse1" });
      await expect(driver.requestPasswordReset("jean@mail.fr", "https://exemple.fr/cb")).resolves.toBeUndefined();
    });

    it("le bon code ouvre une session ; point 3 : un second usage est refusé", async () => {
      const { make, sent } = setup();
      await make().driver.signUp({ email: "jean@mail.fr", password: "motdepasse1" });
      await make().driver.requestPasswordReset("jean@mail.fr", "https://exemple.fr/cb");
      const code = codeOf(sent[0].link);

      const first = make();
      expect(await first.driver.exchangeRecoveryCode(code)).toBe(true);
      expect((await first.driver.currentUser())?.email).toBe("jean@mail.fr");

      const second = make();
      expect(await second.driver.exchangeRecoveryCode(code)).toBe(false);
      expect(await second.driver.currentUser()).toBeNull();
    });

    it("point 3 : un code de plus d'1 h est refusé ; un code inconnu aussi", async () => {
      const { clock, make, sent } = setup();
      await make().driver.signUp({ email: "jean@mail.fr", password: "motdepasse1" });
      await make().driver.requestPasswordReset("jean@mail.fr", "https://exemple.fr/cb");
      clock.now = new Date(clock.now.getTime() + 61 * 60 * 1000);
      expect(await make().driver.exchangeRecoveryCode(codeOf(sent[0].link))).toBe(false);
      expect(await make().driver.exchangeRecoveryCode("code-invente")).toBe(false);
    });

    it("un code valable 59 minutes fonctionne encore", async () => {
      const { clock, make, sent } = setup();
      await make().driver.signUp({ email: "jean@mail.fr", password: "motdepasse1" });
      await make().driver.requestPasswordReset("jean@mail.fr", "https://exemple.fr/cb");
      clock.now = new Date(clock.now.getTime() + 59 * 60 * 1000);
      expect(await make().driver.exchangeRecoveryCode(codeOf(sent[0].link))).toBe(true);
    });
  });

  describe("changement de mot de passe", () => {
    it("point 4 : ferme les autres sessions, garde la session en cours", async () => {
      const { make } = setup();
      const phone = make();
      await phone.driver.signUp({ email: "jean@mail.fr", password: "motdepasse1" });
      const laptop = make();
      await laptop.driver.signIn({ email: "jean@mail.fr", password: "motdepasse1" });
      const stolen = make();
      await stolen.driver.signIn({ email: "jean@mail.fr", password: "motdepasse1" });
      expect(await t.sql`select 1 from auth_session`).toHaveLength(3);

      expect(await laptop.driver.updatePassword("nouveau-mdp-9")).toEqual({ ok: true });

      expect((await laptop.driver.currentUser())?.email).toBe("jean@mail.fr");
      expect(await phone.driver.currentUser()).toBeNull();
      expect(await stolen.driver.currentUser()).toBeNull();
      expect(await t.sql`select 1 from auth_session`).toHaveLength(1);

      expect((await make().driver.signIn({ email: "jean@mail.fr", password: "motdepasse1" })).ok).toBe(false);
      expect((await make().driver.signIn({ email: "jean@mail.fr", password: "nouveau-mdp-9" })).ok).toBe(true);
    });

    it("refuse sans session et un mot de passe trop court", async () => {
      const { make } = setup();
      expect(await make().driver.updatePassword("nouveau-mdp-9")).toEqual({ ok: false, reason: "failed" });
      const { driver } = make();
      await driver.signUp({ email: "jean@mail.fr", password: "motdepasse1" });
      expect(await driver.updatePassword("court")).toEqual({ ok: false, reason: "weak_password" });
    });
  });

  describe("compte", () => {
    it("verifyPassword ne touche pas à la session", async () => {
      const { make } = setup();
      const { driver } = make();
      await driver.signUp({ email: "jean@mail.fr", password: "motdepasse1" });
      expect(await driver.verifyPassword("Jean@Mail.fr", "motdepasse1")).toBe(true);
      expect(await driver.verifyPassword("jean@mail.fr", "faux")).toBe(false);
      expect(await driver.verifyPassword("inconnu@mail.fr", "motdepasse1")).toBe(false);
      expect(await t.sql`select 1 from auth_session`).toHaveLength(1);
    });

    it("updateEmail passe en minuscules et refuse un doublon", async () => {
      const { make } = setup();
      const { driver } = make();
      const a = await driver.signUp({ email: "jean@mail.fr", password: "motdepasse1" });
      await make().driver.signUp({ email: "paul@mail.fr", password: "motdepasse1" });
      if (!a.ok) throw new Error("inscription");
      expect(await driver.updateEmail(a.user.id, "Paul@Mail.fr")).toEqual({ ok: false, reason: "email_taken" });
      expect(await driver.updateEmail(a.user.id, "Jean.Neuf@Mail.fr")).toEqual({ ok: true });
      expect((await driver.currentUser())?.email).toBe("jean.neuf@mail.fr");
    });

    it("deleteUser supprime le compte, ses sessions et ses codes", async () => {
      const { make } = setup();
      const { driver } = make();
      const a = await driver.signUp({ email: "jean@mail.fr", password: "motdepasse1" });
      if (!a.ok) throw new Error("inscription");
      await driver.requestPasswordReset("jean@mail.fr", "https://exemple.fr/cb");
      await driver.deleteUser(a.user.id);
      expect(await t.sql`select 1 from auth_user`).toHaveLength(0);
      expect(await t.sql`select 1 from auth_session`).toHaveLength(0);
      expect(await t.sql`select 1 from auth_recovery`).toHaveLength(0);
      expect(await driver.currentUser()).toBeNull();
    });

    it("le rôle « staff » vient de la base (compte créé par le script de la tablette)", async () => {
      const { make } = setup();
      const { hashPassword } = await import("../../src/modules/auth/password");
      await t.sql`insert into auth_user (email, password_hash, role) values ('equipe@salon.fr', ${await hashPassword("un-mot-de-passe-long")}, 'staff')`;
      const { driver } = make();
      const result = await driver.signIn({ email: "equipe@salon.fr", password: "un-mot-de-passe-long" });
      expect(result.ok && result.user.role).toBe("staff");
    });
  });
});
