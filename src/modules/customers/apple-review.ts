import { eq, sql } from "drizzle-orm";
import type { Database } from "@/db/types";
import { customer } from "@/db/schema";
import { DomainError } from "@/lib/domain-error";

// Compte de démonstration de l'examinateur d'Apple (R-103, D-125). Une fiche client ordinaire, simplement marquée : ses
// RDV sont réels (le salon les voit, étiquetés « Test Apple »), mais le compte n'envoie aucun email (donc aucune
// notification), reste hors du Bilan et de la fidélité, et peut annuler ou déplacer à tout moment.

/** Marque une fiche comme compte de démonstration Apple. */
export async function markAppleReview(db: Database, customerId: string): Promise<void> {
  const updated = await db
    .update(customer)
    .set({ appleReview: true })
    .where(eq(customer.id, customerId))
    .returning({ id: customer.id });
  if (updated.length === 0) throw new DomainError("unknown_customer");
}

export async function isAppleReview(db: Database, customerId: string): Promise<boolean> {
  const [row] = await db
    .select({ appleReview: customer.appleReview })
    .from(customer)
    .where(eq(customer.id, customerId));
  return row?.appleReview ?? false;
}

/** Cet email est-il celui d'un compte de démonstration ? (même règle d'unicité que R-70 : sans tenir compte de la casse.) */
export async function isAppleReviewEmail(db: Database, email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: customer.id })
    .from(customer)
    .where(sql`lower(${customer.email}) = lower(${email}) and ${customer.appleReview}`)
    .limit(1);
  return row !== undefined;
}

/** Le délai de modification qui s'applique à ce client : 0 pour le compte de démonstration (jusqu'au début du RDV). */
export async function changeCutoffFor(db: Database, customerId: string, cutoffHours: number): Promise<number> {
  return (await isAppleReview(db, customerId)) ? 0 : cutoffHours;
}
