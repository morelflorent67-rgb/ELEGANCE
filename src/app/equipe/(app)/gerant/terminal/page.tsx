import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { db } from "@/db/client";
import { getTerminalStatus } from "@/modules/payments";
import { paymentProviderFromEnv } from "@/modules/payments/from-env";
import { managerUnlocked, requireStaff } from "../../../_lib/session";
import { TerminalManager } from "./terminal-manager";

export const metadata: Metadata = { title: "Terminal d’encaissement · espace gérant" };

export default function TerminalPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="px-6 py-10 text-body-sm text-stone">
          Chargement…
        </p>
      }
    >
      <Terminal />
    </Suspense>
  );
}

async function Terminal() {
  await connection();
  const user = await requireStaff();
  // R-73 : sans le code gérant, on revient à la saisie du code.
  if (!(await managerUnlocked(user))) redirect("/equipe/gerant");
  const status = await getTerminalStatus(db());

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-7 py-7">
      <div className="mx-auto flex max-w-[820px] flex-col gap-6">
        <Link
          href="/equipe/gerant"
          className="inline-flex min-h-11 items-center self-start text-body-sm text-ivory-soft underline underline-offset-4"
        >
          Retour à l’espace gérant
        </Link>
        <div className="flex flex-col gap-1.5">
          <span className="text-label uppercase tracking-[0.3em] text-stone">Espace gérant</span>
          <h1 className="text-[30px] font-light leading-tight">Terminal d’encaissement</h1>
          <p className="max-w-[640px] text-[14px] leading-normal text-stone">
            Le bouton « Encaisser » de la fiche rendez-vous envoie le montant au terminal SumUp Solo
            du salon. Le terminal se relie une fois, avec le code marchand du compte SumUp et le code
            affiché sur son écran.
          </p>
        </div>
        <TerminalManager
          keyAvailable={paymentProviderFromEnv() !== null}
          configured={status.configured}
          merchantCode={status.merchantCode}
        />
      </div>
    </main>
  );
}
