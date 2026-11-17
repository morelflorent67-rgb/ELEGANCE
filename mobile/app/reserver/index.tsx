import { router } from "expo-router";
import { Linking, Pressable, Text, View } from "react-native";
import type { Service } from "@/api/types";
import { useBooking } from "@/booking";
import { formatDuration, formatPrice } from "@/lib/money";
import { StepHeader } from "@/step-header";
import { colors, fonts, spacing } from "@/theme";
import { Body, Button, Check, Eyebrow, LabelCaps, LoadState, Muted, Rule, Screen, Title } from "@/ui";
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
          <Muted style={{ fontSize: 14 }}>
            {chosen.length === 0
              ? "Aucune prestation choisie"
              : `${chosen.length} ${chosen.length > 1 ? "prestations" : "prestation"} · ${formatPrice(total)} · ${formatDuration(minutes)}`}
          </Muted>
          <Button label="Continuer" arrow disabled={chosen.length === 0} onPress={() => router.push("/reserver/coiffeur")} />
        </>
      }
    >
      <StepHeader step={1} label="Prestations" />
      <View style={{ gap: 14, marginTop: 24 }}>
        <Title>Que souhaitez-vous ?</Title>
        <Body style={{ color: colors.ivorySoft }}>Plusieurs choix possibles.</Body>
      </View>
      <LoadState loading={vitrine.loading} error={vitrine.error} hasData={!!data} reload={vitrine.reload}>
        {[...groups.entries()].map(([category, services]) => (
          <View key={category} style={{ gap: spacing.sm, marginTop: spacing.lg }}>
            <Eyebrow>{category}</Eyebrow>
            <View>
              {services.map((s) => {
                const selected = draft.serviceIds.includes(s.id);
                return (
                  <View key={s.id}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${s.name}, ${formatPrice(s.priceCents)}`}
                      accessibilityState={{ selected }}
                      onPress={() => (s.bookableOnline ? toggle(s.id) : data && void Linking.openURL(data.access.phoneHref))}
                      style={{ minHeight: 70, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 }}
                    >
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={{ fontFamily: fonts.sans, fontSize: 17, lineHeight: 22, color: colors.ivory }}>
                          {s.name}
                        </Text>
                        <Muted style={{ fontSize: 14 }}>
                          {s.bookableOnline ? formatDuration(s.durationMin) : "Appeler le salon"}
                          {s.performedBy === "apprentice" ? " · tarif formation" : ""}
                        </Muted>
                      </View>
                      {s.bookableOnline ? (
                        <>
                          <Text
                            style={{
                              fontFamily: fonts.display,
                              fontSize: 26,
                              color: colors.ivory,
                              fontVariant: ["lining-nums", "tabular-nums"],
                            }}
                          >
                            {formatPrice(s.priceCents)}
                          </Text>
                          <Check checked={selected} />
                        </>
                      ) : (
                        <LabelCaps style={{ color: colors.ivory }}>Sur devis</LabelCaps>
                      )}
                    </Pressable>
                    <Rule />
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </LoadState>
    </Screen>
  );
}
