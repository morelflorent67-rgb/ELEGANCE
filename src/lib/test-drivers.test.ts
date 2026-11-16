import { describe, expect, it } from "vitest";
import {
  assertTestDriversAllowed,
  authDriverKind,
  logTransportAllowed,
  paymentDriverKind,
} from "./test-drivers";

const prod = { NODE_ENV: "production" } as const;
const allowed = { ALLOW_TEST_DRIVERS: "true" } as const;

describe("faux pilotes : interdits tant qu'on ne les autorise pas (point 5)", () => {
  it("assertTestDriversAllowed lève sans la variable, ne lève pas avec « true »", () => {
    expect(() => assertTestDriversAllowed("AUTH_DRIVER=memory", {})).toThrow(/ALLOW_TEST_DRIVERS/);
    expect(() => assertTestDriversAllowed("AUTH_DRIVER=memory", { ALLOW_TEST_DRIVERS: "1" })).toThrow();
    expect(() => assertTestDriversAllowed("AUTH_DRIVER=memory", allowed)).not.toThrow();
  });

  it("AUTH_DRIVER=memory sans autorisation refuse la connexion", () => {
    expect(() => authDriverKind({ AUTH_DRIVER: "memory", ...prod })).toThrow(/AUTH_DRIVER=memory/);
    expect(authDriverKind({ AUTH_DRIVER: "memory", ...allowed })).toBe("memory");
  });

  it("sans AUTH_DRIVER, le pilote est Postgres, autorisation ou non", () => {
    expect(authDriverKind({})).toBe("postgres");
    expect(authDriverKind(allowed)).toBe("postgres");
  });

  it("PAYMENT_DRIVER=fake sans autorisation refuse l'encaissement", () => {
    expect(() => paymentDriverKind({ PAYMENT_DRIVER: "fake", ...prod })).toThrow(/PAYMENT_DRIVER=fake/);
    expect(paymentDriverKind({ PAYMENT_DRIVER: "fake", ...allowed })).toBe("fake");
    expect(paymentDriverKind({})).toBe("real");
  });

  it("le transport « journal » (rien ne part) est refusé en production, sauf pour les tests", () => {
    expect(logTransportAllowed({ ...prod })).toBe(false);
    expect(logTransportAllowed({ ...prod, ...allowed })).toBe(true);
    expect(logTransportAllowed({ NODE_ENV: "development" })).toBe(true);
    expect(logTransportAllowed({})).toBe(true);
  });
});
