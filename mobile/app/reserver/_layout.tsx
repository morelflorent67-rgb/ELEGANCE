import { Stack } from "expo-router";
import { colors } from "@/theme";

export default function BookingLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ink } }} />;
}
