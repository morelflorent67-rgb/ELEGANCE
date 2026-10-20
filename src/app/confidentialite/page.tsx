import type { Metadata } from "next";
import { LegalPlaceholder } from "@/components/legal-placeholder";

export const metadata: Metadata = { title: "Politique de confidentialité" };

export default function Page() {
  return <LegalPlaceholder title="Politique de confidentialité" />;
}
