import { and, desc, eq, inArray, lt } from "drizzle-orm";
import type { Database } from "@/db/types";
import { appointment, appointmentItem, payment, salonSettings } from "@/db/schema";
import { DomainError } from "@/lib/domain-error";
import { recordAudit } from "@/modules/audit/record";
import { MAX_ADJUSTED_AMOUNT_CENTS } from "@/modules/booking/adjust-amount";
import { assertActiveAuthor } from "@/modules/staff/team";
import { isProviderError, type PaymentProvider } from "./provider";

// Encaissement au terminal SumUp Solo depuis la fiche RDV (D-105, R-89 à R-93). Le terminal est unique : une seule
// ligne « en cours » pour tout le salon (index unique). Le résultat n'est jamais cru sur parole : on le relit
// auprès du fournisseur, que l'appel vienne de son rappel (webhook) ou de la tablette qui interroge.

/** Un encaissement sans réponse du terminal au bout de ce délai est clos comme échoué (R-92). Limite technique. */
export const PAYMENT_TIMEOUT_MINUTES = 5;

export type PaymentState = "pending" | "successful" | "failed" | "cancelled";

export interface PaymentView {
  id: string;
  appointmentId: string;
  status: PaymentState;
  amountCents: number;
  failureReason: string | null;
}

const view = (row: typeof payment.$inferSelect): PaymentView => ({
  id: row.id,
  appointmentId: row.appointmentId,
  status: row.status,
  amountCents: row.amountCents,
  failureReason: row.failureReason,
});

const isUniqueViolation = (error: unknown): boolean => {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
};

async function loadTerminal(db: Database) {
  const [row] = await db
    .select({ merchantCode: salonSettings.paymentMerchantCode, readerId: salonSettings.paymentReaderId })
    .from(salonSettings);
  if (!row?.merchantCode || !row.readerId) throw new DomainError("terminal_not_configured");
  return { merchantCode: row.merchantCode, readerId: row.readerId };
}

export async function getTerminalStatus(
  db: Database,
): Promise<{ configured: boolean; merchantCode: string | null; readerId: string | null }> {
  const [row] = await db
    .select({ merchantCode: salonSettings.paymentMerchantCode, readerId: salonSettings.paymentReaderId })
    .from(salonSettings);
  return {
    configured: !!row?.merchantCode && !!row.readerId,
    merchantCode: row?.merchantCode ?? null,
    readerId: row?.readerId ?? null,
  };
}

export interface StartPaymentInput {
  appointmentId: string;
  /** Membre de l'équipe qui encaisse (R-74). */
  authorStaffId: string;
  /** Adresse publique où le fournisseur rappelle le site avec le résultat. */
  returnUrl: string;
}

/**
 * R-89 : envoie au terminal le montant de la fiche (le montant corrigé s'il y en a un, sinon le prix de la carte).
 * Refus : `author_required` / `unknown_author`, `appointment_not_found`, `not_modifiable` (lapin, annulé), `not_started`,
 * `already_paid`, `invalid_amount` (0 € ou plus de 1 000 €), `terminal_not_configured`, `terminal_busy` (un autre
 * encaissement est en cours), `terminal_unavailable` (le fournisseur ne répond pas ou refuse).
 */
