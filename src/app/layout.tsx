import type { Metadata, Viewport } from "next";
import { Sora } from "next/font/google";
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
  title: { default: "Elegance Strasbourg", template: "%s · Elegance Strasbourg" },
  description: "Salon de coiffure homme et barbe à Schiltigheim, sur rendez-vous.",
  robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
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
