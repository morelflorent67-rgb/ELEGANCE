import Link from "next/link";
import { PhoneIcon } from "@/components/ui";
import { SALON } from "@/lib/salon";

/** Barre collante « Réserver + Appeler » de toutes les pages publiques (mobile et tablette). 88 px. */
export function BookingBar() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2.5 border-t border-line-subtle bg-bar px-4 pb-5 pt-4 lg:hidden">
      <Link
        href="/reservation"
        className="text-button flex h-14 flex-1 items-center justify-center bg-ivory uppercase text-ink"
      >
        Réserver
      </Link>
      <a
        href={SALON.phoneHref}
        aria-label="Appeler le salon"
        className="flex h-14 w-14 shrink-0 items-center justify-center border border-line-strong text-ivory"
      >
        <PhoneIcon size={20} />
      </a>
    </div>
  );
}
