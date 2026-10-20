import type { CatalogService } from "@/modules/catalog";

// La carte telle que la vitrine la montre : groupes, prestations phares, qui réalise quoi. Fonctions pures.

export interface CatalogGroup {
  title: string;
  anchor: string;
  items: CatalogService[];
}

/** « Barbe et soin » → « barbe-et-soin » : identifiant d'ancre sans accent. */
export function anchorOf(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Les groupes de la carte, dans l'ordre où ils apparaissent ; l'ordre des prestations est celui du gérant. */
export function groupCatalog(services: CatalogService[]): CatalogGroup[] {
  const groups = new Map<string, CatalogGroup>();
  for (const s of services) {
    const group = groups.get(s.category) ?? {
      title: s.category,
      anchor: anchorOf(s.category) || "autres",
      items: [],
    };
    group.items.push(s);
    groups.set(s.category, group);
  }
  return [...groups.values()];
}

/** Prestations qui ne se réservent que par téléphone (R-17, D-19, D-36). */
export const callOnlyNames = (services: CatalogService[]): string[] =>
  services.filter((s) => !s.bookableOnline).map((s) => s.name);

/** Les prestations phares de l'accueil : les premières de la carte, réservables en ligne, réalisées par les coiffeurs. */
export function highlights(services: CatalogService[], count = 3): CatalogService[] {
  return services.filter((s) => s.bookableOnline && s.performedBy === "barber").slice(0, count);
}

interface TeamMember {
  firstName: string;
  role: "barber" | "apprentice";
}

const orJoin = (names: string[]) => names.join(" ou ");

/** « Tarif formation : réalisé par Kaan ou Taha… » (R-12) ; rien à dire s'il n'y a pas d'apprenti actif. */
export function performerNote(team: TeamMember[]): string | null {
  const apprentices = team.filter((m) => m.role === "apprentice").map((m) => m.firstName);
  const barbers = team.filter((m) => m.role === "barber").map((m) => m.firstName);
  if (apprentices.length === 0) return null;
  const who = apprentices.length === 1 ? "notre apprenti" : "nos apprentis";
  const rest =
    barbers.length > 0
      ? ` Toutes les autres prestations sont réalisées par ${orJoin(barbers)}.`
      : "";
  return `Tarif formation : réalisé par ${orJoin(apprentices)}, ${who}.${rest}`;
}

/** « Tribal, coloration et défrisage » : énumération à la française, minuscules après le premier nom. */
export function joinFr(names: string[]): string {
  const items = names.map((n, i) => (i === 0 ? n : n.charAt(0).toLowerCase() + n.slice(1)));
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

/** « Orhan, Enes, Kaan et Taha » : des prénoms, la casse ne change pas. */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
}
