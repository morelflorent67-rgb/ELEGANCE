// Lecture du fichier clients du salon (export Treatwell, CSV séparé par des points-virgules) et choix des fiches à
// importer (D-70, D-77). Fonctions pures, sans aucun import : la commande `pnpm customers:import` les charge
// directement avec Node, et les tests les vérifient sur un faux fichier. Le vrai fichier n'entre jamais dans le dépôt.

export interface ImportCandidate {
  firstName: string;
  lastName: string | null;
  /** Forme internationale (+33…), ou null. */
  phone: string | null;
  /** En minuscules, ou null. */
  email: string | null;
  /** Nombre de visites chez le salon avant le site, ou null. */
  visits: number | null;
  /** « AAAA-MM-JJ », ou null si la date du fichier est à venir (un RDV déjà pris, pas une visite). */
  lastVisitOn: string | null;
}

export interface ImportReport {
  /** Lignes de clients lues (en-tête exclu). */
  read: number;
  /** Fiches retenues, doublons du fichier réunis. */
  kept: number;
  /** Dernière visite avant la date limite (3 ans, D-77). */
  tooOld: number;
  /** Ni téléphone ni email utilisable. */
  noContact: number;
  /** Aucune visite connue, ou ligne sans prénom. */
  incomplete: number;
  /** Lignes réunies avec une autre : même email, ou même numéro et même prénom. */
  duplicates: number;
  /** Numéros présents mais illisibles (gardés si l'email suffit). */
  invalidPhones: number;
}

export interface ImportPlan {
  candidates: ImportCandidate[];
  report: ImportReport;
}

/** Colonnes de l'export Treatwell utilisées ; les autres (adresse, genre, dépense moyenne…) sont ignorées (D-77). */
export const TREATWELL_COLUMNS = {
  firstName: "firstname",
  lastName: "lastname",
  phone: "phonenumber",
  email: "email",
  visits: "countbookings",
  lastVisit: "lastappointmentat",
} as const;

/** CSV avec guillemets (un champ peut contenir le séparateur ou un retour à la ligne). */
export function parseCsv(text: string, separator = ";"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === separator) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** « DUPONT » → « Dupont », « jean-marc » reste tel quel : seuls les noms tout en majuscules sont adoucis. */
export function tidyName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name !== name.toUpperCase() || name === name.toLowerCase()) return name;
  return name
    .toLowerCase()
    .replace(
      /(^|[\s'’-])(\p{L})/gu,
      (_, before: string, letter: string) => before + letter.toUpperCase(),
    );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Clé de comparaison d'un prénom : sans accents ni casse. */
const nameKey = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Choisit les fiches à importer (D-77) : clients venus depuis `since` (« AAAA-MM-JJ », 3 ans avant l'import), avec un
 * téléphone ou un email utilisable. Une date après `today` est un RDV déjà pris chez l'ancien outil : le client est
 * gardé, sans date de dernière visite. Les doublons du fichier sont réunis : même email, ou même numéro et même prénom
 * (une famille qui partage un numéro garde des fiches séparées). Rien d'autre n'est gardé du fichier.
 */
export function planImport(
  rows: string[][],
  options: { since: string; today: string; normalizePhone: (input: string) => string | null },
): ImportPlan {
  const [header, ...lines] = rows;
  const report: ImportReport = {
    read: lines.length,
    kept: 0,
    tooOld: 0,
    noContact: 0,
    incomplete: 0,
    duplicates: 0,
    invalidPhones: 0,
  };
  if (!header) return { candidates: [], report };

  const columns = header.map((h) => h.trim().toLowerCase());
  const index = Object.fromEntries(
    Object.entries(TREATWELL_COLUMNS).map(([key, name]) => [key, columns.indexOf(name)]),
  ) as Record<keyof typeof TREATWELL_COLUMNS, number>;
  const missing = Object.entries(index)
    .filter(([, i]) => i < 0)
    .map(([key]) => TREATWELL_COLUMNS[key as keyof typeof TREATWELL_COLUMNS]);
  if (missing.length > 0) {
    throw new Error(`Colonnes absentes du fichier : ${missing.join(", ")}.`);
  }

  const candidates: ImportCandidate[] = [];
  const byEmail = new Map<string, ImportCandidate>();
  const byPhoneAndName = new Map<string, ImportCandidate>();

  for (const line of lines) {
    const cell = (key: keyof typeof TREATWELL_COLUMNS) => (line[index[key]] ?? "").trim();
    const firstName = tidyName(cell("firstName"));
    const date = /^\d{4}-\d{2}-\d{2}/.exec(cell("lastVisit"))?.[0] ?? null;
    if (!firstName || !date) {
      report.incomplete++;
      continue;
    }
    if (date < options.since) {
      report.tooOld++;
      continue;
    }
    const rawPhone = cell("phone");
    const phone = rawPhone ? options.normalizePhone(rawPhone) : null;
    if (rawPhone && !phone) report.invalidPhones++;
    const rawEmail = cell("email").toLowerCase();
    const email = EMAIL.test(rawEmail) ? rawEmail : null;
    if (!phone && !email) {
      report.noContact++;
      continue;
    }
    const visitsText = cell("visits");
    const visits = /^\d+$/.test(visitsText) ? Number(visitsText) : null;
    const candidate: ImportCandidate = {
      firstName,
      lastName: tidyName(cell("lastName")) || null,
      phone,
      email,
      visits,
      lastVisitOn: date > options.today ? null : date,
    };

    const phoneKey = phone ? `${phone}|${nameKey(firstName)}` : null;
    const same =
      (email ? byEmail.get(email) : undefined) ??
      (phoneKey ? byPhoneAndName.get(phoneKey) : undefined);
    if (same) {
      report.duplicates++;
      same.lastName ??= candidate.lastName;
      same.phone ??= candidate.phone;
      same.email ??= candidate.email;
      same.visits =
        same.visits === null && candidate.visits === null
          ? null
          : (same.visits ?? 0) + (candidate.visits ?? 0);
      if (
        candidate.lastVisitOn &&
        (!same.lastVisitOn || candidate.lastVisitOn > same.lastVisitOn)
      ) {
        same.lastVisitOn = candidate.lastVisitOn;
      }
      if (same.email) byEmail.set(same.email, same);
      if (same.phone) byPhoneAndName.set(`${same.phone}|${nameKey(same.firstName)}`, same);
      continue;
    }
    candidates.push(candidate);
    if (email) byEmail.set(email, candidate);
    if (phoneKey) byPhoneAndName.set(phoneKey, candidate);
  }

  report.kept = candidates.length;
  return { candidates, report };
}

/** Date limite de D-77 : les clients venus dans les 3 ans avant l'import (« AAAA-MM-JJ »). */
export function importSince(today: string, years = 3): string {
  const [y, m, d] = today.split("-").map(Number);
  const since = new Date(Date.UTC(y - years, m - 1, d));
  return since.toISOString().slice(0, 10);
}
