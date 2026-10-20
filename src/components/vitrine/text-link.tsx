import Link from "next/link";
import type { ReactNode } from "react";

/** Lien discret « Voir les 10 prestations ——— » : capitales et filet doré. */
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex min-h-11 items-center gap-3 self-start text-button-sm uppercase text-ivory transition-colors hover:text-gold"
    >
      {children}
      <span className="h-px w-8 bg-gold" aria-hidden="true" />
    </Link>
  );
}
