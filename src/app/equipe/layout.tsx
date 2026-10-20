import type { Metadata } from "next";
import type { ReactNode } from "react";

// La tablette du salon n'est jamais indexée, quel que soit ALLOW_INDEXING (R-72).
export const metadata: Metadata = {
  title: { default: "Salon", template: "%s · Salon" },
  robots: { index: false, follow: false },
};

export default function TeamRootLayout({ children }: { children: ReactNode }) {
  return children;
}
