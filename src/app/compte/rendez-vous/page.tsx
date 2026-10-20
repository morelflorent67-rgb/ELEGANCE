import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CallButton, Eyebrow, LedLine, PageHeader, btnPrimary } from "@/components/ui";
import { db } from "@/db/client";
import { capitalize, formatDay, formatDuration, formatPrice, formatTime } from "@/lib/format";
import { listCustomerAppointments } from "@/modules/appointments/queries";
import { getAuthDriver } from "@/modules/auth";
import { currentCustomer } from "@/modules/customers/accounts";

export const metadata: Metadata = { title: "Mes rendez-vous" };

export default function MesRendezVousPage() {
  return (
    <div className="min-h-dvh">
      <PageHeader backHref="/" />
      <main className="mx-auto flex w-full max-w-[640px] flex-col gap-7 px-6 pb-12 pt-8">
        <div className="flex flex-col gap-3">
          <Eyebrow>Mon compte</Eyebrow>
          <h1 className="text-title-1">Mes rendez-vous</h1>
        </div>
        <LedLine />
        <Suspense
          fallback={
            <p role="status" className="text-body-sm text-stone">
              Chargement…
            </p>
          }
        >
          <Appointments />
        </Suspense>
      </main>
    </div>
  );
}

const STATUS_LABEL = {
  confirmed: "Confirmé",
  honored: "Honoré",
  no_show: "Non venu",
  cancelled_by_customer: "Annulé",
  cancelled_by_salon: "Annulé par le salon",
} as const;

// Version provisoire du lot 2 : lecture seule. Modifier, annuler et « Reprendre le même RDV » arrivent au lot 3.
async function Appointments() {
  await connection();
  const database = db();
  const customer = await currentCustomer(database, getAuthDriver());
  if (!customer) redirect("/connexion?next=/compte/rendez-vous");
  const list = await listCustomerAppointments(database, customer.id);

  if (list.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <p className="text-body text-ivory-soft">Vous n&rsquo;avez pas encore de rendez-vous.</p>
        <Link href="/reservation" className={btnPrimary}>
          Réserver
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-3">
        {list.map((a) => (
          <li key={a.id} className="flex flex-col gap-2 bg-graphite p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-label uppercase text-gold">
                {capitalize(formatDay(a.startsAt))}
              </span>
              <span className="text-label uppercase text-stone">{STATUS_LABEL[a.status]}</span>
            </div>
            <span className="text-[24px] font-light tabular-nums">{formatTime(a.startsAt)}</span>
            {a.items.map((item) => (
              <span
                key={item.name}
                className="flex justify-between gap-3 text-body-sm text-ivory-soft"
              >
                <span>
                  {item.name} · {formatDuration(item.durationMin)}
                </span>
                <span>{formatPrice(item.priceCents)}</span>
              </span>
            ))}
            <span className="text-body-sm text-stone">avec {a.staffFirstName}</span>
          </li>
        ))}
      </ul>
      <p className="text-body-sm text-stone">
        Pour modifier ou annuler un rendez-vous, appelez le salon.
      </p>
      <CallButton />
      <Link href="/reservation" className={btnPrimary}>
        Réserver
      </Link>
    </div>
  );
}
