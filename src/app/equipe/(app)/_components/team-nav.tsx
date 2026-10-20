"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { logoutStaffAction } from "../../actions";
import { Logo } from "@/components/ui";

const icon = (children: ReactNode) => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const ITEMS = [
  {
    href: "/equipe",
    label: "Planning",
    match: (p: string) => p === "/equipe" || p.startsWith("/equipe/clients"),
    icon: icon(
      <>
        <rect x="3" y="5" width="18" height="16" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </>,
    ),
  },
  {
    href: "/equipe/reserver",
    label: "Réserver",
    match: (p: string) => p.startsWith("/equipe/reserver"),
    icon: icon(<path d="M12 5v14M5 12h14" />),
  },
  {
    label: "Absences",
    icon: icon(
      <>
        <circle cx="10" cy="8" r="4" />
        <path d="M3 21c1-4 4-6 7-6s4.5 1 5.5 2M16 19h6" />
      </>,
    ),
  },
  {
    label: "Bilan",
    icon: icon(<path d="M5 20V11M12 20V4M19 20v-7" />),
  },
  {
    href: "/equipe/gerant",
    label: "Gérant",
    match: (p: string) => p.startsWith("/equipe/gerant"),
    icon: icon(
      <>
        <rect x="5" y="11" width="14" height="10" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </>,
    ),
  },
] as const;

/** Heure de Paris, à la minute. Affichée seulement une fois montée : le serveur ne connaît pas l'heure du navigateur. */
function Clock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const format = () =>
      new Intl.DateTimeFormat("fr-FR", {
        timeZone: "Europe/Paris",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date());
    const update = () => setTime(format());
    update();
    const timer = setInterval(update, 15_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span className="text-[15px] tabular-nums" aria-label="Heure">
      {time}
    </span>
  );
}

const tab =
  "flex h-[72px] w-14 shrink-0 flex-col md:w-[76px] items-center justify-center gap-1.5 text-[11px] no-underline";

export function TeamNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navigation du salon"
      className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line-subtle bg-charcoal px-2 py-1 md:w-[88px] md:flex-col md:border-b-0 md:border-r md:px-0 md:overflow-visible md:py-4"
    >
      <span className="hidden md:mb-4 md:block">
        <Logo width={60} />
      </span>
      {ITEMS.map((item) => {
        if (!("href" in item)) {
          return (
            <span
              key={item.label}
              aria-disabled="true"
              title="Bientôt disponible"
              className={`${tab} cursor-not-allowed text-stone-dark opacity-60`}
            >
              {item.icon}
              {item.label}
            </span>
          );
        }
        const current = item.match(pathname);
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={`${tab} ${current ? "bg-graphite-light text-ivory" : "text-stone hover:text-ivory"}`}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
      <div className="ml-auto flex items-center gap-3 md:ml-0 md:mt-auto md:flex-col md:gap-4">
        <form action={logoutStaffAction}>
          <button
            type="submit"
            className="flex min-h-11 items-center px-2 text-[11px] text-stone underline underline-offset-4 hover:text-ivory"
          >
            Déconnexion
          </button>
        </form>
        <span className="hidden md:block">
          <Clock />
        </span>
      </div>
    </nav>
  );
}
