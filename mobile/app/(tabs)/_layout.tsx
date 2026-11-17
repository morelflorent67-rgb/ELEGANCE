import { Tabs } from "expo-router";
import { colors, fonts } from "@/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.ink, borderTopColor: colors.line },
        tabBarActiveTintColor: colors.ivory,
        tabBarInactiveTintColor: colors.stone,
        tabBarLabelStyle: { fontFamily: fonts.sansSemi, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" },
        tabBarIconStyle: { display: "none" },
        tabBarLabelPosition: "beside-icon",
        sceneStyle: { backgroundColor: "transparent" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Accueil" }} />
      <Tabs.Screen name="rendez-vous" options={{ title: "Mes RDV" }} />
      <Tabs.Screen name="fidelite" options={{ title: "Fidélité" }} />
      <Tabs.Screen name="compte" options={{ title: "Compte" }} />
    </Tabs>
  );
}
