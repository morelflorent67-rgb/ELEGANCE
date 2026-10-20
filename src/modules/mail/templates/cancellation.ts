import {
  capitalize,
  formatDay,
  formatDayWithYear,
  formatDuration,
  formatPrice,
  formatTime,
} from "@/lib/format";
import { SALON } from "@/lib/salon";
import { COLORS, FONT, button, escapeHtml, layout, type RenderedEmail } from "../layout";

export interface CancellationData {
  firstName: string | null;
  /** Créneau annulé. */
  startsAt: Date;
  items: { name: string; durationMin: number; priceCents: number }[];
  staffFirstName: string;
  /** Page pour reprendre rendez-vous. */
  bookUrl: string;
  /** Qui a annulé : le client lui-même (défaut), ou le salon, qui a appelé le client avant (R-63, D-52). */
  cancelledBy?: "customer" | "salon";
  logoUrl: string;
}

/**
 * Email d'annulation, d'après la maquette « Email — annulation ». Confirme au client l'annulation qu'il a faite, ou,
 * quand le salon annule (R-33, R-63), confirme l'échange téléphonique et présente des excuses (D-52).
 */
export function renderCancellationEmail(data: CancellationData): RenderedEmail {
  const subject = `Votre rendez-vous du ${formatDay(data.startsAt)} est annulé`;
  const preheader = "Envie d'un autre créneau ? Réservez en quelques secondes.";
  const when = `${capitalize(formatDayWithYear(data.startsAt))} · ${formatTime(data.startsAt)}`;
  const total = data.items.reduce((sum, i) => sum + i.priceCents, 0);
  const summary = `${data.items.map((i) => i.name).join(" + ")} · ${formatPrice(total)} · avec ${data.staffFirstName}`;
  const bySalon = data.cancelledBy === "salon";
  const intro = bySalon
    ? `${data.firstName ? `${data.firstName}, s` : "S"}uite à notre échange, nous avons annulé votre rendez-vous. Toutes nos excuses pour la gêne occasionnée.`
    : data.firstName
      ? `Merci de nous avoir prévenus, ${data.firstName} : le créneau est libéré pour un autre client.`
      : "Merci de nous avoir prévenus : le créneau est libéré pour un autre client.";
  const notYou = bySalon
    ? `Une question sur cette annulation ? Appelez-nous au ${SALON.phoneDisplay}.`
    : `Vous n'êtes pas à l'origine de cette annulation ? Appelez-nous au ${SALON.phoneDisplay}.`;
  const duration = formatDuration(data.items.reduce((sum, i) => sum + i.durationMin, 0));

  const bodyHtml = `
<div style="font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:${COLORS.stone};">Rendez-vous annulé</div>
<h1 style="margin:14px 0 0;font-size:30px;line-height:1.15;font-weight:300;letter-spacing:-0.01em;color:${COLORS.ivory};">Votre rendez-vous est annulé.</h1>
<p style="margin:14px 0 0;font-size:16px;line-height:1.6;font-weight:300;color:${COLORS.ivorySoft};">${escapeHtml(intro)}</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;border:1px solid ${COLORS.line};"><tr><td style="padding:24px 28px;">
<div style="font-size:12px;letter-spacing:0.26em;text-transform:uppercase;color:${COLORS.stone};">${escapeHtml(when)}</div>
<div style="padding-top:10px;font-family:${FONT};font-size:16px;line-height:1.5;color:${COLORS.stone};text-decoration:line-through;">${escapeHtml(summary)}</div>
</td></tr></table>

<div style="margin-top:24px;">${button("Reprendre rendez-vous", data.bookUrl, "primary")}</div>
<p style="margin:28px 0 0;font-size:14px;line-height:1.55;color:${COLORS.stone};">${escapeHtml(notYou)}</p>`;

  const html = layout({
    title: subject,
    preheader,
    logoUrl: data.logoUrl,
    bodyHtml,
    footerNote: `Vous recevez cet email car vous aviez un rendez-vous chez ${SALON.name}.`,
  });

  const text = [
    "Votre rendez-vous est annulé.",
    "",
    intro,
    "",
    `${when}`,
    `${summary} (${duration})`,
    "",
    `Reprendre rendez-vous : ${data.bookUrl}`,
    "",
    notYou,
    "",
    `${SALON.name} · ${SALON.tagline}`,
  ].join("\n");

  return { subject, preheader, html, text };
}
