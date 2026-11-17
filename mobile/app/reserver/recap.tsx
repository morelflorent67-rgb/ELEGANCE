import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useState } from "react";
import { ApiError, messageOf } from "@/api/client";
import { useBooking } from "@/booking";
import { formatDuration, formatPrice } from "@/lib/money";
import { StepHeader } from "@/step-header";
import { useSession } from "@/session";
import { colors } from "@/theme";
import { Body, Button, Card, ErrorText, Field, Heading, Muted, Screen, Title } from "@/ui";
import { useVitrine } from "@/vitrine";

// Étape 4 : récapitulatif et confirmation. Sans session (ou session expirée), on propose la connexion : la réservation
// en cours est gardée en mémoire et on revient ici.
export default function RecapStep() {
  const { api, customer } = useSession();
  const { draft, update } = useBooking();
  const vitrine = useVitrine();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lost, setLost] = useState(false);

  const moving = !!draft.movingId;
  const chosen = (vitrine.data?.services ?? []).filter((s) => draft.serviceIds.includes(s.id));
  const total = chosen.reduce((sum, s) => sum + s.priceCents, 0);
  const minutes = chosen.reduce((sum, s) => sum + s.durationMin, 0);

  async function confirm() {
    if (!draft.startsAt) return;
    setBusy(true);
    setError(null);
    try {
      if (draft.movingId) {
        await api.post(`/appointments/${draft.movingId}/reschedule`, { staffId: draft.staffId, startsAt: draft.startsAt });
      } else {
        await api.post("/appointments", {
          serviceIds: draft.serviceIds,
          staffId: draft.staffId,
          startsAt: draft.startsAt,
          ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
          ...(draft.forName.trim() ? { forName: draft.forName.trim() } : {}),
        });
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace("/reserver/confirmation");
    } catch (e) {
      setError(messageOf(e));
      // Créneau pris entre-temps ou devenu impossible : on propose d'en choisir un autre.
      if (e instanceof ApiError && e.status !== 0 && e.code !== "not_signed_in" && e.code !== "rate_limited") setLost(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={
        customer ? (
          lost ? (
            <Button label="Choisir un autre créneau" onPress={() => { update({ startsAt: null, slotLabel: null }); router.back(); }} />
          ) : (
            <Button label={moving ? "Confirmer le nouveau créneau" : "Confirmer la réservation"} onPress={() => void confirm()} loading={busy} disabled={!draft.startsAt} />
          )
        ) : (
          <Button label="Se connecter pour réserver" arrow onPress={() => router.replace("/reserver/compte")} />
        )
      }
    >
      <StepHeader step={5} label="Récapitulatif" />
      <Title>{moving ? "Nouveau créneau" : "Récapitulatif"}</Title>
      <Card>
        <Heading style={lost ? { textDecorationLine: "line-through", color: colors.stone } : undefined}>
          {draft.slotLabel ?? "Aucun créneau choisi"}
        </Heading>
        {chosen.map((s) => (
          <Body key={s.id}>
            {s.name} · {formatPrice(s.priceCents)}
          </Body>
        ))}
        {!moving && chosen.length > 0 ? (
          <Muted>
            Total {formatPrice(total)} · {formatDuration(minutes)} · paiement au salon
          </Muted>
        ) : null}
        {moving ? <Muted>Les prestations de votre rendez-vous ne changent pas.</Muted> : null}
      </Card>

      {!moving ? (
        <>
          <Field label="Pour qui ? (facultatif)" placeholder="Le prénom, si c'est pour un proche" value={draft.forName} onChangeText={(forName) => update({ forName })} maxLength={200} />
          <Field label="Une précision pour le coiffeur ? (facultatif)" value={draft.note} onChangeText={(note) => update({ note })} maxLength={300} multiline />
        </>
      ) : null}
      {!customer ? <Body>Connectez-vous ou créez un compte pour terminer : votre choix est gardé.</Body> : null}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
