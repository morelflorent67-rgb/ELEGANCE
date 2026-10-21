import { appIcon } from "@/lib/app-icon";

// Icône de l'écran d'accueil de l'iPad et de l'iPhone (D-69).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return appIcon(size.width);
}
