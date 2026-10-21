import type { MetadataRoute } from "next";

// D-69 : le site s'installe sur l'écran d'accueil, sans App Store et sans mode hors ligne. Deux manifestes : celui des
// clients ouvre le site, celui de la tablette ouvre le planning. Ils sont servis hors de /equipe : le navigateur les
// charge sans cookie, et le proxy renverrait /equipe/* vers la connexion.

/** Tailles des icônes du manifeste (Android et ordinateur) ; l'iPad et l'iPhone lisent `apple-icon` (180 px). */
export const MANIFEST_ICON_SIZES = [192, 512] as const;

export const CLIENT_MANIFEST_PATH = "/site.webmanifest";
export const TABLET_MANIFEST_PATH = "/equipe.webmanifest";

const INK = "#0b0a09";

const icons: MetadataRoute.Manifest["icons"] = MANIFEST_ICON_SIZES.map((size) => ({
  src: `/icon/${size}`,
  sizes: `${size}x${size}`,
  type: "image/png",
  purpose: "any",
}));

const common = {
  display: "standalone",
  orientation: "any",
  background_color: INK,
  theme_color: INK,
  lang: "fr",
  icons,
} satisfies Partial<MetadataRoute.Manifest>;

export function clientManifest(): MetadataRoute.Manifest {
  return {
    ...common,
    id: "/",
    name: "Elegance Strasbourg",
    short_name: "Elegance",
    description: "Réserver chez Elegance Strasbourg, salon de coiffure homme et barbe.",
    start_url: "/",
    scope: "/",
  };
}

export function tabletManifest(): MetadataRoute.Manifest {
  return {
    ...common,
    id: "/equipe",
    name: "Elegance · Salon",
    short_name: "Elegance",
    description: "Le planning du salon Elegance Strasbourg.",
    start_url: "/equipe",
    scope: "/equipe",
  };
}
