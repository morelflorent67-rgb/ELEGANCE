import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { z } from "zod";
import { db } from "@/db/client";
import { capitalize, formatDay, formatPrice, formatTime, parisDate } from "@/lib/format";
import { planningStatus } from "@/modules/appointments/status";
import { loadCustomerFile } from "@/modules/customers/staff-view";
import { requireStaff } from "../../../_lib/session";

export const metadata: Metadata = { title: "Fiche client" };

export default function ClientFilePage(props: PageProps<"/equipe/clients/[id]">) {
  return (
    <Suspense
      fallback={
        <p role="status" className="px-6 py-10 text-body-sm text-stone">
          Chargement…
        </p>
      }
    >
      <ClientFile params={props.params} />
    </Suspense>
  );
}

const STATUS_LABEL = {
  upcoming: "À venir",
  in_progress: "En cours",
  honored: "Honoré",
  no_show: "Lapin",
  cancelled: "Annulé",
} as const;

async function ClientFile({ params }: { params: PageProps<"/equipe/clients/[id]">["params"] }) {
  await connection();
  await requireStaff();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const file = await loadCustomerFile(db(), id.data);
  if (!file) notFound();

  const now = new Date();
  const upcoming = file.appointments
    .filter(
      (a) => planningStatus(a, now) === "upcoming" || planningStatus(a, now) === "in_progress",
    )
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = file.appointments.filter((a) => !upcoming.includes(a));

  const row = (a: (typeof file.appointments)[number]) => {
    const status = planningStatus(a, now);
    return (
      <li key={a.id}>
        <Link
          href={`/equipe?jour=${parisDate(a.startsAt)}&rdv=${a.id}`}
          className="flex min-h-16 items-center gap-4 border-b border-line-subtle py-2"
        >
          <span className="flex w-44 flex-col gap-0.5">
            <span className="text-[15px]">{capitalize(formatDay(a.startsAt))}</span>
            <span className="text-[13px] tabular-nums text-stone">{formatTime(a.startsAt)}</span>
          </span>
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-[15px]">{a.items.map((i) => i.name).join(" + ")}</span>
            <span className="text-[13px] text-stone">
              {formatPrice(a.totalPriceCents)} · avec {a.staffFirstName}
            </span>
          </span>
          <span
            className={`border px-2 py-1 text-[11px] uppercase tracking-[0.16em] ${
              status === "no_show" ? "border-brick text-brick" : "border-line-strong text-stone"
            }`}
          >
            {STATUS_LABEL[status]}
          </span>
        </Link>
      </li>
    );
  };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-7 py-7">
      <div className="mx-auto flex max-w-[820px] flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-label uppercase tracking-[0.3em] text-stone">Fiche client</span>
            <h1 className="text-[30px] font-light leading-tight">
              {file.firstName} {file.lastName}
            </h1>
            <a
              href={`tel:${file.phone.replace(/\s/g, "")}`}
              className="flex min-h-10 items-center text-[16px] tabular-nums"
            >
              {file.phone}
            </a>
            <span className="text-[14px] text-stone">{file.email}</span>
          </div>
          <div className="flex flex-col gap-2.5">
            <Link
              href={`/equipe/reserver?client=${file.id}`}
              className="flex h-12 items-center justify-center bg-ivory px-5 text-[12px] font-medium uppercase tracking-[0.22em] text-ink"
            >
              Réserver pour ce client
            </Link>
            <Link
              href={`/equipe/gerant/clients/${file.id}`}
              className="flex h-12 items-center justify-center border border-line-strong px-5 text-[11px] uppercase tracking-[0.2em]"
            >
              Fonctions gérant
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span
            className={`border px-2 py-1 text-[11px] uppercase tracking-[0.16em] ${
              file.noShowCount > 0 ? "border-brick text-brick" : "border-line-strong text-stone"
            }`}
          >
            {file.noShowCount === 0
              ? "Aucun lapin"
              : `${file.noShowCount} lapin${file.noShowCount > 1 ? "s" : ""}`}
          </span>
          {file.blocked ? (
            <span className="border border-brick px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-brick">
              Bloqué en ligne
            </span>
          ) : null}
        </div>

        <section aria-label="Rendez-vous à venir" className="flex flex-col">
          <h2 className="border-b border-line pb-2 text-label uppercase tracking-[0.3em] text-stone">
            À venir
          </h2>
          {upcoming.length > 0 ? (
            <ul>{upcoming.map(row)}</ul>
          ) : (
            <p className="py-4 text-[14px] text-stone">Aucun rendez-vous à venir.</p>
          )}
        </section>

        <section aria-label="Rendez-vous passés" className="flex flex-col">
          <h2 className="border-b border-line pb-2 text-label uppercase tracking-[0.3em] text-stone">
            Historique
          </h2>
          {past.length > 0 ? (
            <ul>{past.slice(0, 30).map(row)}</ul>
          ) : (
            <p className="py-4 text-[14px] text-stone">Aucun rendez-vous passé.</p>
          )}
        </section>
      </div>
    </main>
  );
}
