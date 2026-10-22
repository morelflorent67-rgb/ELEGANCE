import { hoursPhrase, lessThanHours } from "@/lib/format";
import { SALON, salonAddressLine } from "@/lib/salon";
import type { SalonRules } from "./load";

// Pages légales : un gabarit à onglets, trois documents. Les textes décrivent ce que le site fait vraiment ; les
// règles chiffrées (rendez-vous à venir, délai de modification, rappel) sont lues dans les réglages du salon, jamais écrites en dur.
// Ce qui n'est connu que du salon reste entre crochets : voir `placeholdersOf`. Le tout est à faire valider par
// un professionnel avant l'ouverture (docs/design/README.md §8).

export const LEGAL_SLUGS = ["mentions-legales", "confidentialite", "conditions"] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export interface LegalSection {
  /** « 01 » */
  num: string;
  /** « s01 » : ancre du sommaire. */
  id: string;
  title: string;
  body: string;
}

export interface LegalDocument {
  slug: LegalSlug;
  /** Libellé de l'onglet. */
  tab: string;
  title: string;
  description: string;
  sections: LegalSection[];
}

/** Date de la dernière rédaction des textes (à changer quand un texte change). */
export const LEGAL_UPDATED = "20 octobre 2026";

const hoursToWords = (hours: number) =>
  hours % 24 === 0 ? `${hours / 24} ${hours / 24 > 1 ? "jours" : "jour"}` : `${hours} h`;

type Raw = [title: string, body: string];

function mentions(): Raw[] {
  return [
    [
      "Éditeur du site",
      `${SALON.name}\n[Forme juridique] au capital de [Montant du capital]\n${salonAddressLine}\nTéléphone : ${SALON.phoneDisplay}\nSIRET : [Numéro de SIRET]`,
    ],
    ["Directeur de la publication", "[Prénom Nom du directeur de la publication], [Fonction]."],
    [
      "Hébergement",
      "Le site est hébergé par Vercel Inc. [Adresse de l'hébergeur].\nLes comptes et les rendez-vous sont enregistrés par Supabase, dans l'Union européenne.\nLes emails sont envoyés par Brevo (France).",
    ],
    [
      "Propriété intellectuelle",
      "Le logo Elegance, les textes et les photos du salon sont la propriété d'Elegance Strasbourg. Toute reproduction sans accord écrit est interdite. [Texte à faire valider.]",
    ],
    [
      "Contact",
      `Par téléphone au ${SALON.phoneDisplay}, du mardi au samedi, ou sur place au ${SALON.street}, ${SALON.postalCode} ${SALON.city}. [Adresse email de contact]`,
    ],
  ];
}

function privacy(rules: SalonRules): Raw[] {
  return [
    [
      "Responsable du traitement",
      `${SALON.name}, ${salonAddressLine}. Contact : ${SALON.phoneDisplay}, [Adresse email de contact].`,
    ],
    [
      "Données collectées",
      "À la création de votre compte : prénom, nom, numéro de téléphone, adresse email et mot de passe. Votre mot de passe est chiffré par le service d'authentification : le salon ne le voit jamais et il n'est jamais lisible.\nLors d'une réservation : les prestations, le coiffeur, la date et l'heure, le prénom du proche pour qui vous réservez et la note que vous laissez éventuellement au salon.\nSi vous réservez par téléphone ou au salon sans compte, le salon enregistre votre prénom, votre nom, votre téléphone et, si vous le donnez, votre email.\nLe salon a aussi repris le fichier clients de son ancien outil de réservation, pour les clients venus ces trois dernières années : prénom, nom, téléphone, email, nombre de visites et date de la dernière visite. Le premier email que vous recevez du site le rappelle. Si vous créez un compte avec la même adresse email, cette fiche devient votre compte.\nLe salon peut noter sur votre fiche qu'un rendez-vous n'a pas été honoré.\nSi vous vous inscrivez à la liste d'attente : les jours, la plage de la journée, les prestations et le coiffeur que vous avez choisis.",
    ],
    [
      "Utilisation",
      `Ces informations servent à gérer vos rendez-vous et à vous écrire à leur sujet : email de confirmation avec un lien d'ajout à l'agenda, rappel ${hoursToWords(rules.reminderHours)} avant le rendez-vous, email si le salon modifie ou annule un rendez-vous${rules.reviewInvitations ? ", et, le lendemain d'un rendez-vous, une invitation à donner votre avis (un lien dans cet email permet de ne plus en recevoir)" : ""}. Si vous vous inscrivez à la liste d'attente, un email vous prévient quand une place qui vous convient se libère ; elle est gardée pour vous ${rules.waitlistHoldMinutes} minutes, puis proposée à la personne suivante, et vous pouvez quitter la liste à tout moment depuis « Mes rendez-vous ». ${rules.winbackAfterDays} jours après votre dernier rendez-vous, si vous n'en avez pas d'autre de prévu, le salon peut vous écrire une fois pour vous inviter à revenir (un lien dans cet email permet de ne plus en recevoir). Aucun SMS n'est envoyé. Vos données ne sont ni vendues ni cédées à des tiers à des fins commerciales.`,
    ],
    [
      "Prestataires",
      "Vercel (hébergement du site), Supabase (base de données et comptes, dans l'Union européenne) et Brevo (envoi des emails) traitent vos données pour le compte du salon, uniquement pour faire fonctionner le service.",
    ],
    [
      "Durée de conservation",
      "Vos données sont conservées tant que votre compte existe. Si vous supprimez votre compte, votre nom, votre téléphone et votre email sont effacés ; vos rendez-vous passés sont gardés sans aucune information qui permette de vous identifier, pour que les statistiques du salon restent justes. Une fiche sans compte peut être effacée sur simple demande au salon. [Durée de conservation d'un compte inactif : à définir.] [Durée de conservation d'une fiche sans compte : à définir.]",
    ],
    [
      "Vos droits",
      "Vous pouvez consulter, corriger ou supprimer vos informations à tout moment depuis « Mes informations », ou en contactant le salon. Vous pouvez aussi demander l'accès à vos données, leur portabilité ou vous opposer à un traitement. Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la CNIL (cnil.fr). [Modalités de réponse à compléter.]",
    ],
    [
      "Cookies",
      "Le site n'utilise que des cookies nécessaires à son fonctionnement : celui qui garde votre connexion et ceux de la tablette du salon. Il n'y a ni publicité ni mesure d'audience, et aucun traceur tiers : aucun bandeau de consentement n'est donc nécessaire. [Texte à faire valider.]",
    ],
  ];
}

