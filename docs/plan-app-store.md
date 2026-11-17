# Plan : l'application iPhone sur l'App Store (lots 24 à 29)

> **État au 17 novembre 2026 : plan écrit ; lot 25 (API mobile) fait et déployé.** Décision D-122 (remplace le « pas d'App Store » de D-69). Réponses de Florent du 17 novembre : publication par **sa société FR Services** (pas la société du salon), **côté clients seulement** (la tablette reste le site), **Florent a un iPhone** pour les essais.

> **Pour l'assistant qui exécute ce plan :** utiliser `superpowers:executing-plans` (une tâche après l'autre, TDD côté serveur). Cocher les cases `- [ ]` de ce fichier au fil de l'eau. Lire d'abord `CLAUDE.md`, puis `docs/reprise.md`, puis ce plan en entier. **Un lot par conversation** ; à la fin de chaque lot : tests verts, `docs/reprise.md` à jour, commit, push.

**Objectif :** une application iPhone « Elegance Strasbourg » acceptée par Apple, gratuite pour les clients, construite et envoyée **sans Mac**, sans autre frais que l'abonnement Apple (99 € par an).

---

## 1. Pourquoi ce choix (à relire si on hésite)

### Le risque n°1 : la règle 4.2 d'Apple
Apple refuse une app qui n'est qu'un « site emballé » (règle 4.2 : *l'app doit apporter plus qu'un site web reconditionné*). C'est exactement ce qui avait fait écarter l'App Store en octobre (D-69). Une coque (Capacitor, WebView) qui affiche `elegance-strasbourg.fr` a donc de fortes chances d'être refusée, et ne marche pas mieux que l'application installable qui existe déjà.

### La solution retenue : une vraie app native avec Expo (React Native)
- **Écrans natifs** (réservation, mes RDV, fidélité, compte) qui appellent le serveur actuel par une **API dédiée**. Les règles métier ne bougent pas : elles restent dans `src/modules/*` (créneaux, réservation, 48 h, liste d'attente, fidélité). L'app ne fait qu'afficher et envoyer.
- **Fonctions qu'un site ne peut pas offrir**, qui justifient l'app auprès d'Apple :
  - **notifications** : rappel de RDV, « une place s'est libérée » (la place n'est gardée que 15 min : la notification est le vrai plus), RDV modifié ou annulé par le salon ;
  - **ajout au calendrier** de l'iPhone en un geste ;
  - **appel et itinéraire** (Plans) natifs, **retour haptique** ;
  - **connexion gardée** (pas de mot de passe à retaper).
- **Sans Mac** : Expo construit l'app dans ses serveurs (**EAS Build**, gratuit : environ 15 constructions iOS par mois, largement assez) et l'envoie à Apple (**EAS Submit**, gratuit). Tout se lance depuis le PC Windows. Les petites corrections de texte ou d'écran peuvent partir sans repasser par Apple (**EAS Update**, gratuit à cette échelle).
- **Essais** : sur l'iPhone de Florent par **TestFlight** (app gratuite d'Apple).
- **Plus tard, en option** : la même app sur Android (Google Play, 25 $ une seule fois), quasi sans travail en plus.

Écartés : Capacitor/WebView (règle 4.2, et sans Mac il faut un service de compilation à part), Flutter ou Swift (tout réécrire, Swift exige un Mac), outils « générateurs d'app » (règle 4.2.6 : refusés s'ils publient pour leurs clients, et payants).

### Ce que Sonnet doit garder en tête
- L'app est un **client** du serveur : **aucun calcul de créneau, de délai ou de points dans l'app**. Tout refus vient du serveur (`DomainError`, code stable) et l'app le traduit en français, comme le site.
- Aucun accès à la base depuis l'app (comme le navigateur).
- Les textes qui citent la carte, l'équipe, les horaires ou une règle **viennent du serveur** (comme la vitrine).
- Le site et la tablette doivent continuer de marcher exactement pareil : `pnpm test:all` vert à chaque lot.

---

## 2. Ce que l'app a déjà pour Apple (vérifié le 17 novembre 2026)

