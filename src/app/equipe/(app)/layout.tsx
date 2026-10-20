import { Suspense, type ReactNode } from "react";
import { TeamNavLoader } from "./_components/team-nav-loader";

// Coque de la tablette : la barre de navigation est fixe, chaque page vérifie elle-même l'accès (R-72).
export default function TeamLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden md:flex-row">
      <Suspense fallback={<div className="h-[74px] shrink-0 bg-charcoal md:h-auto md:w-[88px]" />}>
        <TeamNavLoader />
      </Suspense>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
