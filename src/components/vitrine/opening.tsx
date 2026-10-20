"use client";

import { useEffect } from "react";
import { opening, skipOpeningOnFirstGesture } from "@/lib/motion";

/**
 * Ouverture de l'accueil : jouée une fois par session, jamais bloquante. Au premier geste (toucher, défilement,
 * touche), tout passe à l'état final (`.opening-skip`, voir theme.css). À la première visite de la session on
 * note qu'elle a été jouée ; le script en ligne de `OpeningHero` la saute ensuite avant même l'affichage.
 */
export function OpeningController() {
  useEffect(() => {
    let played = false;
    try {
      played = sessionStorage.getItem(opening.sessionKey) !== null;
      if (!played) sessionStorage.setItem(opening.sessionKey, "1");
    } catch {
      // Stockage refusé (navigation privée…) : l'ouverture se joue à chaque visite, sans conséquence.
    }
    if (played) return;
    return skipOpeningOnFirstGesture();
  }, []);
  return null;
}
