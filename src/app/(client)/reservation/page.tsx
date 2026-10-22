import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { z } from "zod";
import { db } from "@/db/client";
import { ClientHeader } from "@/components/client/legal-links";
import { Note, PhoneIcon, cta, ghost } from "@/components/client/ui";
import { DomainError } from "@/lib/domain-error";
import { capitalize, formatDay, formatTime } from "@/lib/format";
import { loadRepeatSource } from "@/modules/appointments/queries";
import { getAuthDriver } from "@/modules/auth";
import { loadSettings } from "@/modules/availability";
import { loadChangeableAppointment } from "@/modules/booking";
import { loadCatalog, loadStaffChoices, loadStaffChoicesFor } from "@/modules/catalog";
import { currentCustomer, customerBookingState } from "@/modules/customers/accounts";
import { getVitrine } from "@/modules/vitrine/cache";
import { SALON } from "@/lib/salon";
import { BookingFlow, type Prefill } from "./_components/booking-flow";

export const metadata: Metadata = { title: "Réservation" };

export default function ReservationPage(props: PageProps<"/reservation">) {
  return (
    <Suspense fallback={<Loading />}>
      <BookingLoader searchParams={props.searchParams} />
    </Suspense>
  );
}

function Loading() {
  return (
    <div className="min-h-dvh">
      <ClientHeader title="Réservation" />
      <p role="status" className="px-6 py-10 text-center text-[14px] text-stone">
        Chargement…
      </p>
    </div>
  );
}

const param = z.uuid();

// La carte, le client connecté et les réglages sont lus à chaque affichage : rien n'est mis en cache.
async function BookingLoader({
  searchParams,
}: {
  searchParams: PageProps<"/reservation">["searchParams"];
}) {
  await connection();
  const query = await searchParams;
  const database = db();
  const customer = await currentCustomer(database, getAuthDriver());

  // « Modifier » (?modifier=…) et « Reprendre le même RDV » (?reprendre=…) viennent de Mes rendez-vous.
  const toEdit = param.safeParse(query.modifier);
  const toRepeat = param.safeParse(query.reprendre);
  if ((toEdit.success || toRepeat.success) && !customer) {
    const wanted = toEdit.success ? `modifier=${toEdit.data}` : `reprendre=${toRepeat.data}`;
    redirect(`/connexion?next=${encodeURIComponent(`/reservation?${wanted}`)}`);
  }

  const [catalog, settings, booking, { team }] = await Promise.all([
    loadCatalog(database),
    loadSettings(database),
    customer ? customerBookingState(database, customer.id) : Promise.resolve(null),
    getVitrine(),
  ]);

  let prefill: Prefill | undefined;
  let notice: string | undefined;

  if (customer && toEdit.success) {
    try {
      // R-30 à R-32 : le serveur refuse ici un RDV qui n'est plus modifiable ; la page ne l'ouvre jamais.
      const moving = await loadChangeableAppointment(database, customer.id, toEdit.data);
      prefill = {
        kind: "edit",
        choices: await loadStaffChoicesFor(database, moving.services),
        appointment: {
          id: moving.id,
          staffId: moving.staffId,
          currentLabel: `${capitalize(formatDay(moving.startsAt))} · ${formatTime(moving.startsAt)}`,
          items: moving.items.map((i) => ({
            id: i.serviceId,
            name: i.name,
            priceCents: i.priceCents,
            durationMin: i.durationMin,
          })),
        },
      };
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      return <NotChangeable />;
    }
  } else if (customer && toRepeat.success) {
    const source = await loadRepeatSource(database, customer.id, toRepeat.data);
    if (source) {
      // Seules les prestations encore réservables en ligne sont reprises (R-17).
      const bookable = new Set(catalog.filter((s) => s.bookableOnline).map((s) => s.id));
      const serviceIds = source.serviceIds.filter((id) => bookable.has(id));
      if (serviceIds.length > 0) {
        const choices = await loadStaffChoices(database, serviceIds, "online");
        prefill = {
          kind: "repeat",
          serviceIds,
          choices,
          // Le même coiffeur, s'il est toujours habilité ; sinon « Sans préférence » (R-20).
          staffId: choices.some((c) => c.id === source.staffId) ? source.staffId : "any",
        };
        if (serviceIds.length < source.serviceIds.length) {
          notice =
            "Une prestation de ce rendez-vous n'est plus réservable en ligne : elle n'a pas été reprise.";
        }
      } else {
        notice =
          "Les prestations de ce rendez-vous ne sont plus réservables en ligne. Choisissez-en d'autres.";
      }
    }
  }

  return (
    <BookingFlow
      // Un autre RDV à modifier ou à reprendre repart d'un parcours neuf.
      key={`${toEdit.success ? toEdit.data : ""}${toRepeat.success ? toRepeat.data : ""}`}
      catalog={catalog}
      team={{
        barber: team.filter((m) => m.role === "barber").map((m) => m.firstName),
        apprentice: team.filter((m) => m.role === "apprentice").map((m) => m.firstName),
      }}
      customer={customer}
      booking={booking}
      cutoffHours={settings.changeCutoffHours}
      prefill={prefill}
      notice={notice}
    />
  );
}

/** R-31 : passé le délai (ou RDV déjà annulé), le client appelle le salon. */
function NotChangeable() {
  return (
    <div className="min-h-dvh">
      <ClientHeader
        backHref="/compte/rendez-vous"
        backLabel="Retour à mes rendez-vous"
        title="Modifier le RDV"
      />
      <main className="flex flex-col gap-5 px-6 pb-12 pt-6">
        <h1 className="font-display text-[40px] leading-[1.05]">
          Ce rendez-vous ne peut plus être modifié en ligne.
        </h1>
        <Note>
          Le délai de modification est dépassé, ou le rendez-vous n&rsquo;existe plus. Appelez le
          salon pour tout changement.
        </Note>
        <a href={SALON.phoneHref} className={cta}>
          <PhoneIcon color="#0b0a09" />
          Appeler le salon
        </a>
        <Link href="/compte/rendez-vous" className={ghost}>
          Retour à mes rendez-vous
        </Link>
      </main>
    </div>
  );
}
