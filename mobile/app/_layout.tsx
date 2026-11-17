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
import { DarkTheme, Stack, ThemeProvider, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Image, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BookingProvider } from "@/booking";
import { SessionProvider, useSession } from "@/session";
import { colors } from "@/theme";

void SplashScreen.preventAutoHideAsync();

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
  const veil = usePathname() === "/" ? 0 : 0.5;
  useEffect(() => {
    if (done) void SplashScreen.hideAsync();
  }, [done]);
  if (!done) return null;
  return (
    <ThemeProvider value={navigationTheme}>
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      {/* Fond du côté client du site (lot 18) : image figée de l'éclipse, voilée pour la lisibilité. */}
      <Image source={require("../assets/fond-eclipse.webp")} resizeMode="cover" style={StyleSheet.absoluteFill} accessibilityElementsHidden />
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
