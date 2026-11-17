import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";

// Ouverture de l'accueil, mêmes durées et mêmes retards que le site (client.css, « o-* ») : les faisceaux s'ouvrent, le
// logo s'allume en néon, le titre monte ligne à ligne, puis les boutons. Jouée une fois par lancement de l'app, et
// sautée quand « réduire les animations » est activé. Opacité et transformations seulement : tout tourne sur le
// moteur natif.

const SOFT = Easing.bezier(0.2, 0.7, 0.2, 1);
const DRAW = Easing.bezier(0.6, 0, 0.2, 1);
/** Fin de l'ouverture, en secondes. */
const DONE = 1.7;
let played = false;

export function useOpening() {
  const t = useRef(new Animated.Value(played ? DONE : 0)).current;

  useEffect(() => {
    if (played) return;
    played = true;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) t.setValue(DONE);
      else Animated.timing(t, { toValue: DONE, duration: DONE * 1000, easing: Easing.linear, useNativeDriver: true }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [t]);

  /** 0 → 1 entre `start` et `start + seconds`. */
  const at = (start: number, seconds: number, easing: (value: number) => number = SOFT) =>
    t.interpolate({ inputRange: [start, start + seconds], outputRange: [0, 1], extrapolate: "clamp", easing });

  /** Valeur de départ → valeur d'arrivée entre `start` et `start + seconds`. */
  const between = (start: number, seconds: number, from: number, to: number, easing?: (value: number) => number) =>
    at(start, seconds, easing).interpolate({ inputRange: [0, 1], outputRange: [from, to] });

  /** Le logo qui s'allume en néon (o-neon : 0,34 s de scintillement à partir de 0,45 s). */
  const neon = t.interpolate({
    inputRange: [0.45, 0.45 + 0.34 * 0.3, 0.45 + 0.34 * 0.42, 0.45 + 0.34 * 0.58, 0.45 + 0.34 * 0.68, 0.45 + 0.34 * 0.8],
    outputRange: [0, 0.9, 0.15, 1, 0.5, 1],
    extrapolate: "clamp",
  });

  /** Le faisceau (o-beam) : il s'étire, puis s'éteint. */
  const beamScale = t.interpolate({ inputRange: [0, 0.35], outputRange: [0, 1], extrapolate: "clamp", easing: DRAW });
  const beamOpacity = t.interpolate({ inputRange: [0, 0.35, 0.7, 1], outputRange: [1, 1, 0.7, 0], extrapolate: "clamp" });

  return { at, between, neon, beamScale, beamOpacity, draw: DRAW };
}
