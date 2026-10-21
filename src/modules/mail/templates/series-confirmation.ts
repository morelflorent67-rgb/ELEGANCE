import { capitalize, formatDay, formatDuration, formatPrice, formatTime } from "@/lib/format";
import { SALON, salonAddressLine, salonMapsUrl } from "@/lib/salon";
import {
  COLORS,
  FONT,
  NO_ACCOUNT_TEXT,
  button,
  escapeHtml,
  forNameHtml,
  layout,
  manageButton,
  manageLine,
  noticeLines,
  withoutAccount,
  type Recipient,
  type RenderedEmail,
} from "../layout";

export interface SeriesConfirmationData extends Recipient {
  /** « Pour qui ? » (D-80). */
  forName?: string | null;
  firstName: string | null;
  /** « Toutes les 2 semaines » */
  ruleLabel: string;
  /** Les RDV posés, dans l'ordre (D-91) : ni les dates sautées, ni les RDV annulés depuis. */
  dates: { startsAt: Date; staffFirstName: string }[];
  items: { name: string; durationMin: number; priceCents: number }[];
  totalPriceCents: number;
  durationMinutes: number;
  /** Délai de modification en ligne, en heures (R-30). */
  cutoffHours: number;
  /** Vrai pour une prolongation (D-90) : l'email annonce les nouvelles dates. */
  extended: boolean;
  manageUrl: string;
  calendarUrl: string;
  logoUrl: string;
}

/**
 * Email unique d'une série de RDV (D-71, D-91) : la règle, les prestations et la liste des dates. Pas de maquette dédiée :
 * il reprend la carte de l'email de confirmation, avec une ligne par date.
 */
export function renderSeriesConfirmationEmail(data: SeriesConfirmationData): RenderedEmail {
  const n = data.dates.length;
  const serviceNames = data.items.map((i) => i.name).join(" + ");
  const subject = !data.extended
    ? `Vos ${n} rendez-vous sont confirmés`
    : n === 1
      ? "Votre prochain rendez-vous est réservé"
      : `Vos ${n} prochains rendez-vous sont réservés`;
  const preheader = `${data.ruleLabel} · ${serviceNames}`;
  const greeting = data.firstName ? `C'est noté, ${data.firstName}.` : "C'est noté.";
  const intro = data.extended
    ? `Votre série de rendez-vous continue : ${n === 1 ? "voici la nouvelle date" : `voici les ${n} nouvelles dates`}.`
    : `Vos rendez-vous sont enregistrés, ${data.ruleLabel.toLowerCase()}. Voici les dates.`;

  const hours = data.cutoffHours === 1 ? "une heure" : `${data.cutoffHours} h`;
  const changeText = withoutAccount(data)
    ? `Pour tout changement, appelez le salon : ${SALON.phoneDisplay}. ${NO_ACCOUNT_TEXT}`
    : `Chaque rendez-vous se modifie ou s'annule en ligne jusqu'à ${hours} avant. Ensuite : ${SALON.phoneDisplay}.`;

  const line = (d: SeriesConfirmationData["dates"][number]) =>
    `${capitalize(formatDay(d.startsAt))} · ${formatTime(d.startsAt)} · avec ${d.staffFirstName}`;
  const dateRows = data.dates
    .map(
      (d, index) =>
        `<tr><td style="padding:12px 0;${index > 0 ? `border-top:1px solid ${COLORS.line};` : ""}font-family:${FONT};font-size:16px;line-height:1.4;color:${COLORS.ivory};">${escapeHtml(`${capitalize(formatDay(d.startsAt))} · ${formatTime(d.startsAt)}`)}</td><td align="right" style="padding:12px 0;${index > 0 ? `border-top:1px solid ${COLORS.line};` : ""}font-family:${FONT};font-size:14px;line-height:1.4;color:${COLORS.stone};white-space:nowrap;">avec ${escapeHtml(d.staffFirstName)}</td></tr>`,
    )
    .join("");
  const services = `${serviceNames} · ${formatDuration(data.durationMinutes)} · ${formatPrice(data.totalPriceCents)}`;

  const bodyHtml = `
<div style="font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:${COLORS.gold};">${data.extended ? "Série prolongée" : "Rendez-vous confirmés"}</div>
<h1 style="margin:14px 0 0;font-size:30px;line-height:1.15;font-weight:300;letter-spacing:-0.01em;color:${COLORS.ivory};">${escapeHtml(greeting)}</h1>
<p style="margin:14px 0 0;font-size:16px;line-height:1.6;font-weight:300;color:${COLORS.ivorySoft};">${escapeHtml(intro)}</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.graphite}" style="margin-top:28px;background:${COLORS.graphite};"><tr><td style="padding:28px;">
<div style="font-size:12px;letter-spacing:0.26em;text-transform:uppercase;color:${COLORS.gold};">${escapeHtml(data.ruleLabel)}</div>
<div style="padding:8px 0 18px;font-size:16px;line-height:1.5;color:${COLORS.ivory};">${escapeHtml(services)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${COLORS.line};">${dateRows}</table>
<div style="padding-top:14px;font-size:14px;line-height:1.6;color:${COLORS.stone};">${forNameHtml(data.forName)}Paiement sur place, à chaque rendez-vous</div>
</td></tr></table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;"><tr>
<td width="50%" style="padding-right:6px;">${manageButton(data, data.manageUrl)}</td>
<td width="50%" style="padding-left:6px;">${button("Ajouter à l'agenda", data.calendarUrl, "secondary")}</td>
</tr></table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;"><tr>
<td valign="top" width="50%" style="padding-right:12px;font-size:15px;line-height:1.5;color:${COLORS.ivory};">
<div style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:${COLORS.stone};padding-bottom:6px;">Adresse</div>
${escapeHtml(SALON.street)}<br><span style="color:${COLORS.ivorySoft};">${escapeHtml(`${SALON.postalCode} ${SALON.city}`)}</span><br><a href="${salonMapsUrl}" style="font-size:14px;color:${COLORS.ivory};">Itinéraire</a></td>
<td valign="top" width="50%" style="padding-left:12px;font-size:15px;line-height:1.5;color:${COLORS.ivorySoft};">
<div style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:${COLORS.stone};padding-bottom:6px;">Un changement ?</div>
${escapeHtml(changeText)}<br>Un rappel vous est envoyé avant chaque rendez-vous.</td>
</tr></table>`;

  const html = layout({
    title: subject,
    preheader,
    logoUrl: data.logoUrl,
    bodyHtml,
    originNotice: data.originNotice,
    footerNote: `Vous recevez cet email suite à votre réservation chez ${SALON.name}.`,
  });

  const text = [
    greeting,
    "",
    intro,
    "",
    data.ruleLabel,
    services,
    ...(data.forName ? [`Pour ${data.forName}`] : []),
    ...data.dates.map((d) => `- ${line(d)}`),
    "Paiement sur place, à chaque rendez-vous.",
    "",
    manageLine(data, data.manageUrl),
    `Ajouter à l'agenda : ${data.calendarUrl}`,
    "",
    `${SALON.name}, ${salonAddressLine}`,
    `Itinéraire : ${salonMapsUrl}`,
    changeText,
    "Un rappel vous est envoyé avant chaque rendez-vous.",
    "",
    `${SALON.name} · ${SALON.tagline}`,
    ...noticeLines(data),
  ].join("\n");

  return { subject, preheader, html, text };
}
