import type postgres from "postgres";
import type { ImportCandidate } from "./import-file";

// Écriture en base des fiches importées (D-70, D-77, D-79), en une transaction. SQL direct et aucun import à
// l'exécution : la commande `pnpm customers:import` charge ce fichier avec Node, sans Next.js.
//
// Une personne déjà connue n'est jamais doublée : même email, ou même numéro et même prénom. Sa fiche garde son nom,
// son téléphone et son email ; seul l'historique repris (nombre de visites, dernière visite) est ajouté, et une fiche
// déjà importée le voit rafraîchi. L'import se rejoue donc sans risque avec un export plus récent.

export interface ImportResult {
  created: number;
  /** Fiches importées auparavant, rafraîchies. */
  refreshed: number;
  /** Fiches existantes (comptes, fiches du salon) qui reçoivent l'historique repris. */
  completed: number;
}

interface Existing {
  id: string;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  origin: "account" | "salon" | "import";
}

const nameKey = (name: string | null) =>
  (name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export async function applyImport(
  sql: postgres.Sql,
  candidates: ImportCandidate[],
  now: Date = new Date(),
): Promise<ImportResult> {
  return sql.begin(async (tx) => {
    const existing = await tx<Existing[]>`
      select id, lower(email) as email, phone, first_name, origin
      from customer
      where anonymized_at is null`;
    const byEmail = new Map<string, Existing>();
    const byPhoneAndName = new Map<string, Existing>();
    for (const row of existing) {
      if (row.email) byEmail.set(row.email, row);
      if (row.phone) byPhoneAndName.set(`${row.phone}|${nameKey(row.first_name)}`, row);
    }

    const result: ImportResult = { created: 0, refreshed: 0, completed: 0 };
    const toCreate: ImportCandidate[] = [];
    for (const c of candidates) {
      const known =
        (c.email ? byEmail.get(c.email) : undefined) ??
        (c.phone ? byPhoneAndName.get(`${c.phone}|${nameKey(c.firstName)}`) : undefined);
      if (!known) {
        toCreate.push(c);
        continue;
      }
      if (known.origin === "import") {
        // Rejeu : l'historique suit l'export le plus récent ; un champ vide se complète, rien ne s'efface.
        await tx`
          update customer set
            legacy_visits = ${c.visits},
            legacy_last_visit_on = greatest(legacy_last_visit_on, ${c.lastVisitOn}::date),
            last_name = coalesce(last_name, ${c.lastName}),
            phone = coalesce(phone, ${c.phone})
          where id = ${known.id}`;
        result.refreshed++;
      } else {
        // Compte ou fiche du salon : la personne a ses propres informations ; on n'ajoute que l'historique, une fois.
        const updated = await tx`
          update customer set legacy_visits = ${c.visits}, legacy_last_visit_on = ${c.lastVisitOn}::date
          where id = ${known.id} and legacy_last_visit_on is null`;
        result.completed += updated.count;
      }
    }

    for (let i = 0; i < toCreate.length; i += 500) {
      const rows = toCreate.slice(i, i + 500).map((c) => ({
        first_name: c.firstName,
        last_name: c.lastName,
        phone: c.phone,
        email: c.email,
        origin: "import",
        legacy_visits: c.visits,
        legacy_last_visit_on: c.lastVisitOn,
        created_at: now,
      }));
      await tx`insert into customer ${tx(rows)}`;
    }
    result.created = toCreate.length;

    // Journal : les nombres seulement, aucune donnée personnelle (principe 6).
    await tx`
      insert into audit_log (actor_type, actor_id, action, entity, entity_id, after, created_at)
      values ('system', null, 'customers.imported', 'customer', 'import', ${tx.json({ ...result })}, ${now})`;
    return result;
  }) as Promise<ImportResult>;
}
