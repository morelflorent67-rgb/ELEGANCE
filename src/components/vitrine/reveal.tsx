"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { inView } from "@/lib/motion";

/**
 * Révélations au défilement (passation design, §6) : chaque `[data-reveal]` et chaque `.led-line` reçoit
 * `.is-visible` une seule fois, en entrant à l'écran. Sans JavaScript, le contenu reste visible : la règle
 * CSS qui le masque ne s'applique que sous `html.js-reveal`, posé ici.
 */
export function Reveal() {
  const pathname = usePathname();
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("js-reveal");
    const targets = document.querySelectorAll<HTMLElement>("[data-reveal], .led-line");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      },
      { threshold: inView.reveal.threshold },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pathname]);
  return null;
}