export async function startPayment(
  db: Database,
  provider: PaymentProvider,
  input: StartPaymentInput,
  now: Date = new Date(),
): Promise<PaymentView> {
  await expireStalePayments(db, provider, now);
  const terminal = await loadTerminal(db);

  let created: typeof payment.$inferSelect;
  try {
    created = await db.transaction(async (tx) => {
      const authorId = await assertActiveAuthor(tx, input.authorStaffId);
      const [row] = await tx
        .select()
        .from(appointment)
        .where(eq(appointment.id, input.appointmentId))
        .for("update");
      if (!row) throw new DomainError("appointment_not_found");
      if (row.status !== "confirmed" && row.status !== "honored") throw new DomainError("not_modifiable");
      if (row.status === "confirmed" && row.startsAt.getTime() > now.getTime()) {
        throw new DomainError("not_started");
      }
      const [paid] = await tx
        .select({ id: payment.id })
        .from(payment)
        .where(and(eq(payment.appointmentId, row.id), eq(payment.status, "successful")));
      if (paid) throw new DomainError("already_paid");

      const items = await tx
        .select({ priceCents: appointmentItem.priceCents })
        .from(appointmentItem)
        .where(eq(appointmentItem.appointmentId, row.id));
      const amountCents = row.adjustedAmountCents ?? items.reduce((sum, i) => sum + i.priceCents, 0);
      if (amountCents <= 0 || amountCents > MAX_ADJUSTED_AMOUNT_CENTS) throw new DomainError("invalid_amount");

      const [inserted] = await tx
        .insert(payment)
        .values({ appointmentId: row.id, amountCents, startedByStaffId: authorId, createdAt: now })
        .returning();
      await recordAudit(
        tx,
        {
          actorType: "staff",
          actorId: authorId,
          action: "payment.started",
          entity: "payment",
          entityId: inserted.id,
          after: { appointmentId: row.id, amountCents },
        },
        now,
      );
      return inserted;
    });
  } catch (error) {
    // L'index « un seul encaissement en cours » a refusé la ligne : le terminal est pris.
    if (isUniqueViolation(error)) throw new DomainError("terminal_busy");
    throw error;
  }

  try {
    const { reference } = await provider.startCheckout({
      ...terminal,
      amountCents: created.amountCents,
      returnUrl: input.returnUrl,
      paymentId: created.id,
    });
    const [updated] = await db
      .update(payment)
      .set({ providerReference: reference })
      .where(eq(payment.id, created.id))
      .returning();
    return view(updated);
  } catch (error) {
    if (!isProviderError(error)) throw error;
    await db
      .update(payment)
      .set({ status: "failed", failureReason: "terminal_unavailable", completedAt: now })
      .where(and(eq(payment.id, created.id), eq(payment.status, "pending")));
    throw new DomainError("terminal_unavailable");
  }
}

/**
 * R-90, R-91 : relit l'encaissement auprès du fournisseur et, s'il est terminé, l'enregistre. Idempotent : un
 * encaissement déjà clos n'est pas touché, un rappel en double est sans effet. Au succès, le montant réellement
 * débité devient le montant encaissé du RDV (comme une correction, R-53) et l'entrée est au journal. Un échec ne
 * change rien au RDV, qui reste à encaisser.
 */
export async function settlePayment(
  db: Database,
  provider: PaymentProvider,
  paymentId: string,
  now: Date = new Date(),
): Promise<PaymentView> {
  const [current] = await db.select().from(payment).where(eq(payment.id, paymentId));
  if (!current) throw new DomainError("payment_not_found");
  if (current.status !== "pending" || !current.providerReference) return view(current);

  const terminal = await loadTerminal(db);
  let state;
  try {
    state = await provider.getCheckout({
      merchantCode: terminal.merchantCode,
      reference: current.providerReference,
    });
  } catch (error) {
    // Fournisseur injoignable : on garde « en cours », la prochaine lecture réessaiera.
    if (isProviderError(error)) return view(current);
    throw error;
  }
  if (state.status === "pending") return view(current);

  return db.transaction(async (tx) => {
    const [locked] = await tx.select().from(payment).where(eq(payment.id, paymentId)).for("update");
    if (!locked || locked.status !== "pending") return view(locked ?? current);

    if (state.status === "failed") {
      const [done] = await tx
        .update(payment)
        .set({ status: "failed", failureReason: state.failureReason ?? "failed", completedAt: now })
        .where(eq(payment.id, paymentId))
        .returning();
      await recordAudit(
        tx,
        {
          actorType: "system",
          actorId: null,
          action: "payment.failed",
          entity: "payment",
          entityId: paymentId,
          after: { appointmentId: locked.appointmentId, reason: state.failureReason },
        },
        now,
      );
      return view(done);
    }

    const charged = state.amountCents ?? locked.amountCents;
    const [done] = await tx
      .update(payment)
      .set({ status: "successful", amountCents: charged, completedAt: now })
      .where(eq(payment.id, paymentId))
      .returning();

    const [row] = await tx
      .select()
      .from(appointment)
      .where(eq(appointment.id, locked.appointmentId))
      .for("update");
    const items = await tx
      .select({ priceCents: appointmentItem.priceCents })
      .from(appointmentItem)
      .where(eq(appointmentItem.appointmentId, locked.appointmentId));
    const price = items.reduce((sum, i) => sum + i.priceCents, 0);
    const previous = row?.adjustedAmountCents ?? null;
    const next = charged === price ? null : charged;
    if (row && next !== previous) {
      await tx.update(appointment).set({ adjustedAmountCents: next }).where(eq(appointment.id, row.id));
    }
    await recordAudit(
      tx,
      {
        actorType: "staff",
        actorId: locked.startedByStaffId,
        action: "appointment.paid",
        entity: "appointment",
        entityId: locked.appointmentId,
        before: { amountCents: previous ?? price, adjustedAmountCents: previous },
        after: { amountCents: charged, adjustedAmountCents: next, paymentId },
      },
      now,
    );
    return view(done);
  });
}

