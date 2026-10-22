import Link from "next/link";
import type { ReactNode } from "react";
import { AgendaIcon, ArrowLeft, CloseIcon, Mark } from "./ui";

/**
 * Le panneau de l'interface client (« Mes rendez-vous », « Mon compte », connexion ; maquette « Lot12-MesRdv ») :
 * il monte du bas, l'accueil recule derrière lui. Chaque page a son adresse (les liens des emails y mènent) ; le
 * gabarit de /compte garde le panneau ouvert d'une page à l'autre.
 */
export function PanelFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#050404]">
      <HomeBackdrop />
      <Link
        href="/"
        aria-hidden="true"
        tabIndex={-1}
        className="p-scrim fixed inset-0 bg-[rgb(5_4_4_/_0.6)]"
      />
      <div className="p-sheet fixed inset-x-0 bottom-0 top-[52px] mx-auto flex w-full max-w-[430px] flex-col bg-[#11100e]">
        <span
          aria-hidden="true"
          className="absolute inset-x-0 -top-px h-px bg-[rgb(239_233_221_/_0.1)]"
        />
        <span
          aria-hidden="true"
          className="p-edge absolute inset-x-0 -top-px h-px shadow-[0_0_10px_rgb(255_255_255_/_0.35)]"
          style={{
            background:
              "linear-gradient(90deg, rgb(239 233 221 / 0) 0%, rgb(239 233 221 / 0.9) 50%, rgb(239 233 221 / 0) 100%)",
          }}
        />
        <Link
          href="/"
          aria-label="Fermer le panneau"
          className="flex h-[18px] w-16 shrink-0 items-center justify-center self-center pt-2.5"
        >
          <span className="h-px w-10 bg-[rgb(239_233_221_/_0.45)]" />
        </Link>
        {children}
      </div>
    </div>
  );
}

/** La ligne du haut du panneau : son nom (ou un retour) et la croix qui le ferme. */
export function PanelHeader({
  label,
  back,
}: {
  label?: string;
  back?: { href: string; label: string };
}) {
  return (
    <header className="flex min-h-12 shrink-0 items-center justify-between gap-2.5 pl-6 pr-3.5 pt-1.5">
      {back ? (
        <Link
          href={back.href}
          className="-ml-1.5 flex min-h-11 items-center gap-2.5 px-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-ivory-soft"
        >
          <ArrowLeft color="#c9c3b7" />
          {back.label}
        </Link>
      ) : (
        <span className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-ivory-soft">
          <Mark />
          {label}
        </span>
      )}
      <Link href="/" aria-label="Fermer" className="flex h-11 w-11 items-center justify-center">
        <CloseIcon />
      </Link>
    </header>
  );
}

/** Le contenu du panneau, qui défile ; chaque page y entre en glissant (450 ms). */
export function PanelBody({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-0 flex-1 overflow-y-auto">
      <div className="p-pane p-in flex flex-col gap-[22px] px-6 pb-10 pt-3.5">{children}</div>
    </main>
  );
}

/** L'accueil, figé derrière le panneau (décor seulement). */
function HomeBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="p-back pointer-events-none fixed inset-x-0 top-0 mx-auto h-dvh w-full max-w-[430px] bg-[#0a0908]"
    >
      <div className="absolute left-6 right-3.5 top-[18px] flex h-11 items-center justify-between">
        <span className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.3em] text-ivory-soft">
          <Mark />
          Elegance
        </span>
        <AgendaIcon />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- décor */}
      <img
        src="/logo/elegance-logo-ivoire.svg"
        alt=""
        width={252}
        height={48}
        className="absolute left-1/2 top-[152px] -ml-[126px] w-[252px] drop-shadow-[0_0_10px_rgb(239_233_221_/_0.35)]"
      />
      <div className="absolute inset-x-6 top-[278px] text-center font-display text-[46px] leading-[1.08]">
        Bien plus
        <br />
        qu&rsquo;une coupe.
      </div>
    </div>
  );
}
