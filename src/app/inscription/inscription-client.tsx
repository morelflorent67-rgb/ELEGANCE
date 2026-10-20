"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SignUpForm } from "@/components/account-forms";
import { safeNext } from "@/lib/safe-redirect";

export function SignUpWithRedirect() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"), "/reservation");
  return <SignUpForm onSuccess={() => router.push(next)} />;
}
