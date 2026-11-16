import "server-only";
import { headers } from "next/headers";

/** Adresse de l'appelant, pour limiter les essais. Derrière Caddy, `x-forwarded-for` est réécrit par Caddy (les en-têtes envoyés par le visiteur ne sont pas crus) et Next n'écoute que sur 127.0.0.1. */
export async function callerIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "unknown";
}
