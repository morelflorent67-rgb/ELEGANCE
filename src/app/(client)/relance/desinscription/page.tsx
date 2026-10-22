import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { z } from "zod";
import { cta as btnPrimary, ghost as btnSecondary } from "@/components/client/ui";
import { appSecret } from "@/lib/env";
import { winbackOptOutSubject, verifyToken } from "@/modules/security/token";
import { optOutWinbackAction } from "./actions";

export const metadata: Metadata = {
  title: "Messages du salon",
  robots: { index: false, follow: false },
};

// Page ouverte depuis l'email « Nous serions ravis de vous revoir » (R-88) : lien signé, aucune connexion, aucune donnée personnelle
// affichée.
export default function WinbackOptOutPage(props: PageProps<"/relance/desinscription">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- logo SVG */}
      <img
        src="/logo/elegance-logo-ivoire.svg"
        alt="Elegance Strasbourg"
        width={200}
        height={38}
        className="w-[200px]"
      />
      <span
        aria-hidden="true"
        className="h-px w-[220px] bg-led shadow-[0_0_10px_1px_rgb(255_255_255_/_0.45)]"
      />
      <Suspense
        fallback={
          <p role="status" className="text-[14px] text-stone">
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
  searchParams: PageProps<"/relance/desinscription">["searchParams"];
}) {
  await connection();
  const query = await searchParams;
  const id = z.uuid().safeParse(query.c);
  const token = typeof query.t === "string" ? query.t : "";
  const valid = id.success && verifyToken(appSecret(), winbackOptOutSubject(id.data), token);

  if (!valid) {
    return (
      <>
        <h1 className="font-display text-[40px] leading-[1.05]">Ce lien n’est plus valable</h1>
        <p className="text-[15px] leading-[1.6] text-ivory-soft">
          Pour ne plus recevoir ces messages, utilisez le lien de l’email le plus récent, ou
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
        <h1 className="font-display text-[40px] leading-[1.05]">C’est noté</h1>
        <p className="text-[15px] leading-[1.6] text-ivory-soft">
          Vous ne recevrez plus de message pour vous inviter à revenir. Vos emails de rendez-vous
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
      <h1 className="font-display text-[40px] leading-[1.05]">
        Ne plus recevoir ces invitations ?
      </h1>
      <p className="text-[15px] leading-[1.6] text-ivory-soft">
        Nous ne vous écrirons plus pour vous inviter à revenir. Vos emails de rendez-vous continuent
        d’arriver.
      </p>
      <form action={optOutWinbackAction} className="flex w-full flex-col gap-3">
        <input type="hidden" name="c" value={id.data} />
        <input type="hidden" name="t" value={token} />
        <button type="submit" className={btnPrimary}>
          Ne plus recevoir
        </button>
        <Link href="/" className={btnSecondary}>
          Garder ces messages
        </Link>
      </form>
    </>
  );
}
