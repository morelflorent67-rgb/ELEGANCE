import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PhoneIcon } from "@/components/ui";
import { ChevronRight, HexMark } from "@/components/vitrine/icons";
import { SiteHeader } from "@/components/vitrine/site-header";
import { formatDuration, formatPrice } from "@/lib/format";
import { SALON } from "@/lib/salon";
import { callOnlyNames, groupCatalog, joinFr, performerNote } from "@/modules/vitrine/catalog-view";
import { getVitrine } from "@/modules/vitrine/cache";
import { hoursSummary } from "@/modules/vitrine/hours";

export const metadata: Metadata = {
  title: "Prestations et tarifs",
  description:
    "La carte du salon : coupes, barbe, soin du visage et techniques, avec prix et durées. Sur rendez-vous à Schiltigheim, paiement sur place.",
  alternates: { canonical: "/prestations" },
};

const chip =
  "flex h-11 items-center border px-3.5 text-button-sm tracking-[0.12em] transition-colors";

export default async function PrestationsPage() {
  const { services, team, week } = await getVitrine();
  const groups = groupCatalog(services);
  const note = performerNote(team);
  const callOnly = callOnlyNames(services);

  return (
    <>
      <SiteHeader />
      <main>
        <section className="mx-auto flex w-full max-w-[1200px] flex-col gap-3.5 px-6 pb-8 pt-10 lg:pt-16">
          <div className="flex animate-reveal items-center gap-3">
            <HexMark />
            <span className="text-label uppercase text-stone">La carte</span>
          </div>
          <h1 className="animate-reveal text-title-page [animation-delay:70ms] lg:text-display">
            Prestations et tarifs
          </h1>
          <p className="max-w-xl animate-reveal text-body text-ivory-soft [animation-delay:140ms]">
            {services.length} prestations, sur rendez-vous uniquement. Paiement sur place.
          </p>
        </section>

        <div className="relative h-[210px] lg:h-[320px]">
          <Image
            src="/photos/stitch-v.jpg"
            alt="Fauteuil capitonné à surpiqûres dorées"
            fill
            priority
            sizes="100vw"
            className="object-cover object-[50%_78%]"
          />
          <div
            className="led-line is-visible absolute inset-x-0 top-0 opacity-85"
            aria-hidden="true"
          />
        </div>

        <div className="mx-auto w-full max-w-[1200px]">
          {groups.length > 1 ? (
            <nav
              aria-label="Catégories"
              className="flex flex-wrap gap-2 border-b border-line-subtle px-6 py-4"
            >
              {groups.map((group, index) => (
                <a
                  key={group.anchor}
                  href={`#${group.anchor}`}
                  className={`${chip} ${
                    index === 0
                      ? "border-ivory bg-ivory font-medium text-ink"
                      : "border-line-strong text-ivory hover:bg-graphite-light"
                  }`}
                >
                  {group.title}
                </a>
              ))}
            </nav>
          ) : null}

          <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-12 lg:px-6">
            {groups.map((group) => (
              <section
                key={group.anchor}
                id={group.anchor}
                className="flex scroll-mt-4 flex-col gap-[18px] px-6 pb-2 pt-10 lg:px-0"
                data-reveal
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-[26px] font-light leading-[1.15] tracking-[-0.01em]">
                    {group.title}
                  </h2>
                  <span className="text-body-sm text-stone">
                    {group.items.length} prestation{group.items.length > 1 ? "s" : ""}
                  </span>
                </div>
                <ul className="flex flex-col border-t border-line">
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex min-h-20 items-center gap-3.5 border-b border-line py-3"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-body">{item.name}</span>
                        <span className="text-[13px] text-stone">
                          {formatDuration(item.durationMin)}
                          {!item.bookableOnline ? " · sur appel" : ""}
                          {item.performedBy === "apprentice" ? " · par un apprenti" : ""}
                        </span>
                      </div>
                      <span className="text-[17px] tabular-nums">
                        {formatPrice(item.priceCents)}
                      </span>
                      {item.bookableOnline ? (
                        <Link
                          href="/reservation"
                          aria-label={`Réserver : ${item.name}`}
                          className="flex h-11 w-11 shrink-0 items-center justify-center border border-line-strong text-gold transition-colors hover:bg-graphite-light"
                        >
                          <ChevronRight />
                        </Link>
                      ) : (
                        <a
                          href={SALON.phoneHref}
                          aria-label={`Appeler pour : ${item.name}`}
                          className="flex h-11 w-11 shrink-0 items-center justify-center border border-line-strong text-ivory transition-colors hover:bg-graphite-light"
                        >
                          <PhoneIcon size={16} />
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
                {group.items.some((i) => i.performedBy === "apprentice") && note ? (
                  <div className="flex gap-3.5 bg-charcoal p-4">
                    <span className="mt-0.5 shrink-0">
                      <HexMark />
                    </span>
                    <p className="text-body-sm text-ivory-soft">{note}</p>
                  </div>
                ) : null}
              </section>
            ))}
          </div>

          {callOnly.length > 0 ? (
            <section
              className="mx-6 mt-10 flex flex-col gap-4 border border-line-strong px-5 py-6 lg:max-w-xl"
              data-reveal
            >
              <span className="text-label uppercase text-gold">Sur appel</span>
              <p className="text-[15px] leading-[1.55] text-ivory-soft">
                {joinFr(callOnly)} demandent un échange avant le rendez-vous. Appelez-nous : nous
                trouvons le créneau ensemble.
              </p>
              <a
                href={SALON.phoneHref}
                className="text-button-sm flex h-[52px] items-center justify-center gap-2.5 border border-line-strong uppercase text-ivory transition-colors hover:bg-graphite-light"
              >
                <PhoneIcon size={16} />
                Appeler le salon
              </a>
              <span className="text-[13px] text-stone">
                {SALON.phoneDisplay} · {hoursSummary(week)}
              </span>
            </section>
          ) : null}
        </div>
      </main>
    </>
  );
}
