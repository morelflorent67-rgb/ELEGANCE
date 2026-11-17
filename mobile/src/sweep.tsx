import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, useWindowDimensions } from "react-native";

/**
 * La ligne de lumière qui balaie l'écran à chaque étape de la réservation (« sw-line » du site, 0,52 s) : elle descend,
 * s'allume puis s'éteint. Un élément par écran d'étape : elle se rejoue à chaque arrivée.
 */
export function Sweep() {
  const { height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 520, easing: Easing.bezier(0.6, 0, 0.2, 1), useNativeDriver: true }).start();
  }, [progress]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          bottom: undefined,
          height: 1,
          backgroundColor: "#fff",
          shadowColor: "#fff",
          shadowOpacity: 0.6,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 0 },
          opacity: progress.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 0.8, 0.5, 0] }),
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, height] }) }],
        },
      ]}
    />
  );
}
