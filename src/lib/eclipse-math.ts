/**
 * Fond animé « éclipse bleue » (lot 18, D-113) : calculs purs, testés (tests/unit/eclipse-math.test.ts).
 * Le dessin lui-même (WebGL) est dans `eclipse.ts`.
 */

/** Réglages de l'éclipse, d'après le fichier de Florent (docs/design/elegance-fond-anime.html). */
export const ECLIPSE = {
  speed: 1,
  motion: 1,
  glow: 1,
  breathPeriod: 7,
  /** Halo au plus bas : 0,25 (et non 0) pour que l'écran ne paraisse jamais vide pendant la respiration. */
  breathMin: 0.25,
  coreMin: 0.12,
  /** Densité de pixels maximale : 1,5 sur téléphone (batterie), 1,75 ailleurs. */
  maxDprPhone: 1.5,
  maxDprWide: 1.75,
} as const;

/** Repère de l'image d'origine : 863 × 1822. */
export const DESIGN = { width: 863, height: 1822 } as const;

/** Défilement (en px) au bout duquel l'éclipse a complètement disparu. */
export const FADE_DISTANCE = 600;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Opacité du fond selon le défilement : 1 en haut de page, 0 à `FADE_DISTANCE`. */
export function eclipseOpacity(scrollY: number): number {
  return clamp01(1 - Math.max(0, scrollY) / FADE_DISTANCE);
}

/** Légère montée (px) et léger zoom du fond pendant qu'il s'efface : de la profondeur sans bouger le texte. */
export function eclipseDepth(scrollY: number): { lift: number; scale: number } {
  const t = clamp01(Math.max(0, scrollY) / FADE_DISTANCE);
  return { lift: -t * 70, scale: 1 + t * 0.06 };
}

/** Tant que l'éclipse est invisible, on arrête la boucle d'animation. */
export function eclipseIsVisible(scrollY: number): boolean {
  return eclipseOpacity(scrollY) > 0.01;
}

/** Densité de pixels du canevas : plafonnée selon l'écran. */
export function eclipseDpr(devicePixelRatio: number, width: number): number {
  const max = width < 768 ? ECLIPSE.maxDprPhone : ECLIPSE.maxDprWide;
  return Math.min(devicePixelRatio || 1, max);
}

/**
 * Cadrage : sur téléphone, identique à l'image ; sur écran large, l'éclipse est centrée.
 * `scale` = pixels écran par unité de design ; (ax, ay) = point du design placé au centre de l'écran.
 */
export function eclipseFraming(width: number, height: number): { scale: number; ax: number; ay: number } {
  const k = smooth(0.62, 1.15, width / height);
  const cover = Math.max(width / DESIGN.width, height / DESIGN.height);
  const wide = height / 1480;
  return {
    scale: cover + (wide - cover) * k,
    ax: 431.5 + (505 - 431.5) * k,
    ay: 911 + (858 - 911) * k,
  };
}
