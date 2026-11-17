import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Garde-fous entre le site et l'app iPhone (dossier `mobile/`, qui n'a pas accès au code du site).

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("copies de fichiers du site dans l'app", () => {
  it.each(["hours", "status"])("mobile/src/lib/shared/%s.ts est identique à l'original du site", (name) => {
    const original = read(`src/modules/vitrine/${name}.ts`);
    const copy = read(`mobile/src/lib/shared/${name}.ts`);
    // Les deux premières lignes de la copie sont son en-tête.
    expect(copy.split("\n").slice(2).join("\n")).toBe(original);
  });
});

/** Codes de refus qui ne peuvent atteindre qu'une personne du salon (tablette, gérant) : l'app ne les voit jamais. */
const SALON_ONLY = new Set([
  "author_required",
  "unknown_author",
  "appointment_over",
  "not_started",
  "not_no_show",
  "customer_not_blockable",
  "customer_has_no_account",
  "customer_has_account",
  "customers_both_have_accounts",
  "invalid_for_name",
  "invalid_series",
  "already_in_series",
  "not_in_series",
  "series_empty",
  "invalid_amount",
  "terminal_not_configured",
  "terminal_busy",
  "terminal_unavailable",
  "already_paid",
  "invalid_pairing",
  "payment_not_found",
  "invalid_service",
  "unknown_staff",
  "staff_role_mismatch",
  "no_staff_for_service",
  "invalid_staff",
  "staff_name_taken",
  "staff_needed_for_service",
  "loyalty_disabled",
  "reward_not_available",
  "reward_already_used",
  "no_reward_service",
  "no_reward_to_cancel",
  "invalid_adjustment",
  "loyalty_negative",
  "invalid_hours",
  "invalid_closure",
  "invalid_absence",
  "absence_in_past",
  "unknown_absence",
  "closure_in_past",
  "unknown_closure",
]);

describe("refus du serveur traduits dans l'app", () => {
  const source = read("src/lib/domain-error.ts");
  const codes = [...source.matchAll(/\|\s*"([a-z_]+)"/g)].map((m) => m[1]);

  it("lit bien les codes du site", () => {
    expect(codes).toContain("slot_unavailable");
    expect(codes.length).toBeGreaterThan(40);
  });

  it("chaque code que peut recevoir un client a sa phrase dans l'app ; un nouveau code oblige à choisir", () => {
    const app = read("mobile/src/lib/errors.ts");
    const missing = codes.filter((code) => !SALON_ONLY.has(code) && !new RegExp(`\\b${code}:`).test(app));
    expect(missing).toEqual([]);
  });

  it("l'app ne traduit que des codes qui existent (pas de faute de frappe)", () => {
    const app = read("mobile/src/lib/errors.ts");
    const translated = [...app.matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1]);
    const known = new Set([...codes, "invalid", "not_signed_in", "invalid_credentials", "failed", "network", "rate_limited"]);
    expect(translated.filter((code) => !known.has(code))).toEqual([]);
  });
});
