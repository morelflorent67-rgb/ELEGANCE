import type { Metadata } from "next";
import Link from "next/link";
import { LedLine, Logo, btnPrimary } from "@/components/ui";

export const metadata: Metadata = { title: "Compte supprimé" };

// Page d'arrivée après la suppression du compte (R-75, D-43) : rien à lire en base, donc rien de personnel.
export default function CompteSupprimePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <Logo />
      <LedLine />
      <h1 className="text-title-1">Votre compte est supprimé</h1>
      <p className="text-body text-ivory-soft">
        Vos coordonnées ont été effacées et vos rendez-vous à venir annulés. Merci d&rsquo;être
        passé chez Elegance Strasbourg : vous pouvez créer un nouveau compte quand vous le
        souhaitez.
      </p>
      <Link href="/" className={btnPrimary}>
        Retour à l&rsquo;accueil
      </Link>
    </main>
  );
}
