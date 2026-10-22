/**
 * Elegance Strasbourg — valeurs de mouvement pour le code (TypeScript).
 * Mêmes valeurs que design-tokens.json et theme.css. Détail de chaque animation :
 * planche « 4 — Fiche des animations » du canevas.
 */

export const duration = {
  instant: 120, // appui sur un bouton
  fast: 200, // survol, sélection d'un créneau
  panel: 240, // fiche RDV tablette, messages
  base: 280, // étape qui se replie / s'ouvre, feuille, ligne rapide — plafond des outils
  reveal: 600, // révélation au défilement
  draw: 1000, // ligne de lumière (vitrine)
  signature: 1100, // hexagone et reflet doré de la confirmation
  opening: 1400, // photo de l'ouverture
} as const;

export const easing = {
  out: "cubic-bezier(0.2, 0.7, 0.2, 1)",
  draw: "cubic-bezier(0.6, 0, 0.2, 1)",
  in: "cubic-bezier(0.4, 0, 1, 1)",
  trace: "cubic-bezier(0.55, 0, 0.25, 1)",
  shine: "cubic-bezier(0.5, 0, 0.3, 1)",
} as const;

export const stagger = {
  reveal: 70,
  menu: 60,
  confirmation: 100,
  loader: 120,
} as const;

/**
 * Ouverture de l'accueil (lot 12, fiche « Lot12-Animations ») : 1,62 s, jouée une fois par visite, sautée au premier
 * geste. Les délais et durées sont dans src/app/(client)/client.css (classes o-*).
 */
export const opening = {
  totalMs: 1620,
  sessionKey: "elegance-opening-played",
} as const;

/** Script en ligne de l'arrivée, lu avant le premier affichage : l'ouverture déjà jouée dans cette visite est sautée. */
export const skipOpeningIfPlayed = `try{if(sessionStorage.getItem(${JSON.stringify(
  opening.sessionKey,
)})!==null)document.documentElement.classList.add("opening-skip")}catch(e){}`;

/** Confirmation du rendez-vous : le seul endroit où revient le reflet doré. */
export const confirmation = {
  hexagon: { delay: 100, duration: 1100, easing: easing.trace },
  check: { delay: 900, duration: 400, easing: "ease" },
  shine: { delay: 1000, duration: 1100, easing: easing.shine },
  blocks: { delay: 1200, duration: 600, easing: easing.out, stagger: 100 },
} as const;

/** Seuils de déclenchement au défilement (IntersectionObserver). */
export const inView = {
  reveal: { threshold: 0.15, once: true },
  ledLine: { threshold: 0.2, once: true },
} as const;

/**
 * Un élément déjà à l'écran quand la révélation démarre reste affiché tel quel : le masquer pour le refaire
 * apparaître en fondu donnait un clignotement au premier affichage (lot 8). Seuls les éléments plus bas s'animent.
 */
export const alreadyOnScreen = (
  rect: { top: number; bottom: number },
  viewportHeight: number,
): boolean => rect.top < viewportHeight && rect.bottom > 0;

/** Affiche l'indicateur de chargement seulement au-delà de ce délai. */
export const loaderDelay = 300;

export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Arrête l'ouverture au premier geste : ajoute .opening-skip sur <html>,
 * le CSS place alors tous les éléments de l'ouverture à leur état final.
 */
export function skipOpeningOnFirstGesture(
  root: HTMLElement = document.documentElement,
): () => void {
  const skip = () => {
    root.classList.add("opening-skip");
    events.forEach((e) => window.removeEventListener(e, skip));
  };
  const events = ["pointerdown", "wheel", "touchstart", "keydown"] as const;
  events.forEach((e) => window.addEventListener(e, skip, { once: true, passive: true }));
  return skip;
}
