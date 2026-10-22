import { ProviderError, type CheckoutState, type PaymentProvider } from "./provider";

// Cloud API SumUp pour le terminal Solo (https://developer.sumup.com/terminal-payments/cloud-api).
// Écrit d'après la documentation, pas encore essayé sur un vrai compte (clé d'API en attente) : à vérifier avec le
// terminal ou le Virtual Solo avant la mise en service.

const BASE = "https://api.sumup.com";

export interface SumupConfig {
  apiKey: string;
  /** Clé et identifiant d'application d'affiliation, exigés par SumUp pour les paiements lancés à distance. */
  affiliateKey?: string;
  appId?: string;
  fetch?: typeof fetch;
}

export function createSumupProvider(config: SumupConfig): PaymentProvider {
  const doFetch = config.fetch ?? fetch;

  async function call(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await doFetch(`${BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ProviderError("SumUp injoignable.");
    }
    if (response.status === 404 && method === "GET") return null;
    if (!response.ok) throw new ProviderError(`SumUp a refusé la demande (${response.status}).`);
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }

  const reader = (merchantCode: string, readerId: string) =>
    `/v0.1/merchants/${encodeURIComponent(merchantCode)}/readers/${encodeURIComponent(readerId)}`;

  return {
    async startCheckout({ merchantCode, readerId, amountCents, returnUrl, paymentId }) {
      const result = (await call("POST", `${reader(merchantCode, readerId)}/checkout`, {
        total_amount: { currency: "EUR", minor_unit: 2, value: amountCents },
        return_url: returnUrl,
        ...(config.affiliateKey && config.appId
          ? { affiliate: { key: config.affiliateKey, app_id: config.appId, foreign_transaction_id: paymentId } }
          : {}),
      })) as { data?: { client_transaction_id?: string } };
      const reference = result.data?.client_transaction_id;
      if (!reference) throw new ProviderError("SumUp n'a pas renvoyé d'identifiant de transaction.");
      return { reference };
    },

    async terminate({ merchantCode, readerId }) {
      await call("POST", `${reader(merchantCode, readerId)}/terminate`, {});
    },

    async getCheckout({ merchantCode, reference }): Promise<CheckoutState> {
      const path = `/v2.1/merchants/${encodeURIComponent(merchantCode)}/transactions?client_transaction_id=${encodeURIComponent(reference)}`;
      const found = (await call("GET", path)) as {
        status?: string;
        amount?: number;
        simple_status?: string;
      } | null;
      // La transaction n'existe pas encore : le client n'a pas fini de payer.
      if (!found || !found.status) return { status: "pending", amountCents: null, failureReason: null };
      const status = found.status.toUpperCase();
      if (status === "SUCCESSFUL") {
        const amountCents = typeof found.amount === "number" ? Math.round(found.amount * 100) : null;
        return { status: "successful", amountCents, failureReason: null };
      }
      if (status === "PENDING") return { status: "pending", amountCents: null, failureReason: null };
      return { status: "failed", amountCents: null, failureReason: status.toLowerCase() };
    },

    async pairReader({ merchantCode, pairingCode, name }) {
      const result = (await call("POST", `/v0.1/merchants/${encodeURIComponent(merchantCode)}/readers`, {
        pairing_code: pairingCode,
        name,
      })) as { id?: string; data?: { id?: string } };
      const readerId = result.id ?? result.data?.id;
      if (!readerId) throw new ProviderError("SumUp n'a pas renvoyé d'identifiant de terminal.");
      return { readerId };
    },
  };
}
