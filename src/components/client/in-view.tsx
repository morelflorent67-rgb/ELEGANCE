"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { alreadyOnScreen, opening, skipOpeningOnFirstGesture } from "@/lib/motion";

/**
 * Une section qui s'anime en entrant à l'écran (data-inview : « wait » puis « vis », voir client.css). Sans
 * JavaScript, l'attribut n'existe pas et tout reste visible ; une section déjà à l'écran au chargement reste telle
 * quelle (« shown »), sans fondu. L'attribut est posé directement sur l'élément : aucun nouveau rendu.
 */
export function InView({
  as: Tag = "section",
  className,
  children,
  ...rest
}: {
  as?: "section" | "div";
  className?: string;
  children: ReactNode;
  "aria-labelledby"?: string;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (alreadyOnScreen(el.getBoundingClientRect(), window.innerHeight)) {
      el.dataset.inview = "shown";
      return;
    }
    el.dataset.inview = "wait";
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.dataset.inview = "vis";
        observer.disconnect();
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <Tag ref={ref as never} className={className} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * Barre « Réserver + Appeler » : elle monte quand le bouton Réserver de l'arrivée (#arrivee-reserver) sort de
 * l'écran, et redescend quand il revient.
 */
export function BookingBarWatcher({ targetId, barId }: { targetId: string; barId: string }) {
  useEffect(() => {
    const target = document.getElementById(targetId);
    const bar = document.getElementById(barId);
    if (!target || !bar) return;
    const observer = new IntersectionObserver(([entry]) => {
      bar.dataset.show = entry.isIntersecting ? "false" : "true";
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId, barId]);
  return null;
}

/**
 * Ouverture de l'accueil : jouée une fois par visite (session du navigateur), sautée au premier geste. Le script en
 * ligne de l'arrivée la saute avant même l'affichage quand elle a déjà été jouée.
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
