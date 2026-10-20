import type { Metadata } from "next";
import { Gallery } from "@/components/vitrine/gallery";
import { HexMark } from "@/components/vitrine/icons";
import { HoursAccess } from "@/components/vitrine/hours-access";
import { SiteHeader } from "@/components/vitrine/site-header";
import { TeamSection } from "@/components/vitrine/team-section";
import { gallery } from "@/lib/photos";
import { performerNote } from "@/modules/vitrine/catalog-view";
import { getVitrine } from "@/modules/vitrine/cache";
import { weekRows } from "@/modules/vitrine/hours";

export const metadata: Metadata = {
  title: "Le salon",
  description:
    "Le salon d'Elegance Strasbourg à Schiltigheim : plafond de lumière, fauteuils capitonnés, coin d'attente. L'équipe, les horaires et l'accès.",
  alternates: { canonical: "/salon" },
};

export default async function SalonPage() {
  const { team, week, closures } = await getVitrine();
  return (
    <>
      <SiteHeader />
      <main>
        <section className="mx-auto flex w-full max-w-[1200px] flex-col gap-3.5 px-6 pb-8 pt-10 lg:pt-16">
          <div className="flex animate-reveal items-center gap-3">
            <HexMark />
            <span className="text-label uppercase text-stone">Le lieu</span>
          </div>
          <h1 className="animate-reveal text-title-page [animation-delay:70ms] lg:text-display">Le salon</h1>
          <p className="max-w-xl animate-reveal text-body text-ivory-soft [animation-delay:140ms]">
            Un plafond de lumière, des poutres en bois, des fauteuils capitonnés. Et pour patienter,
            des canapés en cuir et un café.
          </p>
        </section>

        <div className="mx-auto w-full max-w-[1200px]">
          <Gallery photos={gallery} />
        </div>

        <TeamSection team={team} note={performerNote(team)} />
        <HoursAccess rows={weekRows(week)} closures={closures} />
      </main>
    </>
  );
}
