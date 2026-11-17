import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Platform } from "react-native";
import type { ApiClient } from "@/api/client";

// Notifications (lot 27, R-102, D-124). Le serveur décide de tout (quoi, quand) et écrit le texte ; l'app ne fait que
// demander l'autorisation, donner à l'iPhone sa clé à Apple (jeton APNs) au serveur, et ouvrir le bon écran au toucher.
// Elles accompagnent les emails, ne les remplacent pas.

/** Ce que le serveur met dans `data` de la notification (src/modules/push/transport.ts du site). */
export type PushData = { kind: "offer"; offerId: string } | { kind: "appointment"; appointmentId: string };

/** Premier plan : la notification s'affiche aussi quand l'app est ouverte (une place gardée 15 minutes ne doit pas passer inaperçue). */
export function configureNotifications(): void {
  if (Platform.OS !== "ios") return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Écran à ouvrir pour une notification : l'offre de place libérée, ou la liste des rendez-vous. */
export function routeFor(data: unknown): "/rendez-vous" | `/attente/${string}` | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Partial<Record<string, unknown>>;
  if (d.kind === "offer" && typeof d.offerId === "string" && /^[0-9a-f-]{36}$/i.test(d.offerId)) {
    return `/attente/${d.offerId}`;
  }
  if (d.kind === "appointment") return "/rendez-vous";
  return null;
}

export function openFromNotification(response: Notifications.NotificationResponse | null): void {
  if (!response) return;
  const path = routeFor(response.notification.request.content.data?.data ?? response.notification.request.content.data);
  if (path) router.push(path);
}

export type Permission = "granted" | "denied" | "undetermined" | "unsupported";

export async function notificationPermission(): Promise<Permission> {
  if (Platform.OS !== "ios") return "unsupported";
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return "granted";
  return current.canAskAgain ? "undetermined" : "denied";
}

/** Rattache l'iPhone au compte (si l'autorisation est déjà donnée) : à chaque connexion. Silencieux en cas d'échec. */
export async function registerDeviceIfAllowed(api: ApiClient): Promise<void> {
  try {
    if ((await notificationPermission()) !== "granted") return;
    const token = await Notifications.getDevicePushTokenAsync();
    if (typeof token.data === "string") await api.post("/push-device", { token: token.data });
  } catch {
    // Pas de jeton (simulateur, Expo Go, pas de réseau) : l'app fonctionne sans notification.
  }
}

/** Demande l'autorisation (une seule fois, après la première réservation), puis enregistre l'appareil. Renvoie l'état final. */
export async function askAndRegister(api: ApiClient): Promise<Permission> {
  if (Platform.OS !== "ios") return "unsupported";
  const before = await notificationPermission();
  if (before === "undetermined") {
    const asked = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    if (!asked.granted) return "denied";
  } else if (before !== "granted") {
    return before;
  }
  await registerDeviceIfAllowed(api);
  return "granted";
}

/** À la déconnexion : l'iPhone n'est plus rattaché au compte (avant de fermer la session). */
export async function unregisterDevice(api: ApiClient): Promise<void> {
  try {
    if ((await notificationPermission()) !== "granted") return;
    const token = await Notifications.getDevicePushTokenAsync();
    if (typeof token.data === "string") await api.delete("/push-device", { token: token.data });
  } catch {
    // Hors ligne : le jeton restera rattaché jusqu'à la prochaine connexion d'un autre compte ou la suppression du compte.
  }
}
