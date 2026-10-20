import "server-only";
import { headers } from "next/headers";

/** Adresse de l'appelant, pour limiter les essais. Sur Vercel, `x-forwarded-for` est posé par la plateforme. */
export async function callerIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "unknown";
}
