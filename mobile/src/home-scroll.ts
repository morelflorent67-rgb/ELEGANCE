import { Animated } from "react-native";
import { FADE_DISTANCE } from "@/lib/shared/eclipse-math";

// Défilement de l'accueil, partagé avec le fond : l'éclipse s'efface, monte et grossit un peu pendant qu'on descend
// (eclipseOpacity et eclipseDepth du site), sans bouger le texte.
export const homeScroll = new Animated.Value(0);

const input = [0, FADE_DISTANCE];
export const homeFade = {
  opacity: homeScroll.interpolate({ inputRange: input, outputRange: [1, 0], extrapolate: "clamp" }),
  lift: homeScroll.interpolate({ inputRange: input, outputRange: [0, -70], extrapolate: "clamp" }),
  zoom: homeScroll.interpolate({ inputRange: input, outputRange: [1, 1.06], extrapolate: "clamp" }),
};
