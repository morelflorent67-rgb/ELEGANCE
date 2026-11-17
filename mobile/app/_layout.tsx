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
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ink } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="reserver" />
      <Stack.Screen name="connexion" options={{ presentation: "modal" }} />
      <Stack.Screen name="mot-de-passe" options={{ presentation: "modal" }} />
      <Stack.Screen name="attente/[id]" options={{ presentation: "modal" }} />
    </Stack>
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
