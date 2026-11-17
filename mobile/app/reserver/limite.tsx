import { router } from "expo-router";
import { View } from "react-native";
import type { AppointmentsResponse } from "@/api/types";
import { useSession } from "@/session";
import { StepHeader } from "@/step-header";
import { useLoad } from "@/use-load";
import { Body, Button, Card, LoadState, Muted, Screen, Title } from "@/ui";

// Maximum de rendez-vous à venir atteint (R-25) : on montre ceux qui comptent, hors rendez-vous répétés (D-87). Le
// décompte qui décide reste celui du serveur à la réservation.
export default function LimitScreen() {
  const { api, booking } = useSession();
  const loaded = useLoad(() => api.get<AppointmentsResponse>("/appointments"));
  const counted = (loaded.data?.upcoming ?? []).filter((a) => !a.repeated);

  return (
    <Screen
      footer={
        <>
          <Button label="Mes rendez-vous" arrow onPress={() => router.replace("/rendez-vous")} />
          <Button label="Retour à l'accueil" kind="secondary" onPress={() => router.dismissTo("/")} />
        </>
      }
    >
      <StepHeader step={4} label="Compte" />
      <Title>Déjà {booking?.upcoming ?? ""} rendez-vous à venir</Title>
      <Body>
        Vous avez atteint le maximum de {booking?.maxUpcoming ?? ""} rendez-vous à venir. Annulez-en un pour en réserver un
        autre.
      </Body>
      <LoadState loading={loaded.loading} error={loaded.error} hasData={!!loaded.data} reload={loaded.reload}>
        <View style={{ gap: 12 }}>
          {counted.map((a) => (
            <Card key={a.id}>
              <Body>
                {a.dayLabel} · {a.time}
              </Body>
              <Muted>
                {a.what} · {a.price}
              </Muted>
            </Card>
          ))}
        </View>
      </LoadState>
    </Screen>
  );
}
