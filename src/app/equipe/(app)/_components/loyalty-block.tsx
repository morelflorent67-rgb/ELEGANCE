"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { formatPrice } from "@/lib/format";
import type { RewardPanel } from "@/modules/loyalty";
import { teamMessage } from "../../_lib/messages";
import { cancelRewardAction, fetchRewardPanelAction, redeemRewardAction } from "../../actions";
import { AuthorPicker, type TeamMemberView } from "./author-picker";

const ghost =
  "h-[52px] border border-line-strong text-[11px] uppercase tracking-[0.2em] text-ivory transition-colors duration-200 hover:bg-graphite-light";

/**
 * Fidélité du client sur la fiche RDV (D-114, R-98, R-99) : son solde, et « Utiliser la coupe offerte » dès le seuil,
 * avec confirmation et prénom de l'auteur. Le solde se lit à l'ouverture de la fiche (le calcul des gains se fait là).
 */
export function LoyaltyBlock({
  appointmentId,
  customerFirstName,
  team,
  onToast,
}: {
  appointmentId: string;
  customerFirstName: string;
  team: TeamMemberView[];
  onToast: (message: string | null) => void;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<RewardPanel | null>(null);
  const [mode, setMode] = useState<"idle" | "redeem" | "cancel">("idle");
  const [authorId, setAuthorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let stopped = false;
    void fetchRewardPanelAction({ appointmentId }).then((result) => {
      if (!stopped && result.ok) setPanel(result.panel);
    });
    return () => {
      stopped = true;
    };
  }, [appointmentId]);

  if (!panel || !panel.enabled) return null;

  const close = () => {
    setMode("idle");
    setAuthorId(null);
    setError(null);
  };

  const run = (kind: "redeem" | "cancel") => {
    if (!authorId) return;
    startTransition(async () => {
      setError(null);
      const result =
        kind === "redeem"
          ? await redeemRewardAction({ appointmentId, authorId })
          : await cancelRewardAction({ appointmentId, authorId });
      if (!result.ok) return setError(teamMessage(result.error));
      setPanel(result.panel);
      close();
      onToast(
        kind === "redeem"
          ? `Coupe offerte utilisée pour ${customerFirstName}.`
          : "Coupe offerte annulée : les points sont rendus.",
      );
      router.refresh();
    });
  };

  if (mode !== "idle") {
    const redeeming = mode === "redeem";
    return (
      <section aria-label="Coupe offerte" className="flex flex-col gap-3 border border-ivory p-4">
        <span className="text-[16px]">
          {redeeming
            ? `Utiliser la coupe offerte de ${customerFirstName} ?`
            : "Annuler la coupe offerte de ce rendez-vous ?"}
        </span>
        <p className="text-[13px] leading-normal text-stone">
          {redeeming
            ? `${panel.threshold} points sont débités et ${formatPrice(panel.eligibleCents ?? 0)} sont déduits du montant à encaisser.`
            : `Les ${panel.threshold} points sont rendus et le montant d’avant est rétabli.`}
        </p>
        <AuthorPicker team={team} value={authorId} onChange={setAuthorId} label="Qui confirme ?" />
        {error ? (
          <p role="alert" className="border border-brick p-3 text-[13px] leading-normal">
            {error}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={close} className={ghost}>
            Retour
          </button>
          <button
            type="button"
            disabled={pending || !authorId}
            onClick={() => run(mode)}
            className="h-[52px] bg-ivory text-[11px] font-medium uppercase tracking-[0.2em] text-ink disabled:bg-disabled disabled:text-stone-dark"
          >
            {pending ? "…" : redeeming ? "Confirmer" : "Annuler la coupe offerte"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Fidélité" className="flex flex-col gap-2 border border-line px-4 py-3.5">
      <span className="text-label uppercase tracking-[0.24em] text-gold">Fidélité</span>
      <span className="text-[14px] text-ivory">
        {panel.balance} / {panel.threshold} points
      </span>
      {panel.used ? (
        <>
          <p role="status" className="text-[14px] text-ivory">
            Coupe offerte utilisée{panel.discountCents ? ` · −${formatPrice(panel.discountCents)}` : ""}
          </p>
          {!panel.paid ? (
            <button type="button" onClick={() => setMode("cancel")} className="min-h-10 self-start text-[13px] text-ivory-soft underline underline-offset-4">
              Annuler la coupe offerte
            </button>
          ) : null}
        </>
      ) : panel.canRedeem ? (
        <button
          type="button"
          onClick={() => setMode("redeem")}
          className="h-[52px] border border-gold text-[11px] uppercase tracking-[0.2em] text-ivory"
        >
          Utiliser la coupe offerte
        </button>
      ) : panel.balance >= panel.threshold && !panel.paid && panel.eligibleCents === null ? (
        <p className="text-[13px] leading-normal text-stone">
          Coupe offerte acquise, mais aucune coupe ou coupe &amp; barbe dans ce rendez-vous.
        </p>
      ) : null}
    </section>
  );
}
