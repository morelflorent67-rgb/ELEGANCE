import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, AppState, PixelRatio, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { ECLIPSE, eclipseDpr, eclipseFraming } from "@/lib/shared/eclipse-math";
import { FS, VS } from "@/lib/shared/eclipse-shader";
import { colors } from "@/theme";

// Le fond « éclipse » du site (lot 18, D-113) : le même programme graphique, dessiné en direct sur la carte graphique du
// téléphone (src/lib/eclipse.ts du site, repris tel quel). Animé sur l'accueil ; ailleurs, une seule image à
// mouvement nul (« still »), comme les images figées du site, sans boucle : aucun calcul de plus.

interface Controller {
  setStill: (still: boolean) => void;
  resize: (width: number, height: number) => void;
  destroy: () => void;
}

function start(gl: ExpoWebGLRenderingContext, still: boolean, width: number, height: number): Controller | null {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const u: Record<string, WebGLUniformLocation | null> = {};
  for (const name of ["uRes", "uScale", "uOffset", "uTime", "uMotion", "uGlow", "uBreathPeriod", "uBreathMin", "uCoreMin"]) {
    u[name] = gl.getUniformLocation(program, name);
  }
  gl.uniform1f(u.uGlow, ECLIPSE.glow);
  gl.uniform1f(u.uBreathPeriod, ECLIPSE.breathPeriod);
  gl.uniform1f(u.uBreathMin, ECLIPSE.breathMin);
  gl.uniform1f(u.uCoreMin, ECLIPSE.coreMin);

  let isStill = still;
  let active = AppState.currentState === "active";
  let raf = 0;
  let destroyed = false;
  let origin = 0;

  const draw = (ms: number) => {
    gl.uniform1f(u.uTime, isStill ? 0 : ((ms - origin) / 1000) * ECLIPSE.speed);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.endFrameEXP?.();
  };
  const frame = (ms: number) => {
    raf = 0;
    if (origin === 0) origin = ms;
    draw(ms);
    schedule();
  };
  function schedule() {
    if (!raf && !isStill && active && !destroyed) raf = requestAnimationFrame(frame);
  }

  const resize = (w: number, h: number) => {
    const bufferWidth = gl.drawingBufferWidth;
    const bufferHeight = gl.drawingBufferHeight;
    const dpr = bufferWidth / w;
    gl.viewport(0, 0, bufferWidth, bufferHeight);
    const { scale, ax, ay } = eclipseFraming(w, h);
    gl.uniform2f(u.uRes, bufferWidth, bufferHeight);
    gl.uniform1f(u.uScale, scale * dpr);
    gl.uniform2f(u.uOffset, (w / 2 - ax * scale) * dpr, (h / 2 - ay * scale) * dpr);
    draw(origin);
  };
  gl.uniform1f(u.uMotion, isStill ? 0 : ECLIPSE.motion);
  resize(width, height);
  schedule();

  const subscription = AppState.addEventListener("change", (state) => {
    active = state === "active";
    if (active) schedule();
    else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  });

  return {
    setStill(next) {
      if (next === isStill) return;
      isStill = next;
      gl.uniform1f(u.uMotion, next ? 0 : ECLIPSE.motion);
      if (next) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        draw(0);
      } else {
        origin = 0;
        schedule();
      }
    },
    resize,
    destroy() {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      subscription.remove();
    },
  };
}

/**
 * Fond d'écran de l'app. `still` : une seule image, sans mouvement (pages autres que l'accueil). `opacity` : fondu au
 * défilement de l'accueil, comme sur le site.
 */
export function EclipseBackground({
  still,
  opacity = 1,
  lift,
  zoom,
}: {
  still: boolean;
  opacity?: Animated.AnimatedInterpolation<number> | number;
  lift?: Animated.AnimatedInterpolation<number>;
  zoom?: Animated.AnimatedInterpolation<number>;
}) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const controller = useRef<Controller | null>(null);
  const stillRef = useRef(still);
  stillRef.current = still;

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) setSize({ width, height });
  };

  useEffect(() => {
    controller.current?.setStill(still);
  }, [still]);

  useEffect(() => {
    if (size) controller.current?.resize(size.width, size.height);
  }, [size]);

  useEffect(() => () => controller.current?.destroy(), []);

  // Densité de pixels plafonnée comme sur le site (1,5 sur téléphone) : le tracé se fait plus petit puis s'agrandit.
  const pixelRatio = PixelRatio.get();
  const ratio = size ? Math.min(1, eclipseDpr(pixelRatio, size.width) / pixelRatio) : 1;

  const onContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext) => {
      if (!size) return;
      controller.current?.destroy();
      controller.current = start(gl, stillRef.current, size.width, size.height);
    },
    [size],
  );

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: colors.ink, opacity },
        lift && zoom ? { transform: [{ translateY: lift }, { scale: zoom }] } : null,
      ]}
      onLayout={onLayout}
    >
      {size ? (
        <View style={{ width: size.width, height: size.height, overflow: "hidden" }}>
          <GLView
            key={`${size.width}x${size.height}`}
            style={{
              width: size.width * ratio,
              height: size.height * ratio,
              transform: [{ scale: 1 / ratio }],
              transformOrigin: "top left",
            }}
            onContextCreate={onContextCreate}
          />
        </View>
      ) : null}
    </Animated.View>
  );
}
