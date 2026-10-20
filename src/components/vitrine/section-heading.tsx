import type { ReactNode } from "react";
import { HexMark } from "./icons";

/** Étiquette (nœud hexagonal + capitales) et titre de section, comme sur les maquettes. */
export function SectionHeading({
  label,
  title,
  as: Tag = "h2",
  children,
}: {
  label: string;
  title: string;
  as?: "h1" | "h2";
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3" data-reveal>
      <div className="flex items-center gap-3">
        <HexMark />
        <span className="text-label uppercase text-stone">{label}</span>
      </div>
      <Tag className={Tag === "h1" ? "text-title-page" : "text-title-2"}>{title}</Tag>
      {children}
    </div>
  );
}
