import {
  CormorantGaramond_500Medium,
  CormorantGaramond_600SemiBold,
} from "@expo-google-fonts/cormorant-garamond";
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from "@expo-google-fonts/manrope";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { DarkTheme, Stack, ThemeProvider, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BookingProvider } from "@/booking";
import { EclipseBackground } from "@/eclipse-background";
import { homeFade } from "@/home-scroll";
import { configureNotifications, openFromNotification } from "@/notifications";
import { SessionProvider, useSession } from "@/session";
import { colors } from "@/theme";

void SplashScreen.preventAutoHideAsync();
configureNotifications();

// Thème de navigation : sans lui, les écrans prennent le fond gris clair par défaut et cachent le fond d'éclipse.
const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: "transparent",
    card: colors.ink,
    border: colors.line,
    primary: colors.accent,
    text: colors.ivory,
  },
};

function Gate() {
  const { ready } = useSession();
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    CormorantGaramond_500Medium,
    CormorantGaramond_600SemiBold,
  });
  const done = ready && fontsLoaded;
  // L'accueil montre l'éclipse en pleine lumière (comme le site) ; les autres écrans la voilent pour la lisibilité.
  const home = usePathname() === "/";
  const veil = home ? 0 : 0.5;
  useEffect(() => {
    if (done) void SplashScreen.hideAsync();
  }, [done]);
  // Toucher une notification ouvre l'offre ou les rendez-vous : à chaud (app ouverte) et à froid (app fermée).
  useEffect(() => {
    if (!done || Platform.OS !== "ios") return;
    void Notifications.getLastNotificationResponseAsync().then(openFromNotification).catch(() => {});
    const subscription = Notifications.addNotificationResponseReceivedListener(openFromNotification);
    return () => subscription.remove();
  }, [done]);
  if (!done) return null;
  return (
    <ThemeProvider value={navigationTheme}>
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      {/* Fond du côté client du site (lot 18) : l'éclipse animée sur l'accueil, une image sans mouvement ailleurs, voilée pour la lisibilité. */}
      <EclipseBackground still={!home} opacity={home ? homeFade.opacity : 1} lift={home ? homeFade.lift : undefined} zoom={home ? homeFade.zoom : undefined} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,13,29,${veil})` }]} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "transparent" } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="reserver" />
        <Stack.Screen name="connexion" options={{ presentation: "modal", contentStyle: { backgroundColor: colors.ink } }} />
        <Stack.Screen name="mot-de-passe" options={{ presentation: "modal", contentStyle: { backgroundColor: colors.ink } }} />
        <Stack.Screen name="attente/[id]" options={{ presentation: "modal", contentStyle: { backgroundColor: colors.ink } }} />
      </Stack>
    </View>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <BookingProvider>
          <StatusBar style="light" />
          <Gate />
        </BookingProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
