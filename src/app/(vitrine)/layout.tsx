import { ViewTransition } from "react";
import { BookingBar } from "@/components/vitrine/booking-bar";
import { Reveal } from "@/components/vitrine/reveal";
import { SiteFooter } from "@/components/vitrine/site-footer";

// Gabarit des pages publiques : le contenu, le pied de page, la barre « Réserver + Appeler » et les révélations
// au défilement. L'en-tête est posé par chaque page (celui de l'accueil se superpose à la photo).
export default function VitrineLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ViewTransition exit="vt-out" default="none">
        <div className="min-h-dvh">{children}</div>
      </ViewTransition>
      <SiteFooter />
      <BookingBar />
      <Reveal />
    </>
  );
}
