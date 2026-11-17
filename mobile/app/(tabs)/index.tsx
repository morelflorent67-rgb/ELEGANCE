import { router } from "expo-router";
import { Linking, View } from "react-native";
import { useBooking } from "@/booking";
import { groupWeekHours } from "@/lib/shared/hours";
import { openStatus, zonedNow } from "@/lib/shared/status";
import { colors, spacing } from "@/theme";
import { Body, Button, Card, Heading, LoadState, Muted, Row, Screen, Title } from "@/ui";
import { useVitrine } from "@/vitrine";

// Accueil : l'état du salon à l'instant, les horaires, l'accès avec Appeler et Itinéraire. Tout vient du serveur.
export default function HomeScreen() {
  const vitrine = useVitrine();
  const booking = useBooking();
  const data = vitrine.data;

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <Muted>{data?.salon.name ?? "Elegance Strasbourg"}</Muted>
        <Title>Bien plus qu&apos;une coupe.</Title>
      </View>

      <Button
        label="Réserver"
        onPress={() => {
          booking.reset();
          router.push("/reserver");
        }}
      />

      <LoadState
        loading={vitrine.loading}
        error={vitrine.error}
        hasData={!!data}
        reload={vitrine.reload}
      >
        {data ? <Details data={data} /> : null}
      </LoadState>
    </Screen>
  );
}

function Details({ data }: { data: NonNullable<ReturnType<typeof useVitrine>["data"]> }) {
  const status = openStatus(data.week, data.closures, zonedNow(new Date()));
  const rows = groupWeekHours(data.week);
  const { access } = data;
  return (
    <>
      <Card>
        <Row>
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: status.open ? colors.sage : colors.stone,
            }}
          />
          <Heading>{status.headline}</Heading>
        </Row>
        <Muted>{status.detail}</Muted>
      </Card>

      {data.reviewCount ? (
        <Card>
          <Heading>Plus de {data.reviewCount.toLocaleString("fr-FR")} avis</Heading>
          <Muted>Des clients qui nous font confiance</Muted>
        </Card>
      ) : null}
      {data.loyaltyPitch ? <Muted>{data.loyaltyPitch}</Muted> : null}

      <Heading>Horaires</Heading>
      <Card>
        {rows.map((row) => (
          <Row key={row.label} style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <Body style={{ flex: 1 }}>{row.label}</Body>
            <Body style={{ flex: 1, textAlign: "right", color: row.closed ? colors.stone : colors.ivory }}>
              {row.closed ? "Fermé" : row.ranges.join("\n")}
            </Body>
          </Row>
        ))}
      </Card>

      <Heading>Nous trouver</Heading>
      <Card>
        <Body>{access.address}</Body>
        {access.ways.map((way) => (
          <Muted key={way.kind}>
            {way.title} · {way.detail}
          </Muted>
        ))}
      </Card>
      <Button label={`Appeler · ${access.phoneDisplay}`} kind="secondary" onPress={() => void Linking.openURL(access.phoneHref)} />
      <Button label="Itinéraire" kind="secondary" onPress={() => void Linking.openURL(access.applePlansUrl)} />
    </>
  );
}
