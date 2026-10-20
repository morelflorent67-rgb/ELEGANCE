import { describe, expect, it } from "vitest";
import { connectionOptions } from "./connection-url";

describe("connectionOptions", () => {
  it("retire les paramètres ajoutés par l'intégration Vercel et exige le SSL en ligne", () => {
    const { url, ssl } = connectionOptions(
      "postgres://postgres.abc:secret@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x",
    );
    expect(url).toBe(
      "postgres://postgres.abc:secret@aws-0-eu-west-1.pooler.supabase.com:6543/postgres",
    );
    expect(ssl).toBe("require");
  });

  it("n'impose pas le SSL à la base locale", () => {
    expect(connectionOptions("postgresql://postgres@127.0.0.1:54322/postgres").ssl).toBe(false);
    expect(connectionOptions("postgresql://postgres@localhost:5432/postgres").ssl).toBe(false);
  });
});
