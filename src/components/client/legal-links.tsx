import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, Mark } from "./ui";

/** Les pages légales, en liens discrets (D-72). */
export function LegalLinks() {
  const link =
    "flex min-h-11 items-center text-[12px] text-stone-dark no-underline hover:text-ivory-soft";
  return (
    <>
      <Link href="/mentions-legales" className={link}>
        Mentions légales
      </Link>
      <Link href="/confidentialite" className={link}>
        Confidentialité
      </Link>
      <Link href="/conditions" className={link}>
        Conditions
      </Link>
    </>
  );
}

/** En-tête des pages secondaires : retour, titre court au centre, place pour une action à droite. */
export function ClientHeader({
  backHref = "/",
  backLabel = "Retour à l'accueil",
  title,
  sub,
  right,
}: {
  backHref?: string;
  backLabel?: string;
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex h-[60px] shrink-0 items-center justify-between px-2.5">
      <Link
        href={backHref}
        aria-label={backLabel}
        className="flex h-11 w-11 items-center justify-center"
      >
        <ArrowLeft />
      </Link>
      <div className="flex flex-col items-center gap-[3px]">
        <span className="flex items-center gap-[9px] text-[10px] font-semibold uppercase tracking-[0.3em] text-ivory-soft">
          <Mark size={7} />
          {title}
        </span>
        {sub ? <span className="text-[11px] tabular-nums text-stone-dark">{sub}</span> : null}
      </div>
      {right ?? <span className="w-11" />}
    </header>
  );
}
