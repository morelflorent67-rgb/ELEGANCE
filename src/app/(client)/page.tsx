import type { Metadata } from "next";
import Link from "next/link";
import { Access } from "@/components/client/access";
import { HoursLive } from "@/components/client/hours-live";
import { BookingBarWatcher, OpeningController } from "@/components/client/in-view";
import { AgendaIcon, ArrowRight, Mark, PhoneIcon } from "@/components/client/ui";
import { LegalLinks } from "@/components/client/legal-links";
import { siteUrl } from "@/lib/env";
import { skipOpeningIfPlayed } from "@/lib/motion";
import { SALON } from "@/lib/salon";
import { getVitrine } from "@/modules/vitrine/cache";
import { jsonLdScript, salonJsonLd } from "@/modules/vitrine/seo";

export const metadata: Metadata = {
  title: { absolute: "Elegance Strasbourg · Barbier sur rendez-vous à Schiltigheim" },
  description:
    "Salon de coiffure homme et barbe à Schiltigheim, près de Strasbourg : coupe, taille de barbe, soin du visage. Sur rendez-vous, réservation en ligne.",
  alternates: { canonical: "/" },
};

const beam = "o-beam h-px w-[300px] bg-led shadow-[0_0_10px_1px_rgb(255_255_255_/_0.65)]";

// La page client (D-72, D-94) : l'arrivée, les horaires et l'accès, puis les liens légaux. Tout ce qui cite les
// horaires et les fermetures vient de la base (getVitrine, en cache).
export default async function HomePage() {
  const data = await getVitrine();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(salonJsonLd(data, siteUrl())) }}
      />
      <main>
        <Arrival />
        <HoursLive week={data.week} closures={data.closures} />
        <Access />
      </main>
      <footer className="flex flex-wrap justify-center gap-x-[18px] border-t border-[rgb(239_233_221_/_0.08)] px-6 pb-[120px] pt-6">
        <LegalLinks />
      </footer>
      <BookingBar />
    </>
  );
}

/** L'arrivée (844 px) : le logo s'allume comme un néon entre deux faisceaux, puis le titre et les boutons montent. */
function Arrival() {
  return (
    <section aria-label={SALON.name} className="relative h-[844px] overflow-hidden">
      <script dangerouslySetInnerHTML={{ __html: skipOpeningIfPlayed }} />
      <OpeningController />
      <header className="o-head absolute left-6 right-3.5 top-[18px] flex h-11 items-center justify-between">
        <span className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.3em] text-ivory-soft">
          <Mark />
          Elegance
        </span>
        <Link
          href="/compte/rendez-vous"
          aria-label="Mes rendez-vous"
          className="flex h-11 w-11 items-center justify-end"
        >
          <AgendaIcon />
        </Link>
      </header>

      <div
        aria-hidden="true"
        className="o-glow absolute left-1/2 top-[118px] h-[120px] w-[320px] -ml-[160px]"
        style={{
          background:
            "radial-gradient(ellipse 160px 60px at center, rgb(239 233 221 / 0.16), rgb(239 233 221 / 0) 100%)",
        }}
      />
      <div className="o-mask absolute left-1/2 top-[140px] -ml-[135px] flex h-[76px] w-[270px] items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo SVG, affiché tel quel */}
        <img
          src="/logo/elegance-logo-ivoire.svg"
          alt={SALON.name}
          width={252}
          height={48}
          className="o-neon block h-auto w-[252px] drop-shadow-[0_0_10px_rgb(239_233_221_/_0.35)]"
        />
      </div>
      <div
        aria-hidden="true"
        className="o-rule-top absolute left-1/2 top-[144px] -ml-[150px] h-px w-[300px]"
      >
        <div className={beam} />
      </div>
      <div
        aria-hidden="true"
        className="o-rule-bottom absolute left-1/2 top-[212px] -ml-[150px] h-px w-[300px]"
      >
        <div className={beam} />
      </div>

      <div className="absolute inset-x-6 top-[278px] flex flex-col items-center gap-4 text-center">
        <h1 className="flex flex-col items-center font-display text-[46px] leading-[1.04] tracking-[-0.01em]">
          <span className="block overflow-hidden pb-1">
            <span className="o-l1 block">Bien plus</span>
          </span>
          <span className="block overflow-hidden pb-1">
            <span className="o-l2 block">qu&rsquo;une coupe.</span>
          </span>
        </h1>
        <p className="o-sub text-[13px] leading-normal text-ivory-soft">
          Coiffure homme et barbe · {SALON.city}
        </p>
      </div>

      <div className="absolute inset-x-6 top-[452px] flex flex-col gap-3">
        <Link
          id="arrivee-reserver"
          href="/reservation"
          className="o-b1 flex h-[58px] items-center justify-center gap-4 bg-ivory pl-[0.3em] text-[13px] font-semibold uppercase tracking-[0.3em] text-ink"
        >
          Réserver
          <ArrowRight color="#0b0a09" />
        </Link>
        <a
          href={SALON.phoneHref}
          className="o-b2 flex h-[54px] items-center justify-center gap-3 border border-[rgb(239_233_221_/_0.32)] text-[12px] font-medium uppercase tracking-[0.28em]"
        >
          <PhoneIcon />
          Appeler
        </a>
      </div>

      <div
        aria-hidden="true"
        className="o-cue absolute left-1/2 top-[610px] h-[52px] w-px overflow-hidden bg-[rgb(239_233_221_/_0.14)]"
      >
        <div className="o-cue-dot h-3.5 w-px bg-led" />
      </div>

      <div className="absolute inset-x-6 top-[730px] grid grid-cols-3 gap-2 text-center text-[10px] font-medium uppercase leading-[1.7] tracking-[0.22em] text-ivory-soft">
        {[
          ["Coupe", "homme"],
          ["Taille", "de barbe"],
          ["Sur", "rendez-vous"],
        ].map(([a, b], i) => (
          <span key={a} className="o-f" style={{ animationDelay: `${1000 + i * 60}ms` }}>
            {a}
            <br />
            {b}
          </span>
        ))}
      </div>
    </section>
  );
}

/** « Réserver + Appeler », fixée en bas une fois le bouton de l'arrivée sorti de l'écran. */
function BookingBar() {
  return (
    <>
      <div
        id="barre-reserver"
        data-show="false"
        className="c-bar fixed bottom-0 left-1/2 z-20 flex w-full max-w-[430px] -translate-x-1/2 gap-2.5 border-t border-[rgb(239_233_221_/_0.1)] bg-[rgb(10_9_8_/_0.94)] px-6 pb-[18px] pt-3"
      >
        <Link
          href="/reservation"
          tabIndex={-1}
          className="flex h-14 flex-1 items-center justify-center gap-3.5 bg-ivory text-[13px] font-semibold uppercase tracking-[0.28em] text-ink"
        >
          Réserver
          <ArrowRight color="#0b0a09" />
        </Link>
        <a
          href={SALON.phoneHref}
          tabIndex={-1}
          aria-label="Appeler le salon"
          className="flex h-14 w-14 items-center justify-center border border-[rgb(239_233_221_/_0.32)]"
        >
          <PhoneIcon size={18} />
        </a>
      </div>
      <BookingBarWatcher targetId="arrivee-reserver" barId="barre-reserver" />
    </>
  );
}
