import { router } from "expo-router";
import { Animated, Easing, Linking, Text, View, useWindowDimensions } from "react-native";
import Svg, { Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";
import type { Vitrine } from "@/api/types";
import { useBooking } from "@/booking";
import { groupWeekHours } from "@/lib/shared/hours";
import { AccessMap } from "@/access-map";
import { homeScroll } from "@/home-scroll";
import { useOpening } from "@/opening";
import { openStatus, zonedNow } from "@/lib/shared/status";
import { colors, fonts, spacing } from "@/theme";
import { Body, Button, Eyebrow, Heading, LoadState, LabelCaps, Mark, Muted, Rule, Screen } from "@/ui";
import { useVitrine } from "@/vitrine";

// Accueil : l'arrivée (logo, titre, Réserver, Contacter), puis l'état du salon et les horaires, puis l'accès.
// Même ordre et mêmes textes que la page d'accueil du site ; tout vient du serveur.
export default function HomeScreen() {
  const vitrine = useVitrine();
  const booking = useBooking();
  const { height } = useWindowDimensions();
  const o = useOpening();
  const data = vitrine.data;

  return (
    <Screen padTop={false} gap={0} scrollY={homeScroll}>
      <View style={{ minHeight: Math.max(560, height - 110), paddingTop: 70, gap: 28 }}>
        <Animated.View
          style={{
            position: "absolute",
            top: 18,
            left: 0,
            right: 0,
            flexDirection: "row",
            alignItems: "center",
            opacity: o.at(0.6, 0.5, Easing.linear),
          }}
        >
          <Mark />
          <Text
            style={{
              marginLeft: 12,
              fontFamily: fonts.sansMedium,
              fontSize: 11,
              letterSpacing: 3.3,
              textTransform: "uppercase",
              color: colors.ivorySoft,
            }}
          >
            Elegance
          </Text>
        </Animated.View>

        {/* Le logo : deux faisceaux s'ouvrent, la zone se déplie, le néon s'allume. */}
        <View style={{ alignItems: "center", marginTop: 40, height: 76, justifyContent: "center" }}>
          <Animated.View
            pointerEvents="none"
            style={{ position: "absolute", width: 320, height: 120, opacity: o.neon.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }) }}
          >
            <Svg width={320} height={120}>
              <Defs>
                <RadialGradient id="logo-glow" cx="50%" cy="50%" rx="50%" ry="50%">
                  <Stop offset="0" stopColor="#efe9dd" stopOpacity={0.16} />
                  <Stop offset="1" stopColor="#efe9dd" stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Ellipse cx={160} cy={60} rx={160} ry={60} fill="url(#logo-glow)" />
            </Svg>
          </Animated.View>
          <Animated.View style={{ transform: [{ scaleY: o.at(0.25, 0.4, o.draw) }] }}>
            <Animated.Image
              source={require("../../assets/logo-ivoire.png")}
              resizeMode="contain"
              accessibilityLabel="Elegance Strasbourg"
              style={{ width: 252, height: 76, opacity: o.neon }}
            />
          </Animated.View>
          {[{ top: 4, from: 34 }, { top: 72, from: -34 }].map(({ top, from }) => (
            <Animated.View
              key={top}
              pointerEvents="none"
              style={{ position: "absolute", top, width: 300, transform: [{ translateY: o.between(0.25, 0.4, from, 0, o.draw) }] }}
            >
              <Animated.View
                style={{
                  height: 1,
                  backgroundColor: "#fff",
                  opacity: o.beamOpacity,
                  transform: [{ scaleX: o.beamScale }],
                  shadowColor: "#fff",
                  shadowOpacity: 0.65,
                  shadowRadius: 5,
                  shadowOffset: { width: 0, height: 0 },
                }}
              />
            </Animated.View>
          ))}
        </View>

        <View style={{ alignItems: "center", gap: 14, marginTop: 24 }}>
          {[
            { text: "Bien plus", start: 0.62 },
            { text: "qu’une coupe.", start: 0.7 },
          ].map((line, i) => (
            <View key={line.text} style={{ overflow: "hidden", height: 50, marginTop: i === 0 ? 0 : -12 }}>
              <Animated.Text
                accessibilityRole="header"
                accessibilityLabel={i === 0 ? "Bien plus qu’une coupe." : undefined}
                accessibilityElementsHidden={i === 1}
                style={{
                  fontFamily: fonts.display,
                  fontSize: 46,
                  lineHeight: 50,
                  letterSpacing: -0.5,
                  color: colors.ivory,
                  textAlign: "center",
                  transform: [{ translateY: o.between(line.start, 0.7, 54, 0) }],
                }}
              >
                {line.text}
              </Animated.Text>
            </View>
          ))}
          <Animated.Text
            style={{
              fontFamily: fonts.sans,
              fontSize: 13,
              color: colors.ivorySoft,
              opacity: o.at(0.78, 0.5),
              transform: [{ translateY: o.between(0.78, 0.5, 10, 0) }],
            }}
          >
            Coiffure homme et barbe · Schiltigheim
          </Animated.Text>
        </View>

        <View style={{ gap: 12, marginTop: 20 }}>
          <Animated.View style={{ opacity: o.at(0.82, 0.5), transform: [{ translateY: o.between(0.82, 0.5, 10, 0) }] }}>
            <Button
              label="Réserver"
              arrow
              onPress={() => {
                booking.reset();
                router.push("/reserver");
              }}
            />
          </Animated.View>
          <Animated.View style={{ opacity: o.at(0.88, 0.5), transform: [{ translateY: o.between(0.88, 0.5, 10, 0) }] }}>
            <Button
              label="Contacter"
              kind="secondary"
              onPress={() => data && void Linking.openURL(data.access.phoneHref)}
              disabled={!data}
            />
          </Animated.View>
        </View>
      </View>

      <LoadState loading={vitrine.loading} error={vitrine.error} hasData={!!data} reload={vitrine.reload}>
        {data ? <Details data={data} /> : null}
      </LoadState>
    </Screen>
  );
}

