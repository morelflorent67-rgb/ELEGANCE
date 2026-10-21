import { describe, expect, it } from "vitest";
import { connectionOptions } from "./connection-url";

describe("connectionOptions", () => {
  it("retire les paramètres ajoutés par l'intégration Vercel et exige le SSL en ligne", () => {
    const { url, ssl } = connectionOptions(
      "postgres://postgres.abc:secret@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x",
    );
    expect(url).toBe(
      "postgres://postgres.abc:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres",
    );
    expect(ssl).toBe("require");
  });

  it("passe le pooler Supabase du mode transaction (6543) au mode session (5432)", () => {
    // En mode transaction, des requêtes envoyées à la suite sur une connexion restent bloquées (planning, lot 8).
    expect(
      connectionOptions("postgresql://postgres.abc:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres").url,
    ).toBe("postgresql://postgres.abc:pw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres");
  });

  it("garde une adresse déjà en mode session, ou qui n'est pas le pooler Supabase", () => {
    expect(
      connectionOptions("postgresql://postgres.abc:pw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres").url,
    ).toBe("postgresql://postgres.abc:pw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres");
    expect(connectionOptions("postgresql://postgres@127.0.0.1:6543/postgres").url).toBe(
      "postgresql://postgres@127.0.0.1:6543/postgres",
    );
    expect(connectionOptions("postgresql://u:p@db.example.com:6543/postgres").url).toBe(
      "postgresql://u:p@db.example.com:6543/postgres",
    );
  });

  it("n'impose pas le SSL à la base locale", () => {
    expect(connectionOptions("postgresql://postgres@127.0.0.1:54322/postgres").ssl).toBe(false);
    expect(connectionOptions("postgresql://postgres@localhost:5432/postgres").ssl).toBe(false);
  });
});
