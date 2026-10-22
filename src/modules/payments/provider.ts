// Le terminal d'encaissement vu par le reste du code (D-105). Une seule implémentation réelle (SumUp Solo, Cloud API) et
// un faux terminal pour les tests : le module de paiement ne connaît que cette interface.

export type CheckoutStatus = "pending" | "successful" | "failed";

export interface CheckoutState {
  status: CheckoutStatus;
  /** Montant réellement débité, en centimes, quand le fournisseur le donne. */
  amountCents: number | null;
  failureReason: string | null;
}

export interface TerminalTarget {
  merchantCode: string;
  readerId: string;
}

export interface PaymentProvider {
  /** Envoie le montant au terminal. La réponse dit seulement que le terminal l'a accepté : le résultat vient après. */
  startCheckout(
    input: TerminalTarget & { amountCents: number; returnUrl: string; paymentId: string },
  ): Promise<{ reference: string }>;
  /** Demande au terminal d'abandonner l'encaissement en cours (sans accusé de réception). */
  terminate(input: TerminalTarget): Promise<void>;
  /** État d'un encaissement, lu auprès du fournisseur : c'est lui qui fait foi, pas le contenu d'un appel entrant. */
  getCheckout(input: { merchantCode: string; reference: string }): Promise<CheckoutState>;
  /** Appaire le terminal avec le code affiché sur son écran. */
  pairReader(input: { merchantCode: string; pairingCode: string; name: string }): Promise<{ readerId: string }>;
}

export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

/**
 * Par le nom, pas par `instanceof` : le faux terminal des tests est partagé entre des paquets du serveur qui chacun
 * embarquent leur copie de cette classe.
 */
export const isProviderError = (error: unknown): error is ProviderError =>
  error instanceof Error && error.name === "ProviderError";