function Details({ data }: { data: Vitrine }) {
  const status = openStatus(data.week, data.closures, zonedNow(new Date()));
  const rows = groupWeekHours(data.week);
  const { access } = data;
  return (
    <>
      {data.reviewCount ? (
        <View
          style={{
            alignItems: "center",
            gap: 14,
            paddingVertical: 36,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: "rgba(239,233,221,0.08)",
          }}
        >
          <Text style={{ color: colors.accent, fontSize: 18, letterSpacing: 6 }}>★★★★★</Text>
          <Text style={{ fontFamily: fonts.display, fontSize: 32, lineHeight: 34, color: colors.ivory, textAlign: "center" }}>
            Plus de {data.reviewCount.toLocaleString("fr-FR")} avis
          </Text>
          <LabelCaps>Des clients qui nous font confiance</LabelCaps>
        </View>
      ) : null}

      {data.loyaltyPitch ? (
        <Text
          style={{
            paddingTop: 28,
            paddingBottom: 8,
            textAlign: "center",
            fontFamily: fonts.sansSemi,
            fontSize: 11,
            letterSpacing: 2.6,
            textTransform: "uppercase",
            color: colors.ivorySoft,
          }}
        >
          Carte de fidélité · {data.loyaltyPitch}
        </Text>
      ) : null}

      <View style={{ paddingTop: 56, gap: 22 }}>
        <Eyebrow>Horaires</Eyebrow>
        <View style={{ gap: 14 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 46, lineHeight: 48, color: colors.ivory }}>
            {status.headline}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: status.open ? colors.accent : colors.stone,
              }}
            />
            <Body style={{ color: colors.ivorySoft, fontSize: 14 }}>{status.detail}</Body>
          </View>
        </View>
        <View>
          <Rule />
          {rows.map((row) => (
            <View key={row.label}>
              <View style={{ minHeight: 64, flexDirection: "row", alignItems: "center" }}>
                <Text
                  style={{
                    width: 150,
                    fontFamily: fonts.sansSemi,
                    fontSize: 11,
                    letterSpacing: 2.6,
                    textTransform: "uppercase",
                    color: row.closed ? colors.stone : colors.ivory,
                  }}
                >
                  {row.label}
                </Text>
                <Body style={{ flex: 1, fontSize: 14, color: row.closed ? colors.stone : colors.ivory }}>
                  {row.closed ? "Fermé" : row.ranges.join("\n")}
                </Body>
              </View>
              <Rule />
            </View>
          ))}
        </View>
      </View>

      <View style={{ paddingTop: 56, gap: 20 }}>
        <Eyebrow>Accès</Eyebrow>
        <View style={{ marginHorizontal: -spacing.xl }}>
          <AccessMap city="Schiltigheim" road="Route de Bischwiller" />
        </View>
        <Heading>Nous trouver</Heading>
        <Body style={{ color: colors.ivorySoft, fontSize: 14 }}>{access.address}</Body>
        <View style={{ gap: 4 }}>
          {access.ways.map((way) => (
            <Muted key={way.kind}>
              {way.title} · {way.detail}
            </Muted>
          ))}
        </View>
        <View style={{ gap: spacing.sm }}>
          <Button label="Itinéraire" kind="secondary" onPress={() => void Linking.openURL(access.applePlansUrl)} />
          <Button label="Waze" kind="secondary" onPress={() => void Linking.openURL(access.wazeUrl)} />
          <Button label={`Appeler · ${access.phoneDisplay}`} kind="secondary" onPress={() => void Linking.openURL(access.phoneHref)} />
        </View>
      </View>
    </>
  );
}
