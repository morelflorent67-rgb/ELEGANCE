import Image from "next/image";

// Page provisoire du lot 0 : elle prouve que le thème, le logo et le déploiement fonctionnent.
// L'accueil définitif est construit au lot 6.
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[1200px] flex-col items-center justify-center gap-10 px-6 py-16 text-center">
      <div className="bg-ivory p-6">
        <Image
          src="/logo/elegance-logo-noir.svg"
          alt="Elegance"
          width={256}
          height={51}
          priority
          unoptimized
        />
      </div>
      <p className="label-caps">Style · Soin · Confiance</p>
      <h1 className="text-title-1">Bien plus qu&rsquo;une coupe</h1>
      <p className="text-body-lg max-w-md text-ivory-soft">
        La réservation en ligne ouvre bientôt. En attendant, appelez le salon.
      </p>
      <a
        href="tel:+33388977468"
        className="text-button inline-flex h-14 items-center bg-ivory px-8 uppercase text-ink"
      >
        Appeler le salon
      </a>
    </main>
  );
}
