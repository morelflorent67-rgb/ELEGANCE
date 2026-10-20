import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/ui";
import { SALON, salonAddressLine } from "@/lib/salon";
import { getVitrine } from "@/modules/vitrine/cache";
import { hoursSummary } from "@/modules/vitrine/hours";
import { UserIcon } from "./icons";
import { MenuAccount } from "./menu-account";
import { SiteMenu } from "./site-menu";

const navLink =
  "flex min-h-11 items-center px-3 text-button-sm uppercase text-ivory-soft transition-colors hover:text-ivory";

/**
 * En-tête des pages publiques. Mobile : menu, logo sur plaque ivoire, compte. À partir de 1024 px (D-37) : logo,
 * liens, compte et bouton Réserver dans l'en-tête, à la place de la barre collante. `overlay` : posé sur la photo
 * de l'accueil, sans logo (il y est déjà en grand).
 */
export async function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const { week } = await getVitrine();
  return (
    <header
      className={`${
        overlay ? "absolute inset-x-0 top-0 z-30" : "relative"
      } mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-2.5 lg:h-20 lg:px-6`}
    >
      <div className="lg:hidden">
        <SiteMenu
          hours={hoursSummary(week)}
          address={salonAddressLine}
          accountSlot={
            <Suspense fallback={<div className="min-h-11" />}>
              <MenuAccount />
            </Suspense>
          }
        />
      </div>
      {overlay ? (
        <span aria-hidden="true" />
      ) : (
        <Link href="/" aria-label="Accueil" className="flex min-h-11 items-center">
          <Logo />
        </Link>
      )}
      <div className="flex items-center">
        <nav aria-label="Navigation principale" className="hidden items-center lg:flex">
          <Link href="/prestations" className={navLink}>
            Prestations
          </Link>
          <Link href="/salon" className={navLink}>
            Le salon
          </Link>
          <a href={SALON.phoneHref} className={navLink}>
            {SALON.phoneDisplay}
          </a>
        </nav>
        <Link
          href="/compte/rendez-vous"
          aria-label="Mon compte"
          className="flex h-11 w-11 items-center justify-center text-ivory"
        >
          <UserIcon />
        </Link>
        <Link
          href="/reservation"
          className="text-button ml-3 hidden h-12 items-center bg-ivory px-6 uppercase text-ink lg:flex"
        >
          Réserver
        </Link>
      </div>
    </header>
  );
}
