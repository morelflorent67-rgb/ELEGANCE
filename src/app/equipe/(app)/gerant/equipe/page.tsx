import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { db } from "@/db/client";
import { listStaffForManager } from "@/modules/staff/manage";
import { ToHandleNotice } from "../../_components/to-handle-notice";
import { managerUnlocked, requireStaff } from "../../../_lib/session";
import { EquipeManager } from "./equipe-manager";

export const metadata: Metadata = { title: "Équipe · espace gérant" };

export default function EquipePage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="px-6 py-10 text-body-sm text-stone">
          Chargement…
        </p>
      }
    >
      <Equipe />
    </Suspense>
  );
}

async function Equipe() {
  await connection();
  const user = await requireStaff();
  // R-73 : sans le code gérant, on revient à la saisie du code.
  if (!(await managerUnlocked(user))) redirect("/equipe/gerant");
  const members = await listStaffForManager(db());

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
          <h1 className="text-[30px] font-light leading-tight">Équipe et habilitations</h1>
          <p className="max-w-[640px] text-[14px] leading-normal text-stone">
            L’ordre ci-dessous est celui des colonnes du planning. À égalité de rendez-vous,
            « Sans préférence » choisit le premier de la liste. Qui réalise quelle prestation se
            règle dans{" "}
            <Link href="/equipe/gerant/carte" className="underline underline-offset-4">
              Carte et tarifs
            </Link>
            .
          </p>
        </div>
        <Suspense fallback={null}>
          <ToHandleNotice />
        </Suspense>
        <EquipeManager members={members} />
      </div>
    </main>
  );
}
