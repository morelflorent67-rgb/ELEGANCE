"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Logo, PhoneIcon } from "@/components/ui";
import { btnPrimary } from "@/components/ui";
import { CloseIcon, MenuBars } from "./icons";

const ITEMS = [
  { href: "/", label: "Accueil" },
  { href: "/prestations", label: "Prestations et tarifs" },
  { href: "/salon", label: "Le salon" },
  { href: "/compte/rendez-vous", label: "Mes rendez-vous" },
  { href: "/compte/informations", label: "Mes informations" },
] as const;

/**
 * Menu plein écran (mobile et tablette). Ouvert, il garde le focus, se ferme avec Échap ou en suivant un lien,
 * puis rend le focus au bouton. Les lignes entrent en cascade de 60 ms (motion.ts › stagger.menu).
 */
export function SiteMenu({
  hours,
  address,
  accountSlot,
}: {
  hours: string;
  address: string;
  accountSlot: ReactNode;
}) {
  // Le menu s'ouvre sur une page précise : en changer (lien suivi) le referme sans effet de bord.
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const opener = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpenOn(null);
    opener.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("[data-close]")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key !== "Tab" || !panel.current) return;
      // Le focus reste dans le menu.
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled])",
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={opener}
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpenOn(pathname)}
        className="flex h-11 w-11 items-center justify-center text-ivory"
      >
        <MenuBars />
      </button>
      {open ? (
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-label="Menu principal"
          className="fixed inset-0 z-50 flex animate-fade-in flex-col overflow-y-auto bg-ink"
        >
          <div className="flex h-16 shrink-0 items-center justify-between px-2.5">
            <button
              type="button"
              data-close
              aria-label="Fermer le menu"
              onClick={close}
              className="flex h-11 w-11 items-center justify-center text-ivory"
            >
              <CloseIcon />
            </button>
            <Logo />
            <span className="h-11 w-11" />
          </div>
          <div className="led-line is-visible h-px shrink-0 bg-led opacity-70" />
          <nav aria-label="Menu principal" className="flex flex-col px-6 pt-5">
            {ITEMS.map((item, index) => {
              const here = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={here ? "page" : undefined}
                  onClick={() => {
                    if (item.href === pathname) close();
                  }}
                  style={{ animationDelay: `${50 + index * 60}ms` }}
                  className="flex min-h-16 animate-reveal items-center gap-[18px] border-b border-line-subtle text-title-3 text-ivory"
                >
                  {here ? (
                    <span className="text-gold">
                      <MenuBars size={12} />
                    </span>
                  ) : (
                    <span className="w-3" aria-hidden="true" />
                  )}
                  <span className="text-[26px] font-light tracking-[-0.01em]">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto flex flex-col gap-5 p-6">
            <div className="flex flex-col gap-1.5 text-body-sm text-stone">
              <span>{address}</span>
              <span>{hours}</span>
            </div>
            <div className="flex gap-2.5">
              <Link href="/reservation" className={btnPrimary}>
                Réserver
              </Link>
              <a
                href="tel:+33388977468"
                aria-label="Appeler le salon"
                className="flex h-14 w-14 shrink-0 items-center justify-center border border-line-strong text-ivory"
              >
                <PhoneIcon size={20} />
              </a>
            </div>
            {accountSlot}
          </div>
        </div>
      ) : null}
    </>
  );
}
