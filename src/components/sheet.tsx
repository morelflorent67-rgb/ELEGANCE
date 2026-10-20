"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Feuille modale du design : montée du bas sur mobile, centrée sur tablette. Elle s'appuie sur l'élément <dialog> :
 * le focus reste dans la feuille, Échap la ferme, et le reste de la page n'est plus atteignable au clavier.
 */
export function Sheet({
  open,
  onClose,
  titleId,
  children,
}: {
  open: boolean;
  onClose: () => void;
  titleId: string;
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
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // Un clic sur le voile (et non sur le contenu) ferme la feuille.
        if (event.target === ref.current) onClose();
      }}
      className="m-0 mt-auto w-full max-w-none border-t border-line bg-charcoal p-0 text-ivory backdrop:bg-ink/80 open:animate-sheet-up md:m-auto md:max-w-[520px] md:border"
    >
      {open ? (
        <div className="flex flex-col gap-5 px-6 pb-7 pt-3">
          <div className="h-[3px] w-10 self-center bg-line-strong" aria-hidden="true" />
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
