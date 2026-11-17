import { router } from "expo-router";
import { Body, Button, Screen, Title } from "@/ui";

/** Écran proposé quand une page demande un compte et que le client n'est pas connecté (ou que sa session a expiré). */
export function NeedsLogin({ title, text }: { title: string; text: string }) {
  return (
    <Screen>
      <Title>{title}</Title>
      <Body>{text}</Body>
      <Button label="Se connecter" onPress={() => router.push("/connexion")} />
      <Button label="Créer un compte" kind="secondary" onPress={() => router.push("/connexion?mode=register")} />
    </Screen>
  );
}
