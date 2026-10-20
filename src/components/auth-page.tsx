import type { ReactNode } from "react";
import { Eyebrow, LedLine, PageHeader } from "./ui";

/** Gabarit des pages de compte : en-tête, titre, filet de lumière, contenu. Une colonne, 480 px au plus. */
export function AuthPage({
  backHref = "/",
  title,
  lead,
  children,
  footer,
}: {
  backHref?: string;
  title: string;
  lead?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <PageHeader backHref={backHref} />
      <main className="mx-auto flex w-full max-w-[480px] flex-col gap-7 px-6 pb-12 pt-8">
        <div className="flex flex-col gap-3">
          <Eyebrow>Mon compte</Eyebrow>
          <h1 className="text-title-1">{title}</h1>
          {lead ? <p className="text-body text-ivory-soft">{lead}</p> : null}
        </div>
        <LedLine />
        {children}
        {footer ? (
          <div className="flex flex-col gap-3.5 border-t border-line-subtle pt-6">{footer}</div>
        ) : null}
      </main>
    </div>
  );
}
