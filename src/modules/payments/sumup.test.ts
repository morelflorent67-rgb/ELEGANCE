import { describe, expect, it, vi } from "vitest";
import { ProviderError } from "./provider";
import { createSumupProvider } from "./sumup";

// Le client SumUp est écrit d'après la documentation de la Cloud API (terminal Solo) : ces tests fixent ce qu'il envoie
// et comment il lit les réponses, avec un faux `fetch`. Pas encore essayé sur un vrai compte.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function provider(response: Response | (() => Response)) {
  const fetchMock = vi.fn(async () => (typeof response === "function" ? response() : response));
  return {
    fetchMock,
    sumup: createSumupProvider({ apiKey: "cle-test", affiliateKey: "aff", appId: "app", fetch: fetchMock as never }),
  };
}

describe("startCheckout", () => {
  it("envoie le montant en centimes au terminal, avec la clé, l'adresse de rappel et l'affiliation", async () => {
    const { fetchMock, sumup } = provider(json({ data: { client_transaction_id: "tx-1" } }));
    const result = await sumup.startCheckout({
      merchantCode: "MABC1234",
      readerId: "rdr_1",
      amountCents: 2850,
      returnUrl: "https://exemple.test/hook",
      paymentId: "pay-1",
    });
    expect(result).toEqual({ reference: "tx-1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.sumup.com/v0.1/merchants/MABC1234/readers/rdr_1/checkout");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer cle-test");
    expect(JSON.parse(init.body as string)).toEqual({
      total_amount: { currency: "EUR", minor_unit: 2, value: 2850 },
      return_url: "https://exemple.test/hook",
      affiliate: { key: "aff", app_id: "app", foreign_transaction_id: "pay-1" },
    });
  });

  it("refuse une réponse sans identifiant de transaction ou un refus de SumUp", async () => {
    const input = { merchantCode: "M", readerId: "r", amountCents: 100, returnUrl: "https://x.test", paymentId: "p" };
    await expect(provider(json({})).sumup.startCheckout(input)).rejects.toBeInstanceOf(ProviderError);
    await expect(provider(json({}, 422)).sumup.startCheckout(input)).rejects.toBeInstanceOf(ProviderError);
  });

  it("traduit un réseau coupé en erreur de fournisseur", async () => {
    const sumup = createSumupProvider({
      apiKey: "k",
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as never,
    });
    await expect(
      sumup.startCheckout({ merchantCode: "M", readerId: "r", amountCents: 100, returnUrl: "https://x.test", paymentId: "p" }),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("getCheckout", () => {
  const read = (body: unknown, status = 200) =>
    provider(json(body, status)).sumup.getCheckout({ merchantCode: "MABC1234", reference: "tx-1" });

  it("lit une transaction réussie et son montant en centimes", async () => {
    expect(await read({ status: "SUCCESSFUL", amount: 28.5 })).toEqual({
      status: "successful",
      amountCents: 2850,
      failureReason: null,
    });
  });

  it("lit une transaction échouée ou annulée", async () => {
    expect(await read({ status: "FAILED" })).toMatchObject({ status: "failed", failureReason: "failed" });
    expect(await read({ status: "CANCELLED" })).toMatchObject({ status: "failed", failureReason: "cancelled" });
  });

  it("une transaction en attente ou pas encore connue reste en cours", async () => {
    expect((await read({ status: "PENDING" })).status).toBe("pending");
    expect((await read({}, 404)).status).toBe("pending");
  });
});

describe("pairReader", () => {
  it("envoie le code d'appairage et rend l'identifiant du terminal", async () => {
    const { fetchMock, sumup } = provider(json({ id: "rdr_9" }));
    expect(await sumup.pairReader({ merchantCode: "MABC1234", pairingCode: "ZX81QA", name: "Salon" })).toEqual({
      readerId: "rdr_9",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.sumup.com/v0.1/merchants/MABC1234/readers");
    expect(JSON.parse(init.body as string)).toEqual({ pairing_code: "ZX81QA", name: "Salon" });
  });
});

describe("terminate", () => {
  it("interrompt l'encaissement en cours", async () => {
    const { fetchMock, sumup } = provider(json({}));
    await sumup.terminate({ merchantCode: "M", readerId: "r" });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      "https://api.sumup.com/v0.1/merchants/M/readers/r/terminate",
    );
  });
});
