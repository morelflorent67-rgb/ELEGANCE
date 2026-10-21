import { ImageResponse } from "next/og";

// D-69 : l'icône de l'application est le « E » du logo, ivoire sur fond noir (exception à D-33). Dans le logo, le E est
// fait de trois barres horizontales de même épaisseur, séparées par leur épaisseur : 5 bandes égales, aussi hautes que
// la lettre est large (`public/logo/elegance-logo-noir.svg`, premier tracé).

const INK = "#0b0a09";
const IVORY = "#efe9dd";

/** Largeur du E par rapport à l'icône : il reste dans la zone sûre des icônes arrondies ou découpées. */
const LETTER_RATIO = 0.42;

export function appIcon(size: number) {
  const width = Math.round(size * LETTER_RATIO);
  const bar = width / 5;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: INK,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", width, height: width }}>
        <div style={{ height: bar, background: IVORY }} />
        <div style={{ height: bar }} />
        <div style={{ height: bar, background: IVORY }} />
        <div style={{ height: bar }} />
        <div style={{ height: bar, background: IVORY }} />
      </div>
    </div>,
    { width: size, height: size },
  );
}
