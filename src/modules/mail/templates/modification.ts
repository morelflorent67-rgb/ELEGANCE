import {
  capitalize,
  formatDay,
  formatDayWithYear,
  formatDuration,
  formatPrice,
  formatTime,
} from "@/lib/format";
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

export interface ModificationData extends Recipient {
  /** « Pour qui ? » (D-80). */
  forName?: string | null;
  firstName: string | null;
  /** Nouveau créneau. */
  startsAt: Date;
  items: { name: string; durationMin: number; priceCents: number }[];
  totalPriceCents: number;
  durationMinutes: number;
  staffFirstName: string;
  /** Ancien créneau, libéré. */
  previousStartsAt: Date;
  /** Renseigné seulement si le coiffeur a changé. */
  previousStaffFirstName: string | null;
  /** Dernier instant pour modifier en ligne (R-30). */
  changeDeadline: Date;
  /** Faux si le nouveau créneau est à moins de 48 h : il ne se modifie plus en ligne (R-30, R-32). */
  changeableOnline: boolean;
  manageUrl: string;
  calendarUrl: string;
  logoUrl: string;
  /** Qui a déplacé : le client lui-même (défaut), ou le salon, qui a appelé le client avant (R-63, D-52). */
  changedBy?: "customer" | "salon";
}

/**
 * Email de modification, d'après la maquette « Email — modification ». Prévient le client d'un déplacement qu'il a fait,
 * ou confirme celui que le salon a décidé avec lui par téléphone (R-33, R-63, D-52).
 */
export function renderModificationEmail(data: ModificationData): RenderedEmail {
  const day = capitalize(formatDayWithYear(data.startsAt));
  const time = formatTime(data.startsAt);
  const subject = `Votre rendez-vous est déplacé au ${formatDay(data.startsAt)}`;
  const preheader = `Nouveau créneau : ${time} avec ${data.staffFirstName}`;
  const bySalon = data.changedBy === "salon";
  const noted = bySalon ? "Bonjour" : "C'est noté";
  const greeting = data.firstName ? `${noted}, ${data.firstName}.` : `${noted}.`;
  const lead = bySalon
    ? "Suite à notre échange, nous avons déplacé votre rendez-vous. Le précédent créneau est libéré."
    : "Votre rendez-vous a été déplacé. Le précédent créneau est libéré.";

  const previous = `${capitalize(formatDay(data.previousStartsAt))} · ${formatTime(data.previousStartsAt)}${
    data.previousStaffFirstName ? ` · avec ${data.previousStaffFirstName}` : ""
  }`;

  const changeText = withoutAccount(data)
    ? `Pour tout changement, appelez le salon : ${SALON.phoneDisplay}. ${NO_ACCOUNT_TEXT}`
    : data.changeableOnline
      ? `Ce créneau ne vous convient plus ? Modifiez-le en ligne jusqu'au ${formatDay(data.changeDeadline)}, ${formatTime(data.changeDeadline)}, ou appelez le ${SALON.phoneDisplay}.`
      : `Pour tout nouveau changement, appelez le salon : ${SALON.phoneDisplay}.`;

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
<div style="font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:${COLORS.gold};">Rendez-vous modifié</div>
<h1 style="margin:14px 0 0;font-size:30px;line-height:1.15;font-weight:300;letter-spacing:-0.01em;color:${COLORS.ivory};">${escapeHtml(greeting)}</h1>
<p style="margin:14px 0 0;font-size:16px;line-height:1.6;font-weight:300;color:${COLORS.ivorySoft};">${escapeHtml(lead)}</p>

<div style="margin-top:28px;padding:0 4px;">
<div style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:${COLORS.stone};padding-bottom:8px;">Avant</div>
<div style="font-size:16px;line-height:1.4;color:${COLORS.stone};text-decoration:line-through;">${escapeHtml(previous)}</div>
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.graphite}" style="margin-top:24px;background:${COLORS.graphite};"><tr><td style="padding:28px;">
<div style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:${COLORS.ivory};padding-bottom:18px;">Maintenant</div>
<div style="font-size:12px;letter-spacing:0.26em;text-transform:uppercase;color:${COLORS.gold};">${escapeHtml(day)}</div>
<div style="padding:4px 0 18px;font-size:40px;font-weight:300;line-height:1.2;color:${COLORS.ivory};">${escapeHtml(time)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${COLORS.line};"><tr><td height="18" style="height:18px;line-height:18px;font-size:1px;">&nbsp;</td></tr>${rows}${totalRow}</table>
<div style="padding-top:14px;font-size:14px;line-height:1.6;color:${COLORS.stone};">${forNameHtml(data.forName)}avec ${escapeHtml(data.staffFirstName)}<br>Paiement sur place</div>
</td></tr></table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;"><tr>
<td width="50%" style="padding-right:6px;">${manageButton(data, data.manageUrl)}</td>
<td width="50%" style="padding-left:6px;">${button("Mettre à jour l'agenda", data.calendarUrl, "secondary")}</td>
</tr></table>

<p style="margin:28px 0 0;font-size:14px;line-height:1.55;color:${COLORS.stone};">${escapeHtml(changeText)}</p>
<p style="margin:20px 0 0;font-size:14px;line-height:1.55;color:${COLORS.stone};">${escapeHtml(salonAddressLine)} · <a href="${salonMapsUrl}" style="color:${COLORS.ivory};">Itinéraire</a></p>`;

  const html = layout({
    title: subject,
    preheader,
    logoUrl: data.logoUrl,
    bodyHtml,
    originNotice: data.originNotice,
    footerNote: `Vous recevez cet email car vous avez un rendez-vous chez ${SALON.name}.`,
  });

  const text = [
    greeting,
    "",
    lead,
    "",
    `Avant : ${previous}`,
    `Maintenant : ${day} à ${time}`,
    ...data.items.map(
      (i) => `- ${i.name} · ${formatDuration(i.durationMin)} · ${formatPrice(i.priceCents)}`,
    ),
    `Total : ${formatPrice(data.totalPriceCents)} · ${formatDuration(data.durationMinutes)}`,
    `Avec ${data.staffFirstName}. Paiement sur place.`,
    "",
    manageLine(data, data.manageUrl),
    `Mettre à jour l'agenda : ${data.calendarUrl}`,
    "",
    changeText,
    `${SALON.name}, ${salonAddressLine}`,
    `Itinéraire : ${salonMapsUrl}`,
    "",
    `${SALON.name} · ${SALON.tagline}`,
    ...noticeLines(data),
  ].join("\n");

  return { subject, preheader, html, text };
}
