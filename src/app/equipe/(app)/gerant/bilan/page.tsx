import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { db } from "@/db/client";
import { capitalize, formatDayShort, formatPrice, formatTime, parisDate } from "@/lib/format";
import { loadDashboard, type DashboardView, type PeriodKind } from "@/modules/dashboard";
import { managerUnlocked, requireStaff } from "../../../_lib/session";
import { ToHandleNotice } from "../../_components/to-handle-notice";
import { ManagerGate } from "../manager-gate";

export const metadata: Metadata = { title: "Bilan · espace gérant" };

// Le tableau de bord (R-53 à R-55), derrière le code gérant (R-73) : le chiffre d'affaires est une fonction gérant.
// La page vit dans /equipe/gerant pour partager le verrouillage de l'espace (D-53).

const PERIODS: { kind: PeriodKind; param: string; label: string }[] = [
  { kind: "day", param: "jour", label: "Aujourd’hui" },
  { kind: "week", param: "semaine", label: "Semaine" },
  { kind: "month", param: "mois", label: "Mois" },
];

const ROLE_LABEL = { barber: "Coiffeur", apprentice: "Apprenti" } as const;

export default function BilanPage(props: PageProps<"/equipe/gerant/bilan">) {
  return (
    <Suspense
      fallback={
        <p role="status" className="px-6 py-10 text-body-sm text-stone">
          Chargement…
        </p>
      }
    >
      <Bilan searchParams={props.searchParams} />
    </Suspense>
  );
}

const href = (param: string, date?: string) =>
  `/equipe/gerant/bilan?periode=${param}${date ? `&date=${date}` : ""}`;

