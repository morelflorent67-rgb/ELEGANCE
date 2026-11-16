import { SALON } from "@/lib/salon";
import { COLORS, DISPLAY_FONT, button, escapeHtml, layout, type RenderedEmail } from "../layout";

export interface PasswordResetData {
  /** Lien complet, avec le code : c'est un secret, il ne passe pas par la file d'envoi (D-117). */
  link: string;
  logoUrl: string;
}

/** Email « mot de passe oublié » : remplace celui de Supabase (D-117). Doré comme les autres emails. */
export function renderPasswordResetEmail(data: PasswordResetData): RenderedEmail {
  const subject = "Réinitialisez votre mot de passe";
  const preheader = "Ce lien est valable 1 heure et ne sert qu'une fois.";

  const bodyHtml = `
<div style="font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:${COLORS.gold};">${escapeHtml(SALON.name)}</div>
<h1 style="margin:14px 0 0;font-family:${DISPLAY_FONT};font-size:36px;line-height:1.1;font-weight:400;color:${COLORS.ivory};">Un nouveau mot de passe.</h1>
<p style="margin:14px 0 0;font-size:16px;line-height:1.6;font-weight:300;color:${COLORS.ivorySoft};">Vous avez demandé à changer de mot de passe. Le lien ci-dessous est valable 1 heure et ne sert qu'une fois.</p>
<div style="margin-top:28px;">${button("Choisir un nouveau mot de passe", data.link, "primary")}</div>
<p style="margin:28px 0 0;font-size:13px;line-height:1.55;color:${COLORS.stone};">Vous n'êtes pas à l'origine de cette demande ? Vous pouvez simplement ignorer cet email : votre mot de passe actuel reste valable.</p>`;

  const html = layout({
    title: subject,
    preheader,
    logoUrl: data.logoUrl,
    bodyHtml,
    footerNote: `Vous recevez cet email car une réinitialisation de mot de passe a été demandée sur ${SALON.name}.`,
  });

  const text = [
    "Un nouveau mot de passe.",
    "",
    "Vous avez demandé à changer de mot de passe. Le lien ci-dessous est valable 1 heure et ne sert qu'une fois :",
    data.link,
    "",
    "Vous n'êtes pas à l'origine de cette demande ? Vous pouvez simplement ignorer cet email.",
    "",
    `${SALON.name} · ${SALON.tagline}`,
  ].join("\n");

  return { subject, preheader, html, text };
}
