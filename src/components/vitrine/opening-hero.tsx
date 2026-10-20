import Image from "next/image";
import { opening } from "@/lib/motion";
import { photos } from "@/lib/photos";
import { SALON } from "@/lib/salon";
import { OpeningController } from "./opening";

// Lu avant l'affichage du premier écran : si l'ouverture a déjà été jouée dans cette session, elle est sautée.
const skipIfPlayed = `try{if(sessionStorage.getItem(${JSON.stringify(
  opening.sessionKey,
)})!==null)document.documentElement.classList.add("opening-skip")}catch(e){}`;

/** Premier écran de l'accueil : photo du plafond, plaque ivoire du logo, ligne de lumière, signature. */
export function OpeningHero() {
  return (
    <section className="relative h-dvh max-h-[900px] min-h-[640px] overflow-hidden lg:max-h-[960px]">
      <script dangerouslySetInnerHTML={{ __html: skipIfPlayed }} />
      <OpeningController />
      <h1 className="sr-only">
        {SALON.name} : barbier sur rendez-vous à {SALON.city}
      </h1>

      <div className="absolute inset-x-0 top-0 h-[76%] lg:inset-x-auto lg:right-0 lg:h-full lg:w-[58%]">
        <Image
          src={photos.hero.src}
          alt={photos.hero.alt}
          fill
          priority
          sizes="(min-width: 1024px) 60vw, 100vw"
          data-opening
          className="animate-photo-in object-cover object-[50%_0%]"
        />
        <div
          className="absolute inset-0 lg:hidden"
          style={{
            background:
              "linear-gradient(180deg, rgb(11 10 9 / 0.55) 0%, rgb(11 10 9 / 0) 22%, rgb(11 10 9 / 0) 50%, var(--color-ink) 100%)",
          }}
        />
        <div
          className="absolute inset-0 hidden lg:block"
          style={{
            background:
              "linear-gradient(90deg, var(--color-ink) 0%, rgb(11 10 9 / 0) 38%), linear-gradient(180deg, rgb(11 10 9 / 0.55) 0%, rgb(11 10 9 / 0) 18%, rgb(11 10 9 / 0) 80%, var(--color-ink) 100%)",
          }}
        />
      </div>

      <div className="absolute inset-x-0 top-[54%] flex flex-col items-center gap-5 px-6 lg:right-auto lg:top-1/2 lg:w-[46%] lg:-translate-y-1/2">
        <div className="relative w-full max-w-[342px]">
          <svg
            data-opening
            className="trace pointer-events-none absolute -inset-2.5 h-[calc(100%+20px)] w-[calc(100%+20px)]"
            viewBox="0 0 362 256"
            preserveAspectRatio="none"
            fill="none"
            aria-hidden="true"
          >
            <path
              pathLength="1"
              d="M0.5 0.5 H361.5 V255.5 H0.5 Z"
              stroke="var(--color-led)"
              strokeWidth="1"
              strokeOpacity="0.75"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className="relative flex h-[236px] flex-col items-center justify-center gap-5 bg-ivory text-ink">
            <Image
              data-opening
              className="animate-logo-reveal"
              src="/logo/elegance-logo-noir.svg"
              alt={SALON.name}
              width={256}
              height={51}
              priority
              unoptimized
              style={{ width: 256, height: "auto" }}
            />
            <div
              data-opening
              className="h-px w-[150px] origin-center animate-led bg-ink/45 [animation-delay:200ms]"
            />
            <p
              data-opening
              className="animate-reveal pl-[0.34em] text-[12px] font-medium uppercase tracking-[0.34em] [animation-delay:900ms]"
            >
              {SALON.tagline}
            </p>
          </div>
        </div>
        <p
          data-opening
          className="animate-reveal text-body-sm tracking-[0.02em] text-stone [animation-delay:900ms]"
        >
          Barbier sur rendez-vous · {SALON.city}
        </p>
      </div>
    </section>
  );
}
