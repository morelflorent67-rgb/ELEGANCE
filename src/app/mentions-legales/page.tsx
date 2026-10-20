import type { Metadata } from "next";
import { LegalPlaceholder } from "@/components/legal-placeholder";

export const metadata: Metadata = { title: "Mentions légales" };

export default function Page() {
  return <LegalPlaceholder title="Mentions légales" />;
}
