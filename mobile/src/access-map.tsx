import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from "react-native-svg";
import { homeScroll } from "@/home-scroll";
import { PATH_LENGTHS } from "@/lib/access-map-lengths";
import { BUILDINGS, MAIN_ROAD, ROUTES, STREETS } from "@/lib/shared/access-map-data";
import { colors, fonts } from "@/theme";

// Le plan d'accès du site (maquette « Lot12-Arrivee ») : dessiné au trait, sans carte tierce. Les rues se tracent l'une
// après l'autre, la route de Bischwiller puis le trajet bleu jusqu'au salon, la pastille tombe, les ondes partent. Même
// chronologie que le site (client.css, m-*), lancée quand le plan arrive à l'écran.

const FRAME_HEIGHT = 350;
const SALON = { x: 0.58, y: 0.45 };
// `collapsable` est ajouté par Animated : sans effet sur un tracé, et le navigateur le refuse (aperçu web de développement).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AnimatedPath = Animated.createAnimatedComponent(function PlanPath({ collapsable: _collapsable, ...props }: any) {
  return <Path {...props} />;
});

const EASE_DRAW = Easing.bezier(0.6, 0, 0.2, 1);
const EASE_TRACE = Easing.bezier(0.55, 0, 0.25, 1);
const EASE_SOFT = Easing.bezier(0.2, 0.7, 0.2, 1);
const TOTAL_SECONDS = 3.6;

