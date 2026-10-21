import { appIcon } from "@/lib/app-icon";
import { MANIFEST_ICON_SIZES } from "@/lib/web-app";

// Icônes du manifeste (D-69) : /icon/192 et /icon/512.
export function generateImageMetadata() {
  return MANIFEST_ICON_SIZES.map((size) => ({
    id: String(size),
    size: { width: size, height: size },
    contentType: "image/png",
  }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  return appIcon(Number(await id));
}
