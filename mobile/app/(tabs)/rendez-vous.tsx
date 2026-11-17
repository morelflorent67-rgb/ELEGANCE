import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Linking, View } from "react-native";
import { ApiError, messageOf } from "@/api/client";
import type { AppointmentsResponse, PastAppointment, UpcomingAppointment, WaitlistLine } from "@/api/types";
import { useBooking } from "@/booking";
import { NeedsLogin } from "@/needs-login";
import { useSession } from "@/session";
import { spacing } from "@/theme";
import { useLoad } from "@/use-load";
import { Body, Button, Card, ErrorText, Heading, LoadState, Muted, Screen, Title } from "@/ui";

export default function AppointmentsScreen() {
  const { customer } = useSession();
  if (!customer) {
    return <NeedsLogin title="Mes rendez-vous" text="Connectez-vous pour retrouver, déplacer ou annuler vos rendez-vous." />;
  }
  return <Appointments />;
}

function Appointments() {
  const { api } = useSession();
  const booking = useBooking();
  const list = useLoad(() => api.get<AppointmentsResponse>("/appointments"));
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Revient sur l'écran (après une réservation, une annulation…) : on relit le serveur.
  const { reload } = list;
  useFocusEffect(useCallback(() => reload(), [reload]));

  async function run(id: string, action: () => Promise<void>) {
    setBusy(id);
    setActionError(null);
    try {
      await action();
      reload();
    } catch (e) {
      setActionError(messageOf(e));
      if (e instanceof ApiError && e.code === "change_too_late") reload();
    } finally {
      setBusy(null);
    }
  }

  function confirmCancel(a: UpcomingAppointment) {
    Alert.alert("Annuler ce rendez-vous ?", `${a.dayLabel} à ${a.time}, ${a.what}.`, [
      { text: "Garder", style: "cancel" },
      {
        text: "Annuler le rendez-vous",
        style: "destructive",
        onPress: () => void run(a.id, async () => void (await api.post(`/appointments/${a.id}/cancel`))),
      },
    ]);
  }

  function move(a: UpcomingAppointment) {
    // Les prestations viennent du RDV (côté serveur) : l'app ne garde que son identifiant.
    booking.reset({ movingId: a.id });
    router.push("/reserver/coiffeur");
  }

  function repeat(p: PastAppointment) {
    void run(p.id, async () => {
      const source = await api.get<{ serviceIds: string[]; staffId: string }>(`/appointments/${p.id}/repeat`);
      booking.reset({ serviceIds: source.serviceIds, staffId: source.staffId });
      router.push("/reserver/creneau");
    });
  }

  const data = list.data;
  return (
    <Screen>
      <Title>Mes rendez-vous</Title>
      <ErrorText>{actionError}</ErrorText>
      <LoadState loading={list.loading} error={list.error} hasData={!!data} reload={list.reload}>
        {data ? (
          <>
            <Muted>
              {data.booking.upcoming} rendez-vous à venir sur {data.booking.maxUpcoming}
            </Muted>
            {data.booking.blocked ? (
              <Card>
                <Body>La réservation en ligne est indisponible pour votre compte. Appelez le salon.</Body>
              </Card>
            ) : null}

            {data.upcoming.length === 0 ? <Body>Aucun rendez-vous à venir.</Body> : null}
            {data.upcoming.map((a) => (
              <Card key={a.id}>
                <Heading>{a.dayLabel}</Heading>
                <Body>
                  {a.time}
                  {a.relative ? ` · ${a.relative}` : ""}
                  {a.soon ? ` · ${a.soon}` : ""}
                </Body>
                <Body>{a.what}</Body>
                <Muted>
                  {a.staffLabel} · {a.price}
                  {a.repeated ? " · rendez-vous répété" : ""}
                </Muted>
                {a.changeable ? (
                  <>
                    <Muted>Modifiable ou annulable jusqu&apos;au {a.deadlineLabel}</Muted>
                    <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                      <Button label="Modifier" kind="secondary" disabled={busy === a.id} onPress={() => move(a)} />
                      <Button
                        label="Annuler"
                        kind="danger"
                        loading={busy === a.id}
                        onPress={() => confirmCancel(a)}
                      />
                    </View>
                  </>
                ) : (
                  <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                    <Muted>Pour modifier ce rendez-vous, appelez le salon.</Muted>
                    <Button label="Appeler le salon" kind="secondary" onPress={() => void callSalon(api)} />
                  </View>
                )}
              </Card>
            ))}

            {data.waitlist.length > 0 ? (
              <>
                <Heading>Liste d&apos;attente</Heading>
                {data.waitlist.map((w) => (
                  <WaitlistCard
                    key={w.id}
                    line={w}
                    busy={busy === w.id}
                    onLeave={() => void run(w.id, async () => void (await api.delete(`/waitlist/${w.id}`)))}
                  />
                ))}
              </>
            ) : null}

            {data.past.length > 0 ? <Heading>Déjà venus</Heading> : null}
            {data.past.map((p) => (
              <Card key={p.id}>
                <Body>{p.whenLabel}</Body>
                <Muted>{p.summary}</Muted>
                {p.statusLabel ? <Muted>{p.statusLabel}</Muted> : null}
                {p.canRepeat ? (
                  <Button label="Reprendre le même rendez-vous" kind="secondary" loading={busy === p.id} onPress={() => repeat(p)} />
                ) : null}
              </Card>
            ))}
          </>
        ) : null}
      </LoadState>
    </Screen>
  );
}

function WaitlistCard({ line, busy, onLeave }: { line: WaitlistLine; busy: boolean; onLeave: () => void }) {
  return (
    <Card>
      <Body>{line.what}</Body>
      <Muted>
        {line.daysLabel} · {line.windowLabel} · {line.staffLabel}
      </Muted>
      {line.offer ? (
        <Button
          label={`Une place est libre : ${line.offer.label}`}
          onPress={() => router.push(`/attente/${line.offer!.id}`)}
        />
      ) : null}
      <Button label="Me retirer de la liste" kind="secondary" loading={busy} onPress={onLeave} />
    </Card>
  );
}

async function callSalon(api: ReturnType<typeof useSession>["api"]) {
  const vitrine = await api.get<{ access: { phoneHref: string } }>("/vitrine").catch(() => null);
  if (vitrine) await Linking.openURL(vitrine.access.phoneHref);
}
