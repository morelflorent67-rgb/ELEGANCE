import { SALON, salonAddressLine } from "@/lib/salon";

// Gabarit commun des emails : tableaux HTML (les clients mail ignorent flex et grid), 600 px, thème sombre
// du design, Arial en repli (Sora ne s'affiche pas partout). Chaque couleur est répétée en attribut
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

export const FONT = "Sora, Arial, Helvetica, sans-serif";

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
}): string {
  const { title, preheader, logoUrl, bodyHtml, footerNote } = input;
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
<div style="padding-top:12px;font-size:12px;">${escapeHtml(footerNote)}</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
