"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { teamMessage } from "../../../_lib/messages";
import { setLoyaltyEnabledAction } from "../../../actions";

/** Programme de fidélité (D-114) : actif ou arrêté. Les points par prestation se règlent dans chaque prestation. */
export function LoyaltyToggle({ enabled, threshold }: { enabled: boolean; threshold: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = () =>
    startTransition(async () => {
      setError(null);
      const result = await setLoyaltyEnabledAction({ enabled: !enabled });
      if (!result.ok) {
        if (result.error === "manager_locked") return router.push("/equipe/gerant");
        return setError(teamMessage(result.error));
      }
      router.refresh();
    });

  return (
    <section aria-label="Programme de fidélité" className="flex flex-col gap-3 border border-line p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[16px]">Carte de fidélité</span>
          <span className="text-[13px] leading-normal text-stone">
            {threshold} points = une coupe offerte. Chaque prestation rapporte ses points (réglage dans
            « Modifier »).
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Programme de fidélité"
          disabled={pending}
          onClick={toggle}
          className={`h-12 min-w-24 border px-4 text-[11px] uppercase tracking-[0.2em] ${
            enabled ? "border-ivory bg-ivory text-ink" : "border-line-strong"
          }`}
        >
          {enabled ? "Actif" : "Arrêté"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="border border-brick p-3 text-[13px]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
