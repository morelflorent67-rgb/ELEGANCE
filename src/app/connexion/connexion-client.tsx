"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { LoginForm } from "@/components/account-forms";
import { safeNext } from "@/lib/safe-redirect";

export function LoginWithRedirect() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"), "/compte/rendez-vous");
  return <LoginForm onSuccess={() => router.push(next)} />;
}
