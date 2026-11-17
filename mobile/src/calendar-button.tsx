import { useState } from "react";
import type { Vitrine } from "@/api/types";
import { addToCalendar, calendarMessage, type CalendarResult } from "@/calendar";
import { useSession } from "@/session";
import { Button, Muted } from "@/ui";

/** « Ajouter au calendrier » : l'adresse du salon est lue sur le serveur au moment de l'ajout (jamais en dur). */
export function CalendarButton({
  startsAt,
  endsAt,
  what,
  staffFirstName,
}: {
  startsAt: string;
  endsAt: string;
  what: string;
  staffFirstName: string;
}) {
  const { api } = useSession();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CalendarResult | null>(null);

  async function add() {
    setBusy(true);
    const vitrine = await api.get<Vitrine>("/vitrine").catch(() => null);
    const outcome = await addToCalendar({
      title: `${vitrine?.salon.name ?? "Elegance Strasbourg"} : ${what}`,
      startsAt,
      endsAt,
      location: vitrine?.access.address ?? "",
      notes: `Avec ${staffFirstName}`,
    });
    setResult(outcome);
    setBusy(false);
  }

  return (
    <>
      <Button
        label={result === "added" ? "Ajouté au calendrier" : "Ajouter au calendrier"}
        kind="secondary"
        loading={busy}
        disabled={result === "added"}
        onPress={() => void add()}
      />
      {result && result !== "added" ? <Muted>{calendarMessage(result)}</Muted> : null}
    </>
  );
}
