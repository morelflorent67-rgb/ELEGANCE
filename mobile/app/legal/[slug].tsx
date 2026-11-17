import { useLocalSearchParams } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { colors, fonts, spacing } from "@/theme";
import { Body, Eyebrow, LoadState, Muted, Rule, Screen, Title } from "@/ui";
import { useVitrine } from "@/vitrine";
import { router } from "expo-router";

// Mentions légales, confidentialité, conditions : les textes du site (src/modules/vitrine/legal.ts), lus sur le serveur,
// mis à jour en même temps que lui. Lien de l'App Store : la politique de confidentialité est dans l'app.
export default function LegalScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const vitrine = useVitrine();
  const doc = vitrine.data?.legal.find((d) => d.slug === slug);

  return (
    <Screen>
      <Pressable accessibilityRole="button" accessibilityLabel="Retour" hitSlop={12} onPress={() => router.back()} style={{ width: 44, height: 44, justifyContent: "center" }}>
        <Text style={{ fontFamily: fonts.sans, fontSize: 26, color: colors.ivory }}>←</Text>
      </Pressable>
      <LoadState loading={vitrine.loading} error={vitrine.error} hasData={!!doc} reload={vitrine.reload}>
        {doc ? (
          <View style={{ gap: spacing.lg }}>
            <View style={{ gap: 10 }}>
              <Title>{doc.title}</Title>
              <Muted>Dernière mise à jour : {vitrine.data?.legalUpdated}</Muted>
            </View>
            <Rule />
            {doc.sections.map((section) => (
              <View key={section.id} style={{ gap: 10 }}>
                <Eyebrow>{`${section.num} · ${section.title}`}</Eyebrow>
                <Body style={{ color: colors.ivorySoft }}>{section.body}</Body>
              </View>
            ))}
          </View>
        ) : null}
      </LoadState>
    </Screen>
  );
}
