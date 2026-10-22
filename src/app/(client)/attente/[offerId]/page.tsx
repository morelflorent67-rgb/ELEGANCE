import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { z } from "zod";
import { db } from "@/db/client";
import { capitalize, formatDay, formatPrice, formatTime } from "@/lib/format";
import { getAuthDriver } from "@/modules/auth";
import { loadSettings } from "@/modules/availability";
import { currentCustomer } from "@/modules/customers/accounts";
import { loadOffer } from "@/modules/waitlist";
import { OfferView } from "./offer-view";

export const metadata: Metadata = {
  title: "Une place s'est libérée",
  robots: { index: false, follow: false },
};

export default function WaitlistOfferPage(props: PageProps<"/attente/[offerId]">) {
  return (
    <Suspense
      fallback={
        <p role="status" className="px-6 py-16 text-center text-[14px] text-stone">
          Chargement…
        </p>
      }
    >
      <Offer params={props.params} />
    </Suspense>
  );
}

// D-99, D-100 : la page où le client prend, refuse ou quitte. Elle exige la connexion (la place est à son nom) ; l'état
// de l'offre est relu sur le serveur à chaque affichage et refait par chaque action.
async function Offer({ params }: { params: PageProps<"/attente/[offerId]">["params"] }) {
  await connection();
  const id = z.uuid().safeParse((await params).offerId);
  if (!id.success) notFound();

  const database = db();
  const customer = await currentCustomer(database, getAuthDriver());
  if (!customer) redirect(`/connexion?next=${encodeURIComponent(`/attente/${id.data}`)}`);

  const now = new Date();
  const offer = await loadOffer(database, customer.id, id.data, now);
  if (!offer) notFound();
  const settings = await loadSettings(database);

  return (
    <OfferView
      offer={{
        id: offer.id,
        entryId: offer.entryId,
        state: offer.state,
        day: capitalize(formatDay(offer.startsAt)),
        time: `${formatTime(offer.startsAt)} – ${formatTime(offer.endsAt)}`,
        services: offer.items.map((i) => i.name).join(" + "),
        staff: offer.staffFirstName,
        price: formatPrice(offer.totalPriceCents),
        expiresAt: offer.expiresAt.toISOString(),
        until: formatTime(offer.expiresAt),
      }}
      maxUpcoming={settings.maxUpcomingPerCustomer}
      nowIso={now.toISOString()}
    />
  );
}
