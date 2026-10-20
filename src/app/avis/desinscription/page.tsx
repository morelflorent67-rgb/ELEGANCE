import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { z } from "zod";
import { LedLine, Logo, btnPrimary, btnSecondary } from "@/components/ui";
import { appSecret } from "@/lib/env";
import { reviewOptOutSubject, verifyToken } from "@/modules/security/token";
import { optOutReviewsAction } from "./actions";

export const metadata: Metadata = {
  title: "Invitations à un avis",
  robots: { index: false, follow: false },
};

// Page ouverte depuis l'email d'invitation à un avis (R-64) : lien signé, aucune connexion, aucune donnée personnelle
// affichée.
export default function ReviewOptOutPage(props: PageProps<"/avis/desinscription">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <Logo />
      <LedLine />
      <Suspense
        fallback={
          <p role="status" className="text-body-sm text-stone">
            Chargement…
          </p>
        }
      >
        <Content searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({
  searchParams,
}: {
  searchParams: PageProps<"/avis/desinscription">["searchParams"];
}) {
  await connection();
  const query = await searchParams;
  const id = z.uuid().safeParse(query.c);
  const token = typeof query.t === "string" ? query.t : "";
  const valid = id.success && verifyToken(appSecret(), reviewOptOutSubject(id.data), token);

  if (!valid) {
    return (
      <>
        <h1 className="text-title-1">Ce lien n’est plus valable</h1>
        <p className="text-body text-ivory-soft">
          Pour ne plus recevoir ces invitations, utilisez le lien de l’email le plus récent, ou
          appelez le salon.
        </p>
        <Link href="/" className={btnSecondary}>
          Retour à l’accueil
        </Link>
      </>
    );
  }

  if (query.fait === "1") {
    return (
      <>
        <h1 className="text-title-1">C’est noté</h1>
        <p className="text-body text-ivory-soft">
          Vous ne recevrez plus d’invitation à laisser un avis. Vos emails de rendez-vous
          (confirmation, rappel, modification) continuent d’arriver.
        </p>
        <Link href="/" className={btnSecondary}>
          Retour à l’accueil
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-title-1">Ne plus recevoir ces invitations ?</h1>
      <p className="text-body text-ivory-soft">
        Nous ne vous écrirons plus pour demander votre avis. Vos emails de rendez-vous continuent
        d’arriver.
      </p>
      <form action={optOutReviewsAction} className="flex w-full flex-col gap-3">
        <input type="hidden" name="c" value={id.data} />
        <input type="hidden" name="t" value={token} />
        <button type="submit" className={btnPrimary}>
          Ne plus recevoir
        </button>
        <Link href="/" className={btnSecondary}>
          Garder les invitations
        </Link>
      </form>
    </>
  );
}
