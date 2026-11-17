import { router } from "expo-router";
import { useBooking } from "@/booking";
import { Body, Button, Card, Heading, Muted, Screen, Title } from "@/ui";

export default function ConfirmationStep() {
  const { draft, reset } = useBooking();
  const moved = !!draft.movingId;

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
      </Card>
    </Screen>
  );
}
