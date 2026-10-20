import { asc, and, eq } from "drizzle-orm";
import type { Database } from "@/db/types";
import { staff } from "@/db/schema";
import { DomainError } from "@/lib/domain-error";

export interface TeamMember {
  id: string;
  firstName: string;
  role: "barber" | "apprentice";
}

/** L'équipe active, dans l'ordre d'affichage : les colonnes du planning et les noms proposés pour signer (R-74). */
export async function listActiveStaff(db: Database): Promise<TeamMember[]> {
  return db
    .select({ id: staff.id, firstName: staff.firstName, role: staff.role })
    .from(staff)
    .where(eq(staff.active, true))
    .orderBy(asc(staff.sortOrder), asc(staff.firstName));
}

/**
 * R-74 : l'auteur d'une action du salon est un membre actif de l'équipe, choisi sur la tablette.
 * Refus : `author_required` (aucun nom) ou `unknown_author` (inconnu ou désactivé).
 */
export async function assertActiveAuthor(
  db: Database,
  authorId: string | undefined | null,
): Promise<string> {
  if (!authorId) throw new DomainError("author_required");
  const [member] = await db
    .select({ id: staff.id })
    .from(staff)
    .where(and(eq(staff.id, authorId), eq(staff.active, true)));
  if (!member) throw new DomainError("unknown_author");
  return member.id;
}
