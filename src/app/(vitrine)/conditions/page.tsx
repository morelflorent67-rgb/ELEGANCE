import type { Metadata } from "next";
import { LegalPage } from "@/components/vitrine/legal-page";
import { legalMeta } from "@/modules/vitrine/legal";

const meta = legalMeta("conditions");

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: "/conditions" },
};

export default function Page() {
  return <LegalPage slug="conditions" />;
}
