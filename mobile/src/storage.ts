import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// Stockage du jeton : le trousseau de l'iPhone (expo-secure-store). Sur le web, seulement pour l'aperçu de développement
// (captures d'écran de l'app dans un navigateur) : localStorage. L'app publiée est iOS uniquement.

export async function getSecret(key: string): Promise<string | null> {
  if (Platform.OS === "web") return globalThis.localStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

export async function setSecret(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") globalThis.localStorage?.setItem(key, value);
  else await SecureStore.setItemAsync(key, value);
}

export async function deleteSecret(key: string): Promise<void> {
  if (Platform.OS === "web") globalThis.localStorage?.removeItem(key);
  else await SecureStore.deleteItemAsync(key);
}
