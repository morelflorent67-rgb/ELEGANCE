import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Garde-fous entre le site et l'app iPhone (dossier `mobile/`, qui n'a pas accès au code du site).

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("copies de fichiers du site dans l'app", () => {
  it.each([
    ["src/modules/vitrine/hours.ts", "mobile/src/lib/shared/hours.ts"],
    ["src/modules/vitrine/status.ts", "mobile/src/lib/shared/status.ts"],
    ["src/lib/eclipse-math.ts", "mobile/src/lib/shared/eclipse-math.ts"],
    ["src/components/client/access-map-data.ts", "mobile/src/lib/shared/access-map-data.ts"],
  ])("%s est copié à l'identique dans %s", (source, copyPath) => {
    // Les deux premières lignes de la copie sont son en-tête.
    expect(read(copyPath).split("\n").slice(2).join("\n")).toBe(read(source));
  });

  it("chaque tracé du plan d'accès a sa longueur dans l'app (animation « le trait se dessine »)", () => {
    const data = read("src/components/client/access-map-data.ts");
    const paths = [...data.matchAll(/d: "([^"]+)"/g)].map((m) => m[1]);
    paths.push(data.match(/MAIN_ROAD =\s*"([^"]+)"/)![1]);
    expect(paths.length).toBeGreaterThan(30);
    const lengths = read("mobile/src/lib/access-map-lengths.ts");
    const missing = paths.filter((d) => !lengths.includes(JSON.stringify(d)));
    expect(missing).toEqual([]);
  });

  it("les programmes graphiques de l'éclipse (VS et FS) sont identiques à ceux du site", () => {
    const grab = (text: string, name: "VS" | "FS") => text.match(new RegExp(`${name} = (\`[^\`]*\`)`))?.[1];
    const site = read("src/lib/eclipse.ts");
    const app = read("mobile/src/lib/shared/eclipse-shader.ts");
    for (const name of ["VS", "FS"] as const) {
      expect(grab(site, name)).toBeTruthy();
      expect(grab(app, name)).toBe(grab(site, name));
    }
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

describe("champ Téléphone facultatif (R-70, D-126)", () => {
  const field = read("mobile/src/lib/phone-field.ts");
  const text = (key: string) => field.match(new RegExp(`${key}: "([^"]+)"`))?.[1];

  it.each([
    "src/components/account-forms.tsx",
    "src/app/(client)/compte/informations/informations-forms.tsx",
  ])("l'app reprend « facultatif » et l'aide du site (%s)", (path) => {
    const source = read(path);
    expect(source).toContain(`aside="${text("aside")}"`);
    expect(source).toContain(`hint="${text("hint")}"`);
  });

  it.each(["mobile/src/auth-form.tsx", "mobile/app/(tabs)/compte.tsx"])("%s utilise ce champ", (path) => {
    expect(read(path)).toContain("<Field {...PHONE_FIELD}");
  });
});
