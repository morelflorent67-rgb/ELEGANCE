import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { z } from "zod";
import { CalendarIcon, btnSecondary } from "@/components/ui";
import { db } from "@/db/client";
import { appSecret } from "@/lib/env";
import {
  capitalize,
  formatDay,
  formatDuration,
  formatPrice,
  formatTime,
  hoursPhrase,
} from "@/lib/format";
import { SALON } from "@/lib/salon";
import { loadCustomerAppointment } from "@/modules/appointments/queries";
import { getAuthDriver } from "@/modules/auth";
import { loadSettings } from "@/modules/availability";
import { currentCustomer } from "@/modules/customers/accounts";
import { calendarSubject, signToken } from "@/modules/security/token";

export const metadata: Metadata = { title: "Rendez-vous confirmé" };

export default function ConfirmationPage(props: PageProps<"/reservation/confirmation">) {
  return (
    <Suspense
      fallback={
        <p role="status" className="px-6 py-16 text-center text-body-sm text-stone">
          Chargement…
        </p>
      }
    >
      <Confirmation searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Confirmation({
  searchParams,
}: {
  searchParams: PageProps<"/reservation/confirmation">["searchParams"];
}) {
  await connection();
  const { rdv, modifie } = await searchParams;
  const moved = modifie === "1";
  const id = z.uuid().safeParse(typeof rdv === "string" ? rdv : "");
  if (!id.success) notFound();

  const database = db();
  const customer = await currentCustomer(database, getAuthDriver());
  if (!customer)
    redirect(`/connexion?next=${encodeURIComponent(`/reservation/confirmation?rdv=${id.data}`)}`);

  const appointment = await loadCustomerAppointment(database, customer.id, id.data);
  if (!appointment) notFound();
  const settings = await loadSettings(database);

  // R-30, R-32 : modifiable en ligne jusqu'au délai réglé avant son début. Un RDV pris (ou déplacé) en deçà
  // ne l'est donc plus dès maintenant.
  const deadline = new Date(
    appointment.startsAt.getTime() - settings.changeCutoffHours * 3_600_000,
  );
  const changeableOnline = new Date().getTime() <= deadline.getTime();

  const calendarUrl = `/api/agenda/${appointment.id}?t=${signToken(appSecret(), calendarSubject(appointment.id))}`;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col items-center gap-6 px-6 pb-16 pt-12 text-center">
      <div className="relative flex h-20 w-[92px] items-center justify-center">
        <svg
          className="trace absolute inset-0"
          width="92"
          height="80"
          viewBox="0 0 92 80"
          fill="none"
          aria-hidden="true"
        >
          <path
            pathLength="1"
            d="M23.5 1H68.5L91 40L68.5 79H23.5L1 40Z"
            stroke="#ffffff"
            strokeWidth="1"
          />
        </svg>
        <svg
          className="relative animate-fade-in [animation-delay:900ms]"
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-ivory)"
          strokeWidth="1.4"
          aria-hidden="true"
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </div>

      <div className="flex flex-col gap-2.5">
        <h1 className="gold-shine text-title-page">
          {moved ? "Rendez-vous modifié" : "Rendez-vous confirmé"}
        </h1>
        <p className="animate-reveal text-body text-ivory-soft [animation-delay:1000ms]">
          {moved
            ? "Votre rendez-vous a été déplacé. Un email de confirmation vient de vous être envoyé."
            : "À bientôt au salon. Un email de confirmation vient de vous être envoyé."}
        </p>
      </div>

      <div className="flex w-full animate-reveal flex-col gap-3.5 bg-graphite p-5 text-left [animation-delay:1200ms]">
        <div className="flex flex-col gap-1">
          <span className="text-label uppercase text-gold">
            {capitalize(formatDay(appointment.startsAt))}
          </span>
          <span className="text-[32px] font-light tabular-nums">
            {formatTime(appointment.startsAt)}
          </span>
        </div>
        <div className="h-px bg-line" />
        {appointment.items.map((item) => (
          <div key={item.name} className="flex justify-between gap-3 text-[15px]">
            <span>
              {item.name} · {formatDuration(item.durationMin)}
            </span>
            <span>{formatPrice(item.priceCents)}</span>
          </div>
        ))}
        {appointment.items.length > 1 ? (
          <div className="flex justify-between gap-3 text-[15px] text-stone">
            <span>Total · {formatDuration(appointment.durationMinutes)}</span>
            <span>{formatPrice(appointment.totalPriceCents)}</span>
          </div>
        ) : null}
        <span className="text-body-sm text-ivory">Paiement sur place</span>
        <span className="text-body-sm text-stone">
          avec {appointment.staffFirstName} · {SALON.street}, {SALON.city}
        </span>
      </div>

      <div className="flex w-full animate-reveal flex-col gap-2.5 [animation-delay:1300ms]">
        <a href={calendarUrl} className={btnSecondary}>
          <CalendarIcon />
          {moved ? "Mettre à jour mon agenda" : "Ajouter à mon agenda"}
        </a>
        <Link href="/compte/rendez-vous" className={btnSecondary}>
          Voir mes rendez-vous
        </Link>
        <p className="mt-1.5 text-body-sm leading-normal text-stone">
          {changeableOnline
            ? `Modifiable ou annulable jusqu'à ${hoursPhrase(settings.changeCutoffHours)} avant, depuis Mes RDV.`
            : `Ce rendez-vous ne peut pas être modifié en ligne : pour un changement, appelez le salon au ${SALON.phoneDisplay}.`}
        </p>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-3 self-center text-button-sm uppercase text-ivory"
        >
          Retour à l&rsquo;accueil
          <span className="h-px w-6 bg-gold" />
        </Link>
      </div>
    </main>
  );
}
