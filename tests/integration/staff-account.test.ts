import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { upsertStaffAccount } from "../../src/modules/auth/staff-account";
import { hashPassword, verifyPasswordHash } from "../../src/modules/auth/password";
import { connectTestDb } from "./helpers";

const t = connectTestDb();
beforeEach(() => t.reset());
afterAll(() => t.close());

describe("compte équipe de la tablette (script staff:account)", () => {
  it("crée le compte avec le rôle staff, adresse en minuscules, mot de passe haché", async () => {
    const result = await upsertStaffAccount(t.sql, "Equipe@Salon.FR", await hashPassword("un-mot-de-passe-long"));
    expect(result).toBe("created");
    const [row] = await t.sql`select email, role, password_hash from auth_user`;
    expect(row.email).toBe("equipe@salon.fr");
    expect(row.role).toBe("staff");
    expect(row.password_hash).not.toContain("un-mot-de-passe-long");
    expect(await verifyPasswordHash("un-mot-de-passe-long", row.password_hash)).toBe(true);
  });

  it("met à jour le mot de passe d'un compte équipe existant et ferme ses sessions", async () => {
    await upsertStaffAccount(t.sql, "equipe@salon.fr", await hashPassword("premier-mot-de-passe"));
    const [{ id }] = await t.sql`select id from auth_user`;
    await t.sql`insert into auth_session (token_hash, user_id, expires_at) values ('s', ${id}, now() + interval '1 day')`;

    expect(await upsertStaffAccount(t.sql, "EQUIPE@salon.fr", await hashPassword("second-mot-de-passe"))).toBe("updated");

    const rows = await t.sql`select password_hash from auth_user`;
    expect(rows).toHaveLength(1);
    expect(await verifyPasswordHash("second-mot-de-passe", rows[0].password_hash)).toBe(true);
    expect(await verifyPasswordHash("premier-mot-de-passe", rows[0].password_hash)).toBe(false);
    expect(await t.sql`select 1 from auth_session`).toHaveLength(0);
  });

  it("refuse l'adresse d'un compte client", async () => {
    await t.sql`insert into auth_user (email, password_hash) values ('client@mail.fr', 'x')`;
    expect(await upsertStaffAccount(t.sql, "client@mail.fr", await hashPassword("un-mot-de-passe-long"))).toBe("customer_account");
    const [row] = await t.sql`select role from auth_user`;
    expect(row.role).toBe("customer");
  });
});
