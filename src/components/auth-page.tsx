import type { ReactNode } from "react";
import { PanelBody, PanelFrame, PanelHeader } from "./client/panel";

/** Gabarit des pages de compte (connexion, inscription, mot de passe) : le panneau client, ouvert sur l'accueil. */
export function AuthPage({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <PanelFrame>
      <PanelHeader label="Mon compte" />
      <PanelBody>
        <div className="flex flex-col gap-2.5">
          <h1
            className="s-up font-display text-[40px] leading-[1.05]"
            style={{ animationDelay: "120ms" }}
          >
            {title}
          </h1>
          {lead ? (
            <p
              className="s-up text-[14px] leading-[1.55] text-stone"
              style={{ animationDelay: "180ms" }}
            >
              {lead}
            </p>
          ) : null}
        </div>
        <div className="s-up" style={{ animationDelay: "230ms" }}>
          {children}
        </div>
        {footer ? (
          <div className="s-up flex items-center gap-3.5" style={{ animationDelay: "420ms" }}>
            <span className="h-px flex-1 bg-[rgb(239_233_221_/_0.12)]" />
            {footer}
            <span className="h-px flex-1 bg-[rgb(239_233_221_/_0.12)]" />
          </div>
        ) : null}
      </PanelBody>
    </PanelFrame>
  );
}
