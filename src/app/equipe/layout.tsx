import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TABLET_MANIFEST_PATH } from "@/lib/web-app";

// La tablette du salon n'est jamais indexée, quel que soit ALLOW_INDEXING (R-72).
export const metadata: Metadata = {
  title: { default: "Salon", template: "%s · Salon" },
  robots: { index: false, follow: false },
  // D-69 : ajoutée à l'écran d'accueil, la tablette ouvre le planning, sous le nom « Elegance » (et non « Planning »).
  manifest: TABLET_MANIFEST_PATH,
  appleWebApp: { capable: true, title: "Elegance", statusBarStyle: "black" },
};

export default function TeamRootLayout({ children }: { children: ReactNode }) {
  return children;
}
