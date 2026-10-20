import { eq } from "drizzle-orm";
import type { Database } from "@/db/types";
import { appointment, appointmentItem } from "@/db/schema";
import { DomainError } from "@/lib/domain-error";
import { recordAudit } from "@/modules/audit/record";
import { assertActiveAuthor } from "@/modules/staff/team";

// Correction du montant d'un RDV à la clôture (R-53, R-54). Le prix de la carte est figé à la réservation (R-16) ;
// ici, l'équipe note ce qui a réellement été encaissé (remise, offert, supplément). Le chiffre d'affaires indicatif
// lit ce montant (R-53), sans valeur comptable : la caisse fait foi (R-55). Chaque correction est signée d'un membre de
// l'équipe (R-74) et inscrite au journal dans la même transaction (R-54).

/** Plafond d'un montant saisi : 1 000 €. Au-delà, c'est une erreur de frappe. */
export const MAX_ADJUSTED_AMOUNT_CENTS = 100_000;

export interface AdjustAmountInput {
  appointmentId: string;
  /** Membre de l'équipe qui corrige (R-74). */
  authorStaffId: string;
  /** Montant encaissé en centimes, 0 compris ; null rétablit le prix de la carte. */
  amountCents: number | null;
}

/**
 * Refus : `invalid_amount`, `author_required` / `unknown_author`, `appointment_not_found`, `not_started` (RDV à venir),
 * `not_modifiable` (lapin ou annulé : il n'apporte rien au chiffre d'affaires). Rejouer le même montant ne journalise rien.
 */
export async function adjustAppointmentAmount(
  db: Database,
  input: AdjustAmountInput,
  now: Date = new Date(),
): Promise<{ amountCents: number; adjusted: boolean }> {
  const { amountCents } = input;
  if (
    amountCents !== null &&
    (!Number.isInteger(amountCents) || amountCents < 0 || amountCents > MAX_ADJUSTED_AMOUNT_CENTS)
  ) {
    throw new DomainError("invalid_amount");
  }

  return db.transaction(async (tx) => {
    const authorId = await assertActiveAuthor(tx, input.authorStaffId);
    const [row] = await tx
      .select()
      .from(appointment)
      .where(eq(appointment.id, input.appointmentId))
      .for("update");
    if (!row) throw new DomainError("appointment_not_found");
    if (row.status !== "confirmed" && row.status !== "honored") {
      throw new DomainError("not_modifiable");
    }
    if (row.status === "confirmed" && row.startsAt.getTime() > now.getTime()) {
      throw new DomainError("not_started");
    }

    const items = await tx
      .select({ priceCents: appointmentItem.priceCents })
      .from(appointmentItem)
      .where(eq(appointmentItem.appointmentId, row.id));
    const price = items.reduce((sum, i) => sum + i.priceCents, 0);

    // Un montant égal au prix de la carte n'est pas une correction.
    const next = amountCents === null || amountCents === price ? null : amountCents;
    const previous = row.adjustedAmountCents;
    const result = { amountCents: next ?? price, adjusted: next !== null };
    if (next === previous) return result;

    await tx
      .update(appointment)
      .set({ adjustedAmountCents: next })
      .where(eq(appointment.id, row.id));
    await recordAudit(
      tx,
      {
        actorType: "staff",
        actorId: authorId,
        action: "appointment.amount_adjusted",
        entity: "appointment",
        entityId: row.id,
        before: { amountCents: previous ?? price, adjustedAmountCents: previous },
        after: { amountCents: result.amountCents, adjustedAmountCents: next },
      },
      now,
    );
    return result;
  });
}
