import type { Metadata, Viewport } from "next";
import { Sora } from "next/font/google";
import { siteUrl } from "@/lib/env";
import { photos } from "@/lib/photos";
import { CLIENT_MANIFEST_PATH } from "@/lib/web-app";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-sora",
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
    <html lang="fr" className={sora.variable}>
      <body className="min-h-dvh bg-ink text-ivory">{children}</body>
    </html>
  );
}
