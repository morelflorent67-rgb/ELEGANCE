import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

// Briques d'interface du design « Lumière » : aucun coin arrondi, une seule action ivoire par écran,
// cibles tactiles de 44 px au moins, champs à 16 px (pas de zoom sur iPhone).

export const btnPrimary =
  "flex h-14 w-full items-center justify-center bg-ivory px-6 text-button uppercase text-ink transition-colors duration-200 hover:bg-ivory-soft disabled:bg-disabled disabled:text-stone-dark";

export const btnSecondary =
  "flex h-[52px] w-full items-center justify-center gap-2.5 border border-line-strong px-6 text-button-sm uppercase text-ivory transition-colors duration-200 hover:bg-graphite-light";

export const inputClass =
  "h-[52px] w-full min-w-0 border border-line-strong bg-ink px-4 text-[16px] text-ivory placeholder:text-stone-dark";

export const linkQuiet =
  "inline-flex min-h-11 items-center text-body-sm text-ivory-soft underline underline-offset-4";

export function Logo({ width = 92 }: { width?: number }) {
  return (
    <span className="flex bg-ivory px-2.5 py-2">
      <Image
        src="/logo/elegance-logo-noir.svg"
        alt="Elegance Strasbourg"
        width={width}
        height={Math.round(width / 5.03)}
        unoptimized
        priority
        style={{ width, height: "auto" }}
      />
    </span>
  );
}

export function BackIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function PhoneIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z" />
    </svg>
  );
}

export function CalendarIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

/** En-tête des pages d'accueil de parcours : retour, logo sur plaque ivoire, ou titre de section. */
export function PageHeader({ backHref, label }: { backHref: string; label?: string }) {
  return (
    <header className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-2.5">
      <Link
        href={backHref}
        aria-label="Retour"
        className="flex h-11 w-11 items-center justify-center text-ivory"
      >
        <BackIcon />
      </Link>
      {label ? (
        <span className="text-label uppercase text-ivory">{label}</span>
      ) : (
        <Link href="/" aria-label="Accueil" className="flex min-h-11 items-center">
          <Logo />
        </Link>
      )}
      <span className="h-11 w-11" />
    </header>
  );
}

/** Ligne de lumière : un filet blanc d'un pixel. */
export function LedLine() {
  return <div className="h-px bg-led opacity-60" />;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="text-label uppercase text-stone">{children}</span>;
}

export function Field({
  id,
  label,
  hint,
  error,
  optional,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="text-body-sm text-ivory-soft">
        {label}
        {optional ? <span className="text-stone"> (facultatif)</span> : null}
      </label>
      {children}
      {error ? (
        <span id={`${id}-error`} role="alert" className="text-body-sm text-brick">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="text-body-sm text-stone">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** Message encadré : erreur (contour brique, jamais en aplat) ou information (contour neutre). */
export function Alert({
  kind,
  title,
  children,
}: {
  kind: "error" | "info";
  title: string;
  children?: ReactNode;
}) {
  const error = kind === "error";
  return (
    <div
      role={error ? "alert" : "status"}
      className={`flex gap-3.5 border p-4 ${error ? "border-brick" : "border-line-strong"}`}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={error ? "var(--color-brick)" : "var(--color-ivory)"}
        strokeWidth="1.5"
        className="shrink-0"
        aria-hidden="true"
      >
        {error ? (
          <path d="M12 3l9.5 17h-19zM12 10v4M12 17v.5" />
        ) : (
          <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
        )}
      </svg>
      <div className="flex flex-col gap-1">
        <span className="text-body text-ivory">{title}</span>
        {children ? <span className="text-body-sm text-stone">{children}</span> : null}
      </div>
    </div>
  );
}

export function CallButton({ kind = "secondary" }: { kind?: "primary" | "secondary" }) {
  return (
    <a href="tel:+33388977468" className={kind === "primary" ? btnPrimary : btnSecondary}>
      <PhoneIcon size={16} />
      Appeler le salon
    </a>
  );
}
