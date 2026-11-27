// Champ « Téléphone » de l'inscription et de « Mon compte » (R-70, D-126) : facultatif, demandé par Apple
// (règle 5.1.1(v)). Mêmes textes que le site (`src/components/account-forms.tsx`) ; le serveur valide le numéro.

export const PHONE_FIELD = {
  label: "Téléphone",
  aside: "facultatif",
  hint: "Pour que le salon puisse vous prévenir en cas d'imprévu.",
} as const;
