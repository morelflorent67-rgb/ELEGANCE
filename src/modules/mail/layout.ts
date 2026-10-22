import { SALON, salonAddressLine } from "@/lib/salon";

// Gabarit commun des emails : tableaux HTML (les clients mail ignorent flex et grid), 600 px, thème sombre
// du design (D-93 : Manrope pour le texte, Cormorant Garamond pour les titres), Arial et Georgia en repli : la plupart
// des messageries n'ont pas ces polices. Chaque couleur est répétée en attribut
// bgcolor pour résister au mode sombre forcé d'Outlook.

export const COLORS = {
  ink: "#0b0a09",
  graphite: "#1a1816",
  ivory: "#efe9dd",
  ivorySoft: "#c9c3b7",
  stone: "#a8a297",
  gold: "#b8935a",
  line: "#2c2a26",
} as const;

export const FONT = "Manrope, 'Helvetica Neue', Arial, Helvetica, sans-serif";
export const DISPLAY_FONT = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface RenderedEmail {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

/**
 * Ce que l'email sait de son destinataire (D-78, D-81). Une fiche sans compte (créée au salon ou importée) n'a pas de
 * « Mes rendez-vous » : le bouton l'invite à créer son compte avec cette adresse, et les changements passent par le
 * salon. Le premier email reçu par une fiche importée dit d'où vient l'adresse.
 */
export interface Recipient {
  /** Faux pour une fiche sans compte. Absent : un compte (comportement d'origine). */
  hasAccount?: boolean;
  /** Page d'inscription, pour une fiche sans compte. */
  signupUrl?: string;
  /** Premier email d'une fiche importée du fichier du salon (D-78). */
  originNotice?: boolean;
}

export const ORIGIN_NOTICE = `Vos coordonnées viennent du fichier clients du salon ${SALON.name}, qui reprend ses rendez-vous sur son nouveau site. Elles servent aux emails de vos rendez-vous. Pour les faire corriger ou effacer, appelez le ${SALON.phoneDisplay}.`;

export const NO_ACCOUNT_TEXT =
  "Pour gérer vos rendez-vous en ligne, créez votre compte avec cette adresse email : vous les y retrouverez.";

export const withoutAccount = (recipient: Recipient) =>
  recipient.hasAccount === false && !!recipient.signupUrl;

/** « Gérer mon rendez-vous », ou « Créer mon compte » pour une fiche sans compte (D-81). */
export function manageButton(recipient: Recipient, manageUrl: string): string {
  return withoutAccount(recipient)
    ? button("Créer mon compte", recipient.signupUrl!, "primary")
    : button("Gérer mon rendez-vous", manageUrl, "primary");
}

export function manageLine(recipient: Recipient, manageUrl: string): string {
  return withoutAccount(recipient)
    ? `Créer mon compte : ${recipient.signupUrl}`
    : `Gérer mon rendez-vous : ${manageUrl}`;
}

/** Fin de la version texte : la mention d'origine, quand elle est due. */
export const noticeLines = (recipient: Recipient): string[] =>
  recipient.originNotice ? ["", ORIGIN_NOTICE] : [];

/** « Pour Lina » au-dessus du coiffeur, quand le RDV est pris pour un proche (D-80). */
export const forNameHtml = (forName: string | null | undefined) =>
  forName ? `Pour ${escapeHtml(forName)}<br>` : "";

/** Bouton « tableau » : principal (ivoire) ou secondaire (contour). */
export function button(label: string, href: string, kind: "primary" | "secondary"): string {
  const bg = kind === "primary" ? COLORS.ivory : COLORS.ink;
  const color = kind === "primary" ? COLORS.ink : COLORS.ivory;
  const border = kind === "primary" ? COLORS.ivory : "#5a564f";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center" bgcolor="${bg}" style="background:${bg};border:1px solid ${border};"><a href="${escapeHtml(href)}" style="display:block;padding:19px 12px;font-family:${FONT};font-size:12px;font-weight:500;letter-spacing:0.22em;text-transform:uppercase;text-decoration:none;color:${color};">${escapeHtml(label)}</a></td></tr></table>`;
}

export function layout(input: {
  title: string;
  preheader: string;
  logoUrl: string;
  bodyHtml: string;
  footerNote: string;
  /** D-78 : la mention d'origine de l'adresse, en pied d'email. */
  originNotice?: boolean;
}): string {
  const { title, preheader, logoUrl, bodyHtml, footerNote, originNotice } = input;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.ink};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COLORS.ink};">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.ink}" style="background:${COLORS.ink};">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td align="center" bgcolor="${COLORS.ivory}" style="background:${COLORS.ivory};line-height:0;"><img src="${escapeHtml(logoUrl)}" width="600" height="120" alt="${escapeHtml(SALON.name)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></td></tr>
<tr><td height="1" bgcolor="#ffffff" style="height:1px;line-height:1px;font-size:1px;background:#ffffff;">&nbsp;</td></tr>
<tr><td style="padding:44px 32px 8px;font-family:${FONT};color:${COLORS.ivory};">${bodyHtml}</td></tr>
<tr><td style="padding:40px 32px 40px;font-family:${FONT};font-size:13px;line-height:1.6;color:${COLORS.stone};border-top:1px solid ${COLORS.line};">
<div style="color:${COLORS.ivory};">${escapeHtml(SALON.name)} · ${escapeHtml(SALON.tagline)}</div>
<div style="padding-top:12px;">${escapeHtml(salonAddressLine)} · ${escapeHtml(SALON.phoneDisplay)}</div>
<div style="padding-top:12px;"><a href="${SALON.instagram}" style="color:${COLORS.ivorySoft};">Instagram</a> · <a href="${SALON.snapchat}" style="color:${COLORS.ivorySoft};">Snapchat</a></div>
<div style="padding-top:12px;font-size:12px;">${escapeHtml(footerNote)}</div>${
    originNotice
      ? `<div style="padding-top:12px;font-size:12px;color:${COLORS.ivorySoft};">${escapeHtml(ORIGIN_NOTICE)}</div>`
      : ""
  }
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
