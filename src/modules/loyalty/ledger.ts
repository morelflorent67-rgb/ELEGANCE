import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Database } from "@/db/types";
import {
  appointment,
  appointmentItem,
  customer,
  loyaltyEntry,
  payment,
  salonSettings,
  service,
} from "@/db/schema";
import { DomainError } from "@/lib/domain-error";
import { recordAudit } from "@/modules/audit/record";
import { isHonored } from "@/modules/appointments/status";
import { isAppleReview } from "@/modules/customers/apple-review";
import { assertActiveAuthor } from "@/modules/staff/team";
import { loyaltyProgress, pointsForItems, type LoyaltyProgress } from "./points";

// Carte de fidélité (D-114, R-96 à R-100). Le solde est la somme des écritures de `loyalty_entry`.
//
// Un RDV « honoré » est un état calculé (R-51) : rien n'est écrit quand il passe. Les gains se matérialisent donc à la
// demande (`settleLoyalty`), sous le verrou de la fiche client, avant toute lecture ou écriture du solde : pour chaque
// RDV du client, on écrit la différence entre les points qu'il doit rapporter (honoré : ses points ; lapin, annulé,
// à venir : 0) et ceux déjà écrits. Rejouer ne fait donc rien (idempotent), et un lapin retiré puis remis (R-97) se
// corrige tout seul, sans jamais supprimer d'écriture.

async function loadSettings(tx: Database) {
  const [settings] = await tx
    .select({
      enabled: salonSettings.loyaltyEnabled,
      threshold: salonSettings.loyaltyRewardThreshold,
      startedAt: salonSettings.loyaltyStartedAt,
    })
    .from(salonSettings);
  return settings ?? { enabled: false, threshold: 100, startedAt: new Date(0) };
}

async function lockCustomer(tx: Database, customerId: string): Promise<void> {
  const [row] = await tx
    .select({ id: customer.id })
    .from(customer)
    .where(eq(customer.id, customerId))
    .for("update");
  if (!row) throw new DomainError("unknown_customer");
}

