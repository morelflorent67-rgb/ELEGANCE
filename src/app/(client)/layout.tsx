import { ClientBackdrop } from "@/components/client/eclipse-background";
import "./client.css";

// Gabarit de l'interface client (D-72, lot 12) : la page tient dans une colonne de la largeur d'un téléphone. Sur
// téléphone elle occupe tout l'écran ; sur tablette et ordinateur, elle est centrée. Derrière (lot 18, D-113) :
// l'éclipse bleue animée sur l'accueil, une image figée ailleurs. La colonne est transparente : les sections qui
// ont besoin d'un fond opaque le posent elles-mêmes.
export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="client min-h-dvh font-normal">
      <ClientBackdrop />
      <div className="relative mx-auto min-h-dvh w-full max-w-[430px] sm:border-x sm:border-line-subtle">
        {children}
      </div>
    </div>
  );
}
