import { capitalize, formatDay, formatPrice, formatTime } from "@/lib/format";
import { SALON } from "@/lib/salon";
import {
  COLORS,
  DISPLAY_FONT,
  button,
  escapeHtml,
  layout,
  type RenderedEmail,
} from "../layout";

export interface WaitlistOfferData {
  firstName: string | null;
  startsAt: Date;
  endsAt: Date;
  /** Fin de la garde : au-delà, la place passe à la personne suivante (D-100). */
  expiresAt: Date;
  holdMinutes: number;
  items: { name: string }[];
  totalPriceCents: number;
  staffFirstName: string;
  /** Page de l'offre : « Prendre cette place », « Pas cette fois », « Quitter la liste ». */
  offerUrl: string;
  cutoffHours: number;
  maxUpcoming: number;
  logoUrl: string;
}

/**
 * Email « Une place s'est libérée » (D-99, D-100), d'après la maquette « Email — place libérée » : une seule
 * personne reçoit la place, gardée `holdMinutes` minutes.
 */
export function renderWaitlistOfferEmail(data: WaitlistOfferData): RenderedEmail {
  const day = capitalize(formatDay(data.startsAt));
  const time = formatTime(data.startsAt);
  const until = formatTime(data.expiresAt);
  const subject = `Une place s'est libérée, ${formatDay(data.startsAt)} à ${time}`;
  const preheader = `Gardée pour vous ${data.holdMinutes} minutes, jusqu'à ${until}. Confirmez en un geste.`;
  const greeting = data.firstName ? `Bonjour ${data.firstName}, une` : "Une";
  const lead = `${greeting} place vient de se libérer avec ${data.staffFirstName}, un jour que vous aviez demandé.`;
  const services = data.items.map((i) => i.name).join(" + ");
  const holdHead = `Gardée pour vous jusqu'à ${until}`;
  const holdTail = ` (${data.holdMinutes} minutes). Passé ce délai, la place est proposée à la personne suivante sur la liste.`;
  const hold = holdHead + holdTail;
  const rules = `Modification ou annulation en ligne jusqu'à ${data.cutoffHours} h avant. Vous pouvez avoir ${data.maxUpcoming} rendez-vous à venir au maximum : si vous les avez atteints, annulez-en un avant de prendre cette place.`;

  const bodyHtml = `
<div style="font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:${COLORS.gold};">Liste d'attente</div>
<h1 style="margin:14px 0 0;font-family:${DISPLAY_FONT};font-size:40px;line-height:1.1;font-weight:400;color:${COLORS.ivory};">Une place s'est libérée.</h1>
<p style="margin:14px 0 0;font-size:16px;line-height:1.6;font-weight:300;color:${COLORS.ivorySoft};">${escapeHtml(lead)}</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.graphite}" style="margin-top:28px;background:${COLORS.graphite};border:1px solid ${COLORS.gold};"><tr>
<td style="padding:22px 24px;font-family:inherit;">
<div style="font-family:${DISPLAY_FONT};font-size:30px;line-height:1.15;color:${COLORS.ivory};">${escapeHtml(day)}</div>
<div style="padding-top:6px;font-size:20px;color:${COLORS.ivory};">${escapeHtml(time)} – ${escapeHtml(formatTime(data.endsAt))}</div>
<div style="padding-top:8px;font-size:15px;color:${COLORS.ivorySoft};">${escapeHtml(services)}</div>
<div style="padding-top:4px;font-size:13px;color:${COLORS.stone};">avec ${escapeHtml(data.staffFirstName)} · ${escapeHtml(formatPrice(data.totalPriceCents))}</div>
</td></tr></table>

<p style="margin:22px 0 0;font-size:15px;line-height:1.6;color:${COLORS.ivorySoft};"><span style="color:${COLORS.ivory};">${escapeHtml(holdHead)}</span>${escapeHtml(holdTail)}</p>

<div style="margin-top:24px;">${button("Prendre cette place", data.offerUrl, "primary")}</div>

<p style="margin:26px 0 0;padding-top:18px;border-top:1px solid ${COLORS.line};font-size:14px;line-height:2;color:${COLORS.ivorySoft};"><a href="${escapeHtml(data.offerUrl)}" style="color:${COLORS.ivorySoft};">Pas cette fois, je reste sur la liste</a><br><a href="${escapeHtml(data.offerUrl)}" style="color:${COLORS.ivorySoft};">Quitter la liste d'attente</a></p>

<p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:${COLORS.stone};">${escapeHtml(rules)}</p>`;

  const html = layout({
    title: subject,
    preheader,
    logoUrl: data.logoUrl,
    bodyHtml,
    footerNote: "Vous recevez cet email car vous êtes sur la liste d'attente.",
  });

  const text = [
    "Une place s'est libérée.",
    "",
    lead,
    "",
    `${day} · ${time} – ${formatTime(data.endsAt)}`,
    `${services} · avec ${data.staffFirstName} · ${formatPrice(data.totalPriceCents)}`,
    "",
    hold,
    "",
    `Prendre cette place : ${data.offerUrl}`,
    `Pas cette fois, ou quitter la liste d'attente : ${data.offerUrl}`,
    "",
    rules,
    "",
    `${SALON.name} · ${SALON.tagline}`,
  ].join("\n");

  return { subject, preheader, html, text };
}
