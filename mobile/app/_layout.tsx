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
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Image, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BookingProvider } from "@/booking";
import { SessionProvider, useSession } from "@/session";
import { colors } from "@/theme";

void SplashScreen.preventAutoHideAsync();

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
  useEffect(() => {
    if (done) void SplashScreen.hideAsync();
  }, [done]);
  if (!done) return null;
  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      {/* Fond du côté client du site (lot 18) : image figée de l'éclipse, voilée pour la lisibilité. */}
      <Image source={require("../assets/fond-eclipse.webp")} resizeMode="cover" style={StyleSheet.absoluteFill} accessibilityElementsHidden />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,13,29,0.5)" }]} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "transparent" } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="reserver" />
        <Stack.Screen name="connexion" options={{ presentation: "modal", contentStyle: { backgroundColor: colors.ink } }} />
        <Stack.Screen name="mot-de-passe" options={{ presentation: "modal", contentStyle: { backgroundColor: colors.ink } }} />
        <Stack.Screen name="attente/[id]" options={{ presentation: "modal", contentStyle: { backgroundColor: colors.ink } }} />
      </Stack>
    </View>
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
