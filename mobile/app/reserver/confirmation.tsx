import { router } from "expo-router";
import { useEffect, useState } from "react";
import type { AppointmentsResponse, UpcomingAppointment } from "@/api/types";
import { useBooking } from "@/booking";
import { CalendarButton } from "@/calendar-button";
import { askAndRegister, notificationPermission } from "@/notifications";
import { useSession } from "@/session";
import { Body, Button, Card, Heading, Muted, Screen, Title } from "@/ui";

export default function ConfirmationStep() {
  const { api } = useSession();
  const { draft, reset } = useBooking();
  const moved = !!draft.movingId;
  // Le RDV qui vient d'être pris, relu sur le serveur (heure de fin exacte pour le calendrier).
  const [booked, setBooked] = useState<UpcomingAppointment | null>(null);
  const [offerAlerts, setOfferAlerts] = useState(false);
  const [alertsAnswer, setAlertsAnswer] = useState<"granted" | "denied" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await api.get<AppointmentsResponse>("/appointments").catch(() => null);
      const found = list?.upcoming.find((a) => a.startsAt === draft.startsAt) ?? null;
      if (!cancelled) setBooked(found);
      // R-102 : l'autorisation se demande ici, après la première réservation, et seulement si elle n'a jamais été posée.
      if (!cancelled) setOfferAlerts((await notificationPermission()) === "undetermined");
    })();
    return () => {
      cancelled = true;
    };
  }, [api, draft.startsAt]);

  async function enableAlerts() {
    const answer = await askAndRegister(api);
    setAlertsAnswer(answer === "granted" ? "granted" : "denied");
    setOfferAlerts(false);
  }

  function leave(path: "/" | "/rendez-vous") {
    reset();
    router.dismissTo(path);
  }

  return (
    <Screen
      footer={
        <>
          <Button label="Mes rendez-vous" onPress={() => leave("/rendez-vous")} />
          <Button label="Retour à l'accueil" kind="secondary" onPress={() => leave("/")} />
        </>
      }
    >
      <Title>{moved ? "C'est déplacé." : "C'est réservé."}</Title>
      <Card>
        <Heading>{draft.slotLabel}</Heading>
        <Body>Un email de confirmation vous est envoyé.</Body>
        <Muted>Le paiement se fait au salon.</Muted>
        {booked ? (
          <CalendarButton
            startsAt={booked.startsAt}
            endsAt={booked.endsAt}
            what={booked.what}
            staffFirstName={booked.staffFirstName}
          />
        ) : null}
      </Card>
      {offerAlerts ? (
        <Card>
          <Heading>Être prévenu</Heading>
          <Body>
            Recevez un rappel avant votre rendez-vous, et soyez prévenu tout de suite si une place se libère ou si le salon
            doit modifier un rendez-vous.
          </Body>
          <Button label="Activer les notifications" onPress={() => void enableAlerts()} />
          <Button label="Plus tard" kind="secondary" onPress={() => setOfferAlerts(false)} />
        </Card>
      ) : null}
      {alertsAnswer === "granted" ? <Muted>Notifications activées. Les emails continuent en plus.</Muted> : null}
      {alertsAnswer === "denied" ? (
        <Muted>Notifications non activées. Vous pouvez les autoriser dans les réglages de l&apos;iPhone.</Muted>
      ) : null}
    </Screen>
  );
}