function conditions(rules: SalonRules): Raw[] {
  return [
    [
      "Réservation",
      `La réservation en ligne nécessite un compte. Un client peut avoir au maximum ${rules.maxUpcomingPerCustomer} rendez-vous à venir en même temps. Un rendez-vous est confirmé dès sa réservation ; un email de confirmation vous est envoyé. Il est toujours au nom du titulaire du compte ; « Pour qui ? » permet d'indiquer le prénom d'un proche.`,
    ],
    [
      "Modification et annulation",
      `Un rendez-vous peut être modifié ou annulé en ligne jusqu'à ${hoursPhrase(rules.changeCutoffHours)} avant son début. Ensuite, ou pour un rendez-vous pris ${lessThanHours(rules.changeCutoffHours)} à l'avance, il faut appeler le salon au ${SALON.phoneDisplay}. Le salon peut lui-même modifier ou annuler un rendez-vous ; il vous prévient alors par téléphone et par email.`,
    ],
    [
      "Rendez-vous non honorés",
      `Un rendez-vous non honoré sans prévenir est noté sur votre fiche. À partir de ${rules.noShowBlockThreshold} rendez-vous non honorés, le salon peut décider de suspendre votre réservation en ligne ; vous pouvez toujours prendre rendez-vous en appelant le salon. [Conditions à valider.]`,
    ],
    [
      "Prestations sur appel",
      `Certaines prestations, signalées « sur appel » sur la page Prestations et tarifs, demandent un échange avant le rendez-vous : elles se réservent uniquement par téléphone au ${SALON.phoneDisplay}.`,
    ],
    [
      "Paiement",
      "Le paiement se fait sur place, au salon, après la prestation. Les prix affichés sont ceux de la carte au moment de la réservation : le prix et la durée d'un rendez-vous ne changent plus une fois réservé.",
    ],
    [
      "Responsabilité",
      "Le salon s'efforce de maintenir le site accessible en permanence, sans pouvoir garantir l'absence d'interruption. En cas de difficulté pour réserver, appelez le salon. [Texte à compléter et à faire valider.]",
    ],
  ];
}

const META: Record<LegalSlug, Pick<LegalDocument, "tab" | "title" | "description">> = {
  "mentions-legales": {
    tab: "Mentions",
    title: "Mentions légales",
    description: "Éditeur, hébergement et contact du site d'Elegance Strasbourg.",
  },
  confidentialite: {
    tab: "Confidentialité",
    title: "Politique de confidentialité",
    description:
      "Les données collectées par le site d'Elegance Strasbourg, leur usage, leur durée de conservation et vos droits.",
  },
  conditions: {
    tab: "Conditions",
    title: "Conditions d'utilisation",
    description:
      "Réservation, modification et annulation, rendez-vous non honorés et paiement chez Elegance Strasbourg.",
  },
};

export function legalDocument(slug: LegalSlug, rules: SalonRules): LegalDocument {
  const raw =
    slug === "mentions-legales"
      ? mentions()
      : slug === "confidentialite"
        ? privacy(rules)
        : conditions(rules);
  return {
    slug,
    ...META[slug],
    sections: raw.map(([title, body], index) => {
      const num = String(index + 1).padStart(2, "0");
      return { num, id: `s${num}`, title, body };
    }),
  };
}

/** Les champs entre crochets que le salon doit encore fournir ou faire valider, sans doublon. */
export function placeholdersOf(rules: SalonRules): string[] {
  const found = LEGAL_SLUGS.flatMap((slug) =>
    legalDocument(slug, rules).sections.flatMap((s) => s.body.match(/\[[^\]]+\]/g) ?? []),
  );
  return [...new Set(found)];
}

/** Titre et description d'un document, sans les règles du salon : pour les métadonnées de la page. */
export const legalMeta = (slug: LegalSlug) => META[slug];
