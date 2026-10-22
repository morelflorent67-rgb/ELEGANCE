import Link from "next/link";
import { ClientHeader, LegalLinks } from "./legal-links";
import { getVitrine } from "@/modules/vitrine/cache";
import { LEGAL_SLUGS, LEGAL_UPDATED, legalDocument, type LegalSlug } from "@/modules/vitrine/legal";

/** Gabarit unique des pages légales : trois onglets (des liens, une page par document), sommaire, sections numérotées. */
export async function LegalPage({ slug }: { slug: LegalSlug }) {
  const { rules } = await getVitrine();
  const doc = legalDocument(slug, rules);
  return (
    <>
      <ClientHeader title="Informations légales" />
      <main className="w-full">
        <section id="haut" className="flex flex-col gap-5 px-6 pb-6 pt-4">
          <nav aria-label="Documents" className="grid grid-cols-3 border-b border-line">
            {LEGAL_SLUGS.map((key) => {
              const current = key === slug;
              return (
                <Link
                  key={key}
                  href={`/${key}`}
                  aria-current={current ? "page" : undefined}
                  className={`flex h-12 items-center justify-center border-b px-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-opacity ${
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
            <h1 className="font-display text-[40px] leading-[1.05]">{doc.title}</h1>
            <span className="text-[13px] text-stone">Dernière mise à jour : {LEGAL_UPDATED}</span>
          </div>
          <div className="led-line is-visible opacity-60" aria-hidden="true" />
          <nav
            aria-label="Sommaire"
            className="flex flex-col border-y border-line-subtle py-[18px]"
          >
            <span className="pb-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-stone">
              Sommaire
            </span>
            {doc.sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="flex min-h-11 items-center gap-3.5 text-[15px] hover:text-ivory-soft"
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
                <h2 className="font-display text-[26px] leading-tight">{section.title}</h2>
              </div>
              <p className="whitespace-pre-line text-[15px] leading-[1.7] text-ivory-soft">
                {section.body}
              </p>
            </section>
          ))}
          <a
            href="#haut"
            className="flex min-h-11 items-center gap-3 self-start text-[11px] font-semibold uppercase tracking-[0.22em] text-ivory"
          >
            Haut de page
            <span className="h-px w-6 bg-gold" aria-hidden="true" />
          </a>
        </article>
      </main>
      <footer className="flex flex-wrap justify-center gap-x-[18px] border-t border-[rgb(239_233_221_/_0.08)] px-6 pb-10 pt-6">
        <LegalLinks />
      </footer>
    </>
  );
}
