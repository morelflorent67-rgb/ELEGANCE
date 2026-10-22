import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { db } from "@/db/client";
import { listFlaggedCustomers } from "@/modules/customers/staff-view";
import { loadSettings } from "@/modules/availability";
import { managerUnlocked, requireStaff } from "../../_lib/session";
import { ToHandleNotice } from "../_components/to-handle-notice";
import { ManagerGate } from "./manager-gate";
import { CustomerFinder, LockButton } from "./manager-tools";

export const metadata: Metadata = { title: "Espace gérant" };

export default function ManagerPage(props: PageProps<"/equipe/gerant">) {
  return (
    <Suspense
      fallback={
        <p role="status" className="px-6 py-10 text-body-sm text-stone">
          Chargement…
        </p>
      }
    >
      <Manager searchParams={props.searchParams} />
    </Suspense>
  );
}

/** Les fonctions du gérant : un lien quand l'écran existe, sinon « Bientôt ». */
const TOOLS: { label: string; href?: string }[] = [
  { label: "Carte et tarifs", href: "/equipe/gerant/carte" },
  { label: "Équipe et habilitations", href: "/equipe/gerant/equipe" },
  { label: "Horaires et fermetures", href: "/equipe/gerant/horaires" },
  { label: "Bilan et chiffre d’affaires", href: "/equipe/gerant/bilan" },
  { label: "Terminal d’encaissement", href: "/equipe/gerant/terminal" },
];

async function Manager({
  searchParams,
}: {
  searchParams: PageProps<"/equipe/gerant">["searchParams"];
}) {
  await connection();
  const user = await requireStaff();
  // R-73 : sans le code gérant, rien de l'espace gérant n'est lu ni affiché.
  if (!(await managerUnlocked(user))) return <ManagerGate />;

  const query = await searchParams;
  const deleted = Number(query.supprime);
  const [flagged, settings] = await Promise.all([listFlaggedCustomers(db()), loadSettings(db())]);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-7 py-7">
      <div className="mx-auto flex max-w-[820px] flex-col gap-7">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-label uppercase tracking-[0.3em] text-stone">Espace gérant</span>
            <h1 className="text-[30px] font-light leading-tight">Gérer le salon</h1>
          </div>
          <LockButton />
        </div>

        {Number.isInteger(deleted) && query.supprime !== undefined ? (
          <p role="status" className="border border-line-strong p-4 text-[14px] leading-normal">
            Fiche client supprimée.
            {deleted > 0
              ? ` ${deleted} rendez-vous à venir ${deleted > 1 ? "ont été annulés" : "a été annulé"} sans email : appelez le client si besoin.`
              : ""}
          </p>
        ) : null}

        <Suspense fallback={null}>
          <ToHandleNotice />
        </Suspense>

        <section aria-label="Clients" className="flex flex-col gap-4">
          <h2 className="border-b border-line pb-2 text-label uppercase tracking-[0.3em] text-stone">
            Clients
          </h2>
          <CustomerFinder />
          <div className="flex flex-col">
            <h3 className="pb-1 pt-2 text-[15px]">À surveiller</h3>
            <p className="pb-3 text-[13px] leading-normal text-stone">
              Clients qui ont {settings.noShowBlockThreshold} lapins ou plus, ou que vous avez déjà
              bloqués. À partir de ce seuil, vous pouvez bloquer leur réservation en ligne.
            </p>
            {flagged.length === 0 ? (
              <p className="text-[14px] text-stone">Aucun client à surveiller.</p>
            ) : (
              <ul className="border-t border-line-subtle">
                {flagged.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/equipe/gerant/clients/${c.id}`}
                      className="flex min-h-16 items-center gap-4 border-b border-line-subtle"
                    >
                      <span className="flex-1 text-[16px]">{c.name}</span>
                      <span className="text-[13px] text-brick">
                        {c.noShowCount} lapin{c.noShowCount > 1 ? "s" : ""}
                      </span>
                      {c.blocked ? (
                        <span className="border border-brick px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-brick">
                          Bloqué en ligne
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section aria-label="Gestion du salon" className="flex flex-col gap-3">
          <h2 className="border-b border-line pb-2 text-label uppercase tracking-[0.3em] text-stone">
            Gestion du salon
          </h2>
          <ul className="grid grid-cols-2 gap-2.5">
            {TOOLS.map(({ label, href }) => (
              <li key={label}>
                {href ? (
                  <Link
                    href={href}
                    className="flex h-14 items-center justify-between border border-line-strong px-4 text-[14px] hover:bg-graphite-light"
                  >
                    {label}
                    <span aria-hidden="true" className="text-gold">
                      →
                    </span>
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    title="Bientôt disponible"
                    className="flex h-14 items-center border border-line px-4 text-[14px] text-stone-dark"
                  >
                    {label}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
