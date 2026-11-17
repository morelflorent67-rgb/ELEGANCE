import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { View } from "react-native";
import type { LoyaltyResponse } from "@/api/types";
import { NeedsLogin } from "@/needs-login";
import { useSession } from "@/session";
import { colors, spacing } from "@/theme";
import { useLoad } from "@/use-load";
import { Body, Card, Heading, LoadState, Muted, Row, Screen, Title } from "@/ui";

export default function LoyaltyScreen() {
  const { customer } = useSession();
  if (!customer) {
    return <NeedsLogin title="Fidélité" text="Connectez-vous pour suivre votre carte de fidélité." />;
  }
  return <Loyalty />;
}

function Loyalty() {
  const { api } = useSession();
  const loaded = useLoad(() => api.get<LoyaltyResponse>("/loyalty"));
  const { reload } = loaded;
  useFocusEffect(useCallback(() => reload(), [reload]));
  const data = loaded.data;

  return (
    <Screen>
      <Title>Fidélité</Title>
      <LoadState loading={loaded.loading} error={loaded.error} hasData={!!data} reload={loaded.reload}>
        {data ? <Card_ data={data} /> : null}
      </LoadState>
    </Screen>
  );
}

function Card_({ data }: { data: LoyaltyResponse }) {
  const { card } = data;
  if (!card.enabled) return <Body>Le programme de fidélité n&apos;est pas actif pour le moment.</Body>;
  return (
    <>
      <Card>
        <Heading>{card.balance} points</Heading>
        <View style={{ flexDirection: "row", gap: 6, marginVertical: spacing.sm }} accessibilityLabel={`${card.balance} points sur ${card.threshold}`}>
          {card.cells.map((cell, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 34,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: colors.lineStrong,
                overflow: "hidden",
              }}
            >
              <View style={{ width: `${cell.fill * 100}%`, height: "100%", backgroundColor: colors.accent }} />
            </View>
          ))}
        </View>
        {card.rewardsAvailable > 0 ? (
          <Body>
            {card.rewardsAvailable === 1 ? "Une coupe offerte vous attend" : `${card.rewardsAvailable} coupes offertes vous attendent`}.
            À présenter au salon.
          </Body>
        ) : (
          <Body>Encore {card.pointsToNext} points avant votre prochaine coupe offerte.</Body>
        )}
        <Muted>Une visite rapporte environ {data.pointsPerVisit} points.</Muted>
      </Card>

      {card.history.length > 0 ? <Heading>Historique</Heading> : null}
      {card.history.map((h) => (
        <Row key={h.id} style={{ justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Body>{h.label}</Body>
            <Muted>{h.dateLabel}</Muted>
          </View>
          <Body style={{ color: h.points >= 0 ? colors.accentShine : colors.brick }}>
            {h.points > 0 ? "+" : ""}
            {h.points}
          </Body>
        </Row>
      ))}
    </>
  );
}
