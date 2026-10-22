import type { Metadata } from "next";
import { LegalPage } from "@/components/client/legal-page";
import { legalMeta } from "@/modules/vitrine/legal";

const meta = legalMeta("mentions-legales");

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: "/mentions-legales" },
};

export default function Page() {
  return <LegalPage slug="mentions-legales" />;
}
