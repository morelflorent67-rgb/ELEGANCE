import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { appSecret, siteUrl } from "@/lib/env";
import { sharedFakeTerminal } from "./fake";
import { createSumupProvider } from "./sumup";
import type { PaymentProvider } from "./provider";

/**
 * Terminal choisi par l'environnement : SumUp si la clé d'API existe, le faux terminal avec `PAYMENT_DRIVER=fake`
 * (tests de bout en bout, refusé sur Vercel). Sans l'un ni l'autre : `null`, l'encaissement n'est pas disponible.
 */
export function paymentProviderFromEnv(): PaymentProvider | null {
  if (process.env.PAYMENT_DRIVER === "fake") {
    if (process.env.VERCEL) throw new Error("PAYMENT_DRIVER=fake est interdit sur Vercel.");
    return sharedFakeTerminal();
  }
  const apiKey = process.env.SUMUP_API_KEY;
  if (!apiKey) return null;
  return createSumupProvider({
    apiKey,
    affiliateKey: process.env.SUMUP_AFFILIATE_KEY || undefined,
    appId: process.env.SUMUP_APP_ID || undefined,
  });
}

/** Secret dans l'adresse du rappel : SumUp ne signe pas ses appels, le secret en tient lieu (le résultat est de toute façon relu chez SumUp). */
function webhookSecret(): string {
  return (
    process.env.SUMUP_WEBHOOK_SECRET ||
    createHmac("sha256", appSecret()).update("elegance-strasbourg/sumup-webhook/v1").digest("hex").slice(0, 40)
  );
}

export const webhookUrl = (): string => `${siteUrl()}/api/sumup/webhook/${webhookSecret()}`;

export function isWebhookSecret(candidate: string): boolean {
  const expected = Buffer.from(webhookSecret());
  const given = Buffer.from(candidate);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
