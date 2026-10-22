import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import { siteUrl } from "@/lib/env";
import { photos } from "@/lib/photos";
import { CLIENT_MANIFEST_PATH } from "@/lib/web-app";
import "./globals.css";

// D-93 : Manrope (texte) et Cormorant Garamond (titres, chiffres) pour le client ; la tablette charge Sora dans son
// propre gabarit (src/app/equipe/layout.tsx).
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-manrope",
  display: "swap",
});
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

// Tant que le site n'est pas lancé, ALLOW_INDEXING reste faux : les moteurs ne l'indexent pas.
const indexable = process.env.ALLOW_INDEXING === "true";

export const metadata: Metadata = {
  // Adresse publique (SITE_URL) : base des liens canoniques et de l'image de partage. Jamais le domaine en dur.
  metadataBase: new URL(siteUrl()),
  title: { default: "Elegance Strasbourg", template: "%s · Elegance Strasbourg" },
  description: "Salon de coiffure homme et barbe à Schiltigheim, sur rendez-vous.",
  robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: "Elegance Strasbourg",
    images: [
      {
        url: photos.postesWide.src,
        width: photos.postesWide.width,
        height: photos.postesWide.height,
        alt: photos.postesWide.alt,
      },
    ],
  },
  twitter: { card: "summary_large_image" },
  // D-69 : installable sur l'écran d'accueil, avec le nom « Elegance » sous l'icône.
  manifest: CLIENT_MANIFEST_PATH,
  appleWebApp: { capable: true, title: "Elegance", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  themeColor: "#0b0a09",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning : le script de l'arrivée pose « opening-skip » sur <html> avant React (ouverture déjà
    // jouée dans cette visite) ; ce n'est pas un écart de rendu.
    <html
      lang="fr"
      className={`${manrope.variable} ${cormorant.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-ink text-ivory">{children}</body>
    </html>
  );
}
