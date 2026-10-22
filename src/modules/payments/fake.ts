import { ProviderError, type CheckoutState, type PaymentProvider } from "./provider";

// Faux terminal : sert aux tests d'intégration et aux parcours Playwright (PAYMENT_DRIVER=fake). Interdit sur Vercel.
// Les tests décident du résultat avec `complete`, comme le client qui paie (ou pas) sur le vrai terminal.

export interface FakeTerminal extends PaymentProvider {
  /** Simule la fin d'un encaissement sur le terminal. */
  complete(reference: string, result: { status: "successful" | "failed"; amountCents?: number; failureReason?: string }): void;
  /** Les encaissements envoyés, dans l'ordre. */
  readonly sent: { reference: string; amountCents: number; returnUrl: string }[];
  terminated: number;
  /** Fait échouer l'envoi suivant (terminal éteint, hors ligne). */
  offline: boolean;
  /** Appaire n'importe quel code sauf « INVALID ». */
  reset(): void;
}

export function createFakeTerminal(): FakeTerminal {
  const states = new Map<string, CheckoutState>();
  const sent: FakeTerminal["sent"] = [];
  let counter = 0;

  const fake: FakeTerminal = {
    sent,
    terminated: 0,
    offline: false,
    async startCheckout({ amountCents, returnUrl }) {
      if (fake.offline) throw new ProviderError("Terminal hors ligne.");
      const reference = `fake-tx-${++counter}`;
      sent.push({ reference, amountCents, returnUrl });
      states.set(reference, { status: "pending", amountCents: null, failureReason: null });
      return { reference };
    },
    async terminate() {
      fake.terminated++;
    },
    async getCheckout({ reference }) {
      return states.get(reference) ?? { status: "pending", amountCents: null, failureReason: null };
    },
    async pairReader({ pairingCode }) {
      if (pairingCode.toUpperCase() === "INVALID") throw new ProviderError("Code refusé.");
      return { readerId: `fake-reader-${pairingCode.toLowerCase()}` };
    },
    complete(reference, result) {
      const last = sent.find((s) => s.reference === reference);
      states.set(reference, {
        status: result.status,
        amountCents: result.status === "successful" ? (result.amountCents ?? last?.amountCents ?? null) : null,
        failureReason: result.status === "failed" ? (result.failureReason ?? "declined") : null,
      });
    },
    reset() {
      states.clear();
      sent.length = 0;
      fake.terminated = 0;
      fake.offline = false;
      counter = 0;
    },
  };
  return fake;
}

const globalKey = Symbol.for("elegance.fakeTerminal");
/** Un seul faux terminal par processus : le serveur de test et sa route de commande le partagent. */
export function sharedFakeTerminal(): FakeTerminal {
  const store = globalThis as unknown as Record<symbol, FakeTerminal | undefined>;
  return (store[globalKey] ??= createFakeTerminal());
}
