import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AccountNav } from "@/components/account-nav";
import { CallButton, Eyebrow, PageHeader, btnPrimary } from "@/components/ui";
import { db } from "@/db/client";
import { appSecret } from "@/lib/env";
import { pastView, splitAppointments, upcomingView } from "@/modules/appointments/account-view";
import { listCustomerAppointments } from "@/modules/appointments/queries";
import { getAuthDriver } from "@/modules/auth";
import { loadSettings } from "@/modules/availability";
import { currentCustomer, customerBookingState } from "@/modules/customers/accounts";
import { calendarSubject, signToken } from "@/modules/security/token";
import { AppointmentsView } from "./appointments-view";

export const metadata: Metadata = { title: "Mes rendez-vous" };

export default function MesRendezVousPage() {
  return (
    <div className="min-h-dvh">
      <PageHeader backHref="/" />
      <Suspense
        fallback={
          <p role="status" className="px-6 py-10 text-center text-body-sm text-stone">
            Chargement…
          </p>
        }
      >
        <Appointments />
      </Suspense>
    </div>
  );
}

// R-76 : les rendez-vous du client. Le délai de modification (R-30) est calculé ici, côté serveur, et refait à
// chaque action : la page ne fait qu'afficher.
async function Appointments() {
  await connection();
  const database = db();
  const customer = await currentCustomer(database, getAuthDriver());
  if (!customer) redirect("/connexion?next=/compte/rendez-vous");

  const now = new Date();
  const [list, settings, booking] = await Promise.all([
    listCustomerAppointments(database, customer.id),
    loadSettings(database),
    customerBookingState(database, customer.id, now),
  ]);
  const { upcoming, past } = splitAppointments(list, now);

  return (
    <>
      <main className="mx-auto flex w-full max-w-[640px] flex-col gap-6 px-6 pb-36 pt-6">
        <div className="flex flex-col gap-3">
          <Eyebrow>Bonjour {customer.firstName}</Eyebrow>
          <h1 className="text-title-1">Mes rendez-vous</h1>
        </div>
        <AccountNav current="rendez-vous" />
        <AppointmentsView
          upcoming={upcoming.map((a) => ({
            ...upcomingView(a, now, settings.changeCutoffHours),
            calendarUrl: `/api/agenda/${a.id}?t=${signToken(appSecret(), calendarSubject(a.id))}`,
          }))}
          past={past.map((a) => {
            const view = pastView(a);
            return { ...view, canRepeat: !view.cancelled };
          })}
          cutoffHours={settings.changeCutoffHours}
          maxUpcoming={settings.maxUpcomingPerCustomer}
          blocked={booking.blocked}
        />
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-line-subtle bg-ink/95 px-4 pb-5 pt-4">
        <div className="mx-auto w-full max-w-[640px]">
          {booking.blocked ? (
            <CallButton kind="primary" />
          ) : (
            <Link href="/reservation" className={btnPrimary}>
              Prendre rendez-vous
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
