import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { homeScroll } from "@/home-scroll";
import { colors, fonts } from "@/theme";

/** Devient vrai la première fois que l'élément entre dans l'écran (comme le « InView » du site). */
export function useWhenVisible() {
  const { height } = useWindowDimensions();
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (visible) return;
    const check = () =>
      ref.current?.measureInWindow((_x, y, _w, h) => {
        if (h > 0 && y < height * 0.9 && y + h > 0) setVisible(true);
      });
    const id = homeScroll.addListener(check);
    const first = setTimeout(check, 400);
    return () => {
      homeScroll.removeListener(id);
      clearTimeout(first);
    };
  }, [height, visible]);
  return { ref, visible };
}

const START = 150;
const STEP = 36;

/** L'état du salon qui s'écrit lettre à lettre (150 ms de départ, 36 ms par lettre, comme le site), avec son curseur. */
export function Typed({ text }: { text: string }) {
  const { ref, visible } = useWhenVisible();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setCount(0);
    let n = 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    const begin = setTimeout(() => {
      interval = setInterval(() => {
        n += 1;
        setCount(n);
        if (n >= text.length && interval) clearInterval(interval);
      }, STEP);
    }, START);
    return () => {
      clearTimeout(begin);
      if (interval) clearInterval(interval);
    };
  }, [visible, text]);

  return (
    <View ref={ref} style={{ minHeight: 100, justifyContent: "flex-start" }} accessible accessibilityLabel={text}>
      <Text
        accessibilityElementsHidden
        style={{ fontFamily: fonts.display, fontSize: 46, lineHeight: 48, color: colors.ivory, maxWidth: 300 }}
      >
        {text.slice(0, count)}
        {visible && count < text.length ? <Text style={{ color: colors.ivory }}>|</Text> : null}
      </Text>
    </View>
  );
}