async function Bilan({
  searchParams,
}: {
  searchParams: PageProps<"/equipe/gerant/bilan">["searchParams"];
}) {
  await connection();
  const user = await requireStaff();
  // R-73 : sans le code gérant, rien du bilan n'est lu ni affiché.
  if (!(await managerUnlocked(user))) return <ManagerGate />;

  const query = await searchParams;
  const chosen = PERIODS.find((p) => p.param === query.periode) ?? PERIODS[0];
  const date = typeof query.date === "string" ? query.date : undefined;
  const now = new Date();
  const view = await loadDashboard(db(), { kind: chosen.kind, date }, now);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8 md:py-7">
      <div className="mx-auto flex max-w-[1040px] flex-col gap-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-1.5">
            <span className="text-label uppercase tracking-[0.3em] text-stone">
              Tableau de bord
            </span>
            <h1 className="text-[26px] font-light leading-tight">{view.period.title}</h1>
            <PeriodNav param={chosen.param} view={view} />
          </div>
          <nav aria-label="Période" className="flex gap-1.5">
            {PERIODS.map((p) => {
              const on = p.kind === chosen.kind;
              return (
                <Link
                  key={p.kind}
                  href={href(p.param)}
                  aria-current={on ? "page" : undefined}
                  className={`flex h-12 items-center border px-[18px] text-[14px] ${
                    on
                      ? "border-ivory bg-ivory text-ink"
                      : "border-line-strong text-ivory hover:bg-graphite-light"
                  }`}
                >
                  {p.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <Suspense fallback={null}>
          <ToHandleNotice />
        </Suspense>

        <Cards view={view} />

        <div className="grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:gap-8">
          <PerStaff view={view} />
          <RecentNoShows view={view} now={now} />
        </div>
      </div>
    </main>
  );
}

function PeriodNav({ param, view }: { param: string; view: DashboardView }) {
  const { period } = view;
  const arrow =
    "flex h-11 min-w-11 items-center justify-center border border-line-strong px-3 text-[13px] text-ivory hover:bg-graphite-light";
  return (
    <div className="flex items-center gap-2 pt-1.5">
      <Link href={href(param, period.prevDate)} className={arrow} aria-label="Période précédente">
        <span aria-hidden="true">←</span>
        <span className="pl-2">Précédent</span>
      </Link>
      {period.nextDate ? (
        <Link href={href(param, period.nextDate)} className={arrow} aria-label="Période suivante">
          <span className="pr-2">Suivant</span>
          <span aria-hidden="true">→</span>
        </Link>
      ) : (
        <span
          aria-disabled="true"
          className="flex h-11 min-w-11 items-center justify-center border border-line px-3 text-[13px] text-stone-dark"
        >
          <span className="pr-2">Suivant</span>
          <span aria-hidden="true">→</span>
        </span>
      )}
    </div>
  );
}

function Cards({ view }: { view: DashboardView }) {
  const { totals } = view;
  const card = "flex flex-col gap-2 bg-graphite p-6";
  const big = "text-[40px] font-light tabular-nums leading-tight";
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <section className={card} aria-label="Chiffre d’affaires indicatif">
        <span className="text-[13px] text-stone">Chiffre d’affaires indicatif</span>
        <span className={big}>{formatPrice(totals.revenueCents)}</span>
        <span className="text-[12px] leading-normal text-stone">
          Prix de la carte ou montant corrigé, lapins et annulations exclus
          {totals.adjustedCount > 0
            ? ` · ${totals.adjustedCount} montant${totals.adjustedCount > 1 ? "s" : ""} corrigé${totals.adjustedCount > 1 ? "s" : ""}`
            : ""}
          . Un repère : la caisse fait foi.
        </span>
      </section>
      <section className={card} aria-label="Rendez-vous">
        <span className="text-[13px] text-stone">Rendez-vous</span>
        <span className={big}>{totals.appointmentCount}</span>
        <span className="text-[12px] text-stone">
          {totals.onlineCount} en ligne · {totals.salonCount} par le salon
        </span>
      </section>
      <section className={card} aria-label="Lapins">
        <span className="text-[13px] text-stone">Lapins</span>
        <span className={`${big} ${totals.noShowCount > 0 ? "text-brick" : ""}`}>
          {totals.noShowCount}
        </span>
        <span className="text-[12px] text-stone">Rendez-vous non honorés</span>
      </section>
    </div>
  );
}

function PerStaff({ view }: { view: DashboardView }) {
  const row =
    "grid grid-cols-[minmax(0,1fr)_56px_96px_56px] items-center gap-3 md:grid-cols-[minmax(0,1fr)_90px_120px_80px]";
  return (
    <section aria-label="Par membre" className="flex min-w-0 flex-col">
      <h2 className="pb-2 text-label font-normal uppercase tracking-[0.3em] text-stone">
        Par membre
      </h2>
      <div role="table" className="flex flex-col tabular-nums">
        <div role="row" className={`${row} h-10 border-b border-line text-[12px] text-stone`}>
          <span role="columnheader">Membre</span>
          <span role="columnheader" className="text-right">
            RDV
          </span>
          <span role="columnheader" className="text-right">
            CA indicatif
          </span>
          <span role="columnheader" className="text-right">
            Lapins
          </span>
        </div>
        {view.totals.perStaff.map((m) => (
          <div
            key={m.id}
            role="row"
            className={`${row} min-h-14 border-b border-line-subtle text-[15px]`}
          >
            <span role="cell">
              {m.firstName} <span className="text-[12px] text-stone">· {ROLE_LABEL[m.role]}</span>
            </span>
            <span role="cell" className="text-right">
              {m.appointments}
            </span>
            <span role="cell" className="text-right">
              {formatPrice(m.revenueCents)}
            </span>
            <span
              role="cell"
              className={`text-right ${m.noShows > 0 ? "text-brick" : "text-stone"}`}
            >
              {m.noShows}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

const ordinal = (n: number) => (n === 1 ? "1er lapin" : `${n}e lapin`);

function whenLabel(startsAt: Date, now: Date): string {
  const today = parisDate(now);
  const date = parisDate(startsAt);
  const yesterday = parisDate(new Date(now.getTime() - 24 * 3_600_000));
  const day =
    date === today
      ? "Aujourd’hui"
      : date === yesterday
        ? "Hier"
        : capitalize(formatDayShort(startsAt));
  return `${day} · ${formatTime(startsAt)}`;
}

function RecentNoShows({ view, now }: { view: DashboardView; now: Date }) {
  return (
    <section aria-label="Lapins récents" className="flex min-w-0 flex-col gap-2">
      <h2 className="text-label font-normal uppercase tracking-[0.3em] text-stone">
        Lapins récents
      </h2>
      {view.recentNoShows.length === 0 ? (
        <p className="py-2 text-[14px] text-stone">Aucun lapin pour l’instant.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {view.recentNoShows.map((n) => {
            const body = (
              <>
                <span className="flex items-start justify-between gap-3">
                  <span className="text-[16px]">{n.customerName}</span>
                  <span className="shrink-0 text-[12px] uppercase tracking-[0.14em] text-brick">
                    {ordinal(n.ordinal)}
                  </span>
                </span>
                <span className="text-[13px] text-stone">
                  {whenLabel(n.startsAt, now)} · avec {n.staffFirstName}
                  {n.blocked ? " · bloqué en ligne" : ""}
                </span>
              </>
            );
            return (
              <li key={n.appointmentId}>
                {n.customerName === "Client supprimé" ? (
                  <div className="flex flex-col gap-1.5 border border-brick px-[18px] py-4">
                    {body}
                  </div>
                ) : (
                  <Link
                    href={`/equipe/gerant/clients/${n.customerId}`}
                    className="flex flex-col gap-1.5 border border-brick px-[18px] py-4 hover:bg-graphite-light"
                  >
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="pt-1 text-[13px] leading-normal text-stone">
        À partir de {view.noShowBlockThreshold} lapins, vous pouvez bloquer la réservation en ligne
        du client depuis sa fiche. Il peut toujours appeler le salon.
      </p>
    </section>
  );
}
