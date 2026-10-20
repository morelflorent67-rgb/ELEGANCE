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

export interface ReminderData {
  firstName: string | null;
  startsAt: Date;
  items: { name: string; durationMin: number; priceCents: number }[];
  totalPriceCents: number;
  durationMinutes: number;
  staffFirstName: string;
  /** Jours de Paris entre l'envoi et le RDV : 3 pour un rappel à 72 h, 0 si le RDV est aujourd'hui. */
  daysAway: number;
  /** Dernier instant pour modifier ou annuler en ligne (R-30, R-61). */
  changeDeadline: Date;
  /** Faux si cette date limite est déjà passée à l'envoi : le client doit appeler (R-30, R-32). */
  changeableOnline: boolean;
  manageUrl: string;
  logoUrl: string;
}

const weekday = (date: Date) => formatDay(date).split(" ")[0];

/** « Dans 3 jours », « Demain », « Aujourd'hui » : le délai réel, pas celui du réglage. */
const distance = (days: number) =>
  days <= 0 ? "Aujourd'hui" : days === 1 ? "Demain" : `Dans ${days} jours`;

/** Rappel avant le RDV (R-61), d'après la maquette « Email — rappel ». */
export function renderReminderEmail(data: ReminderData): RenderedEmail {
  const day = capitalize(formatDayWithYear(data.startsAt));
  const time = formatTime(data.startsAt);
  // Au-delà d'une semaine, le seul nom du jour prêterait à confusion.
  const when = data.daysAway >= 7 ? formatDay(data.startsAt) : weekday(data.startsAt);
  const subject = `Rappel : votre rendez-vous ${when} à ${time}`;
  const preheader = data.changeableOnline
    ? `Modifiable en ligne jusqu'à ${weekday(data.changeDeadline)} ${formatTime(data.changeDeadline)}`
    : `On vous attend ${when} à ${time}`;
  const eyebrow = distance(data.daysAway);
  const greeting = data.firstName
    ? `Votre rendez-vous approche, ${data.firstName}.`
    : "Votre rendez-vous approche.";
  const lead =
    data.daysAway <= 0
      ? "On vous attend aujourd'hui au salon."
      : data.daysAway === 1
        ? "On vous attend demain au salon."
        : `On vous attend ${when} au salon.`;
  const address = salonAddressLine;
  const changeText = data.changeableOnline
    ? `Un empêchement ? Modifiez ou annulez en ligne jusqu'au ${formatDay(data.changeDeadline)}, ${formatTime(data.changeDeadline)}. Après, appelez le ${SALON.phoneDisplay} : le créneau pourra profiter à un autre client.`
    : `Un empêchement ? Pour tout changement, appelez le salon au ${SALON.phoneDisplay} : le créneau pourra profiter à un autre client.`;

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
<div style="font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:${COLORS.gold};">${escapeHtml(eyebrow)}</div>
<h1 style="margin:14px 0 0;font-size:30px;line-height:1.15;font-weight:300;letter-spacing:-0.01em;color:${COLORS.ivory};">${escapeHtml(greeting)}</h1>
<p style="margin:14px 0 0;font-size:16px;line-height:1.6;font-weight:300;color:${COLORS.ivorySoft};">${escapeHtml(lead)}</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.graphite}" style="margin-top:28px;background:${COLORS.graphite};"><tr><td style="padding:28px;">
<div style="font-size:12px;letter-spacing:0.26em;text-transform:uppercase;color:${COLORS.gold};">${escapeHtml(day)}</div>
<div style="padding:4px 0 18px;font-size:40px;font-weight:300;line-height:1.2;color:${COLORS.ivory};">${escapeHtml(time)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${COLORS.line};"><tr><td height="18" style="height:18px;line-height:18px;font-size:1px;">&nbsp;</td></tr>${rows}${totalRow}</table>
<div style="padding-top:14px;font-size:14px;line-height:1.6;color:${COLORS.stone};">avec ${escapeHtml(data.staffFirstName)}<br>${escapeHtml(address)}</div>
</td></tr></table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;border:1px solid #5a564f;"><tr><td valign="top" width="36" style="padding:20px 0 20px 20px;font-size:18px;line-height:1.3;color:${COLORS.gold};">!</td><td style="padding:20px 20px 20px 8px;font-size:15px;line-height:1.55;color:${COLORS.ivorySoft};">${escapeHtml(changeText)}</td></tr></table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;"><tr>
<td width="50%" style="padding-right:6px;">${button("Gérer mon rendez-vous", data.manageUrl, "primary")}</td>
<td width="50%" style="padding-left:6px;">${button("Itinéraire", salonMapsUrl, "secondary")}</td>
</tr></table>`;

  const html = layout({
    title: subject,
    preheader,
    logoUrl: data.logoUrl,
    bodyHtml,
    footerNote: `Vous recevez cet email car vous avez un rendez-vous chez ${SALON.name}.`,
  });

  const text = [
    greeting,
    "",
    lead,
    "",
    `${day} à ${time}`,
    ...data.items.map(
      (i) => `- ${i.name} · ${formatDuration(i.durationMin)} · ${formatPrice(i.priceCents)}`,
    ),
    `Total : ${formatPrice(data.totalPriceCents)} · ${formatDuration(data.durationMinutes)}`,
    `Avec ${data.staffFirstName}. ${SALON.name}, ${address}.`,
    "",
    changeText,
    "",
    `Gérer mon rendez-vous : ${data.manageUrl}`,
    `Itinéraire : ${salonMapsUrl}`,
    "",
    `${SALON.name} · ${SALON.tagline}`,
  ].join("\n");

  return { subject, preheader, html, text };
}
