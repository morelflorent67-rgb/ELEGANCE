import { hoursPhrase } from "@/lib/format";
import { SALON, SUPPORT_EMAIL, salonAddressLine } from "@/lib/salon";
import type { SalonRules } from "./load";

// Page d'assistance (/aide), adresse « assistance » de la fiche App Store (lot 28, D-125). Les règles chiffrées
// viennent des réglages du salon, jamais écrites en dur.

export interface HelpSection {
  id: string;
  title: string;
  body: string;
}

export function helpSections(rules: SalonRules): HelpSection[] {
  const raw: [string, string][] = [
    [
      "Nous contacter",
      `Écrivez à ${SUPPORT_EMAIL} ou appelez le salon au ${SALON.phoneDisplay}, du mardi au samedi. Le salon est au ${salonAddressLine}.`,
    ],
    [
      "Réserver un rendez-vous",
      `Dans l'application ou sur le site, touchez Réserver, choisissez les prestations, le coiffeur (ou « Sans préférence »), puis un créneau, et confirmez. Un compte est nécessaire. Vous pouvez avoir ${rules.maxUpcomingPerCustomer} rendez-vous à venir en même temps. Certaines prestations sont sur devis : elles se réservent par téléphone.`,
    ],
    [
      "Modifier ou annuler",
      `Dans Mes rendez-vous, touchez Modifier ou Annuler, jusqu'à ${hoursPhrase(rules.changeCutoffHours)} avant le début. Ensuite, appelez le salon au ${SALON.phoneDisplay}.`,
    ],
    [
      "Notifications",
      `L'application peut vous prévenir par notification : rappel de votre rendez-vous, place qui se libère (elle est gardée pour vous ${rules.waitlistHoldMinutes} minutes), rendez-vous modifié ou annulé par le salon. L'autorisation vous est proposée après votre première réservation. Vous pouvez la retirer à tout moment dans les réglages de l'iPhone, rubrique Notifications. Les emails continuent d'être envoyés.`,
    ],
    [
      "Mot de passe oublié",
      "Sur l'écran de connexion, touchez Mot de passe oublié, saisissez votre adresse email : vous recevez un lien pour en choisir un nouveau.",
    ],
    [
      "Supprimer mon compte",
      `Dans l'application : onglet Compte, puis Mon compte, puis Supprimer mon compte, et confirmez. Sur le site : Mon compte, Supprimer mon compte. Votre nom, votre téléphone et votre email sont effacés, vos rendez-vous à venir sont annulés et vos notifications s'arrêtent. Vous pouvez aussi demander la suppression par email à ${SUPPORT_EMAIL}.`,
    ],
  ];
  return raw.map(([title, body], index) => ({ id: `a${index + 1}`, title, body }));
}