/** R-92 : clôt comme échoués les encaissements restés sans réponse trop longtemps (terminal éteint, client parti). */
export async function expireStalePayments(
  db: Database,
  provider: PaymentProvider,
  now: Date = new Date(),
): Promise<number> {
  const limit = new Date(now.getTime() - PAYMENT_TIMEOUT_MINUTES * 60_000);
  const stale = await db
    .select()
    .from(payment)
    .where(and(eq(payment.status, "pending"), lt(payment.createdAt, limit)));
  let closed = 0;
  for (const row of stale) {
    const settled = await settlePayment(db, provider, row.id, now); // un résultat arrivé entre-temps l'emporte
    if (settled.status !== "pending") continue;
    try {
      await provider.terminate(await loadTerminal(db));
    } catch {
      // Sans accusé de réception possible : on clôt quand même, le terminal expire de lui-même.
    }
    const [done] = await db
      .update(payment)
      .set({ status: "failed", failureReason: "timeout", completedAt: now })
      .where(and(eq(payment.id, row.id), eq(payment.status, "pending")))
      .returning({ id: payment.id });
    if (done) closed++;
  }
  return closed;
}

/** Lecture demandée par la tablette pendant qu'un encaissement est en cours : relit le résultat, clôt un oubli. */
export async function refreshPayment(
  db: Database,
  provider: PaymentProvider,
  paymentId: string,
  now: Date = new Date(),
): Promise<PaymentView> {
  const settled = await settlePayment(db, provider, paymentId, now);
  if (settled.status !== "pending") return settled;
  await expireStalePayments(db, provider, now);
  return settlePayment(db, provider, paymentId, now);
}

/**
 * R-93 : « Annuler sur le terminal ». Si le client a déjà payé, le paiement est enregistré et l'annulation est sans
 * effet ; sinon le terminal est interrompu et l'encaissement est clos « annulé » (le RDV reste à encaisser).
 */
export async function cancelPayment(
  db: Database,
  provider: PaymentProvider,
  input: { paymentId: string; authorStaffId: string },
  now: Date = new Date(),
): Promise<PaymentView> {
  const authorId = await assertActiveAuthor(db, input.authorStaffId);
  const settled = await settlePayment(db, provider, input.paymentId, now);
  if (settled.status !== "pending") return settled;
  try {
    await provider.terminate(await loadTerminal(db));
  } catch {
    // Le terminal n'a peut-être pas reçu l'ordre ; il abandonnera seul au bout de son délai.
  }
  return db.transaction(async (tx) => {
    const [done] = await tx
      .update(payment)
      .set({ status: "cancelled", completedAt: now })
      .where(and(eq(payment.id, input.paymentId), eq(payment.status, "pending")))
      .returning();
    if (!done) {
      const [row] = await tx.select().from(payment).where(eq(payment.id, input.paymentId));
      return view(row);
    }
    await recordAudit(
      tx,
      {
        actorType: "staff",
        actorId: authorId,
        action: "payment.cancelled",
        entity: "payment",
        entityId: done.id,
        after: { appointmentId: done.appointmentId },
      },
      now,
    );
    return view(done);
  });
}

