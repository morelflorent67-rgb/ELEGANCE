import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { messageOf } from "@/api/client";
import type { OfferResponse } from "@/api/types";
import { NeedsLogin } from "@/needs-login";
import { useSession } from "@/session";
import { spacing } from "@/theme";
import { useLoad } from "@/use-load";
import { Body, Button, Card, ErrorText, Heading, LoadState, Muted, Screen, Title } from "@/ui";

// « Une place s'est libérée » (D-99) : prendre la place gardée, ou passer. Le serveur décide de tout (délai, limite).
export default function OfferScreen() {
  const { customer } = useSession();
  if (!customer) return <NeedsLogin title="Une place s'est libérée" text="Connectez-vous pour répondre à cette offre." />;
  return <Offer />;
}

function Offer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useSession();
  const loaded = useLoad(() => api.get<OfferResponse>(`/waitlist/offers/${id}`), [id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState(false);

  async function answer(accept: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (accept) {
        await api.post(`/waitlist/offers/${id}/accept`);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setTaken(true);
      } else {
        await api.post(`/waitlist/offers/${id}/decline`);
        router.back();
      }
    } catch (e) {
      setError(messageOf(e));
      loaded.reload();
    } finally {
      setBusy(false);
    }
  }

  const offer = loaded.data?.offer;
  return (
    <Screen padTop={false}>
      <View style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
        <Title>Une place s&apos;est libérée</Title>
        <LoadState loading={loaded.loading} error={loaded.error} hasData={!!offer} reload={loaded.reload}>
          {offer ? (
            taken ? (
              <>
                <Body>C&apos;est réservé. Un email de confirmation vous est envoyé.</Body>
                <Button label="Voir mes rendez-vous" onPress={() => router.replace("/rendez-vous")} />
              </>
            ) : (
              <>
                <Card>
                  <Heading>{offer.services}</Heading>
                  <Body>avec {offer.staff} · {offer.price}</Body>
                  <Muted>Place gardée pour vous jusqu&apos;à {offer.until}</Muted>
                </Card>
                {offer.state !== "pending" ? (
                  <Body>Cette place n&apos;est plus disponible.</Body>
                ) : (
                  <>
                    <ErrorText>{error}</ErrorText>
                    <Button label="Prendre cette place" onPress={() => void answer(true)} loading={busy} />
                    <Button label="Pas cette fois, je reste sur la liste" kind="secondary" disabled={busy} onPress={() => void answer(false)} />
                  </>
                )}
              </>
            )
          ) : null}
        </LoadState>
      </View>
    </Screen>
  );
}