| Exigence Apple | État | Ce qu'il reste |
| --- | --- | --- |
| 5.1.1(v) : supprimer son compte **dans l'app** | Existe sur le site (`/compte/informations`, `profile.ts`, R-75, D-43) | Écran natif qui appelle la même fonction (lot 26) |
| 4.8 : « Se connecter avec Apple » | **Pas obligatoire** : seule la connexion maison (email + mot de passe) existe | Ne pas ajouter Google sans ajouter Apple |
| 3.1.3(e) : paiement d'un service consommé hors de l'app | Rien n'est payé dans l'app (SumUp est au salon) : **pas d'achat intégré Apple** | Rien |
| 5.1.1(i) : politique de confidentialité dans l'app et sur la fiche | Page `/confidentialite` | La compléter : app, notifications, jeton de l'appareil (lot 28) |
| 2.1 : compte de démonstration pour l'examinateur | Rien | Lot 28 (question 0.1) |
| 4.2 : plus qu'un site | Rien | Lots 26 et 27 |
| 5.2.1 : publié par le propriétaire de la marque | **Risque** : FR Services publie la marque du salon | Attestation du salon (lot 24) |
| Chiffrement (export) | HTTPS seulement | `ITSAppUsesNonExemptEncryption = false` (lot 26) |
| Manifeste de confidentialité iOS | Rien | `ios.privacyManifests` dans `app.json` (lot 28) |
| Statut de commerçant (UE, DSA) | Rien | FR Services se déclare « commerçant » : **adresse, téléphone et email de FR Services seront publics sur l'App Store** (lot 24) |

Sur les recommandations de ChatGPT : la suppression de compte **existe déjà** ; le compte de démonstration et la fiche App Store sont bien nécessaires (lots 28 et 29) ; la réservation est déjà couverte par 1 000+ tests côté serveur, il faudra des essais de l'app elle-même (lot 26) ; les « rappels natifs » sont la pièce qui fera accepter l'app (lot 27).

---

## 0. Questions à poser à Florent (au début du lot indiqué)

Règle du projet : une question ouverte se pose, elle ne se suppose pas. Recommandation entre parenthèses.

