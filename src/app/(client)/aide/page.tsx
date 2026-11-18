import type { Metadata } from "next";
import { ClientHeader, LegalLinks } from "@/components/client/legal-links";
import { getVitrine } from "@/modules/vitrine/cache";
import { helpSections } from "@/modules/vitrine/help";

export const metadata: Metadata = {
  title: "Aide et assistance",
  description: "Réserver, modifier, annuler, notifications, suppression du compte : l'aide d'Elegance Strasbourg.",
  alternates: { canonical: "/aide" },
};

export default async function Page() {
  const { rules } = await getVitrine();
  const sections = helpSections(rules);
  return (
    <>
      <ClientHeader title="Aide" />
      <main className="w-full">
        <section className="flex flex-col gap-3 px-6 pb-6 pt-4">
          <h1 className="font-display text-[40px] leading-[1.05]">Aide et assistance</h1>
          <div className="led-line is-visible opacity-60" aria-hidden="true" />
        </section>
        <article className="flex flex-col gap-9 px-6 pb-12 pt-2">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="flex scroll-mt-4 flex-col gap-3">
              <h2 className="font-display text-[26px] leading-tight">{section.title}</h2>
              <p className="whitespace-pre-line text-[15px] leading-[1.7] text-ivory-soft">{section.body}</p>
            </section>
          ))}
        </article>
      </main>
      <footer className="flex flex-wrap justify-center gap-x-[18px] border-t border-[rgb(239_233_221_/_0.08)] px-6 pb-10 pt-6">
        <LegalLinks />
      </footer>
    </>
  );
}
