"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { startEclipse } from "@/lib/eclipse";
import { eclipseDepth, eclipseIsVisible, eclipseOpacity } from "@/lib/eclipse-math";

/**
 * Fond du côté client (lot 18, D-113). Accueil : l'éclipse bleue animée (WebGL), qui s'efface au défilement et dont
 * la boucle s'arrête quand elle n'est plus visible. Toutes les autres pages : une image figée, discrète (aucun
 * WebGL, aucun calcul). Décoratif : `aria-hidden`, derrière tout, sans effet sur le contenu.
 */
export function ClientBackdrop() {
  return (
    <Suspense fallback={<StillBackdrop />}>
      <BackdropByPath />
    </Suspense>
  );
}

function BackdropByPath() {
  const pathname = usePathname();
  return pathname === "/" ? <LiveEclipse /> : <StillBackdrop />;
}

function StillBackdrop() {
  return <div aria-hidden="true" className="eclipse-still pointer-events-none fixed inset-0 -z-0" />;
}

function LiveEclipse() {
  const layer = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const wrap = layer.current;
    if (!el || !wrap) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const handle = startEclipse(el, { still: reduce });
    if (!handle) return; // sans WebGL : le dégradé CSS du canevas reste

    let frame = 0;
    let visible = true;
    const apply = () => {
      frame = 0;
      const y = window.scrollY;
      const { lift, scale } = eclipseDepth(y);
      wrap.style.opacity = String(eclipseOpacity(y));
      wrap.style.transform = `translate3d(0, ${lift}px, 0) scale(${scale})`;
      const nowVisible = eclipseIsVisible(y);
      if (nowVisible !== visible) {
        visible = nowVisible;
        if (visible) handle.resume();
        else handle.pause();
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      handle.destroy();
    };
  }, []);

  return (
    <div
      ref={layer}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 will-change-[opacity,transform]"
    >
      <canvas ref={canvas} className="eclipse-canvas block h-full w-full" />
    </div>
  );
}
