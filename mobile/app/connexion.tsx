import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { AuthForm } from "@/auth-form";
import { spacing } from "@/theme";
import { Screen } from "@/ui";

// Fenêtre de connexion et d'inscription (ouverte depuis Mes RDV, Fidélité, Compte…). Une fois connecté, on revient où
// l'on était.
export default function ConnexionScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  return (
    <Screen padTop={false}>
      <View style={{ paddingTop: spacing.lg }}>
        <AuthForm initialMode={params.mode === "register" ? "signup" : "login"} onDone={() => router.back()} />
      </View>
    </Screen>
  );
}
