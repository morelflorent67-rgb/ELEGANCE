"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export const LOCK_URL = "/equipe/verrouiller";

/**
 * Quitter l'espace gérant le reverrouille (D-53). Se démonte seulement quand on sort de /equipe/gerant : passer d'une
 * page gérant à une autre ne le démonte pas. Fermer ou recharger l'onglet le reverrouille aussi (`pagehide`). Au pire,
 * les 5 minutes d'inactivité reverrouillent tout seules.
 *
 * Next garde la page quittée cachée dans le DOM (Activity) : quand on revient, ses effets repartent et on relit la page
 * auprès du serveur, qui répond « code gérant » puisque l'espace a été reverrouillé. Le verrou réel est côté serveur :
 * sans code, aucune action gérant n'aboutit, quoi que la page affiche un instant.
 */
export function ManagerLeaveGuard() {
  const router = useRouter();
  const left = useRef(false);
  useEffect(() => {
    if (left.current) {
      left.current = false;
      router.refresh();
    }
    const lock = () => navigator.sendBeacon(LOCK_URL);
    window.addEventListener("pagehide", lock);
    const mountedAt = Date.now();
    return () => {
      window.removeEventListener("pagehide", lock);
      // En développement seulement, React monte puis démonte aussitôt chaque composant : ce n'est pas une sortie.
      if (process.env.NODE_ENV !== "production" && Date.now() - mountedAt < 1500) return;
      left.current = true;
      lock();
    };
  }, [router]);
  return null;
}
