"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Seconde feuille de l'interface client (annuler un RDV, supprimer le compte ; maquette « Lot12-Rdv-3-Annuler ») :
 * elle monte du bas, filet doré en haut. L'élément <dialog> garde le focus dans la feuille et Échap la ferme.
 */
export function ClientSheet({
  open,
  onClose,
  titleId,
  role = "dialog",
  children,
}: {
  open: boolean;
  onClose: () => void;
  titleId: string;
  role?: "dialog" | "alertdialog";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      role={role}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // Un toucher sur le voile (et non sur le contenu) ferme la feuille.
        if (event.target === ref.current) onClose();
      }}
      className="client mx-auto mb-0 mt-auto w-full max-w-[430px] border-0 border-t border-[rgb(184_147_90_/_0.6)] bg-[#171512] p-0 text-ivory backdrop:bg-[rgb(5_4_4_/_0.7)] open:animate-sheet-up"
    >
      {open ? (
        <div className="flex flex-col gap-[18px] px-6 pb-[26px] pt-2.5">
          <span
            aria-hidden="true"
            className="mb-0.5 mt-1 h-px w-10 self-center bg-[rgb(239_233_221_/_0.45)]"
          />
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
