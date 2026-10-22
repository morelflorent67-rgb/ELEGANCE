import { PanelFrame } from "@/components/client/panel";

// L'espace client s'ouvre en panneau sur l'accueil (maquette « Lot12-MesRdv ») ; le panneau reste ouvert quand on
// passe de « Mes rendez-vous » à « Mon compte ».
export default function CompteLayout({ children }: { children: React.ReactNode }) {
  return <PanelFrame>{children}</PanelFrame>;
}
