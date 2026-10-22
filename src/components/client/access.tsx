import {
  SALON,
  SALON_ACCESS,
  salonAddressLine,
  salonDirectionsUrl,
  salonWazeUrl,
} from "@/lib/salon";
import { BUILDINGS, MAIN_ROAD, ROUTES, STREETS } from "./access-map-data";
import { InView } from "./in-view";
import { Eyebrow } from "./ui";

const tile =
  "flex min-h-[58px] items-center gap-3 border border-[rgb(239_233_221_/_0.32)] px-3.5 text-[10px] font-semibold uppercase leading-normal tracking-[0.18em] text-ivory";

/** Accès : le plan dessiné au trait, le trajet qui se trace jusqu'au salon, l'adresse et l'itinéraire (D-98). */
export function Access() {
  return (
    <InView aria-labelledby="acces-titre" className="flex flex-col gap-6 pb-16 pt-14">
      <Eyebrow className="s-up px-6">Accès</Eyebrow>

      <div className="relative h-[350px] w-full overflow-hidden bg-[#0c0b0a]">
        <div aria-hidden="true" className="m-cam absolute inset-0">
          <svg
            className="m-bg absolute inset-0 h-full w-full"
            viewBox="0 0 1400 1260"
            preserveAspectRatio="xMidYMid slice"
          >
            <path d={BUILDINGS} fill="rgb(239 233 221 / 0.045)" />
          </svg>
          <svg
            viewBox="0 0 1400 1260"
            preserveAspectRatio="xMidYMid slice"
            fill="none"
            className="absolute inset-0 h-full w-full"
          >
            <g stroke="rgb(239 233 221 / 0.26)" strokeLinecap="round">
              {STREETS.map((street) => (
                <path
                  key={street.d}
                  className="m-st"
                  pathLength="1"
                  vectorEffect="non-scaling-stroke"
                  d={street.d}
                  style={{ animationDelay: `${street.delay}ms` }}
                />
              ))}
            </g>
            <path
              className="m-rdb"
              pathLength="1"
              vectorEffect="non-scaling-stroke"
              d={MAIN_ROAD}
              stroke="rgb(239 233 221 / 0.7)"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            {ROUTES.map((route) => (
              <path
                key={route.d}
                className="m-gold"
                pathLength="1"
                vectorEffect="non-scaling-stroke"
                d={route.d}
                stroke={route.main ? "#b8935a" : "rgb(184 147 90 / 0.6)"}
                strokeWidth={route.main ? 2 : 1.4}
                strokeLinecap="round"
                style={{
                  animationDelay: route.delay,
                  filter: route.main ? "drop-shadow(0 0 4px rgb(184 147 90 / 0.8))" : undefined,
                }}
              />
            ))}
          </svg>
          <div
            className="m-halo absolute left-[58%] top-[45%] h-[150px] w-[150px]"
            style={{
              transform: "translate(-50%, -50%)",
              background:
                "radial-gradient(circle, rgb(184 147 90 / 0.5) 0%, rgb(184 147 90 / 0.16) 40%, rgb(184 147 90 / 0) 70%)",
            }}
          />
          {["2.2s", "3.2s", "4.2s"].map((delay) => (
            <div
              key={delay}
              className="m-ring absolute left-[58%] top-[45%] h-9 w-9 rounded-[50%] border border-gold"
              style={{ animationDelay: delay }}
            />
          ))}
          <div
            className="m-pin absolute left-[58%] top-[45%] flex h-[18px] w-[18px] items-center justify-center rounded-[50%] border-[1.5px] border-gold bg-ink shadow-[0_0_14px_rgb(184_147_90_/_0.8)]"
            style={{ transform: "translate(-50%, -50%)" }}
          >
            <span className="h-1.5 w-1.5 rounded-[50%] bg-ivory" />
          </div>
          <div
            className="m-sign absolute left-[58%] top-[calc(45%-16px)]"
            style={{ transform: "translate(-50%, -100%)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG léger, sans optimisation d'image */}
            <img
              src="/logo/elegance-logo-ivoire.svg"
              alt=""
              width={96}
              height={18}
              className="block h-auto w-24 drop-shadow-[0_0_8px_rgb(239_233_221_/_0.45)]"
            />
          </div>
          <span className="m-lab absolute left-[64%] top-[55%] origin-top-left rotate-[82.8deg] whitespace-nowrap text-[9px] font-medium tracking-[0.08em] text-ivory-soft">
            Route de Bischwiller
          </span>
          <span className="m-lab absolute left-[8%] top-[22%] text-[9px] font-semibold uppercase tracking-[0.24em] text-stone">
            {SALON.city}
          </span>
          <span className="m-lab absolute bottom-[9%] right-[5%] text-[9px] font-semibold uppercase tracking-[0.22em] text-stone">
            Strasbourg →
          </span>
        </div>
        <p className="absolute bottom-1 right-1.5 text-[8px] text-stone-dark">
          <a href="https://www.openstreetmap.org/copyright" className="no-underline">
            © contributeurs OpenStreetMap
          </a>
        </p>
      </div>

      <div className="flex flex-col gap-5 px-6">
        <div className="s-up flex flex-col gap-2" style={{ animationDelay: "300ms" }}>
          <h2 id="acces-titre" className="font-display text-[34px] leading-[1.1]">
            {SALON.name}
          </h2>
          <span className="text-[14px] text-ivory-soft">{salonAddressLine}</span>
        </div>
        <div className="s-up grid grid-cols-2 gap-2.5" style={{ animationDelay: "380ms" }}>
          <a href={salonDirectionsUrl} className={tile}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#efe9dd"
              strokeWidth="1.4"
              className="shrink-0"
              aria-hidden="true"
            >
              <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
              <circle cx="12" cy="9.5" r="2.5" />
            </svg>
            <span>
              Itinéraire
              <br />
              Google Maps
            </span>
          </a>
          <a href={salonWazeUrl} className={`${tile} justify-center`}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#efe9dd"
              strokeWidth="1.4"
              aria-hidden="true"
            >
              <path d="M3 11l18-8-8 18-2-8z" />
            </svg>
            Waze
          </a>
        </div>
        <span
          aria-hidden="true"
          className="s-line block h-px bg-[rgb(239_233_221_/_0.14)]"
          style={{ animationDelay: "450ms" }}
        />
        <ul className="grid grid-cols-3 gap-2 text-center text-[10px] font-semibold uppercase leading-[1.6] tracking-[0.2em] text-ivory-soft">
          {SALON_ACCESS.map((item, i) => (
            <li
              key={item.kind}
              className="s-up flex flex-col items-center gap-2.5"
              style={{ animationDelay: `${520 + i * 60}ms` }}
            >
              <AccessIcon kind={item.kind} />
              <span>
                {item.title}
                <br />
                <span className="text-stone-dark">{item.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </InView>
  );
}

function AccessIcon({ kind }: { kind: (typeof SALON_ACCESS)[number]["kind"] }) {
  const common = {
    fill: "none",
    stroke: "#b8935a",
    strokeWidth: 1.3,
    "aria-hidden": true,
  } as const;
  if (kind === "parking") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" {...common}>
        <path d="M5 16l1.6-5.2A2 2 0 0 1 8.5 9.4h7a2 2 0 0 1 1.9 1.4L19 16v3h-2v-2H7v2H5z" />
        <circle cx="8" cy="14" r=".6" />
        <circle cx="16" cy="14" r=".6" />
      </svg>
    );
  }
  if (kind === "bus") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" {...common}>
        <rect x="6" y="4" width="12" height="13" />
        <path d="M6 11h12M9 20l-2 2M15 20l2 2M10 4V2h4v2" />
      </svg>
    );
  }
  return (
    <svg width="22" height="20" viewBox="0 0 26 24" {...common}>
      <circle cx="6" cy="16" r="4.5" />
      <circle cx="20" cy="16" r="4.5" />
      <path d="M6 16l4.5-8h7L20 16M10.5 8L13 16h-7M15.5 5h3" />
    </svg>
  );
}
