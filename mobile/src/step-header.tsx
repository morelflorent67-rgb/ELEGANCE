import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { colors, fonts, spacing } from "@/theme";
import { Muted } from "@/ui";

/** En-tête d'une étape de réservation : retour, « Étape n sur 4 », et abandon. */
export function StepHeader({ step, total = 4 }: { step: number; total?: number }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retour"
        hitSlop={12}
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      >
        <Text style={{ fontFamily: fonts.sansSemi, color: colors.accent, fontSize: 15 }}>‹ Retour</Text>
      </Pressable>
      <Muted>
        Étape {step} sur {total}
      </Muted>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Abandonner la réservation"
        hitSlop={12}
        onPress={() => router.dismissTo("/")}
        style={{ paddingLeft: spacing.sm }}
      >
        <Text style={{ fontFamily: fonts.sansMedium, color: colors.stone, fontSize: 14 }}>Fermer</Text>
      </Pressable>
    </View>
  );
}
