import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PanelAuth } from "@/components/client/panel-auth";
import { PanelBody, PanelHeader } from "@/components/client/panel";
import { db } from "@/db/client";
import { appSecret } from "@/lib/env";
import { formatDuration, formatPrice, parisDate } from "@/lib/format";
import { dayNames } from "@/lib/slot-view";
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
    <>
      <PanelHeader label="Mes rendez-vous" />
      <PanelBody>
        <Suspense
          fallback={
            <p role="status" className="py-10 text-center text-[14px] text-stone">
              Chargement…
            </p>
          }
        >
          <Appointments />
        </Suspense>
      </PanelBody>
    </>
  );
}

// R-76 : les rendez-vous du client. Le délai de modification (R-30) est calculé ici, côté serveur, et refait à
// chaque action : la page ne fait qu'afficher. Sans session, le panneau propose la connexion.
async function Appointments() {
  await connection();
  const database = db();
  const customer = await currentCustomer(database, getAuthDriver());
  if (!customer) return <PanelAuth />;

  const now = new Date();
  const [list, settings, booking] = await Promise.all([
    listCustomerAppointments(database, customer.id),
    loadSettings(database),
    customerBookingState(database, customer.id, now),
  ]);
  const { upcoming, past } = splitAppointments(list, now);

  return (
    <AppointmentsView
      firstName={customer.firstName}
      upcoming={upcoming.map((a) => {
        const view = upcomingView(a, now, settings.changeCutoffHours);
        const names = dayNames(parisDate(a.startsAt));
        const minutes = Math.max(0, Math.round((a.startsAt.getTime() - now.getTime()) / 60_000));
        return {
          id: view.id,
          dow: names.dow,
          num: names.num,
          month: names.short.split(" ").pop() ?? "",
          longLabel: `${names.long} · ${view.time}`,
          time: view.time,
          // Dans le délai : « dans 50 min » bat en doré (R-31).
          soon: view.changeable ? null : `dans ${formatDuration(minutes)}`,
          what: a.items.map((i) => i.name).join(" + "),
          staff: a.staffFirstName,
          price: formatPrice(a.totalPriceCents),
          forName: a.forName,
          repeated: view.repeated,
          changeable: view.changeable,
          deadlineLabel: view.deadlineLabel,
          calendarUrl: `/api/agenda/${a.id}?t=${signToken(appSecret(), calendarSubject(a.id))}`,
        };
      })}
      // R-25 : seuls les RDV hors série comptent dans la limite (D-87).
      counted={booking.upcoming}
      past={past.map((a) => {
        const view = pastView(a);
        return { ...view, canRepeat: !view.cancelled };
      })}
      cutoffHours={settings.changeCutoffHours}
      maxUpcoming={settings.maxUpcomingPerCustomer}
      blocked={booking.blocked}
    />
  );
}
