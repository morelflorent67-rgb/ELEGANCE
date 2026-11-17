// Charte du côté client du site (lots 12 et 18) : fond bleu nuit, accent bleu, Manrope et Cormorant Garamond.
// Valeurs reprises de src/app/(client)/client.css et docs/design/theme.css (jamais le doré de la tablette).

export const colors = {
  ink: "#000d1d",
  charcoal: "#04172e",
  graphite: "#0a1f3a",
  graphiteLight: "#102a4d",
  disabled: "#16283f",
  ivory: "#efe9dd",
  ivorySoft: "#c9c3b7",
  stone: "#a8a297",
  accent: "#3d8bff",
  accentShine: "#5fd8ff",
  brick: "#d9745f",
  sage: "#9bb58c",
  line: "rgba(239,233,221,0.16)",
  lineSubtle: "rgba(239,233,221,0.12)",
  lineStrong: "rgba(239,233,221,0.28)",
} as const;

export const fonts = {
  sans: "Manrope_400Regular",
  sansMedium: "Manrope_500Medium",
  sansSemi: "Manrope_600SemiBold",
  sansBold: "Manrope_700Bold",
  display: "CormorantGaramond_500Medium",
  displaySemi: "CormorantGaramond_600SemiBold",
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
