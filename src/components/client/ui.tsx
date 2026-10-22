import type { ReactNode } from "react";

// Éléments communs de l'interface client (lot 12, maquettes « Lot12- ») : une seule action ivoire par écran, des
// filets de 1 px, Cormorant Garamond pour les titres et les chiffres (font-display), Manrope pour le texte.
// La tablette garde ses propres éléments (src/components/ui.tsx).

/** Le bouton principal, ivoire. */
export const cta =
  "flex h-[58px] w-full items-center justify-center gap-3.5 bg-ivory px-6 text-[12px] font-semibold uppercase tracking-[0.26em] text-ink transition-opacity duration-200 disabled:opacity-35 aria-disabled:opacity-35";

/** Le bouton secondaire, au filet. */
export const ghost =
  "flex h-[52px] w-full items-center justify-center gap-3 border border-[rgb(239_233_221_/_0.32)] px-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-ivory disabled:opacity-40";

/** Petit bouton au filet (« Sur appel », « Appeler »). */
export const chip =
  "flex min-h-11 shrink-0 items-center gap-2 border border-[rgb(239_233_221_/_0.24)] px-3.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-ivory";

/** Lien discret souligné. */
export const quiet =
  "inline-flex min-h-11 items-center text-[13px] text-ivory-soft underline underline-offset-[3px]";

export const labelCaps = "text-[10px] font-semibold uppercase tracking-[0.22em] text-stone";

/** Le repère rond doré devant une étiquette (D-97 : la forme ronde est gardée). */
export function Mark({ size = 9 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 rounded-[50%] border border-gold"
      style={{ width: size, height: size }}
    />
  );
}

/** Étiquette de section : repère doré + capitales espacées. */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.3em] text-ivory-soft ${className}`}
    >
      <Mark />
      {children}
    </span>
  );
}

/** Champ souligné : le trait se trace quand le champ est actif. */
export function Field({
  id,
  label,
  aside,
  hint,
  error,
  className = "",
  children,
}: {
  id: string;
  label: string;
  /** À droite de l'étiquette : « facultatif », compteur… */
  aside?: ReactNode;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`fld flex flex-col gap-0.5 ${className}`}>
      <label htmlFor={id} className={`flex justify-between gap-3 ${labelCaps}`}>
        {label}
        {aside ? (
          <span className="font-medium normal-case tracking-[0.08em] text-stone-dark">{aside}</span>
        ) : null}
      </label>
      <div className="relative">
        {children}
        <span className="fl bottom-0" aria-hidden="true" />
      </div>
      {error ? (
        <span id={`${id}-error`} className="pt-1.5 text-[13px] leading-snug text-brick">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="pt-1.5 text-[12px] leading-normal text-stone-dark">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** Encadré doré d'information (règle, précision). */
export function Note({ children, role = "note" }: { children: ReactNode; role?: string }) {
  return (
    <div
      role={role}
      className="flex gap-3 border border-[rgb(184_147_90_/_0.45)] px-4 py-3.5 text-[13px] leading-[1.55] text-ivory-soft"
    >
      <InfoIcon />
      <span>{children}</span>
    </div>
  );
}

/** Message d'erreur : liseré brique, jamais d'aplat. */
export function Problem({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div
      role="alert"
      className="relative flex flex-col gap-1.5 border border-[rgb(217_116_95_/_0.5)] px-4 py-3.5 pl-5"
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-brick" />
      <span className="text-[14px] leading-snug text-ivory">{title}</span>
      {children ? (
        <span className="text-[13px] leading-normal text-ivory-soft">{children}</span>
      ) : null}
    </div>
  );
}

/** Bandeau doré (créneau pris entre-temps, place qui peut se libérer…). */
export function GoldBanner({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="e-ban relative flex flex-col gap-3 bg-[rgb(184_147_90_/_0.08)] p-4 pl-5"
    >
      <span aria-hidden="true" className="e-edge absolute inset-y-0 left-0 w-0.5 bg-gold" />
      {children}
    </div>
  );
}

/** Case à cocher dessinée : le trait se trace. */
export function CheckBox({ checked, color }: { checked: boolean; color?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      className="shrink-0"
    >
      <rect
        x="0.5"
        y="0.5"
        width="21"
        height="21"
        stroke={color ?? (checked ? "#efe9dd" : "rgb(239 233 221 / 0.35)")}
      />
      <path
        className="ck"
        pathLength="1"
        d="M5.5 11.2l3.6 3.6L16.8 7"
        stroke="#efe9dd"
        strokeWidth="1.6"
        style={{ strokeDashoffset: checked ? 0 : 1 }}
      />
    </svg>
  );
}

export function Hexagon({
  width = 16,
  height = 14,
  filled = false,
  className = "",
}: {
  width?: number;
  height?: number;
  filled?: boolean;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      viewBox="0 0 16 14"
      fill="none"
      className={className}
    >
      <path
        d="M4.25 0.5H11.75L15.5 7L11.75 13.5H4.25L0.5 7Z"
        fill="#b8935a"
        style={{ opacity: filled ? 1 : 0, transition: "opacity .45s ease" }}
      />
      <path d="M4.25 0.5H11.75L15.5 7L11.75 13.5H4.25L0.5 7Z" stroke="#b8935a" />
    </svg>
  );
}

export function ArrowRight({
  color = "currentColor",
  size = 18,
}: {
  color?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={(size * 12) / 18}
      viewBox="0 0 22 14"
      fill="none"
      stroke={color}
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M0 7h20M14 1l6 6-6 6" />
    </svg>
  );
}

export function ArrowLeft({ color = "#efe9dd" }: { color?: string }) {
  return (
    <svg
      width="20"
      height="14"
      viewBox="0 0 22 14"
      fill="none"
      stroke={color}
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <path d="M22 7H2M8 1L2 7l6 6" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="#efe9dd"
      strokeWidth="1.3"
      aria-hidden="true"
    >
      <path d="M1 1l12 12M13 1L1 13" />
    </svg>
  );
}

export function PhoneIcon({ size = 15, color = "#efe9dd" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z" />
    </svg>
  );
}

export function AgendaIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#efe9dd"
      strokeWidth="1.3"
      aria-hidden="true"
    >
      <rect x="3.5" y="5" width="17" height="15.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <circle cx="16" cy="15" r="1" fill="#b8935a" stroke="none" />
    </svg>
  );
}

export function InfoIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#b8935a"
      strokeWidth="1.4"
      className="mt-0.5 shrink-0"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#b8935a"
      strokeWidth="1.4"
      className="mt-0.5 shrink-0"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
