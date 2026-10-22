import { capitalize, formatDay, formatPrice } from "@/lib/format";
import { SALON } from "@/lib/salon";
import {
  COLORS,
  DISPLAY_FONT,
  button,
  escapeHtml,
  layout,
  type RenderedEmail,
} from "../layout";

export interface WinbackData {
  firstName: string | null;
  /** Début du dernier RDV honoré. */
  lastVisit: Date;
  items: { name: string }[];
  totalPriceCents: number;
  staffFirstName: string;
  /** « Réserver à nouveau » : la page de réservation. */
  bookUrl: string;
  /** « Reprendre le même RDV ». */
  rebookUrl: string;
  /** Lien signé pour ne plus recevoir ces messages (D-74). */
  unsubscribeUrl: string;
  logoUrl: string;
}

/**
 * Email « Nous serions ravis de vous revoir » (D-74), d'après la maquette « Email — revoir ». Un seul bouton ; les
 * trois horaires de la maquette sont écartés (décision de Florent, 22 octobre 2026) : ils seraient périmés dès la
 * lecture, et le client choisit son horaire sur la page de réservation.
 */
export function renderWinbackEmail(data: WinbackData): RenderedEmail {
  const subject = data.firstName
    ? `Nous serions ravis de vous revoir, ${data.firstName}`
    : "Nous serions ravis de vous revoir";
  const lastDay = formatDay(data.lastVisit);
  const preheader = `Votre dernier passage remonte au ${lastDay}. Reprenez le même rendez-vous en quelques secondes.`;
  const greeting = data.firstName ? `Bonjour ${data.firstName}, votre` : "Votre";
  const lead = `${greeting} dernière visite remonte au ${lastDay}. Reprenez le même rendez-vous en quelques secondes.`;
  const services = data.items.map((i) => i.name).join(" + ");

  const bodyHtml = `
<div style="font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:${COLORS.gold};">${escapeHtml(SALON.name)}</div>
<h1 style="margin:14px 0 0;font-family:${DISPLAY_FONT};font-size:40px;line-height:1.1;font-weight:400;color:${COLORS.ivory};">Nous serions ravis de vous revoir.</h1>
<p style="margin:14px 0 0;font-size:16px;line-height:1.6;font-weight:300;color:${COLORS.ivorySoft};">${escapeHtml(lead)}</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;border-top:1px solid ${COLORS.line};border-bottom:1px solid ${COLORS.line};"><tr>
<td style="padding:18px 0;">
<div style="font-size:11px;letter-spacing:0.26em;text-transform:uppercase;color:${COLORS.stone};">Votre dernier rendez-vous</div>
<div style="padding-top:8px;font-size:17px;color:${COLORS.ivory};">${escapeHtml(services)}</div>
<div style="padding-top:4px;font-size:13px;color:${COLORS.stone};">${escapeHtml(capitalize(lastDay))} · avec ${escapeHtml(data.staffFirstName)} · ${escapeHtml(formatPrice(data.totalPriceCents))}</div>
</td></tr></table>

<div style="margin-top:28px;">${button("Réserver à nouveau", data.bookUrl, "primary")}</div>

<p style="margin:22px 0 0;font-size:14px;line-height:1.6;color:${COLORS.ivorySoft};">Même prestation, même coiffeur : <a href="${escapeHtml(data.rebookUrl)}" style="color:${COLORS.ivory};text-decoration:none;border-bottom:1px solid ${COLORS.gold};">Reprendre le même RDV</a>. Un autre coiffeur, une autre prestation ? Choisissez-les sur la page de réservation. Pour une prestation sur appel : ${escapeHtml(SALON.phoneDisplay)}.</p>

<p style="margin:28px 0 0;font-size:12px;line-height:1.55;color:${COLORS.stone};"><a href="${escapeHtml(data.unsubscribeUrl)}" style="color:${COLORS.ivorySoft};">Ne plus recevoir ces messages</a></p>`;

  const html = layout({
    title: subject,
    preheader,
    logoUrl: data.logoUrl,
    bodyHtml,
    footerNote: `Vous recevez cet email car vous avez un compte client chez ${SALON.name}.`,
  });

  const text = [
    "Nous serions ravis de vous revoir.",
    "",
    lead,
    "",
    `Votre dernier rendez-vous : ${services}, avec ${data.staffFirstName} · ${formatPrice(data.totalPriceCents)}`,
    "",
    `Réserver à nouveau : ${data.bookUrl}`,
    `Reprendre le même RDV : ${data.rebookUrl}`,
    "",
    `Ne plus recevoir ces messages : ${data.unsubscribeUrl}`,
    "",
    `${SALON.name} · ${SALON.tagline}`,
  ].join("\n");

  return { subject, preheader, html, text };
}
