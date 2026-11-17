import { describe, expect, it } from "vitest";
import { bearerToken, createBearerStore } from "./bearer";

describe("jeton Bearer de l'app mobile", () => {
  it("lit le jeton de l'en-tête Authorization", () => {
    expect(bearerToken("Bearer abc.def-123_X")).toBe("abc.def-123_X");
    expect(bearerToken("bearer abc")).toBe("abc");
  });

  it("refuse un en-tête absent, vide ou d'un autre type", () => {
    expect(bearerToken(null)).toBeUndefined();
    expect(bearerToken("")).toBeUndefined();
    expect(bearerToken("Bearer ")).toBeUndefined();
    expect(bearerToken("Basic dXNlcjpwYXNz")).toBeUndefined();
    expect(bearerToken("Bearer a b")).toBeUndefined();
  });

  it("le magasin rend le jeton reçu, puis celui qui vient d'être ouvert, et l'oublie à la déconnexion", () => {
    const store = createBearerStore("Bearer ancien");
    expect(store.get()).toBe("ancien");
    store.set("nouveau");
    expect(store.get()).toBe("nouveau");
    expect(store.issued()).toBe("nouveau");
    store.clear();
    expect(store.get()).toBeUndefined();
    expect(store.issued()).toBeUndefined();
  });
});
