import { capitalize, formatDay } from "@/lib/format";
import { SALON } from "@/lib/salon";
import { COLORS, button, escapeHtml, layout, type RenderedEmail } from "../layout";

export interface ReviewInvitationData {
  firstName: string | null;
  startsAt: Date;
  items: { name: string }[];
  staffFirstName: string;
  /** Page d'avis externe, renseignée dans les réglages du salon (R-64). */
  reviewUrl: string;
  /** « Reprendre le même RDV » (lot 3). */
  rebookUrl: string;
  /** « Prendre un nouveau RDV » : la page de réservation (D-67). */
  bookUrl: string;
  /** Lien signé pour ne plus recevoir ces invitations. */
  unsubscribeUrl: string;
  logoUrl: string;
}

/**
 * Invitation à laisser un avis (R-64), d'après la maquette « Email — avis ». La grille de notes de 1 à 5 de la
 * maquette est supprimée (décision de Florent, 20 octobre 2026) : une page d'avis externe ne reçoit pas la note
 * choisie depuis un email, donc un seul bouton y mène. D-67 : sous l'avis, deux façons de revenir, le même RDV ou un
 * nouveau.
 */
export function renderReviewInvitationEmail(data: ReviewInvitationData): RenderedEmail {
  const subject = data.firstName
    ? `Merci de votre visite, ${data.firstName}`
    : "Merci de votre visite";
  const question = `Comment s'est passé votre rendez-vous avec ${data.staffFirstName} ?`;
  const preheader = `${question} 30 secondes suffisent.`;
  const services = data.items.map((i) => i.name).join(" + ");
  const lead = `${capitalize(formatDay(data.startsAt))} · ${services}. Votre avis nous aide à progresser et guide les prochains clients.`;

  const bodyHtml = `
<div style="font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:${COLORS.gold};">Merci de votre visite</div>
<h1 style="margin:14px 0 0;font-size:30px;line-height:1.15;font-weight:300;letter-spacing:-0.01em;color:${COLORS.ivory};">${escapeHtml(question)}</h1>
<p style="margin:14px 0 0;font-size:16px;line-height:1.6;font-weight:300;color:${COLORS.ivorySoft};">${escapeHtml(lead)}</p>

<div style="margin-top:28px;">${button("Laisser un avis", data.reviewUrl, "primary")}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;border-top:1px solid ${COLORS.line};"><tr>
<td style="padding-top:22px;font-size:15px;line-height:1.5;color:${COLORS.ivorySoft};">Déjà envie de revenir ?</td>
<td align="right" style="padding-top:22px;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;"><a href="${escapeHtml(data.rebookUrl)}" style="color:${COLORS.ivory};text-decoration:none;border-bottom:1px solid ${COLORS.gold};">Reprendre le même RDV</a></td>
</tr><tr>
<td style="padding-top:14px;font-size:15px;line-height:1.5;color:${COLORS.ivorySoft};">Autre envie ?</td>
<td align="right" style="padding-top:14px;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;"><a href="${escapeHtml(data.bookUrl)}" style="color:${COLORS.ivory};text-decoration:none;border-bottom:1px solid ${COLORS.gold};">Prendre un nouveau RDV</a></td>
</tr></table>

<p style="margin:28px 0 0;font-size:12px;line-height:1.55;color:${COLORS.stone};"><a href="${escapeHtml(data.unsubscribeUrl)}" style="color:${COLORS.ivorySoft};">Ne plus recevoir ces invitations</a></p>`;

  const html = layout({
    title: subject,
    preheader,
    logoUrl: data.logoUrl,
    bodyHtml,
    footerNote: `Vous recevez cet email après votre rendez-vous chez ${SALON.name}.`,
  });

  const text = [
    question,
    "",
    lead,
    "",
    `Laisser un avis : ${data.reviewUrl}`,
    "",
    `Déjà envie de revenir ? Reprendre le même RDV : ${data.rebookUrl}`,
    `Autre envie ? Prendre un nouveau RDV : ${data.bookUrl}`,
    "",
    `Ne plus recevoir ces invitations : ${data.unsubscribeUrl}`,
    "",
    `${SALON.name} · ${SALON.tagline}`,
  ].join("\n");

  return { subject, preheader, html, text };
}
