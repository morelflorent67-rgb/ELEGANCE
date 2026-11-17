import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { messageOf } from "@/api/client";
import type { DaysResponse } from "@/api/types";
import { useBooking } from "@/booking";
import { zonedNow } from "@/lib/shared/status";
import { StepHeader } from "@/step-header";
import { useSession } from "@/session";
import { colors, fonts, spacing } from "@/theme";
import { useLoad } from "@/use-load";
import { Body, Button, Card, Chip, ErrorText, Heading, LoadState, Muted, Screen, Title } from "@/ui";

type Window = "morning" | "afternoon" | "day";
const WINDOWS: { id: Window; label: string }[] = [
  { id: "morning", label: "Le matin" },
  { id: "afternoon", label: "L'après-midi" },
  { id: "day", label: "Toute la journée" },
];

// Étape 3 : le jour et l'heure. Les créneaux sont calculés par le serveur (module de disponibilité) : l'app ne fait
// qu'afficher la bande de jours, jours fermés et complets compris.
export default function SlotStep() {
  const { api, customer } = useSession();
  const { draft, update } = useBooking();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const loaded = useLoad(
    () =>
      api.post<DaysResponse>("/days", {
        serviceIds: draft.movingId ? [] : draft.serviceIds,
        staffId: draft.staffId,
        from: zonedNow(new Date()).date,
        days: 92,
        ...(draft.movingId ? { appointmentId: draft.movingId } : {}),
      }),
    [draft.movingId, draft.staffId, draft.serviceIds.join(",")],
  );

  const days = (loaded.data?.days ?? []).filter((d) => d.date <= (loaded.data?.lastBookable ?? "9999"));
  const day = days.find((d) => d.date === selectedDate) ?? days.find((d) => d.state === "open") ?? null;

  return (
    <Screen
      footer={
        <Button label="Continuer" disabled={!draft.startsAt} onPress={() => router.push("/reserver/recap")} />
      }
    >
      <StepHeader step={3} />
      <Title>Quand ?</Title>
      <LoadState loading={loaded.loading} error={loaded.error} hasData={!!loaded.data} reload={loaded.reload}>
        {days.length === 0 ? <Body>Aucun jour n&apos;est ouvert à la réservation pour le moment.</Body> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {days.map((d) => {
            const active = day?.date === d.date;
            const disabled = d.state === "closed";
            return (
              <Pressable
                key={d.date}
                accessibilityRole="button"
                accessibilityLabel={`${d.label}${d.state === "full" ? ", complet" : disabled ? ", fermé" : ""}`}
                accessibilityState={{ selected: active, disabled }}
                disabled={disabled}
                onPress={() => {
                  setSelectedDate(d.date);
                  update({ startsAt: null, slotLabel: null });
                }}
                style={{
                  width: 60,
                  paddingVertical: spacing.md,
                  borderRadius: 14,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: active ? colors.ivory : colors.line,
                  backgroundColor: active ? colors.ivory : "transparent",
                  opacity: disabled ? 0.35 : 1,
                }}
              >
                <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: active ? colors.ink : colors.stone }}>{d.dow}</Text>
                <Text style={{ fontFamily: fonts.displaySemi, fontSize: 24, fontVariant: ["lining-nums", "tabular-nums"], color: active ? colors.ink : colors.ivory }}>{d.num}</Text>
                <Text style={{ fontFamily: fonts.sans, fontSize: 10, color: active ? colors.ink : colors.stone }}>
                  {d.state === "full" ? "complet" : d.state === "closed" ? "fermé" : ""}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {day ? (
          <View style={{ gap: spacing.md }}>
            <Heading>{day.label}</Heading>
            {day.state === "open" ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {day.slots.map((s) => (
                  <Chip
                    key={s.iso}
                    label={s.time}
                    selected={draft.startsAt === s.iso}
                    onPress={() => update({ startsAt: s.iso, slotLabel: `${day.label} · ${s.time}` })}
                  />
                ))}
              </View>
            ) : (
              <Body>Ce jour est complet.</Body>
            )}
          </View>
        ) : null}

        {day && day.state === "full" && !draft.movingId ? (
          <Waitlist date={day.date} signedIn={!!customer} />
        ) : null}
        <Muted>Les horaires affichés sont ceux du salon, heure de Paris.</Muted>
      </LoadState>
    </Screen>
  );
}

function Waitlist({ date, signedIn }: { date: string; signedIn: boolean }) {
  const { api } = useSession();
  const { draft } = useBooking();
  const [window, setWindow] = useState<Window>("day");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/waitlist", { serviceIds: draft.serviceIds, staffId: draft.staffId, days: [date], window });
      setDone(true);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Heading>Me prévenir si une place se libère</Heading>
      {done ? (
        <Body>C&apos;est noté. Vous serez prévenu(e) dès qu&apos;une place se libère ; elle sera gardée pour vous quelques minutes.</Body>
      ) : !signedIn ? (
        <>
          <Muted>Connectez-vous pour vous inscrire sur la liste d&apos;attente.</Muted>
          <Button label="Se connecter" kind="secondary" onPress={() => router.push("/connexion")} />
        </>
      ) : (
        <>
          <View style={{ gap: spacing.sm }}>
            {WINDOWS.map((w) => (
              <Chip key={w.id} label={w.label} selected={window === w.id} onPress={() => setWindow(w.id)} />
            ))}
          </View>
          <ErrorText>{error}</ErrorText>
          <Button label="M'inscrire" onPress={() => void join()} loading={busy} />
        </>
      )}
    </Card>
  );
}
