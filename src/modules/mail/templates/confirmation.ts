import {
  capitalize,
  formatDay,
  formatDayWithYear,
  formatDuration,
  formatPrice,
  formatTime,
} from "@/lib/format";
import { SALON, salonAddressLine, salonMapsUrl } from "@/lib/salon";
import { COLORS, FONT, button, escapeHtml, layout, type RenderedEmail } from "../layout";

export interface ConfirmationData {
  firstName: string | null;
  startsAt: Date;
  endsAt: Date;
  items: { name: string; durationMin: number; priceCents: number }[];
  totalPriceCents: number;
  durationMinutes: number;
  staffFirstName: string;
  /** Dernier instant pour modifier ou annuler en ligne (R-30). */
  changeDeadline: Date;
  /** Faux si le RDV a été pris moins de 48 h avant : il ne se modifie pas en ligne (R-32). */
  changeableOnline: boolean;
  manageUrl: string;
  calendarUrl: string;
  logoUrl: string;
}

const weekday = (date: Date) => formatDay(date).split(" ")[0];

/** Email de confirmation (R-60), d'après la maquette « Email — confirmation ». */
export function renderConfirmationEmail(data: ConfirmationData): RenderedEmail {
  const day = capitalize(formatDayWithYear(data.startsAt));
  const time = formatTime(data.startsAt);
  const serviceNames = data.items.map((i) => i.name).join(" + ");
  const subject = `Votre rendez-vous du ${formatDay(data.startsAt)} est confirmé`;
  const preheader = `${time} · ${serviceNames} avec ${data.staffFirstName}`;
  const greeting = data.firstName
    ? `À ${weekday(data.startsAt)}, ${data.firstName}.`
    : `À ${weekday(data.startsAt)}.`;

  const changeText = data.changeableOnline
    ? `Modifiable ou annulable en ligne jusqu'au ${formatDay(data.changeDeadline)}, ${formatTime(data.changeDeadline)}. Ensuite : ${SALON.phoneDisplay}.`
    : `Pour tout changement, appelez le salon : ${SALON.phoneDisplay}.`;

  const rows = data.items
    .map(
      (item) =>
        `<tr><td style="padding:0 0 10px;font-family:${FONT};font-size:16px;line-height:1.4;color:${COLORS.ivory};">${escapeHtml(item.name)} · ${escapeHtml(formatDuration(item.durationMin))}</td><td align="right" style="padding:0 0 10px;font-family:${FONT};font-size:16px;line-height:1.4;color:${COLORS.ivory};white-space:nowrap;">${escapeHtml(formatPrice(item.priceCents))}</td></tr>`,
    )
    .join("");
  const totalRow =
    data.items.length > 1
      ? `<tr><td style="padding:8px 0 0;border-top:1px solid ${COLORS.line};font-family:${FONT};font-size:16px;color:${COLORS.ivory};">Total · ${escapeHtml(formatDuration(data.durationMinutes))}</td><td align="right" style="padding:8px 0 0;border-top:1px solid ${COLORS.line};font-family:${FONT};font-size:16px;color:${COLORS.ivory};">${escapeHtml(formatPrice(data.totalPriceCents))}</td></tr>`
      : "";

  const bodyHtml = `
<div style="font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:${COLORS.gold};">Rendez-vous confirmé</div>
<h1 style="margin:14px 0 0;font-size:30px;line-height:1.15;font-weight:300;letter-spacing:-0.01em;color:${COLORS.ivory};">${escapeHtml(greeting)}</h1>
<p style="margin:14px 0 0;font-size:16px;line-height:1.6;font-weight:300;color:${COLORS.ivorySoft};">Votre rendez-vous est bien enregistré. Voici le récapitulatif.</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.graphite}" style="margin-top:28px;background:${COLORS.graphite};"><tr><td style="padding:28px;">
<div style="font-size:12px;letter-spacing:0.26em;text-transform:uppercase;color:${COLORS.gold};">${escapeHtml(day)}</div>
<div style="padding:4px 0 18px;font-size:40px;font-weight:300;line-height:1.2;color:${COLORS.ivory};">${escapeHtml(time)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${COLORS.line};"><tr><td height="18" style="height:18px;line-height:18px;font-size:1px;">&nbsp;</td></tr>${rows}${totalRow}</table>
<div style="padding-top:14px;font-size:14px;line-height:1.6;color:${COLORS.stone};">avec ${escapeHtml(data.staffFirstName)}<br>Paiement sur place</div>
</td></tr></table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;"><tr>
<td width="50%" style="padding-right:6px;">${button("Gérer mon rendez-vous", data.manageUrl, "primary")}</td>
<td width="50%" style="padding-left:6px;">${button("Ajouter à l'agenda", data.calendarUrl, "secondary")}</td>
</tr></table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;"><tr>
<td valign="top" width="50%" style="padding-right:12px;font-size:15px;line-height:1.5;color:${COLORS.ivory};">
<div style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:${COLORS.stone};padding-bottom:6px;">Adresse</div>
${escapeHtml(SALON.street)}<br><span style="color:${COLORS.ivorySoft};">${escapeHtml(`${SALON.postalCode} ${SALON.city}`)}</span><br><a href="${salonMapsUrl}" style="font-size:14px;color:${COLORS.ivory};">Itinéraire</a></td>
<td valign="top" width="50%" style="padding-left:12px;font-size:15px;line-height:1.5;color:${COLORS.ivorySoft};">
<div style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:${COLORS.stone};padding-bottom:6px;">Un changement ?</div>
${escapeHtml(changeText)}</td>
</tr></table>`;

  const html = layout({
    title: subject,
    preheader,
    logoUrl: data.logoUrl,
    bodyHtml,
    footerNote: `Vous recevez cet email suite à votre réservation chez ${SALON.name}.`,
  });

  const text = [
    `${greeting}`,
    "",
    "Votre rendez-vous est confirmé.",
    "",
    `${day} à ${time}`,
    ...data.items.map(
      (i) => `- ${i.name} · ${formatDuration(i.durationMin)} · ${formatPrice(i.priceCents)}`,
    ),
    `Total : ${formatPrice(data.totalPriceCents)} · ${formatDuration(data.durationMinutes)}`,
    `Avec ${data.staffFirstName}. Paiement sur place.`,
    "",
    `Gérer mon rendez-vous : ${data.manageUrl}`,
    `Ajouter à l'agenda : ${data.calendarUrl}`,
    "",
    `${SALON.name}, ${salonAddressLine}`,
    `Itinéraire : ${salonMapsUrl}`,
    changeText,
    "",
    `${SALON.name} · ${SALON.tagline}`,
  ].join("\n");

  return { subject, preheader, html, text };
}
