import { describe, expect, it } from "vitest";
import { roleOf, userFromClaims } from "./claims";

// La session se lit dans le jeton vérifié par `getClaims()` (signature, expiration) : ces fonctions ne font que
// traduire son contenu. Le rôle « staff » ouvre la tablette (R-72) ; il ne vient que de `app_metadata`.

const claims = {
  sub: "6f1c2a90-0000-4000-8000-000000000001",
  email: "salon@example.test",
  app_metadata: { role: "staff", provider: "email" },
  user_metadata: {},
};

describe("userFromClaims", () => {
  it("R-72 : le compte équipe est reconnu à son rôle dans app_metadata", () => {
    expect(userFromClaims(claims)).toEqual({ id: claims.sub, email: claims.email, role: "staff" });
  });

  it("un compte sans rôle « staff » est un client", () => {
    expect(userFromClaims({ ...claims, app_metadata: { role: "customer" } })?.role).toBe("customer");
    expect(userFromClaims({ ...claims, app_metadata: {} })?.role).toBe("customer");
    expect(userFromClaims({ sub: claims.sub, email: claims.email })?.role).toBe("customer");
  });

  it("R-72 : un rôle posé dans user_metadata, que le client peut modifier, n'ouvre pas la tablette", () => {
    const forged = { ...claims, app_metadata: {}, user_metadata: { role: "staff" } };
    expect(userFromClaims(forged)?.role).toBe("customer");
  });

  it("sans jeton, sans identifiant ou sans email : pas de session", () => {
    expect(userFromClaims(null)).toBeNull();
    expect(userFromClaims(undefined)).toBeNull();
    expect(userFromClaims({ ...claims, sub: "" })).toBeNull();
    expect(userFromClaims({ ...claims, email: undefined })).toBeNull();
    expect(userFromClaims({ ...claims, email: "" })).toBeNull();
  });
});

describe("roleOf", () => {
  it("ne retient « staff » que s'il est écrit tel quel", () => {
    expect(roleOf({ app_metadata: { role: "staff" } })).toBe("staff");
    expect(roleOf({ app_metadata: { role: "STAFF" } })).toBe("customer");
    expect(roleOf({ app_metadata: { role: ["staff"] } })).toBe("customer");
    expect(roleOf({})).toBe("customer");
  });
});
