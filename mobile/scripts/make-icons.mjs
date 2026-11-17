// Génère l'icône de l'app (1024 × 1024, SANS canal alpha : Apple refuse la transparence) et l'image du lancement.
// Le « E » du logo (D-69) : trois barres ivoire de même épaisseur, séparées par leur épaisseur ; fond bleu nuit du
// côté client (lot 18). Outil ponctuel, lancé depuis la racine du dépôt (utilise sharp, déjà installé pour Next) :
//   node mobile/scripts/make-icons.mjs
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const sharp = require("../../node_modules/.pnpm/sharp@0.35.5_@types+node@20.19.43/node_modules/sharp");

const INK = "#000d1d";
const IVORY = "#efe9dd";

/** Le E sur un carré `size`, la lettre occupant `ratio` de la largeur. */
function svg(size, ratio) {
  const width = Math.round(size * ratio);
  const bar = width / 5;
  const x = (size - width) / 2;
  const y = (size - width) / 2;
  const bars = [0, 2, 4]
    .map((i) => `<rect x="${x}" y="${y + i * bar}" width="${width}" height="${bar}" fill="${IVORY}"/>`)
    .join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${INK}"/>${bars}</svg>`,
  );
}

mkdirSync("mobile/assets", { recursive: true });
// Icône : jamais de canal alpha (removeAlpha), fond plein.
await sharp(svg(1024, 0.42)).flatten({ background: INK }).removeAlpha().png().toFile("mobile/assets/icon.png");
// Lancement : le E seul, plus petit, sur le même fond.
await sharp(svg(1024, 0.3)).flatten({ background: INK }).removeAlpha().png().toFile("mobile/assets/splash-icon.png");
// Logo ivoire de l'accueil (le SVG du site, en PNG transparent : l'app n'embarque pas de lecteur SVG).
await sharp("public/logo/elegance-logo-ivoire.svg", { density: 600 }).resize({ width: 900 }).png().toFile("mobile/assets/logo-ivoire.png");
console.log("Icônes et logo écrits dans mobile/assets");