1. **Lot 28 — compte de démonstration Apple.** L'examinateur d'Apple va réserver pour de vrai. (Recommandé : un compte client marqué « examen Apple » ; ses RDV apparaissent sur la tablette avec l'étiquette « Test Apple, ne pas tenir compte », il n'envoie aucun email, ne compte ni au Bilan ni à la fidélité, et peut annuler même à moins de 48 h. Le salon est prévenu le jour de l'envoi.) Autre choix : compte normal, et le salon annule à la main.
2. **Lot 27 — quelles notifications ?** (Recommandé : rappel, place libérée, RDV modifié ou annulé par le salon. La relance « nous serions ravis de vous revoir » **seulement** si le client l'a acceptée, règle 4.5.4.) Les emails continuent en plus, ou la notification remplace l'email quand elle est activée ? (Recommandé : les deux, l'email reste la preuve.)
3. **Lot 28 — fiche App Store** : nom (« Elegance Strasbourg »), sous-titre (30 caractères, ex. « Coiffure & barbier, réservez »), catégorie (Style de vie), adresse d'assistance (`contact@elegance-strasbourg.fr` ?), modèle exact de l'iPhone de Florent (pour les captures d'écran).
4. **Lot 24 — l'app sur iPad aussi ?** (Recommandé : **non**, iPhone seulement : moins de captures, moins de motifs de refus. L'app s'ouvre quand même sur iPad en mode iPhone.)

---

## Lot 24 — Comptes et papiers (Florent, en parallèle du lot 25)

Rien à coder. Sonnet guide Florent pas à pas, avec les noms exacts des boutons. **Florent tape lui-même mots de passe et codes, jamais dans le chat.**

- [x] **Numéro D-U-N-S de FR Services** : déjà obtenu (Florent, 17 novembre 2026).
- [x] **Identifiant Apple** et **inscription au programme Apple Developer en tant qu'organisation** (FR Services) : compte validé par Apple, contrat signé (17 novembre 2026).
- [ ] **Régler l'abonnement** (99 $ par an) : Florent le fait lui-même, depuis l'app Apple Developer ou developer.apple.com. Le compte n'est actif qu'après ce paiement (activation : jusqu'à 48 h).
- [ ] **Attestation du salon** (modèle à rédiger par Sonnet, en `docs/app-store/attestation-salon.md`) : le gérant du salon autorise FR Services à publier l'app « Elegance Strasbourg » avec son nom et son logo. Signée, scannée en PDF, gardée pour la joindre si Apple invoque la règle 5.2.1. **Le vendeur affiché sur l'App Store sera « FR Services ».** Si un jour le salon ouvre son propre compte, l'app peut lui être transférée sans perdre ses avis ni ses utilisateurs.
- [ ] **App Store Connect** : accepter les contrats ; **statut de commerçant (DSA)** : déclarer FR Services commerçant (adresse, téléphone, email publiés) ; contrat « Apps payantes » **inutile** (app gratuite).
- [ ] **Compte Expo** (gratuit) sur expo.dev, au nom de FR Services.
- [ ] **TestFlight** installé sur l'iPhone de Florent.

## Lot 25 — L'API mobile (serveur Next.js)

But : tout ce que fait la page client, accessible en JSON, **sans dupliquer une règle**.

- [x] Lire `node_modules/next/dist/docs/` (route handlers, Next 16) et `src/modules/auth` (le cookie `elegance-session`).
- [x] **Authentification par jeton** : le même jeton de session que le cookie, envoyé en `Authorization: Bearer` (sessions de 90 jours, D-116). Connexion, inscription, déconnexion, mot de passe oublié (le lien de l'email ouvre le site : acceptable). Mêmes limitations d'essais que le site. Décision dans `docs/decisions.md`.
- [x] Routes sous **`/api/mobile/v1/*`** (version dans l'adresse : une app installée ne se met pas à jour toute seule), chacune vérifie elle-même la session, comme `src/app/equipe` :
  vitrine (carte, équipe, horaires, accès, textes légaux), jours et créneaux (`getDaySlots`), réserver (`createAppointment`), mes RDV, déplacer, annuler (`rescheduleAppointment`, `cancelAppointment`), liste d'attente (rejoindre, accepter, refuser, quitter), fidélité (`getLoyaltyCard`), mes informations, **suppression du compte**.
- [x] Erreurs : `{ code }` stable (`DomainError`) ; l'app a la table de traduction.
- [x] `after(wakeWaitlist)` et emails exactement comme dans les actions du site (à recopier depuis les actions existantes, idéalement en partageant une fonction).
- [x] Tests d'intégration pour chaque route (accès refusé sans jeton, jeton d'un autre client, refus métier traduit). **Aucune nouvelle dépendance.**
- [x] Déployer sur le VPS (annoncer avant), vérifier `/api/mobile/v1/vitrine` en ligne.

## Lot 26 — L'app Expo : squelette et écrans

- [x] Dossier **`mobile/`** à la racine, **hors** du `pnpm-workspace.yaml` (son propre `package.json` et sa propre lockfile, comme `communication/lancement/`) : le site ne doit pas hériter des dépendances React Native. Justifier dans `docs/decisions.md` chaque dépendance (Expo SDK à jour, `expo-router`, `expo-secure-store` pour le jeton, `expo-font`, `expo-haptics`).
- [x] `app.json` : nom « Elegance Strasbourg », identifiant `fr.elegancestrasbourg.app` (définitif : ne plus jamais le changer), icône (le E du logo, 1024 × 1024, sans transparence), écran de lancement, `ios.supportsTablet: false`, `ios.config.usesNonExemptEncryption: false`, langue française.
- [x] Charte du lot 12 et 18 : fond encre, accent **bleu** (`--accent-rgb`), Manrope et Cormorant Garamond. Reprendre les valeurs de `src/app/(client)/client.css` (pas le doré de la tablette).
- [x] Écrans : Accueil (ouvert/fermé maintenant, horaires, accès avec bouton Appeler et Itinéraire), Réserver (prestation → coiffeur ou « Sans préférence » → jour → créneau → confirmation, une étape par écran comme `BookingFlow`), Mes RDV (déplacer, annuler, « reprendre le même RDV »), Fidélité, Compte (mes informations, déconnexion, **supprimer mon compte** avec confirmation, liens confidentialité, conditions, mentions légales via `expo-web-browser`), Connexion/Inscription.
- [x] Session expirée → retour propre à la connexion, sans perdre l'étape de réservation en cours. Pas de réseau → message clair, pas d'écran blanc.
- [x] Tests : fonctions pures de l'app (traduction des codes, formats d'heure Europe/Paris) avec Jest d'Expo ; parcours essayés à la main sur l'iPhone, liste cochée dans `docs/app-store/recette.md`.
- [ ] **Première construction** (nécessite le compte Expo et le compte Apple du lot 24 ; `mobile/eas.json` est prêt) : Florent tape `eas login` puis `eas build -p ios` (Expo crée les certificats Apple, Florent saisit lui-même son identifiant Apple), `eas submit` → **TestFlight** sur son iPhone.

## Lot 27 — Fonctions natives (ce qui fait accepter l'app)

- [x] **Notifications** (`expo-notifications`) : demander l'autorisation **après** la première réservation, pas au démarrage. Table `push_device` (client, jeton, date), effacée à la déconnexion et par la suppression du compte (R-75) et la purge des 3 ans (R-101). Nouvelles règles R-xx avec tests.
- [x] Envoi : **directement à Apple (APNs)** depuis le serveur avec une clé `.p8` (HTTP/2 et `node:crypto`, sans dépendance, sans passer par les serveurs d'Expo aux États-Unis) — ou service Expo Push si trop lourd (alors le citer dans la politique de confidentialité). Trancher et noter dans `docs/decisions.md`. Clé `.p8` dans `deploy/.env`, jamais dans le dépôt ni le chat.
- [x] Brancher sur la file existante (`email_outbox`, `worker.ts`) : mêmes règles d'abandon et de report que l'email (RDV annulé, déplacé, « à traiter », email retenu pour le gérant).
- [x] Toucher la notification « place libérée » ouvre directement l'offre dans l'app.
- [x] **Ajouter au calendrier** (`expo-calendar`) depuis la confirmation et Mes RDV.
- [x] Retour haptique à la confirmation ; Appeler et Itinéraire (Plans) natifs.
- [ ] Nouvelle construction, essai complet sur l'iPhone (notification reçue téléphone verrouillé).

## Lot 28 — Conformité et fiche App Store

- [ ] **Compte de démonstration** selon la réponse à la question 0.1 (migration, tests, affichage tablette), créé par Florent (`pnpm` en terminal, mot de passe tapé par lui).
- [ ] **Politique de confidentialité** et conditions : l'app, le jeton de notification, Apple (APNs), Expo (construction ; et notifications si Expo Push), durée de conservation. Le lien est aussi dans l'app.
- [ ] Page **assistance** sur le site (`/aide` : contact, suppression du compte, FAQ courte) : adresse demandée par Apple.
- [ ] **Étiquettes de confidentialité** (App Store Connect, « Confidentialité de l'app ») : coordonnées (nom, email, téléphone), identifiant utilisateur, historique (RDV), identifiant d'appareil (jeton de notification) ; liées à l'identité ; **pas de suivi publicitaire** (donc pas de demande ATT).
- [ ] Manifeste de confidentialité iOS dans `app.json` (raisons d'usage des API demandées par Apple ; vérifier ce que l'Expo SDK déclare déjà).
- [ ] **Classification d'âge** (questionnaire : aucun contenu sensible → 4+).
- [ ] **Captures d'écran** : taille exigée par Apple au moment du lot (vérifier sur developer.apple.com : à ce jour iPhone 6,9 pouces), prises sur l'iPhone de Florent ou mises en page à la bonne taille ; montrer l'app en usage (accueil, réservation, mes RDV, fidélité, notification).
- [ ] Textes : description, mots-clés, nouveautés ; **notes pour l'examinateur** : identifiants du compte démo, « réservation réelle dans un salon de coiffure, le salon est prévenu », où trouver la suppression du compte, à quoi servent les notifications.

## Lot 29 — Envoi à Apple et publication

- [ ] Dernière construction, essai complet sur TestFlight, `pnpm test:all` vert côté site.
- [ ] Envoi à l'examen depuis App Store Connect. Délai habituel : 1 à 3 jours.
- [ ] En cas de refus : lire le motif (règle citée), corriger, répondre dans « Résolution » (joindre l'attestation du salon pour 5.2.1). Ne pas se décourager : un premier refus est courant.
- [ ] Publication manuelle le jour choisi ; mettre le lien App Store sur le site (accueil) et l'affiche de lancement.
- [ ] `docs/exploitation.md` : comment publier une mise à jour (EAS Update pour les petites retouches, nouvelle construction + examen sinon), renouvellement annuel du compte Apple, expiration de la clé APNs (aucune) et des certificats (gérés par Expo).

---

## Message de démarrage (à coller dans une nouvelle conversation, avec Sonnet)

> On attaque l'application iPhone d'Elegance Strasbourg. Lis `CLAUDE.md`, `docs/reprise.md`, puis `docs/plan-app-store.md` en entier, et fais le **lot 25** (API mobile) avec `superpowers:executing-plans`. Je fais le lot 24 (comptes Apple) en parallèle : guide-moi quand je te le demande. Pose-moi d'abord les questions du plan qui concernent ce lot.

Pour les lots suivants : même message en remplaçant le numéro du lot.