/** Rappel du fournisseur : retrouve l'encaissement par son identifiant de transaction et le règle. Inconnu : rien. */
export async function settleByReference(
  db: Database,
  provider: PaymentProvider,
  reference: string,
  now: Date = new Date(),
): Promise<PaymentView | null> {
  const [row] = await db.select().from(payment).where(eq(payment.providerReference, reference));
  if (!row) return null;
  return settlePayment(db, provider, row.id, now);
}

/** Dernier encaissement de chaque RDV (le réussi d'abord) : pastille de la fiche et du planning. */
export async function latestPaymentsFor(
  db: Database,
  appointmentIds: string[],
): Promise<Map<string, PaymentView>> {
  const result = new Map<string, PaymentView>();
  if (appointmentIds.length === 0) return result;
  const rows = await db
    .select()
    .from(payment)
    .where(inArray(payment.appointmentId, appointmentIds))
    .orderBy(desc(payment.createdAt));
  for (const row of rows) {
    const known = result.get(row.appointmentId);
    if (!known || (row.status === "successful" && known.status !== "successful")) {
      result.set(row.appointmentId, view(row));
    }
  }
  return result;
}

// ------------------------------------------------------------------------------------------------ appairage (gérant)

const MERCHANT_CODE = /^[A-Za-z0-9]{4,20}$/;
const PAIRING_CODE = /^[A-Za-z0-9]{4,12}$/;

/** Appaire le terminal avec le code affiché sur son écran (Connexions, API) et mémorise son identifiant (D-105). */
export async function pairTerminal(
  db: Database,
  provider: PaymentProvider,
  input: { merchantCode: string; pairingCode: string; actorId: string },
  now: Date = new Date(),
): Promise<void> {
  const merchantCode = input.merchantCode.trim();
  const pairingCode = input.pairingCode.trim();
  if (!MERCHANT_CODE.test(merchantCode) || !PAIRING_CODE.test(pairingCode)) {
    throw new DomainError("invalid_pairing");
  }
  let readerId: string;
  try {
    ({ readerId } = await provider.pairReader({ merchantCode, pairingCode, name: "Elegance Strasbourg" }));
  } catch (error) {
    if (isProviderError(error)) throw new DomainError("invalid_pairing");
    throw error;
  }
  await db.transaction(async (tx) => {
    await tx
      .update(salonSettings)
      .set({ paymentMerchantCode: merchantCode, paymentReaderId: readerId });
    await recordAudit(
      tx,
      {
        actorType: "manager",
        actorId: input.actorId,
        action: "terminal.paired",
        entity: "salon_settings",
        entityId: "terminal",
        after: { merchantCode },
      },
      now,
    );
  });
}

/** Oublie le terminal appairé. Refusé tant qu'un encaissement est en cours. */
export async function unpairTerminal(
  db: Database,
  input: { actorId: string },
  now: Date = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const [pending] = await tx
      .select({ id: payment.id })
      .from(payment)
      .where(eq(payment.status, "pending"));
    if (pending) throw new DomainError("terminal_busy");
    await tx.update(salonSettings).set({ paymentMerchantCode: null, paymentReaderId: null });
    await recordAudit(
      tx,
      {
        actorType: "manager",
        actorId: input.actorId,
        action: "terminal.unpaired",
        entity: "salon_settings",
        entityId: "terminal",
      },
      now,
    );
  });
}
