"use server";

import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { DomainError, type DomainErrorCode } from "@/lib/domain-error";
import { getAuthDriver } from "@/modules/auth";
import { currentCustomer } from "@/modules/customers/accounts";
import { sendEmailsForAppointment } from "@/modules/mail/send-now";
import { hitRateLimit } from "@/modules/security/rate-limit";
import {
  acceptOffer,
  declineOffer,
  joinWaitlist,
  leaveWaitlist,
} from "@/modules/waitlist";
import { wakeWaitlist } from "@/modules/waitlist/run";

// Actions de la liste d'attente (D-73, D-99, D-100). Les règles sont dans `src/modules/waitlist` ; ici on identifie le
// client, on limite les essais, et on réveille la liste après chaque réponse (la place suivante part tout de suite).

export type WaitlistFailure = {
  ok: false;
  error: DomainErrorCode | "invalid" | "rate_limited" | "not_signed_in" | "failed";
};

function toFailure(error: unknown): WaitlistFailure {
  if (error instanceof DomainError) return { ok: false, error: error.code };
  console.error("Erreur inattendue dans l'action de la liste d'attente :", error);
  return { ok: false, error: "failed" };
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** « Me prévenir si une place se libère » : l'inscription du client connecté (R-80). */
export async function joinWaitlistAction(
  input: unknown,
): Promise<{ ok: true; days: number } | WaitlistFailure> {
  const parsed = z
    .object({
      serviceIds: z.array(z.uuid()).min(1).max(8),
      staffId: z.union([z.uuid(), z.literal("any")]),
      days: z.array(isoDate).min(1).max(14),
      window: z.enum(["morning", "afternoon", "day"]),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const customer = await currentCustomer(db(), getAuthDriver());
    if (!customer) return { ok: false, error: "not_signed_in" };
    const limit = await hitRateLimit(db(), `waitlist:customer:${customer.id}`, {
      limit: 10,
      windowSeconds: 900,
    });
    if (!limit.allowed) return { ok: false, error: "rate_limited" };
    await joinWaitlist(db(), { customerId: customer.id, ...parsed.data });
    return { ok: true, days: new Set(parsed.data.days).size };
  } catch (error) {
    return toFailure(error);
  }
}

/** « Prendre cette place » (R-83). */
export async function acceptOfferAction(
  offerId: string,
): Promise<{ ok: true; appointmentId: string } | WaitlistFailure> {
  const id = z.uuid().safeParse(offerId);
  if (!id.success) return { ok: false, error: "invalid" };
  try {
    const customer = await currentCustomer(db(), getAuthDriver());
    if (!customer) return { ok: false, error: "not_signed_in" };
    const limit = await hitRateLimit(db(), `waitlist-offer:customer:${customer.id}`, {
      limit: 20,
      windowSeconds: 900,
    });
    if (!limit.allowed) return { ok: false, error: "rate_limited" };
    const created = await acceptOffer(db(), { customerId: customer.id, offerId: id.data });
    after(() => sendEmailsForAppointment(db(), created.id));
    return { ok: true, appointmentId: created.id };
  } catch (error) {
    // Une place perdue ou expirée doit passer à la personne suivante sans attendre le cron.
    after(() => wakeWaitlist(db()));
    return toFailure(error);
  }
}

/** « Pas cette fois, je reste sur la liste » (R-84). */
export async function declineOfferAction(offerId: string): Promise<{ ok: true } | WaitlistFailure> {
  const id = z.uuid().safeParse(offerId);
  if (!id.success) return { ok: false, error: "invalid" };
  try {
    const customer = await currentCustomer(db(), getAuthDriver());
    if (!customer) return { ok: false, error: "not_signed_in" };
    await declineOffer(db(), { customerId: customer.id, offerId: id.data });
    after(() => wakeWaitlist(db()));
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

/** « Quitter la liste d'attente » / « Me retirer » (R-85). */
export async function leaveWaitlistAction(entryId: string): Promise<{ ok: true } | WaitlistFailure> {
  const id = z.uuid().safeParse(entryId);
  if (!id.success) return { ok: false, error: "invalid" };
  try {
    const customer = await currentCustomer(db(), getAuthDriver());
    if (!customer) return { ok: false, error: "not_signed_in" };
    await leaveWaitlist(db(), { customerId: customer.id, entryId: id.data });
    after(() => wakeWaitlist(db()));
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}
