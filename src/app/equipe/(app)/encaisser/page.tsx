import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { db } from "@/db/client";
import { loadCatalog } from "@/modules/catalog";
import { listActiveStaff } from "@/modules/staff";
import { requireStaff } from "../../_lib/session";
import { WalkInPayment } from "./walk-in-payment";

export const metadata: Metadata = { title: "Encaisser" };

export default function EncaisserPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="px-6 py-10 text-body-sm text-stone">
          Chargement…
        </p>
      }
    >
      <Encaisser />
    </Suspense>
  );
}

async function Encaisser() {
  await connection();
  await requireStaff();
  const database = db();
  const [catalog, team] = await Promise.all([loadCatalog(database), listActiveStaff(database)]);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-5 py-6 lg:px-7">
      <div className="mx-auto flex max-w-[980px] flex-col gap-5">
        <Link
          href="/equipe"
          className="inline-flex min-h-11 items-center self-start text-body-sm text-ivory-soft underline underline-offset-4"
        >
          Retour au planning
        </Link>
        <div className="flex flex-col gap-1.5">
          <span className="text-label uppercase tracking-[0.3em] text-stone">Hors rendez-vous</span>
          <h1 className="text-[30px] font-light leading-tight">Encaisser</h1>
          <p className="max-w-[640px] text-[14px] leading-normal text-stone">
            Pour un passage sans rendez-vous, un produit ou un supplément. Pour un rendez-vous, ouvrez
            sa fiche dans le planning.
          </p>
        </div>
        <WalkInPayment
          services={catalog
            .filter((s) => s.priceCents > 0)
            .map((s) => ({ id: s.id, name: s.name, priceCents: s.priceCents }))}
          team={team.map((m) => ({ id: m.id, firstName: m.firstName }))}
        />
      </div>
    </main>
  );
}
