import { router } from "expo-router";
import { Linking } from "react-native";
import { StepHeader } from "@/step-header";
import { Body, Button, Screen, Title } from "@/ui";
import { useVitrine } from "@/vitrine";

// Réservation en ligne bloquée par le gérant (R-52) : le client le sait avant d'aller plus loin.
export default function BlockedScreen() {
  const { data } = useVitrine();
  return (
    <Screen
      footer={
        <>
          <Button label="Appeler le salon" arrow disabled={!data} onPress={() => data && void Linking.openURL(data.access.phoneHref)} />
          <Button label="Retour à l'accueil" kind="secondary" onPress={() => router.dismissTo("/")} />
        </>
      }
    >
      <StepHeader step={4} label="Compte" />
      <Title>Réservation indisponible</Title>
      <Body>La réservation en ligne n&apos;est pas disponible pour votre compte. Appelez le salon : il vous prendra rendez-vous.</Body>
    </Screen>
  );
}
