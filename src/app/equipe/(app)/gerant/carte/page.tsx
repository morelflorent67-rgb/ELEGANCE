import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { db } from "@/db/client";
import { listServicesForManager } from "@/modules/catalog/manage";
import { listActiveStaff } from "@/modules/staff";
import { ToHandleNotice } from "../../_components/to-handle-notice";
import { managerUnlocked, requireStaff } from "../../../_lib/session";
import { CarteManager } from "./carte-manager";

export const metadata: Metadata = { title: "Carte et tarifs · espace gérant" };

export default function CartePage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="px-6 py-10 text-body-sm text-stone">
          Chargement…
        </p>
      }
    >
      <Carte />
    </Suspense>
  );
}

async function Carte() {
  await connection();
  const user = await requireStaff();
  // R-73 : sans le code gérant, on revient à la saisie du code.
  if (!(await managerUnlocked(user))) redirect("/equipe/gerant");
  const [services, team] = await Promise.all([listServicesForManager(db()), listActiveStaff(db())]);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-7 py-7">
      <div className="mx-auto flex max-w-[980px] flex-col gap-6">
        <Link
          href="/equipe/gerant"
          className="inline-flex min-h-11 items-center self-start text-body-sm text-ivory-soft underline underline-offset-4"
        >
          Retour à l’espace gérant
        </Link>
        <div className="flex flex-col gap-1.5">
          <span className="text-label uppercase tracking-[0.3em] text-stone">Espace gérant</span>
          <h1 className="text-[30px] font-light leading-tight">Carte et tarifs</h1>
          <p className="max-w-[640px] text-[14px] leading-normal text-stone">
            Un changement de prix ou de durée vaut pour les prochaines réservations. Les rendez-vous
            déjà pris gardent leur prix et leur durée.
          </p>
        </div>
        <Suspense fallback={null}>
          <ToHandleNotice />
        </Suspense>
        <CarteManager
          services={services}
          team={team.map((m) => ({ id: m.id, firstName: m.firstName, role: m.role }))}
        />
      </div>
    </main>
  );
}
