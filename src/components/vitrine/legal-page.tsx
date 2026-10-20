import Link from "next/link";
import { SiteHeader } from "@/components/vitrine/site-header";
import { getVitrine } from "@/modules/vitrine/cache";
import { LEGAL_SLUGS, LEGAL_UPDATED, legalDocument, type LegalSlug } from "@/modules/vitrine/legal";

/** Gabarit unique des pages légales : trois onglets (des liens, une page par document), sommaire, sections numérotées. */
export async function LegalPage({ slug }: { slug: LegalSlug }) {
  const { rules } = await getVitrine();
  const doc = legalDocument(slug, rules);
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[760px]">
        <section id="haut" className="flex flex-col gap-5 px-6 pb-6 pt-8 lg:pt-14">
          <span className="text-label uppercase text-stone">Informations légales</span>
          <nav aria-label="Documents" className="grid grid-cols-3 border-b border-line">
            {LEGAL_SLUGS.map((key) => {
              const current = key === slug;
              return (
                <Link
                  key={key}
                  href={`/${key}`}
                  aria-current={current ? "page" : undefined}
                  className={`flex h-12 items-center justify-center border-b-2 px-0.5 text-button-sm tracking-normal transition-colors ${
                    current
                      ? "border-ivory text-ivory"
                      : "border-transparent text-stone hover:text-ivory"
                  }`}
                >
                  {legalDocument(key, rules).tab}
                </Link>
              );
            })}
          </nav>
          <div className="flex animate-reveal flex-col gap-2.5">
            <h1 className="text-title-1">{doc.title}</h1>
            <span className="text-body-sm text-stone">Dernière mise à jour : {LEGAL_UPDATED}</span>
          </div>
          <div className="led-line is-visible opacity-60" aria-hidden="true" />
          <nav aria-label="Sommaire" className="flex flex-col bg-charcoal px-4 py-[18px]">
            <span className="pb-1.5 text-label uppercase tracking-[0.3em] text-stone">
              Sommaire
            </span>
            {doc.sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="flex min-h-11 items-center gap-3.5 text-[15px] transition-colors hover:text-gold"
              >
                <span className="w-[22px] text-[12px] tabular-nums text-gold">{section.num}</span>
                {section.title}
              </a>
            ))}
          </nav>
        </section>

        <article className="flex flex-col gap-9 px-6 pb-12 pt-2">
          {doc.sections.map((section) => (
            <section key={section.id} id={section.id} className="flex scroll-mt-4 flex-col gap-3">
              <div className="flex items-baseline gap-3.5">
                <span className="text-[12px] tabular-nums text-gold">{section.num}</span>
                <h2 className="text-title-3">{section.title}</h2>
              </div>
              <p className="whitespace-pre-line text-body leading-[1.7] text-ivory-soft">
                {section.body}
              </p>
            </section>
          ))}
          <a
            href="#haut"
            className="flex min-h-11 items-center gap-3 self-start text-button-sm uppercase text-ivory"
          >
            Haut de page
            <span className="h-px w-6 bg-gold" aria-hidden="true" />
          </a>
        </article>
      </main>
    </>
  );
}
