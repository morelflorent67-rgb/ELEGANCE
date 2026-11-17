import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { ApiError, messageOf } from "@/api/client";
import type { DaysResponse } from "@/api/types";
import { useBooking } from "@/booking";
import { formatDuration, formatPrice } from "@/lib/money";
import { StepHeader } from "@/step-header";
import { useSession } from "@/session";
import { colors } from "@/theme";
import { Body, Button, Card, Chip, ErrorText, Field, Heading, LabelCaps, Muted, Screen, Title } from "@/ui";
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
  // Créneau pris entre-temps : les trois horaires les plus proches ce jour-là (calculés par le serveur, triés ici).
  const [nearby, setNearby] = useState<{ iso: string; time: string; label: string }[]>([]);
  const chosen = (vitrine.data?.services ?? []).filter((s) => draft.serviceIds.includes(s.id));
  const total = chosen.reduce((sum, s) => sum + s.priceCents, 0);
  const minutes = chosen.reduce((sum, s) => sum + s.durationMin, 0);

  async function loadNearby() {
    if (!draft.startsAt) return;
    try {
      const wanted = new Date(draft.startsAt);
      const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(wanted);
      const response = await api.post<DaysResponse>("/days", {
        serviceIds: draft.movingId ? [] : draft.serviceIds,
        staffId: draft.staffId,
        from: date,
        days: 1,
        ...(draft.movingId ? { appointmentId: draft.movingId } : {}),
      });
      const day = response.days[0];
      if (!day) return;
      const close = day.slots
        .filter((s) => s.iso !== draft.startsAt)
        .sort((a, b) => Math.abs(Date.parse(a.iso) - wanted.getTime()) - Math.abs(Date.parse(b.iso) - wanted.getTime()))
        .slice(0, 3)
        .sort((a, b) => Date.parse(a.iso) - Date.parse(b.iso));
      setNearby(close.map((s) => ({ ...s, label: `${day.label} · ${s.time}` })));
    } catch {
      setNearby([]);
    }
  }

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
      if (e instanceof ApiError && e.status !== 0 && e.code !== "not_signed_in" && e.code !== "rate_limited") {
        setLost(true);
        void loadNearby();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      sweep
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
      {lost && nearby.length > 0 ? (
        <View style={{ gap: 10 }}>
          <LabelCaps>Horaires proches</LabelCaps>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {nearby.map((n) => (
              <Chip
                key={n.iso}
                label={n.time}
                onPress={() => {
                  update({ startsAt: n.iso, slotLabel: n.label });
                  setLost(false);
                  setError(null);
                  setNearby([]);
                }}
              />
            ))}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
