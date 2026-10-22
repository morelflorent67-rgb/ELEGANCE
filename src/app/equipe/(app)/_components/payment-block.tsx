"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { formatPrice } from "@/lib/format";
import type { PaymentView } from "@/modules/payments";
import { teamMessage } from "../../_lib/messages";
import { cancelPaymentAction, refreshPaymentAction, startPaymentAction } from "../../actions";
import { AuthorPicker, type TeamMemberView } from "./author-picker";

const POLL_MS = 2500;
const ghost =
  "h-[52px] border border-line-strong text-[11px] uppercase tracking-[0.2em] text-ivory transition-colors duration-200 hover:bg-graphite-light";

/**
 * « Encaisser » (D-105, R-89 à R-93) : envoie le montant de la fiche au terminal, attend le client, puis affiche le
 * résultat. Pendant l'attente, la tablette relit le résultat toutes les quelques secondes (le rappel de SumUp
 * l'enregistre aussi de son côté). À remonter avec une `key` qui change quand l'encaissement de la fiche change.
 */
export function PaymentBlock({
  appointmentId,
  customerFirstName,
  amountCents,
  initial,
  team,
  onToast,
}: {
  appointmentId: string;
  customerFirstName: string;
  /** Montant qui sera envoyé : le montant corrigé s'il y en a un, sinon le prix de la carte. */
  amountCents: number;
  initial: PaymentView | null;
  team: TeamMemberView[];
  onToast: (message: string | null) => void;
}) {
  const router = useRouter();
  const [payment, setPayment] = useState<PaymentView | null>(initial);
  const [choosing, setChoosing] = useState(false);
  const [authorId, setAuthorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const waiting = payment?.status === "pending";
  const paymentId = payment?.id;

  // Tant que le terminal attend le client, relire le résultat.
  useEffect(() => {
    if (!waiting || !paymentId) return;
    let stopped = false;
    const timer = setInterval(async () => {
      const result = await refreshPaymentAction({ paymentId });
      if (stopped) return;
      if (!result.ok) return setError(teamMessage(result.error));
      if (result.payment.status === "pending") return;
      setPayment(result.payment);
      if (result.payment.status === "successful") {
        onToast(
          `Encaissé ${formatPrice(result.payment.amountCents)} pour ${customerFirstName}.`,
        );
        router.refresh();
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [waiting, paymentId, customerFirstName, onToast, router]);

  const start = () => {
    if (!authorId) return;
    startTransition(async () => {
      setError(null);
      const result = await startPaymentAction({ appointmentId, authorId });
      if (!result.ok) return setError(teamMessage(result.error));
      setPayment(result.payment);
      setChoosing(false);
      setAuthorId(null);
    });
  };

  const cancel = () => {
    if (!payment) return;
    startTransition(async () => {
      setError(null);
      const picked = authorId;
      if (!picked) return setError(teamMessage("author_required"));
      const result = await cancelPaymentAction({ paymentId: payment.id, authorId: picked });
      if (!result.ok) return setError(teamMessage(result.error));
      setPayment(result.payment);
      setAuthorId(null);
      if (result.payment.status === "successful") router.refresh();
    });
  };

  if (payment?.status === "successful") {
    return (
      <p role="status" className="border border-gold px-4 py-3 text-[14px] text-ivory">
        Encaissé · {formatPrice(payment.amountCents)}
      </p>
    );
  }

  if (waiting && payment) {
    return (
      <section
        aria-label="Encaissement en cours"
        className="flex flex-col gap-3 border border-gold p-4"
      >
        <span role="status" className="text-[15px] text-ivory">
          En attente du client sur le terminal · {formatPrice(payment.amountCents)}
        </span>
        <p className="text-[13px] leading-normal text-stone">
          Présentez le terminal au client. Le résultat s’affiche ici tout seul.
        </p>
        <AuthorPicker team={team} value={authorId} onChange={setAuthorId} label="Qui annule ?" />
        {error ? (
          <p role="alert" className="border border-brick p-3 text-[13px] leading-normal">
            {error}
          </p>
        ) : null}
        <button type="button" disabled={pending || !authorId} onClick={cancel} className={ghost}>
          Annuler sur le terminal
        </button>
      </section>
    );
  }

  if (choosing) {
    return (
      <section aria-label="Encaisser" className="flex flex-col gap-3 border border-ivory p-4">
        <span className="text-[16px]">
          Encaisser {formatPrice(amountCents)} pour {customerFirstName}
        </span>
        <AuthorPicker team={team} value={authorId} onChange={setAuthorId} label="Qui encaisse ?" />
        {error ? (
          <p role="alert" className="border border-brick p-3 text-[13px] leading-normal">
            {error}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setChoosing(false);
              setError(null);
              setAuthorId(null);
            }}
            className={ghost}
          >
            Retour
          </button>
          <button
            type="button"
            disabled={pending || !authorId}
            onClick={start}
            className="h-[52px] bg-ivory text-[11px] font-medium uppercase tracking-[0.2em] text-ink disabled:bg-disabled disabled:text-stone-dark"
          >
            {pending ? "…" : "Envoyer au terminal"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {payment ? (
        <p role="status" className="text-[13px] leading-normal text-brick">
          {payment.status === "cancelled"
            ? "Encaissement annulé : le rendez-vous reste à encaisser."
            : "Le paiement n’a pas abouti : le rendez-vous reste à encaisser."}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => setChoosing(true)}
        className="h-[52px] bg-ivory text-[11px] font-medium uppercase tracking-[0.2em] text-ink"
      >
        {payment ? "Réessayer l’encaissement" : "Encaisser"} · {formatPrice(amountCents)}
      </button>
    </div>
  );
}
