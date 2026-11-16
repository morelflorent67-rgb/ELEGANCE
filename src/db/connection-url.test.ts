import { describe, expect, it } from "vitest";
import { connectionOptions } from "./connection-url";

describe("connectionOptions", () => {
  it("retire les paramètres d'URL et exige le SSL pour une base distante", () => {
    const { url, ssl } = connectionOptions("postgres://u:secret@db.example.com:5432/elegance?sslmode=require&x=1");
    expect(url).toBe("postgres://u:secret@db.example.com:5432/elegance");
    expect(ssl).toBe("require");
  });

  it("garde le port tel quel", () => {
    expect(connectionOptions("postgresql://u:p@db.example.com:6543/elegance").url).toBe(
      "postgresql://u:p@db.example.com:6543/elegance",
    );
  });

  it("accepte « sslmode=disable » écrit dans l'adresse (base d'un conteneur sur le réseau privé du serveur)", () => {
    const { url, ssl } = connectionOptions("postgresql://elegance:p@elegance-db:5432/elegance?sslmode=disable");
    expect(ssl).toBe(false);
    expect(url).toBe("postgresql://elegance:p@elegance-db:5432/elegance");
  });

  it("garde le SSL pour toute autre valeur de sslmode sur une base distante", () => {
    expect(connectionOptions("postgresql://u:p@db.example.com/x?sslmode=prefer").ssl).toBe("require");
    expect(connectionOptions("postgresql://u:p@db.example.com/x").ssl).toBe("require");
  });

  it("n'impose pas le SSL à la base locale (le serveur du site la contacte en local)", () => {
    expect(connectionOptions("postgresql://postgres@127.0.0.1:54322/postgres").ssl).toBe(false);
    expect(connectionOptions("postgresql://elegance@localhost:5432/elegance").ssl).toBe(false);
  });
});
