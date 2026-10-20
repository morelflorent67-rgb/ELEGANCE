import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { db } from "@/db/client";
import { PageHeader } from "@/components/ui";
import { getAuthDriver } from "@/modules/auth";
import { loadSettings } from "@/modules/availability";
import { loadCatalog } from "@/modules/catalog";
import { currentCustomer, customerBookingState } from "@/modules/customers/accounts";
import { BookingFlow } from "./_components/booking-flow";

export const metadata: Metadata = { title: "Réservation" };

export default function ReservationPage() {
  return (
    <Suspense fallback={<Loading />}>
      <BookingLoader />
    </Suspense>
  );
}

function Loading() {
  return (
    <div className="min-h-dvh">
      <PageHeader backHref="/" label="Réservation" />
      <p role="status" className="px-6 py-10 text-center text-body-sm text-stone">
        Chargement…
      </p>
    </div>
  );
}

// La carte, le client connecté et les réglages sont lus à chaque affichage : rien n'est mis en cache.
async function BookingLoader() {
  await connection();
  const database = db();
  const customer = await currentCustomer(database, getAuthDriver());
  const [catalog, settings, booking] = await Promise.all([
    loadCatalog(database),
    loadSettings(database),
    customer ? customerBookingState(database, customer.id) : Promise.resolve(null),
  ]);
  return (
    <BookingFlow
      catalog={catalog}
      customer={customer}
      booking={booking}
      cutoffHours={settings.changeCutoffHours}
    />
  );
}
