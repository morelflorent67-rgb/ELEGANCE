import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "@/components/vitrine/icons";
import { HoursAccess } from "@/components/vitrine/hours-access";
import { OpeningHero } from "@/components/vitrine/opening-hero";
import { SectionHeading } from "@/components/vitrine/section-heading";
import { SiteHeader } from "@/components/vitrine/site-header";
import { TeamSection } from "@/components/vitrine/team-section";
import { TextLink } from "@/components/vitrine/text-link";
import { formatDuration, formatPrice } from "@/lib/format";
import { photos } from "@/lib/photos";
import { highlights, joinNames } from "@/modules/vitrine/catalog-view";
import { getVitrine } from "@/modules/vitrine/cache";
import { groupWeekHours, openingPhrase } from "@/modules/vitrine/hours";

export const metadata: Metadata = {
  title: { absolute: "Elegance Strasbourg · Barbier sur rendez-vous à Schiltigheim" },
  description:
    "Salon de coiffure homme et barbe à Schiltigheim, près de Strasbourg : coupe, taille de barbe, soin du visage. Sur rendez-vous, réservation en ligne.",
  alternates: { canonical: "/" },
};

const figCaption = "text-label uppercase tracking-[0.28em] text-stone";

export default async function HomePage() {
  const { services, team, week, closures } = await getVitrine();
  const phrase = openingPhrase(week);
  const names = joinNames(team.map((m) => m.firstName));

  return (
    <>
      <SiteHeader overlay />
      <main>
        <OpeningHero />

        <section className="mx-auto flex w-full max-w-[1200px] flex-col gap-9 px-6 pb-14 pt-16 lg:items-center lg:py-24 lg:text-center">
          <p className="max-w-[40ch] text-body-lg text-ivory text-pretty" data-reveal>
            {names ? `${names} vous reçoivent ` : "Nous vous recevons "}
            {phrase ? `${phrase}, ` : ""}uniquement sur rendez-vous.
          </p>
          <div
            className="grid grid-cols-3 border-y border-line lg:w-full lg:max-w-xl"
            data-reveal
          >
            {["Style", "Soin", "Confiance"].map((word, index) => (
              <div
                key={word}
                className={`py-5 pl-[0.24em] text-center text-label uppercase tracking-[0.24em] ${
                  index === 1 ? "border-x border-line" : ""
                }`}
              >
                {word}
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto flex w-full max-w-[1200px] flex-col gap-7 px-6 py-14">
          <SectionHeading label="La carte" title="Prestations phares" />
          <ul className="flex flex-col border-t border-line lg:max-w-2xl" data-reveal>
            {highlights(services).map((service) => (
              <li key={service.id} className="border-b border-line">
                <Link
                  href="/reservation"
                  className="flex min-h-[76px] items-center gap-4 transition-colors hover:bg-graphite"
                >
                  <div className="flex flex-1 flex-col gap-1">
                    <span className="text-body font-normal">{service.name}</span>
                    <span className="text-[13px] text-stone">{formatDuration(service.durationMin)}</span>
                  </div>
                  <span className="text-[15px] tabular-nums">{formatPrice(service.priceCents)}</span>
                  <ChevronRight className="text-gold" />
                </Link>
              </li>
            ))}
          </ul>
          <TextLink href="/prestations">Voir les {services.length} prestations</TextLink>
        </section>

        <section className="mx-auto flex w-full max-w-[1200px] flex-col gap-7 py-14">
          <div className="px-6">
            <SectionHeading label="Le lieu" title="Le salon">
              <p className="mt-1 max-w-xl text-body text-ivory-soft">
                Un plafond de lumière, du bois, des fauteuils capitonnés. Et un coin d&rsquo;attente,
                canapés en cuir et café.
              </p>
            </SectionHeading>
          </div>

          <div className="flex flex-col gap-7 lg:grid lg:grid-cols-12 lg:gap-6 lg:px-6">
            <figure className="flex flex-col gap-3.5 lg:col-span-12" data-reveal>
              <div className="relative h-[300px] lg:h-[460px]">
                <Image
                  src={photos.postesWide.src}
                  alt={photos.postesWide.alt}
                  fill
                  sizes="(min-width: 1200px) 1152px, 100vw"
                  className="object-cover object-[50%_30%]"
                />
                <div className="led-line absolute inset-x-0 top-0 opacity-80" aria-hidden="true" />
              </div>
              <figcaption className={`flex items-center gap-3 px-6 lg:px-0 ${figCaption}`}>
                <span className="h-px w-6 bg-gold" aria-hidden="true" />
                {photos.postesWide.caption}
              </figcaption>
            </figure>

            <div className="grid grid-cols-2 items-start gap-3.5 px-6 lg:col-span-5 lg:px-0" data-reveal>
              <figure className="flex flex-col gap-3">
                <div className="relative h-[236px]">
                  <Image
                    src={photos.fauteuils.src}
                    alt={photos.fauteuils.alt}
                    fill
                    sizes="(min-width: 1024px) 220px, 50vw"
                    className="object-cover object-[50%_82%]"
                  />
                </div>
                <figcaption className={figCaption}>{photos.fauteuils.caption}</figcaption>
              </figure>
              <figure className="mt-12 flex flex-col gap-3">
                <div className="relative h-[236px]">
                  <Image
                    src={photos.lumiere.src}
                    alt={photos.lumiere.alt}
                    fill
                    sizes="(min-width: 1024px) 220px, 50vw"
                    className="object-cover object-[50%_35%]"
                  />
                </div>
                <figcaption className={figCaption}>{photos.lumiere.caption}</figcaption>
              </figure>
            </div>

            <figure className="mx-6 flex flex-col gap-3 lg:col-span-7 lg:mx-0" data-reveal>
              <div className="relative h-[214px] lg:h-[300px]">
                <Image
                  src={photos.attente.src}
                  alt={photos.attente.alt}
                  fill
                  sizes="(min-width: 1024px) 660px, 100vw"
                  className="object-cover object-[60%_60%]"
                />
              </div>
              <figcaption className={figCaption}>{photos.attente.caption}</figcaption>
            </figure>
          </div>

          <div className="px-6">
            <TextLink href="/salon">Découvrir le salon</TextLink>
          </div>
        </section>

        <TeamSection team={team} />
        <HoursAccess rows={groupWeekHours(week)} closures={closures} />
      </main>
    </>
  );
}
