import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { colors, fonts } from "@/theme";
import { Mark, Muted } from "@/ui";

/** En-tête d'une étape de réservation, comme celui du site : retour, repère + nom de l'étape, abandon, et une ligne de segments. */
export function StepHeader({ step, total = 4, label }: { step: number; total?: number; label: string }) {
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={12}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          style={{ width: 44, height: 44, justifyContent: "center" }}
        >
          <Text style={{ fontFamily: fonts.sans, fontSize: 26, color: colors.ivory }}>←</Text>
        </Pressable>
        <View style={{ alignItems: "center", gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Mark size={8} />
            <Text
              style={{
                fontFamily: fonts.sansSemi,
                fontSize: 11,
                letterSpacing: 3.3,
                textTransform: "uppercase",
                color: colors.ivorySoft,
              }}
            >
              {label}
            </Text>
          </View>
          <Muted>
            Étape {step} sur {total}
          </Muted>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abandonner la réservation"
          hitSlop={12}
          onPress={() => router.dismissTo("/")}
          style={{ width: 44, height: 44, justifyContent: "center", alignItems: "flex-end" }}
        >
          <Text style={{ fontFamily: fonts.sans, fontSize: 26, color: colors.ivory }}>×</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", gap: 12 }} accessibilityElementsHidden>
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 2,
              backgroundColor: i < step ? colors.accent : "rgba(239,233,221,0.16)",
            }}
          />
        ))}
      </View>
    </View>
  );
}
