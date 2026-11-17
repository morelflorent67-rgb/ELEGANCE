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
        tabBarLabelStyle: { fontFamily: fonts.sansSemi, fontSize: 13 },
        tabBarIconStyle: { display: "none" },
        tabBarLabelPosition: "beside-icon",
        sceneStyle: { backgroundColor: colors.ink },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Accueil" }} />
      <Tabs.Screen name="rendez-vous" options={{ title: "Mes RDV" }} />
      <Tabs.Screen name="fidelite" options={{ title: "Fidélité" }} />
      <Tabs.Screen name="compte" options={{ title: "Compte" }} />
    </Tabs>
  );
}
