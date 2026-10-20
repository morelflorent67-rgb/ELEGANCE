import Link from "next/link";

/** Passage de « Mes rendez-vous » à « Mes informations » (R-76) : l'espace client regroupe les deux. */
export function AccountNav({ current }: { current: "rendez-vous" | "informations" }) {
  const items = [
    { key: "rendez-vous", href: "/compte/rendez-vous", label: "Mes rendez-vous" },
    { key: "informations", href: "/compte/informations", label: "Mes informations" },
  ] as const;
  return (
    <nav aria-label="Mon compte" className="grid grid-cols-2 border-b border-line">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.key === current ? "page" : undefined}
          className={`flex h-12 items-center justify-center border-b-2 text-body-sm transition-colors duration-200 ${
            item.key === current
              ? "border-ivory text-ivory"
              : "border-transparent text-stone hover:text-ivory"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
