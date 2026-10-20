import type { ReactNode } from "react";
import { ManagerLeaveGuard } from "./manager-leave-guard";

// Toutes les pages de l'espace gérant (R-73) partagent cette mise en page : elle reste montée tant qu'on y circule et
// se démonte quand on la quitte, ce qui reverrouille l'espace (D-53).
export default function ManagerLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ManagerLeaveGuard />
      {children}
    </>
  );
}
