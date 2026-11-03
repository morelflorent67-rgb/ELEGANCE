"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { formatPrice } from "@/lib/format";
import { KEYPAD_KEYS, pressKey } from "@/lib/keypad";
import { centsToEuroInput, parseEuros } from "@/lib/money";
import type { PaymentView } from "@/modules/payments";
import { teamMessage } from "../../_lib/messages";
import { cancelPaymentAction, refreshPaymentAction, startWalkInPaymentAction } from "../../actions";
import { AuthorPicker, type TeamMemberView } from "../_components/author-picker";

const POLL_MS = 2500;
const ghost =
  "h-[52px] border border-line-strong text-[11px] uppercase tracking-[0.2em] text-ivory transition-colors duration-200 hover:bg-graphite-light";

export interface QuickService {
  id: string;
  name: string;
  priceCents: number;
}

/**
 * « Encaisser » hors rendez-vous (D-109, R-94) : un pavé numérique pour le montant libre, des raccourcis de la carte qui
 * s'additionnent, le coiffeur concerné (le Bilan par membre en dépend) et le prénom de qui encaisse, puis le terminal.
 */
export function WalkInPayment({
  services,
  team,
}: {
  services: QuickService[];
  team: TeamMemberView[];
}) {
  const [text, setText] = useState("");
  const [labels, setLabels] = useState<string[]>([]);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [authorId, setAuthorId] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const cents = parseEuros(text);
  const waiting = payment?.status === "pending";
  const paymentId = payment?.id;

  useEffect(() => {
    if (!waiting || !paymentId) return;
    let stopped = false;
    const timer = setInterval(async () => {
      const result = await refreshPaymentAction({ paymentId });
      if (stopped) return;
      if (!result.ok) return setError(teamMessage(result.error));
      if (result.payment.status !== "pending") setPayment(result.payment);
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [waiting, paymentId]);

  const addService = (service: QuickService) => {
    setText(centsToEuroInput((cents ?? 0) + service.priceCents));
    setLabels((current) => [...current, service.name]);
  };
  const clear = () => {
    setText("");
    setLabels([]);
  };
  const reset = () => {
    clear();
    setPayment(null);
    setStaffId(null);
    setAuthorId(null);
    setError(null);
  };

  const send = () => {
    if (!cents || !staffId || !authorId) return;
    startTransition(async () => {
      setError(null);
      const result = await startWalkInPaymentAction({
        staffId,
        authorId,
        amountCents: cents,
        label: labels.join(" + "),
      });
      if (!result.ok) return setError(teamMessage(result.error));
      setPayment(result.payment);
      setAuthorId(null);
    });
  };

  const cancel = () => {
    if (!payment || !authorId) return;
    startTransition(async () => {
      setError(null);
      const result = await cancelPaymentAction({ paymentId: payment.id, authorId });
      if (!result.ok) return setError(teamMessage(result.error));
      setPayment(result.payment);
      setAuthorId(null);
    });
  };

  if (payment?.status === "successful") {
    return (
      <section aria-label="Encaissé" className="flex flex-col gap-4 border border-gold p-5">
        <p role="status" className="text-[22px] font-light">
          Encaissé · {formatPrice(payment.amountCents)}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={reset} className={ghost}>
            Nouvel encaissement
          </button>
          <Link href="/equipe" className={`${ghost} flex items-center justify-center`}>
            Retour au planning
          </Link>
        </div>
      </section>
    );
  }

  if (waiting && payment) {
    return (
      <section aria-label="Encaissement en cours" className="flex flex-col gap-3 border border-gold p-5">
        <span role="status" className="text-[18px]">
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
        <button
          type="button"
          disabled={pending || !authorId}
          onClick={cancel}
          className={ghost}
        >
          Annuler sur le terminal
        </button>
      </section>
    );
  }

  const ready = !!cents && !!staffId && !!authorId && !pending;
  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <section aria-label="Montant" className="flex flex-col gap-3">
        <div className="flex min-h-24 flex-col justify-center gap-1 border border-line-strong px-5 py-3">
          <span className="text-label uppercase text-stone">Montant</span>
          <output
            aria-label="Montant saisi"
            className="text-[44px] font-light tabular-nums leading-tight"
          >
            {text === "" ? "0" : text} €
          </output>
          {labels.length > 0 ? (
            <span className="text-[13px] text-stone">{labels.join(" + ")}</span>
          ) : null}
        </div>
        <div role="group" aria-label="Pavé numérique" className="grid grid-cols-3 gap-2">
          {KEYPAD_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={key === "⌫" ? "Effacer un chiffre" : key === "," ? "Virgule" : key}
              onClick={() => setText((current) => pressKey(current, key))}
              className="h-16 border border-line-strong text-[24px] tabular-nums hover:bg-graphite-light"
            >
              {key}
            </button>
          ))}
        </div>
        <button type="button" onClick={clear} className={ghost}>
          Tout effacer
        </button>
      </section>

      <div className="flex flex-col gap-5">
        <section aria-label="Raccourcis de la carte" className="flex flex-col gap-2.5">
          <span className="text-label uppercase text-stone">
            Raccourcis (chaque touche s’ajoute au montant)
          </span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {services.map((service) => (
              <button
                key={service.id}
                type="button"
                onClick={() => addService(service)}
                className="flex min-h-16 flex-col items-start justify-center gap-0.5 border border-line-strong px-3 py-2 text-left hover:bg-graphite-light"
              >
                <span className="text-[14px] leading-tight">{service.name}</span>
                <span className="text-[13px] tabular-nums text-gold">
                  {formatPrice(service.priceCents)}
                </span>
              </button>
            ))}
          </div>
        </section>

        <AuthorPicker
          team={team}
          value={staffId}
          onChange={setStaffId}
          label="Pour quel coiffeur ?"
        />
        <AuthorPicker team={team} value={authorId} onChange={setAuthorId} label="Qui encaisse ?" />

        {payment && (payment.status === "failed" || payment.status === "cancelled") ? (
          <p role="status" className="text-[13px] leading-normal text-brick">
            {payment.status === "cancelled"
              ? "Encaissement annulé : rien n’a été encaissé."
              : "Le paiement n’a pas abouti : rien n’a été encaissé."}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="border border-brick p-3 text-[13px] leading-normal">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={!ready}
          onClick={send}
          className="h-14 bg-ivory px-6 text-[12px] font-medium uppercase tracking-[0.22em] text-ink disabled:bg-disabled disabled:text-stone-dark"
        >
          {pending ? "…" : `Envoyer au terminal${cents ? ` · ${formatPrice(cents)}` : ""}`}
        </button>
      </div>
    </div>
  );
}
