import Image from "next/image";
import Link from "next/link";
import { SALON, salonAddressLine } from "@/lib/salon";

const social =
  "flex h-11 items-center border border-line-strong px-4 text-label uppercase tracking-[0.22em]";
const legal = "flex min-h-11 items-center text-body-sm text-stone";

/** Pied de page : logo (190 px sur plaque ivoire), coordonnées, réseaux, pages légales. */
export function SiteFooter() {
  return (
    <footer className="border-t border-line-subtle px-6 pb-36 pt-12 lg:pb-12">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center gap-7 lg:flex-row lg:justify-between lg:gap-10">
        <div className="flex h-[120px] w-full items-center justify-center bg-ivory lg:w-[300px] lg:shrink-0">
          <Image
            src="/logo/elegance-logo-noir.svg"
            alt="Elegance Strasbourg"
            width={190}
            height={38}
            unoptimized
            style={{ width: 190, height: "auto" }}
          />
        </div>
        <div className="flex flex-col items-center gap-0.5 text-center text-body-sm text-stone lg:items-start lg:text-left">
          <span>{salonAddressLine}</span>
          <a
            href={SALON.phoneHref}
            className="flex min-h-11 items-center text-body tabular-nums text-ivory"
          >
            {SALON.phoneDisplay}
          </a>
        </div>
        <nav aria-label="Réseaux sociaux" className="flex gap-2">
          <a href={SALON.instagram} className={social} rel="noopener" target="_blank">
            Instagram
          </a>
          <a href={SALON.snapchat} className={social} rel="noopener" target="_blank">
            Snapchat
          </a>
        </nav>
      </div>
      <div className="mx-auto mt-7 flex w-full max-w-[1200px] flex-col items-center gap-2 lg:mt-10 lg:flex-row lg:justify-between">
        <nav
          aria-label="Informations légales"
          className="flex flex-wrap justify-center gap-x-5 gap-y-1"
        >
          <Link href="/mentions-legales" className={legal}>
            Mentions légales
          </Link>
          <Link href="/confidentialite" className={legal}>
            Confidentialité
          </Link>
          <Link href="/conditions" className={legal}>
            Conditions
          </Link>
        </nav>
        <span className="text-body-sm text-stone-dark">© {SALON.name}</span>
      </div>
    </footer>
  );
}
