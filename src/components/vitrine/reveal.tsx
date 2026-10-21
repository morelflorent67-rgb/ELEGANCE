"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { alreadyOnScreen, inView } from "@/lib/motion";

/**
 * Révélations au défilement (passation design, §6) : chaque `[data-reveal]` et chaque `.led-line` reçoit
 * `.is-visible` une seule fois, en entrant à l'écran. Sans JavaScript, le contenu reste visible : la règle
 * CSS qui le masque ne s'applique que sous `html.js-reveal`, posé ici. Ce qui est déjà à l'écran à ce moment-là
 * est marqué `.is-shown` (visible, sans animation) avant que la règle s'applique : aucun clignotement.
 */
export function Reveal() {
  const pathname = usePathname();
  useEffect(() => {
    const root = document.documentElement;
    const all = document.querySelectorAll<HTMLElement>("[data-reveal], .led-line");
    // Au premier chargement seulement : après un changement de page, js-reveal est déjà posé, les nouveaux éléments
    // naissent masqués et leur fondu est une entrée, pas un clignotement.
    const firstLoad = !root.classList.contains("js-reveal");
    for (const el of all) {
      if (firstLoad && alreadyOnScreen(el.getBoundingClientRect(), window.innerHeight)) {
        el.classList.add("is-visible", "is-shown");
      }
    }
    root.classList.add("js-reveal");
    const targets = [...all].filter((el) => !el.classList.contains("is-visible"));
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
