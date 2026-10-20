import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-redirect";

describe("redirection après connexion", () => {
  it("accepte un chemin du site, avec sa recherche", () => {
    expect(safeNext("/reservation")).toBe("/reservation");
    expect(safeNext("/compte/rendez-vous?x=1")).toBe("/compte/rendez-vous?x=1");
  });

  it("refuse tout ce qui mène hors du site", () => {
    for (const value of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "evil.example",
      "/ok\nLocation: https://evil.example",
    ]) {
      expect(safeNext(value), value).toBe("/");
    }
  });

  it("utilise la valeur de repli quand il n'y a rien", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined, "/reservation")).toBe("/reservation");
    expect(safeNext("", "/reservation")).toBe("/reservation");
  });
});