export function AccessMap({ city, road }: { city: string; road: string }) {
  const { height: windowHeight } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const frame = useRef<ComponentRef<typeof View>>(null);
  const started = useRef(false);
  // Une seule horloge (en secondes) pour tous les tracés et les apparitions ; la caméra et les ondes tournent à part.
  const time = useRef(new Animated.Value(0)).current;
  const camera = useRef(new Animated.Value(0)).current;
  const radar = useRef(new Animated.Value(0)).current;

  const play = useMemo(
    () => () => {
      Animated.timing(time, { toValue: TOTAL_SECONDS, duration: TOTAL_SECONDS * 1000, easing: Easing.linear, useNativeDriver: false }).start();
      Animated.timing(camera, { toValue: 1, duration: 2600, easing: Easing.bezier(0.16, 0.8, 0.2, 1), useNativeDriver: true }).start();
      Animated.loop(Animated.timing(radar, { toValue: 1, duration: 3000, easing: EASE_SOFT, useNativeDriver: true }), { iterations: -1 }).start();
    },
    [time, camera, radar],
  );

  // Le plan se lance quand il entre dans l'écran (comme le « InView » du site).
  useEffect(() => {
    const check = () => {
      if (started.current) return;
      frame.current?.measureInWindow((_x, y, _w, h) => {
        if (!started.current && h > 0 && y < windowHeight * 0.85 && y + h > 0) {
          started.current = true;
          play();
        }
      });
    };
    const id = homeScroll.addListener(check);
    const first = setTimeout(check, 400);
    return () => {
      homeScroll.removeListener(id);
      clearTimeout(first);
    };
  }, [play, windowHeight]);

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  // Le plan est cadré en « slice » (il remplit le cadre) : un pixel d'écran vaut 1/scale unités du dessin.
  const scale = width > 0 ? Math.max(width / 1400, FRAME_HEIGHT / 1260) : 1;
  const px = (n: number) => n / scale;

  const reveal = (start: number, seconds: number, easing = EASE_SOFT) =>
    time.interpolate({ inputRange: [start, start + seconds], outputRange: [0, 1], extrapolate: "clamp", easing });
  const draw = (d: string, start: number, seconds: number, easing: (t: number) => number) => {
    const length = PATH_LENGTHS[d] ?? 2000;
    return {
      strokeDasharray: [length, length],
      strokeDashoffset: time.interpolate({
        inputRange: [start, start + seconds],
        outputRange: [length, 0],
        extrapolate: "clamp",
        easing,
      }),
    };
  };

  const cx = width * SALON.x;
  const cy = FRAME_HEIGHT * SALON.y;
  const ring = (delaySeconds: number) => {
    // Chaque onde repart avec son retard : le décalage est pris dans le cycle de 3 s.
    const phase = (delaySeconds % 3) / 3;
    const p = radar.interpolate({
      inputRange: [0, 1 - phase, 1 - phase + 0.0001, 1],
      outputRange: [phase, 1, 0, phase],
    });
    return {
      opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
      transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.4, 3.6] }) }],
    };
  };

  return (
    <View
      ref={frame}
      onLayout={onLayout}
      style={{ height: FRAME_HEIGHT, overflow: "hidden", backgroundColor: "#00101f" }}
      accessible
      accessibilityLabel={`Plan d'accès : le salon est sur la route de Bischwiller, à ${city}.`}
    >
      {width > 0 ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              transformOrigin: `${SALON.x * 100}% ${SALON.y * 100}%`,
              transform: [{ scale: camera.interpolate({ inputRange: [0, 1], outputRange: [1.5, 1] }) }],
            },
          ]}
        >
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: reveal(0, 1) }]}>
            <Svg width={width} height={FRAME_HEIGHT} viewBox="0 0 1400 1260" preserveAspectRatio="xMidYMid slice">
              <Path d={BUILDINGS} fill="rgba(239,233,221,0.045)" />
            </Svg>
          </Animated.View>
          <Svg
            width={width}
            height={FRAME_HEIGHT}
            viewBox="0 0 1400 1260"
            preserveAspectRatio="xMidYMid slice"
            fill="none"
            style={StyleSheet.absoluteFill}
          >
            <G stroke="rgba(239,233,221,0.26)" strokeLinecap="round" strokeWidth={px(1)}>
              {STREETS.map((street) => (
                <AnimatedPath key={street.d} d={street.d} {...draw(street.d, street.delay / 1000, 1.8, EASE_DRAW)} />
              ))}
            </G>
            <AnimatedPath
              d={MAIN_ROAD}
              stroke="rgba(239,233,221,0.7)"
              strokeWidth={px(1.6)}
              strokeLinecap="round"
              {...draw(MAIN_ROAD, 0.9, 1.8, EASE_DRAW)}
            />
            {ROUTES.map((route) => {
              const start = parseFloat(route.delay);
              return (
                <G key={route.d}>
                  {route.main ? (
                    // Lueur du trajet principal (le site utilise un drop-shadow).
                    <AnimatedPath
                      d={route.d}
                      stroke="rgba(61,139,255,0.35)"
                      strokeWidth={px(7)}
                      strokeLinecap="round"
                      {...draw(route.d, start, 1.6, EASE_TRACE)}
                    />
                  ) : null}
                  <AnimatedPath
                    d={route.d}
                    stroke={route.main ? colors.accent : "rgba(61,139,255,0.6)"}
                    strokeWidth={px(route.main ? 2 : 1.4)}
                    strokeLinecap="round"
                    {...draw(route.d, start, 1.6, EASE_TRACE)}
                  />
                </G>
              );
            })}
          </Svg>

          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: cx - 75,
              top: cy - 75,
              width: 150,
              height: 150,
              opacity: reveal(1.4, 0.8),
              transform: [{ scale: reveal(1.4, 0.8).interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
            }}
          >
            <Svg width={150} height={150}>
              <Defs>
                <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor="#3d8bff" stopOpacity={0.5} />
                  <Stop offset="0.4" stopColor="#3d8bff" stopOpacity={0.16} />
                  <Stop offset="0.7" stopColor="#3d8bff" stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={75} cy={75} r={75} fill="url(#halo)" />
            </Svg>
          </Animated.View>

          {[2.2, 3.2, 4.2].map((delay) => (
            <Animated.View
              key={delay}
              pointerEvents="none"
              style={[
                {
                  position: "absolute",
                  left: cx - 18,
                  top: cy - 18,
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: colors.accent,
                },
                ring(delay),
              ]}
            />
          ))}

          <Animated.View
            style={{
              position: "absolute",
              left: cx - 9,
              top: cy - 9,
              width: 18,
              height: 18,
              borderRadius: 9,
              borderWidth: 1.5,
              borderColor: colors.accent,
              backgroundColor: colors.ink,
              alignItems: "center",
              justifyContent: "center",
              opacity: reveal(1.5, 0.4),
              transform: [{ scale: reveal(1.5, 0.4).interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
            }}
          >
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.ivory }} />
          </Animated.View>

          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: cx - 48,
              top: cy - 16 - 18,
              opacity: reveal(1.7, 0.7),
              transform: [{ translateY: reveal(1.7, 0.7).interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }],
            }}
          >
            <Image source={require("../assets/logo-ivoire.png")} resizeMode="contain" style={{ width: 96, height: 18 }} />
          </Animated.View>

          <Animated.Text
            style={{
              position: "absolute",
              left: width * 0.64,
              top: FRAME_HEIGHT * 0.55,
              opacity: reveal(1.6, 0.6),
              transformOrigin: "top left",
              transform: [{ rotate: "82.8deg" }],
              fontFamily: fonts.sansMedium,
              fontSize: 9,
              letterSpacing: 0.7,
              color: colors.ivorySoft,
            }}
          >
            {road}
          </Animated.Text>
          <Animated.Text
            style={{
              position: "absolute",
              left: width * 0.08,
              top: FRAME_HEIGHT * 0.22,
              opacity: reveal(1.6, 0.6),
              fontFamily: fonts.sansSemi,
              fontSize: 9,
              letterSpacing: 2.2,
              textTransform: "uppercase",
              color: colors.stone,
            }}
          >
            {city}
          </Animated.Text>
          <Animated.Text
            style={{
              position: "absolute",
              right: width * 0.05,
              bottom: FRAME_HEIGHT * 0.09,
              opacity: reveal(1.6, 0.6),
              fontFamily: fonts.sansSemi,
              fontSize: 9,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: colors.stone,
            }}
          >
            Strasbourg →
          </Animated.Text>
        </Animated.View>
      ) : null}
      <Text style={{ position: "absolute", right: 6, bottom: 4, fontFamily: fonts.sans, fontSize: 8, color: "#8f897e" }}>
        © contributeurs OpenStreetMap
      </Text>
    </View>
  );
}
