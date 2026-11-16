"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { teamMessage } from "../../../../_lib/messages";
import { adjustLoyaltyAction } from "../../../../actions";

const KIND_LABEL: Record<string, string> = {
  earn: "Passage",
  reversal: "Points retirés (lapin ou annulation)",
  redeem: "Coupe offerte utilisée",
  redeem_cancel: "Coupe offerte annulée",
  adjust: "Correction du gérant",
};

export interface LoyaltyLineView {
  id: string;
  kind: string;
  points: number;
  dateLabel: string;
  detail: string;
}

/** Fidélité d'un client pour le gérant (D-114) : solde, historique et correction à la main avec motif (journal). */
export function LoyaltyCard({
  customerId,
  balance,
  threshold,
  history,
}: {
  customerId: string;
  balance: number;
  threshold: number;
  history: LoyaltyLineView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const value = Number(delta.replace(",", ".").trim());
    setError(null);
    startTransition(async () => {
      const result = await adjustLoyaltyAction({ customerId, delta: value, reason });
      if (!result.ok) {
        if (result.error === "manager_locked") return router.push("/equipe/gerant");
        return setError(teamMessage(result.error));
      }
      setDelta("");
      setReason("");
      router.refresh();
    });
  };

  const input =
    "h-12 w-full border border-line-strong bg-transparent px-3 text-[15px] text-ivory";
  return (
    <section aria-label="Fidélité" className="flex flex-col gap-4 border border-line p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[20px] font-light">Fidélité</h2>
        <span className="text-[18px] tabular-nums" aria-label="Solde de points">
          {balance} / {threshold} points
        </span>
      </div>
      {history.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line text-[14px]" aria-label="Historique des points">
          {history.map((h) => (
            <li key={h.id} className="flex items-baseline justify-between gap-4 py-2">
              <span className="flex flex-col">
                <span>{KIND_LABEL[h.kind] ?? h.kind}</span>
                <span className="text-[12px] text-stone">
                  {h.dateLabel}
                  {h.detail ? ` · ${h.detail}` : ""}
                </span>
              </span>
              <span className="tabular-nums">{h.points > 0 ? `+${h.points}` : h.points}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-stone">Aucun point pour l’instant.</p>
      )}
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <span className="text-label uppercase tracking-[0.24em] text-stone">Corriger le solde</span>
        <div className="grid grid-cols-[110px_1fr] gap-3">
          <input
            className={input}
            inputMode="numeric"
            aria-label="Points à ajouter ou retirer"
            placeholder="+10 ou −10"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
          />
          <input
            className={input}
            aria-label="Motif de la correction"
            placeholder="Motif (obligatoire)"
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        {error ? (
          <p role="alert" className="border border-brick p-3 text-[13px]">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending || !delta.trim() || !reason.trim()}
          className="h-[52px] border border-line-strong text-[11px] uppercase tracking-[0.2em] disabled:text-stone-dark"
        >
          {pending ? "…" : "Enregistrer la correction"}
        </button>
      </form>
    </section>
  );
}
