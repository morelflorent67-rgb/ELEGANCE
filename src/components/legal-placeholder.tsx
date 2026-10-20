import { SALON, salonAddressLine } from "@/lib/salon";
import { Eyebrow, LedLine, PageHeader } from "./ui";

/** Page légale provisoire : les textes définitifs seront rédigés et validés par un professionnel avant l'ouverture. */
export function LegalPlaceholder({ title }: { title: string }) {
  return (
    <div className="min-h-dvh">
      <PageHeader backHref="/" />
      <main className="mx-auto flex w-full max-w-[640px] flex-col gap-7 px-6 pb-12 pt-8">
        <div className="flex flex-col gap-3">
          <Eyebrow>Informations légales</Eyebrow>
          <h1 className="text-title-1">{title}</h1>
        </div>
        <LedLine />
        <p className="text-body text-ivory-soft">
          Ce texte est en cours de rédaction. Il sera publié avant l&rsquo;ouverture du site.
        </p>
        <p className="text-body-sm text-stone">
          En attendant, pour toute question : {SALON.name}, {salonAddressLine}, {SALON.phoneDisplay}
          .
        </p>
      </main>
    </div>
  );
}
