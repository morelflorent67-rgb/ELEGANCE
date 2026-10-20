import type { Metadata } from "next";
import { LegalPlaceholder } from "@/components/legal-placeholder";

export const metadata: Metadata = { title: "Conditions d'utilisation" };

export default function Page() {
  return <LegalPlaceholder title="Conditions d'utilisation" />;
}
