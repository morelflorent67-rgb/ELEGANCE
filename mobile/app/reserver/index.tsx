import { router } from "expo-router";
import { Linking, Pressable, View } from "react-native";
import type { Service } from "@/api/types";
import { useBooking } from "@/booking";
import { formatDuration, formatPrice } from "@/lib/money";
import { StepHeader } from "@/step-header";
import { colors, spacing } from "@/theme";
import { Body, Button, Card, Heading, LoadState, Muted, Row, Screen, Title } from "@/ui";
import { useVitrine } from "@/vitrine";

// Étape 1 : les prestations (R-13 à R-18). La carte vient du serveur ; les règles de combinaison aussi (refus à l'étape suivante).
export default function ServicesStep() {
  const vitrine = useVitrine();
  const { draft, update } = useBooking();
  const data = vitrine.data;

  const groups = new Map<string, Service[]>();
  for (const s of data?.services ?? []) groups.set(s.category, [...(groups.get(s.category) ?? []), s]);

  const chosen = (data?.services ?? []).filter((s) => draft.serviceIds.includes(s.id));
  const total = chosen.reduce((sum, s) => sum + s.priceCents, 0);
  const minutes = chosen.reduce((sum, s) => sum + s.durationMin, 0);

  const toggle = (id: string) =>
    update({
      serviceIds: draft.serviceIds.includes(id) ? draft.serviceIds.filter((x) => x !== id) : [...draft.serviceIds, id],
    });

  return (
    <Screen
      footer={
        <>
          {chosen.length > 0 ? (
            <Muted style={{ textAlign: "center" }}>
              {formatPrice(total)} · {formatDuration(minutes)}
            </Muted>
          ) : null}
          <Button label="Continuer" disabled={chosen.length === 0} onPress={() => router.push("/reserver/coiffeur")} />
        </>
      }
    >
      <StepHeader step={1} />
      <Title>Quelle prestation ?</Title>
      <LoadState loading={vitrine.loading} error={vitrine.error} hasData={!!data} reload={vitrine.reload}>
        {[...groups.entries()].map(([category, services]) => (
          <View key={category} style={{ gap: spacing.sm }}>
            <Heading>{category}</Heading>
            {services.map((s) => {
              const selected = draft.serviceIds.includes(s.id);
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: !s.bookableOnline && false }}
                  onPress={() =>
                    s.bookableOnline ? toggle(s.id) : data && void Linking.openURL(data.access.phoneHref)
                  }
                >
                  <Card style={selected ? { borderColor: colors.accent, borderWidth: 1.5 } : undefined}>
                    <Row style={{ justifyContent: "space-between" }}>
                      <Body style={{ flex: 1 }}>{s.name}</Body>
                      <Body>{s.bookableOnline ? formatPrice(s.priceCents) : `à partir de ${formatPrice(s.priceCents)}`}</Body>
                    </Row>
                    <Muted>
                      {s.bookableOnline ? formatDuration(s.durationMin) : "Sur devis · touchez pour appeler le salon"}
                      {s.performedBy === "apprentice" ? " · tarif formation" : ""}
                    </Muted>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        ))}
      </LoadState>
    </Screen>
  );
}