export async function balanceOf(tx: Database, customerId: string): Promise<number> {
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${loyaltyEntry.points}), 0)::int` })
    .from(loyaltyEntry)
    .where(eq(loyaltyEntry.customerId, customerId));
  return row?.total ?? 0;
}

/** Matérialise les gains et les retraits dus (R-96, R-97). À appeler sous le verrou du client, dans une transaction. */
async function settleInTransaction(
  tx: Database,
  customerId: string,
  now: Date,
  /** RDV laissé de côté : celui sur lequel on regarde ou utilise la coupe offerte, qui ne rapporte rien (D-114). */
  exclude?: string,
): Promise<void> {
  const settings = await loadSettings(tx);
  if (!settings.enabled) return;
  // R-103 : le compte de démonstration Apple ne cumule aucun point.
  if (await isAppleReview(tx, customerId)) return;

  const appointments = (await tx
    .select({
      id: appointment.id,
      status: appointment.status,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
    })
    .from(appointment)
    .where(and(eq(appointment.customerId, customerId), gte(appointment.startsAt, settings.startedAt)))).filter(
    (a) => a.id !== exclude,
  );
  if (appointments.length === 0) return;
  const ids = appointments.map((a) => a.id);

  const [items, entries, redeems] = await Promise.all([
    tx
      .select({ appointmentId: appointmentItem.appointmentId, loyaltyPoints: service.loyaltyPoints })
      .from(appointmentItem)
      .innerJoin(service, eq(service.id, appointmentItem.serviceId))
      .where(inArray(appointmentItem.appointmentId, ids)),
    tx
      .select({
        appointmentId: loyaltyEntry.appointmentId,
        kind: loyaltyEntry.kind,
        points: loyaltyEntry.points,
        createdAt: loyaltyEntry.createdAt,
      })
      .from(loyaltyEntry)
      .where(
        and(
          eq(loyaltyEntry.customerId, customerId),
          inArray(loyaltyEntry.kind, ["earn", "reversal"]),
          inArray(loyaltyEntry.appointmentId, ids),
        ),
      )
      .orderBy(asc(loyaltyEntry.createdAt)),
    tx
      .select({ appointmentId: loyaltyEntry.appointmentId, kind: loyaltyEntry.kind })
      .from(loyaltyEntry)
      .where(
        and(
          eq(loyaltyEntry.customerId, customerId),
          inArray(loyaltyEntry.kind, ["redeem", "redeem_cancel"]),
          inArray(loyaltyEntry.appointmentId, ids),
        ),
      ),
  ]);

  const toWrite: (typeof loyaltyEntry.$inferInsert)[] = [];
  for (const a of appointments) {
    const written = entries.filter((e) => e.appointmentId === a.id);
    const net = written.reduce((sum, e) => sum + e.points, 0);
    let wanted = 0;
    // Un RDV où la coupe offerte est utilisée ne rapporte aucun point (D-114).
    const redeemed =
      redeems.filter((r) => r.appointmentId === a.id && r.kind === "redeem").length -
        redeems.filter((r) => r.appointmentId === a.id && r.kind === "redeem_cancel").length >
      0;
    if (isHonored(a, now) && !redeemed) {
      // Premier gain : les points actuels de la carte. Gain rétabli après un retrait : le même nombre de points qu'avant,
      // même si le barème a changé entre-temps.
      const lastEarn = [...written].reverse().find((e) => e.kind === "earn");
      wanted = lastEarn
        ? lastEarn.points
        : pointsForItems(items.filter((i) => i.appointmentId === a.id));
    }
    const diff = wanted - net;
    if (diff === 0) continue;
    toWrite.push({
      customerId,
      appointmentId: a.id,
      kind: diff > 0 ? "earn" : "reversal",
      points: diff,
      actorType: "system",
      createdAt: now,
    });
  }
  if (toWrite.length > 0) await tx.insert(loyaltyEntry).values(toWrite);
}

/** R-96, R-97 : met la carte du client à jour (gains des RDV honorés, retraits des RDV devenus lapin ou annulés). */
export async function settleLoyalty(db: Database, customerId: string, now: Date = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    await lockCustomer(tx, customerId);
    await settleInTransaction(tx, customerId, now);
  });
}

export interface LoyaltyHistoryLine {
  id: string;
  kind: (typeof loyaltyEntry.$inferSelect)["kind"];
  points: number;
  createdAt: Date;
  reason: string | null;
  /** Date du RDV concerné et ses prestations, pour les gains. */
  appointmentStartsAt: Date | null;
  serviceNames: string[];
}

export interface LoyaltyCard extends LoyaltyProgress {
  enabled: boolean;
  history: LoyaltyHistoryLine[];
}

const HISTORY_LIMIT = 30;

/** La carte d'un client : solde, progression et historique. Met d'abord la carte à jour. */
export async function getLoyaltyCard(
  db: Database,
  customerId: string,
  now: Date = new Date(),
): Promise<LoyaltyCard> {
  const settings = await loadSettings(db);
  if (!settings.enabled) return { enabled: false, history: [], ...loyaltyProgress(0, settings.threshold) };
  await settleLoyalty(db, customerId, now);

  const [balance, rows] = await Promise.all([
    balanceOf(db, customerId),
    db
      .select({
        id: loyaltyEntry.id,
        kind: loyaltyEntry.kind,
        points: loyaltyEntry.points,
        createdAt: loyaltyEntry.createdAt,
        reason: loyaltyEntry.reason,
        appointmentId: loyaltyEntry.appointmentId,
        appointmentStartsAt: appointment.startsAt,
      })
      .from(loyaltyEntry)
      .leftJoin(appointment, eq(appointment.id, loyaltyEntry.appointmentId))
      .where(eq(loyaltyEntry.customerId, customerId))
      .orderBy(desc(loyaltyEntry.createdAt), desc(loyaltyEntry.id))
      .limit(HISTORY_LIMIT),
  ]);
  const appointmentIds = [...new Set(rows.flatMap((r) => (r.appointmentId ? [r.appointmentId] : [])))];
  const names = appointmentIds.length
    ? await db
        .select({ appointmentId: appointmentItem.appointmentId, name: appointmentItem.nameSnapshot })
        .from(appointmentItem)
        .where(inArray(appointmentItem.appointmentId, appointmentIds))
        .orderBy(asc(appointmentItem.position))
    : [];

  return {
    enabled: true,
    ...loyaltyProgress(balance, settings.threshold),
    history: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      points: r.points,
      createdAt: r.createdAt,
      reason: r.reason,
      appointmentStartsAt: r.appointmentStartsAt,
      serviceNames: names.filter((n) => n.appointmentId === r.appointmentId).map((n) => n.name),
    })),
  };
}

// ---------------------------------------------------------------------------------------------------------------------

export interface RewardInput {
  appointmentId: string;
  /** Membre de l'équipe qui agit (R-74). */
  authorStaffId: string;
}

async function netRedeems(tx: Database, appointmentId: string) {
  const rows = await tx
    .select()
    .from(loyaltyEntry)
    .where(
      and(
        eq(loyaltyEntry.appointmentId, appointmentId),
        inArray(loyaltyEntry.kind, ["redeem", "redeem_cancel"]),
      ),
    );
  const used = rows.filter((r) => r.kind === "redeem").length - rows.filter((r) => r.kind === "redeem_cancel").length;
  const last = rows.filter((r) => r.kind === "redeem").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return { used, last };
}

async function lockAppointment(tx: Database, appointmentId: string) {
  const [row] = await tx.select().from(appointment).where(eq(appointment.id, appointmentId)).for("update");
  if (!row) throw new DomainError("appointment_not_found");
  return row;
}

async function itemsOf(tx: Database, appointmentId: string) {
  return tx
    .select({
      priceCents: appointmentItem.priceCents,
      eligible: service.loyaltyRewardEligible,
    })
    .from(appointmentItem)
    .innerJoin(service, eq(service.id, appointmentItem.serviceId))
    .where(eq(appointmentItem.appointmentId, appointmentId));
}

/**
 * R-98, R-99 : utilise la coupe offerte du client sur ce RDV. Débite le seuil de points et baisse le montant à encaisser
 * du prix de la prestation éligible (coupe ou coupe & barbe, au prix le plus élevé s'il y en a deux).
 * Refus : `author_required` / `unknown_author`, `appointment_not_found`, `not_modifiable` (lapin, annulé),
 * `not_started`, `loyalty_disabled`, `already_paid`, `reward_already_used`, `reward_not_available` (moins de points que
 * le seuil), `no_reward_service` (aucune prestation éligible dans le RDV).
 */
export async function redeemReward(
  db: Database,
  input: RewardInput,
  now: Date = new Date(),
): Promise<{ discountCents: number; amountCents: number; balance: number }> {
  return db.transaction(async (tx) => {
    const authorId = await assertActiveAuthor(tx, input.authorStaffId);
    const row = await lockAppointment(tx, input.appointmentId);
    if (row.status !== "confirmed" && row.status !== "honored") throw new DomainError("not_modifiable");
    if (row.status === "confirmed" && row.startsAt.getTime() > now.getTime()) throw new DomainError("not_started");
    const settings = await loadSettings(tx);
    if (!settings.enabled) throw new DomainError("loyalty_disabled");

    await lockCustomer(tx, row.customerId);
    await settleInTransaction(tx, row.customerId, now, row.id);

    const [paid] = await tx
      .select({ id: payment.id })
      .from(payment)
      .where(and(eq(payment.appointmentId, row.id), eq(payment.status, "successful")));
    if (paid) throw new DomainError("already_paid");
    if ((await netRedeems(tx, row.id)).used > 0) throw new DomainError("reward_already_used");

    const balance = await balanceOf(tx, row.customerId);
    if (balance < settings.threshold) throw new DomainError("reward_not_available");

    const items = await itemsOf(tx, row.id);
    const eligible = items.filter((i) => i.eligible).sort((a, b) => b.priceCents - a.priceCents)[0];
    if (!eligible) throw new DomainError("no_reward_service");

    const price = items.reduce((sum, i) => sum + i.priceCents, 0);
    const current = row.adjustedAmountCents ?? price;
    const discountCents = Math.min(eligible.priceCents, current);
    const amountCents = current - discountCents;

    await tx.insert(loyaltyEntry).values({
      customerId: row.customerId,
      appointmentId: row.id,
      kind: "redeem",
      points: -settings.threshold,
      discountCents,
      previousAdjustedCents: row.adjustedAmountCents,
      actorType: "staff",
      actorId: authorId,
      createdAt: now,
    });
    await tx
      .update(appointment)
      .set({ adjustedAmountCents: amountCents === price ? null : amountCents })
      .where(eq(appointment.id, row.id));
    // Un gain déjà écrit pour ce RDV (avant l'utilisation) est retiré : la coupe offerte ne rapporte rien.
    await settleInTransaction(tx, row.customerId, now);
    await recordAudit(
      tx,
      {
        actorType: "staff",
        actorId: authorId,
        action: "loyalty.redeemed",
        entity: "appointment",
        entityId: row.id,
        before: { amountCents: current },
        after: { amountCents, discountCents, points: -settings.threshold },
      },
      now,
    );
    return { discountCents, amountCents, balance: await balanceOf(tx, row.customerId) };
  });
}

/** R-99 : annule l'utilisation d'une coupe offerte (erreur) : les points sont rendus, le montant d'avant rétabli. */
export async function cancelReward(
  db: Database,
  input: RewardInput,
  now: Date = new Date(),
): Promise<{ balance: number }> {
  return db.transaction(async (tx) => {
    const authorId = await assertActiveAuthor(tx, input.authorStaffId);
    const row = await lockAppointment(tx, input.appointmentId);
    await lockCustomer(tx, row.customerId);

    const { used, last } = await netRedeems(tx, row.id);
    if (used <= 0 || !last) throw new DomainError("no_reward_to_cancel");
    const [paid] = await tx
      .select({ id: payment.id })
      .from(payment)
      .where(and(eq(payment.appointmentId, row.id), eq(payment.status, "successful")));
    if (paid) throw new DomainError("already_paid");

    await tx.insert(loyaltyEntry).values({
      customerId: row.customerId,
      appointmentId: row.id,
      kind: "redeem_cancel",
      points: -last.points,
      discountCents: last.discountCents,
      actorType: "staff",
      actorId: authorId,
      createdAt: now,
    });
    await tx
      .update(appointment)
      .set({ adjustedAmountCents: last.previousAdjustedCents })
      .where(eq(appointment.id, row.id));
    await settleInTransaction(tx, row.customerId, now);
    await recordAudit(
      tx,
      {
        actorType: "staff",
        actorId: authorId,
        action: "loyalty.redeem_cancelled",
        entity: "appointment",
        entityId: row.id,
        after: { points: -last.points, adjustedAmountCents: last.previousAdjustedCents },
      },
      now,
    );
    return { balance: await balanceOf(tx, row.customerId) };
  });
}

export interface RedeemState {
  /** Une coupe offerte a été utilisée sur ce RDV (et pas annulée). */
  used: boolean;
  discountCents: number | null;
}

/** L'état de la coupe offerte d'un RDV, pour la fiche de la tablette. */
export async function rewardStateFor(db: Database, appointmentId: string): Promise<RedeemState> {
  const { used, last } = await netRedeems(db, appointmentId);
  return { used: used > 0, discountCents: used > 0 ? (last?.discountCents ?? null) : null };
}

export interface AdjustInput {
  customerId: string;
  /** Points ajoutés (positif) ou retirés (négatif), jamais 0. */
  delta: number;
  /** Motif obligatoire. */
  reason: string;
  /** Compte équipe qui a saisi le code gérant. */
  managerActorId: string;
}

const MAX_ADJUST = 10_000;

/**
 * Correction manuelle du solde par le gérant. Refus : `invalid_adjustment` (delta nul ou énorme, motif vide),
 * `unknown_customer`, `loyalty_negative` (le solde passerait sous 0, R-100).
 */
export async function adjustBalance(
  db: Database,
  input: AdjustInput,
  now: Date = new Date(),
): Promise<{ balance: number }> {
  const reason = input.reason.trim();
  if (!Number.isInteger(input.delta) || input.delta === 0 || Math.abs(input.delta) > MAX_ADJUST || !reason || reason.length > 200) {
    throw new DomainError("invalid_adjustment");
  }
  return db.transaction(async (tx) => {
    await lockCustomer(tx, input.customerId);
    await settleInTransaction(tx, input.customerId, now);
    const balance = await balanceOf(tx, input.customerId);
    if (balance + input.delta < 0) throw new DomainError("loyalty_negative");
    await tx.insert(loyaltyEntry).values({
      customerId: input.customerId,
      kind: "adjust",
      points: input.delta,
      reason,
      actorType: "manager",
      actorId: input.managerActorId,
      createdAt: now,
    });
    await recordAudit(
      tx,
      {
        actorType: "manager",
        actorId: input.managerActorId,
        action: "loyalty.adjusted",
        entity: "customer",
        entityId: input.customerId,
        before: { balance },
        after: { balance: balance + input.delta, delta: input.delta, reason },
      },
      now,
    );
    return { balance: balance + input.delta };
  });
}

export interface RewardPanel {
  enabled: boolean;
  balance: number;
  threshold: number;
  /** Une coupe offerte est utilisée sur ce RDV. */
  used: boolean;
  discountCents: number | null;
  /** Prix de la prestation qui serait offerte (null : aucune prestation éligible dans ce RDV). */
  eligibleCents: number | null;
  /** Le RDV est déjà encaissé : on ne touche plus à la remise. */
  paid: boolean;
  /** Le bouton « Utiliser la coupe offerte » peut s'afficher. */
  canRedeem: boolean;
}

/** Ce que la fiche RDV de la tablette affiche de la fidélité du client : solde, coupe offerte possible ou déjà utilisée. */
export async function rewardPanelFor(
  db: Database,
  appointmentId: string,
  now: Date = new Date(),
): Promise<RewardPanel> {
  const settings = await loadSettings(db);
  const [row] = await db.select().from(appointment).where(eq(appointment.id, appointmentId));
  if (!row) throw new DomainError("appointment_not_found");
  if (!settings.enabled) {
    return { enabled: false, balance: 0, threshold: settings.threshold, used: false, discountCents: null, eligibleCents: null, paid: false, canRedeem: false };
  }
  await db.transaction(async (tx) => {
    await lockCustomer(tx, row.customerId);
    await settleInTransaction(tx, row.customerId, now, appointmentId);
  });
  const [balance, state, items, [paid]] = await Promise.all([
    balanceOf(db, row.customerId),
    rewardStateFor(db, appointmentId),
    itemsOf(db, appointmentId),
    db
      .select({ id: payment.id })
      .from(payment)
      .where(and(eq(payment.appointmentId, appointmentId), eq(payment.status, "successful"))),
  ]);
  const eligible = items.filter((i) => i.eligible).sort((a, b) => b.priceCents - a.priceCents)[0];
  const started = row.startsAt.getTime() <= now.getTime();
  const open = row.status === "confirmed" || row.status === "honored";
  return {
    enabled: true,
    balance,
    threshold: settings.threshold,
    used: state.used,
    discountCents: state.discountCents,
    eligibleCents: eligible?.priceCents ?? null,
    paid: !!paid,
    canRedeem: open && started && !state.used && !paid && !!eligible && balance >= settings.threshold,
  };
}

/** Réglages publics du programme : actif, points d'une coupe offerte. */
export async function loyaltySettings(db: Database): Promise<{ enabled: boolean; threshold: number }> {
  const { enabled, threshold } = await loadSettings(db);
  return { enabled, threshold };
}
