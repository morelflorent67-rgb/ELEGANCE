import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { z } from "zod";
import { db } from "@/db/client";
import { parisDate } from "@/lib/format";
import { loadRepeatSource } from "@/modules/appointments/queries";
import { loadSettings } from "@/modules/availability";
import { loadCatalog } from "@/modules/catalog";
import { loadCustomerFile } from "@/modules/customers/staff-view";
import { listActiveStaff } from "@/modules/staff";
import { requireStaff } from "../../_lib/session";
import { ReserveFlow, type ClientView } from "./reserve-flow";

export const metadata: Metadata = { title: "Réserver" };

export default function ReservePage(props: PageProps<"/equipe/reserver">) {
  return (
    <Suspense
      fallback={
        <p role="status" className="px-6 py-10 text-body-sm text-stone">
          Chargement…
        </p>
      }
    >
      <Reserve searchParams={props.searchParams} />
    </Suspense>
  );
}

const shortDate = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  day: "numeric",
  month: "short",
});

async function Reserve({
  searchParams,
}: {
  searchParams: PageProps<"/equipe/reserver">["searchParams"];
}) {
  await connection();
  await requireStaff();
  const query = await searchParams;
  const database = db();
  const now = new Date();

  const [catalog, team, settings] = await Promise.all([
    loadCatalog(database),
    listActiveStaff(database),
    loadSettings(database),
  ]);

  // « Réserver pour ce client » depuis sa fiche : le client est déjà choisi.
  let client: ClientView | null = null;
  const asked = z.uuid().safeParse(query.client);
  if (asked.success) {
    const file = await loadCustomerFile(database, asked.data);
    if (file) {
      const past = file.appointments.find(
        (a) =>
          a.startsAt <= now &&
          a.status !== "cancelled_by_customer" &&
          a.status !== "cancelled_by_salon",
      );
      client = {
        id: file.id,
        name: `${file.firstName} ${file.lastName}`.trim(),
        phone: file.phone,
        lastVisitLabel: past ? shortDate.format(past.startsAt) : null,
        // R-25 : les RDV répétés ne comptent pas dans la limite (D-87).
        upcoming: file.appointments.filter(
          (a) => a.status === "confirmed" && a.startsAt > now && !a.seriesId,
        ).length,
        blocked: file.blocked,
        hasAccount: file.hasAccount,
        hasEmail: file.email !== "",
      };
    }
  }

  // « Réserver à une autre heure » depuis une date sautée d'une série (D-84) : mêmes prestations et coiffeur, ce jour-là.
  const from = z.uuid().safeParse(query.depuis);
  const day = z.iso.date().safeParse(query.jour);
  const source =
    client && from.success ? await loadRepeatSource(database, client.id, from.data) : null;
  const active = new Set(catalog.map((s) => s.id));

  return (
    <ReserveFlow
      // Une fiche choisie par lien (« Choisir cette fiche ») repart d'un parcours neuf.
      key={`${client?.id ?? "nouveau"}:${source ? from.data : ""}:${day.success ? day.data : ""}`}
      catalog={catalog}
      team={team.map((m) => ({ id: m.id, firstName: m.firstName }))}
      today={parisDate(now)}
      maxUpcoming={settings.maxUpcomingPerCustomer}
      initialClient={client}
      initialServiceIds={source?.serviceIds.filter((id) => active.has(id)) ?? []}
      initialStaffId={source?.staffId ?? "any"}
      initialDate={day.success ? day.data : undefined}
    />
  );
}
