// Pictogrammes de la vitrine : trait de 1,4 px sur grille 24, ivoire (passation design, règles 3).

/** Les trois barres du E : bouton de menu. */
export function MenuBars({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" fill="currentColor">
      <rect x="0" y="0" width="20" height="4" />
      <rect x="0" y="8" width="20" height="4" />
      <rect x="0" y="16" width="20" height="4" />
    </svg>
  );
}

export function UserIcon({ size = 22 }: { size?: number }) {
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
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.2-4 4.4-6 8-6s6.8 2 8 6" />
    </svg>
  );
}

export function CloseIcon({ size = 22 }: { size?: number }) {
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
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function ChevronRight({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
      aria-hidden="true"
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function ChevronLeft({ size = 18 }: { size?: number }) {
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
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

/** Repère d'étiquette : petit hexagone doré de 12 px. */
export function HexMark() {
  return (
    <svg width="12" height="11" viewBox="0 0 12 11" fill="none" aria-hidden="true">
      <path d="M3 0.5H9L11.5 5.5L9 10.5H3L0.5 5.5Z" stroke="var(--color-gold)" strokeWidth="1" />
    </svg>
  );
}

/** Badge d'équipe : l'initiale dans un hexagone tracé. */
export function HexBadge({ letter }: { letter: string }) {
  return (
    <div className="relative flex h-10 w-[46px] items-center justify-center" aria-hidden="true">
      <svg width="46" height="40" viewBox="0 0 46 40" fill="none" className="absolute left-0 top-0">
        <path d="M12 1H34L45 20L34 39H12L1 20Z" stroke="var(--color-led)" strokeWidth="1" />
      </svg>
      <span className="relative text-[17px] font-light">{letter}</span>
    </div>
  );
}
