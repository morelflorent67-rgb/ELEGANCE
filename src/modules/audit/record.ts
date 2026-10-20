import type { Database } from "@/db/types";
import { auditLog } from "@/db/schema";

export interface AuditEntry {
  actorType: (typeof auditLog.$inferInsert)["actorType"];
  /** Identifiant de l'auteur (fiche client, membre de l'équipe…), jamais un nom. */
  actorId: string | null;
  /** Ex. « appointment.cancelled ». */
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Inscrit une action au journal (principe 6). À appeler dans la transaction de l'action elle-même :
 * l'action et sa trace existent ensemble ou pas du tout. N'y mettre aucune donnée personnelle (nom, téléphone, email).
 */
export async function recordAudit(db: Database, entry: AuditEntry, now?: Date): Promise<void> {
  await db.insert(auditLog).values({
    actorType: entry.actorType,
    actorId: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ...(now ? { createdAt: now } : {}),
  });
}
