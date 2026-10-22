import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { z } from "zod";
import { cta, ghost } from "@/components/client/ui";
import { db } from "@/db/client";
import { appSecret } from "@/lib/env";
import { capitalize, formatDay, formatPrice, formatTime, hoursPhrase } from "@/lib/format";
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
        <p role="status" className="px-6 py-16 text-center text-[14px] text-stone">
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

  const rays = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

  // Confirmation dorée (≈ 2 s, maquette « Lot12-Resa-6-Confirmation ») : le seul endroit où l'or brille.
  return (
    <main className="flex min-h-dvh flex-col items-center gap-7 px-6 pb-9 pt-[34px] text-center">
      <div aria-hidden="true" className="relative h-[200px] w-[220px]">
        <div
          className="c-glow absolute -inset-[30px]"
          style={{
            background:
              "radial-gradient(circle, rgb(184 147 90 / 0.42) 0%, rgb(184 147 90 / 0.12) 42%, rgb(184 147 90 / 0) 70%)",
          }}
        />
        <div className="c-ring absolute left-[70px] top-[60px] h-20 w-20 rounded-[50%] border border-gold" />
        {rays.map((angle, i) => (
          <span
            key={angle}
            className="absolute left-[109.5px] top-[100px] h-0 w-px"
            style={{ transform: `rotate(${angle}deg)` }}
          >
            <span
              className="c-ray absolute bottom-[92px] left-0 h-3.5 w-px bg-gold"
              style={{ animationDelay: `${1450 + (i % 3) * 40}ms` }}
            />
          </span>
        ))}
        <svg
          width="220"
          height="200"
          viewBox="0 0 220 200"
          fill="none"
          className="absolute inset-0"
        >
          <path
            className="c-hex"
            pathLength="1"
            d="M66 24H154L198 100L154 176H66L22 100Z"
            stroke="#b8935a"
            strokeWidth="1.5"
          />
          <path
            className="c-ck"
            pathLength="1"
            d="M88 102l15 15 30-32"
            stroke="#efe9dd"
            strokeWidth="2"
          />
        </svg>
      </div>

      <div className="flex flex-col gap-3">
        <h1
          className="c-in font-display text-[48px] leading-[1.02]"
          style={{ animationDelay: "1.5s" }}
        >
          {moved ? "C'est modifié." : "C'est réservé."}
        </h1>
        <p
          className="c-in text-[16px] leading-[1.55] text-ivory"
          style={{ animationDelay: "1.62s" }}
        >
          {capitalize(formatDay(appointment.startsAt))} à {formatTime(appointment.startsAt)}
        </p>
        <p
          className="c-in text-[14px] leading-[1.55] text-stone"
          style={{ animationDelay: "1.72s" }}
        >
          avec {appointment.staffFirstName} · {appointment.items.map((i) => i.name).join(" + ")} ·{" "}
          {formatPrice(appointment.totalPriceCents)}
        </p>
        {appointment.forName ? (
          <p className="c-in text-[14px] text-gold" style={{ animationDelay: "1.8s" }}>
            Pour {appointment.forName} · au nom de votre compte
          </p>
        ) : null}
      </div>

      <p
        className="c-in text-[13px] leading-[1.55] text-stone-dark"
        style={{ animationDelay: "1.9s" }}
      >
        Un email de confirmation vous a été envoyé.
        <br />
        {changeableOnline
          ? `Modifiable jusqu'à ${hoursPhrase(settings.changeCutoffHours)} avant, depuis Mes rendez-vous. Paiement sur place.`
          : `Ce rendez-vous ne peut pas être modifié en ligne : pour un changement, appelez le salon au ${SALON.phoneDisplay}.`}
      </p>

      <div className="c-in mt-auto flex w-full flex-col gap-2.5" style={{ animationDelay: "2s" }}>
        <a href={calendarUrl} className={cta}>
          {moved ? "Mettre à jour mon agenda" : "Ajouter à mon agenda"}
        </a>
        <Link href="/compte/rendez-vous" className={ghost}>
          Mes rendez-vous
        </Link>
        <Link href="/" className="flex min-h-11 items-center justify-center text-[13px] text-stone">
          Retour à l&rsquo;accueil
        </Link>
      </div>
    </main>
  );
}
