import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DateTime } from "luxon";
import { db } from "@/db/client";
import { loadSettings } from "@/modules/availability";
import { listClosures, loadWeekHours } from "@/modules/schedule/manage";
import { ToHandleNotice } from "../../_components/to-handle-notice";
import { managerUnlocked, requireStaff } from "../../../_lib/session";
import { HorairesManager } from "./horaires-manager";

export const metadata: Metadata = { title: "Horaires et fermetures · espace gérant" };

export default function HorairesPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="px-6 py-10 text-body-sm text-stone">
          Chargement…
        </p>
      }
    >
      <Horaires />
    </Suspense>
  );
}

async function Horaires() {
  await connection();
  const user = await requireStaff();
  // R-73 : sans le code gérant, on revient à la saisie du code.
  if (!(await managerUnlocked(user))) redirect("/equipe/gerant");
  const now = new Date();
  const settings = await loadSettings(db());
  const [week, closures] = await Promise.all([loadWeekHours(db()), listClosures(db(), now)]);
  const today = DateTime.fromJSDate(now, { zone: settings.timezone }).toISODate()!;

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
          <h1 className="text-[30px] font-light leading-tight">Horaires et fermetures</h1>
          <p className="max-w-[640px] text-[14px] leading-normal text-stone">
            Les horaires valent pour toute l’équipe. Le trou entre deux plages est la pause : aucun
            rendez-vous ne la chevauche. Les rendez-vous déjà pris ne bougent pas.
          </p>
        </div>
        <Suspense fallback={null}>
          <ToHandleNotice />
        </Suspense>
        <HorairesManager week={week} closures={closures} today={today} />
      </div>
    </main>
  );
}
