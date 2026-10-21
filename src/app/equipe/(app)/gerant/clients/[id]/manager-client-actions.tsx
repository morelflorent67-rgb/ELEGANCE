"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sheet } from "@/components/sheet";
import type { SameCustomer } from "@/modules/customers/salon-customers";
import { teamMessage } from "../../../../_lib/messages";
import {
  deleteCustomerAction,
  mergeCustomersAction,
  setCustomerBlockedAction,
} from "../../../../actions";

const ghost =
  "flex h-[52px] items-center justify-center border border-line-strong px-6 text-[11px] uppercase tracking-[0.2em] hover:bg-graphite-light";

/**
 * Lapins (R-52), blocage de la réservation en ligne (D-35), fusion des fiches au même numéro (D-79) et suppression de
 * la fiche (R-75) : réservés au gérant.
 */
export function ManagerClientActions({
  customerId,
  name,
  noShowCount,
  threshold,
  blocked,
  canBlock,
  upcoming,
  hasAccount,
  samePhone,
}: {
  customerId: string;
  name: string;
  noShowCount: number;
  threshold: number;
  blocked: boolean;
  canBlock: boolean;
  upcoming: number;
  hasAccount: boolean;
  samePhone: SameCustomer[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [merging, setMerging] = useState<SameCustomer | null>(null);

  const merge = (other: SameCustomer) => {
    setError(null);
    startTransition(async () => {
      const result = await mergeCustomersAction({ keepId: customerId, mergeId: other.id });
      setMerging(null);
      if (!result.ok) {
        setError(teamMessage(result.error));
        if (result.error === "manager_locked") router.push("/equipe/gerant");
        return;
      }
      if (result.keptId === customerId) router.refresh();
      else router.push(`/equipe/gerant/clients/${result.keptId}`);
    });
  };

  const setBlocked = (next: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await setCustomerBlockedAction({ customerId, blocked: next });
      if (!result.ok) {
        setError(teamMessage(result.error));
        if (result.error === "manager_locked") router.push("/equipe/gerant");
        return;
      }
      router.refresh();
    });
  };

  const remove = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteCustomerAction({ customerId });
      if (!result.ok) {
        setConfirming(false);
        setError(teamMessage(result.error));
        if (result.error === "manager_locked") router.push("/equipe/gerant");
        return;
      }
      router.push(`/equipe/gerant?supprime=${result.cancelled}`);
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p role="alert" className="border border-brick p-4 text-[14px] leading-normal">
          {error}
        </p>
      ) : null}

      <section
        aria-label="Lapins et blocage"
        className="flex flex-col gap-4 border border-line p-5"
      >
        <h2 className="text-[20px] font-light">Lapins et réservation en ligne</h2>
        <p className="text-[15px] leading-normal">
          <span className={noShowCount > 0 ? "text-brick" : ""}>
            {noShowCount === 0
              ? "Aucun lapin."
              : `${noShowCount} lapin${noShowCount > 1 ? "s" : ""}.`}
          </span>{" "}
          {blocked
            ? "La réservation en ligne de ce client est bloquée : il voit « Appelez le salon »."
            : canBlock
              ? "Vous pouvez bloquer sa réservation en ligne. Le salon pourra toujours réserver pour lui."
              : `Le blocage n’est possible qu’à partir de ${threshold} lapins.`}
        </p>
        {blocked ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => setBlocked(false)}
            className={ghost}
          >
            Débloquer la réservation en ligne
          </button>
        ) : (
          <button
            type="button"
            disabled={pending || !canBlock}
            onClick={() => setBlocked(true)}
            className={`${ghost} border-brick text-brick disabled:border-line disabled:text-stone-dark disabled:hover:bg-transparent`}
          >
            Bloquer la réservation en ligne
          </button>
        )}
      </section>

      {samePhone.length > 0 ? (
        <section aria-label="Fusion" className="flex flex-col gap-4 border border-line p-5">
          <h2 className="text-[20px] font-light">Fiches au même numéro</h2>
          <p className="text-[14px] leading-normal text-stone">
            Si c’est la même personne, fusionnez : les rendez-vous passent sur une seule fiche, qui
            complète ses informations manquantes. La fiche qui a un compte est toujours celle qui
            reste. Une famille qui partage un numéro garde ses fiches séparées.
          </p>
          <ul className="flex flex-col gap-2.5">
            {samePhone.map((other) => (
              <li key={other.id} className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[15px]">
                  {other.name}
                  <span className="text-stone">
                    {other.hasAccount ? " · avec compte" : " · sans compte"}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={pending || (hasAccount && other.hasAccount)}
                  onClick={() => setMerging(other)}
                  className={`${ghost} disabled:text-stone-dark disabled:hover:bg-transparent`}
                >
                  Fusionner
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Suppression" className="flex flex-col gap-4 border border-line p-5">
        <h2 className="text-[20px] font-light">Supprimer la fiche</h2>
        <p className="text-[14px] leading-normal text-stone">
          Efface le nom, le téléphone et l’email, et supprime son compte. Les rendez-vous passés
          sont gardés sans identité.{" "}
          {upcoming > 0 ? `Ses ${upcoming} rendez-vous à venir seront annulés, sans email.` : ""}
        </p>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={`${ghost} border-brick text-brick`}
        >
          Supprimer la fiche
        </button>
      </section>

      <Sheet open={!!merging} onClose={() => setMerging(null)} titleId="merge-title">
        <h2 id="merge-title" className="text-title-3">
          Fusionner {name} et {merging?.name} ?
        </h2>
        <p className="text-body-sm leading-normal text-ivory-soft">
          Une seule fiche restera, avec tous les rendez-vous des deux. C’est définitif.
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" onClick={() => setMerging(null)} className={ghost}>
            Retour
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => merging && merge(merging)}
            className="flex h-[52px] items-center justify-center bg-ivory px-6 text-[11px] font-medium uppercase tracking-[0.2em] text-ink"
          >
            {pending ? "…" : "Fusionner"}
          </button>
        </div>
      </Sheet>

      <Sheet open={confirming} onClose={() => setConfirming(false)} titleId="delete-title">
        <h2 id="delete-title" className="text-title-3">
          Supprimer la fiche de {name} ?
        </h2>
        <p className="text-body-sm leading-normal text-ivory-soft">
          C’est définitif.{" "}
          {upcoming > 0
            ? `${upcoming} rendez-vous à venir seront annulés sans email : appelez le client avant. `
            : ""}
          Les rendez-vous passés restent dans les chiffres, sans son nom.
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" onClick={() => setConfirming(false)} className={ghost}>
            Retour
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="flex h-[52px] items-center justify-center border border-brick px-6 text-[11px] font-medium uppercase tracking-[0.2em] text-brick"
          >
            {pending ? "…" : "Supprimer"}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
