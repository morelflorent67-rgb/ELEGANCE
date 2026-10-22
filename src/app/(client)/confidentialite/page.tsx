import type { Metadata } from "next";
import { LegalPage } from "@/components/client/legal-page";
import { legalMeta } from "@/modules/vitrine/legal";

const meta = legalMeta("confidentialite");

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: "/confidentialite" },
};

export default function Page() {
  return <LegalPage slug="confidentialite" />;
}
