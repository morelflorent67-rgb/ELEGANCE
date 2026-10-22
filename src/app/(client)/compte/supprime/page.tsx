import type { Metadata } from "next";
import Link from "next/link";
import { PanelBody, PanelHeader } from "@/components/client/panel";
import { cta } from "@/components/client/ui";

export const metadata: Metadata = { title: "Compte supprimé" };

// Page d'arrivée après la suppression du compte (R-75, D-43) : rien à lire en base, donc rien de personnel.
export default function CompteSupprimePage() {
  return (
    <>
      <PanelHeader label="Mon compte" />
      <PanelBody>
        <h1
          className="s-up font-display text-[40px] leading-[1.05]"
          style={{ animationDelay: "120ms" }}
        >
          Votre compte est supprimé.
        </h1>
        <p
          className="s-up text-[15px] leading-[1.6] text-ivory-soft"
          style={{ animationDelay: "180ms" }}
        >
          Vos coordonnées ont été effacées et vos rendez-vous à venir annulés. Merci d&rsquo;être
          passé chez Elegance Strasbourg : vous pouvez créer un nouveau compte quand vous le
          souhaitez.
        </p>
        <Link href="/" className={`s-up ${cta}`} style={{ animationDelay: "240ms" }}>
          Retour à l&rsquo;accueil
        </Link>
      </PanelBody>
    </>
  );
}
