# Elegance Strasbourg — Dossier projet

Version du 20 octobre 2026 — document de référence, il fait foi.

## Note de cadrage

Elegance Strasbourg remplace Planity par son propre site : une vitrine premium, une réservation mobile en moins d'une minute et un planning fiable sur tablette. C'est le document de référence du projet : il fait foi pour les règles et les décisions. Deux documents en découlent : le brief Claude Design et le dossier de transmission Claude Code.

### Le salon aujourd'hui

- **Activité** : coiffure masculine et barbe, d'après la carte (coupe, barbe, rasage, soin du visage, coloration).
- **Équipe** : 4 coiffeurs, dont 2 apprentis. Orhan et Enes, coiffeurs ; Kaan et Taha, apprentis. La seconde fiche de Kaan sur Planity est un doublon.
- **Horaires** : du mardi au samedi, de 10 h à 12 h et de 13 h à 19 h, pause commune à midi, uniquement sur rendez-vous. Adresse : 162 route de Bischwiller, 67300 Schiltigheim ; téléphone 03 88 97 74 68.
- **Outils** : Planity pour les réservations, un logiciel de caisse séparé, une tablette partagée au salon.
- **Clientèle** : francophone ; aucun nouveau client n'arrive par la marketplace Planity.
- **Réseaux** : Instagram @elegance\_strasbourg et Snapchat barb.hair ; domaine visé : elegance-strasbourg.com.
- **Identité** : logo ELEGANCE aux E en trois barres, signature « Bien plus qu'une coupe », valeurs « Style, Soin, Confiance », salon graphite, blanc, bois et lignes de lumière.

### Objectifs

1. Quitter Planity au plus vite, sans perdre un seul rendez-vous.
2. Faire réinscrire tous les clients sur l'app Elegance, sans import de fichier.
3. Réduire les lapins.
4. Donner au gérant une vue simple de l'activité, dont un chiffre d'affaires indicatif.
5. Porter une image de marque premium, d'abord sur mobile.

### Qui fait quoi

| Rôle | Accès | Peut |
| --- | --- | --- |
| Visiteur | Site public | Découvrir le salon, les prestations et les tarifs |
| Client | Compte avec email et mot de passe | Réserver, modifier ou annuler jusqu'à 48 h avant, revoir son historique |
| Équipe | Tablette du salon, session partagée | Tenir le planning, réserver pour un client, signaler un lapin |
| Gérant | Tablette, avec un code | Tout, plus prestations, tarifs, équipe, horaires, absences et chiffre d'affaires |

### Périmètre

La V1 réunit tout ce qu'il faut pour fermer Planity ; le reste attendra quelques semaines de données réelles.

**V1, pour quitter Planity**

- Vitrine : accueil, prestations et tarifs lus dans le catalogue de l'app, salon et équipe, contact et accès, pages légales.
- Réservation sur une seule page, inspirée de Planity : prestations, coiffeur ou « Sans préférence », créneau, identification, confirmation ; note au salon.
- Espace client : RDV à venir et passés, modification ou annulation dans les délais, « Reprendre le même RDV ».
- Notifications par email uniquement : confirmation avec ajout à l'agenda, rappel, modification ou annulation. Pas de SMS en V1.
- Planning tablette : une colonne par coiffeur, réservation pour un client, fiches clients, signalement des lapins.
- Gestion : prestations et tarifs, équipe, horaires, absences avec traitement des RDV concernés.
- Tableau de bord gérant : chiffre d'affaires indicatif, nombre de RDV, lapins.
- Socle : sécurité, sauvegardes, journal des actions, application installable sur tablette et mobile.

**Juste après le lancement**

- Statistiques détaillées : occupation par coiffeur, prestations phares, fidélité.
- Message « il est temps de repasser » quelques semaines après une coupe, avec désinscription possible.
- Avis clients vérifiés sur 4 critères, avec réponse du salon, et lien vers Google.
- Liste d'attente sur les créneaux libérés.
- Vue semaine et glisser-déposer dans le planning.

**Plus tard, si le besoin se confirme**

- Empreinte bancaire ou acompte contre les lapins.
- Cartes cadeaux en ligne.
- Rappels par SMS.
- Connexion avec Google ou Apple.
- Accès de chaque coiffeur à son planning depuis son téléphone.

**Hors périmètre** : encaissement, comptabilité, second salon, langues étrangères, marketplace, boutique en ligne.

### Principes

- La fiabilité passe avant les fonctionnalités.
- Une seule source de vérité : prestations, prix et horaires saisis une fois, affichés partout.
- Mobile d'abord pour les clients, tablette d'abord pour le salon.
- Un site premium est un site rapide : l'animation ne retarde jamais une action.
- Des données minimales, hébergées en Europe quand c'est possible, exportables à tout moment.
- Une maintenance à la portée du porteur du projet : architecture simple, mises à jour automatisées, alertes, guide d'exploitation.

### Stack envisagée

À confirmer à l'étape Code ; budget de fonctionnement estimé entre 45 et 60 € par mois, sans SMS.

| Besoin | Choix envisagé | Pourquoi |
| --- | --- | --- |
| Site et application | Next.js, TypeScript, Tailwind | Socle solide, que Claude Code maîtrise bien |
| Base de données et comptes | Supabase, offre Pro | L'offre gratuite se met en pause sans activité |
| Emails | Brevo | Société française ; les SMS s'activeront plus tard sans changer d'outil |
| Application installable | Serwist | Successeur maintenu de next-pwa |
| Planning tablette | Développement sur mesure | 4 colonnes fixes ; la vue par coiffeur de FullCalendar est payante |
| Animations | GSAP | Entièrement gratuit, idéal pour le logo vectoriel |
| Hébergement | Vercel, offre Pro | L'offre gratuite exclut l'usage commercial |

Sources : [Vercel](https://vercel.com/docs/platform/fair-use-policy) · [Supabase](https://supabase.com/pricing) · [Brevo](https://www.formalive.fr/avis-brevo/) · [Serwist](https://gist.github.com/nurmdrafi/f3ddef604f80dfd1a4139a7a8ddc76c8) · [FullCalendar](https://fullcalendar.io/premium) · [GSAP](https://webflow.com/blog/gsap-becomes-free)

### Feuille de route

1. Cadrage (Claude Chat) — validé : dossier projet.
2. Design (Claude Design) — validé : maquettes, direction A « Lumière ».
3. Développement (Claude Code) — validation : tests au vert, lot par lot.
4. Recette et bascule — validation : Planity fermé.

Les tests automatiques accompagnent chaque lot de code dès le premier jour, pas seulement la fin du projet.

## Carte des prestations

La carte retenue compte 10 prestations, dont 4 réservables seulement par téléphone ; le rasage complet pourra être ajouté plus tard depuis l'app. Les apprentis y ont leurs propres prestations « tarif formation », plus longues et moins chères : nous reprenons ce modèle, plus simple qu'un prix variable selon le coiffeur.

| Prestation | Prix | Durée | Réalisée par | Réservable en ligne |
| --- | --- | --- | --- | --- |
| Coupe homme | 18 € | 30 min | Coiffeurs | Oui |
| Coupe & taille de barbe | 28 € | 30 min | Coiffeurs | Oui |
| Coupe, tarif formation | 10 € | 45 min | Apprentis | Oui |
| Coupe & taille de barbe, tarif formation | 15 € | 45 min | Apprentis | Oui |
| Taillage barbe | 12 € | 15 min | Coiffeurs | Oui |
| Soin du visage à la vapeur | 25 € | 30 min | Coiffeurs | Oui |
| Coloration | 15 € | 30 min | Coiffeurs | Non |
| Tribal | 10 € | 30 min | Coiffeurs | Non |
| Défrisage | 10 € | 30 min | Coiffeurs | Non |
| Lissage brésilien | 60 € | 30 min | Coiffeurs | Non |

Source : [page Planity du salon](https://www.planity.com/elegance-strasbourg-67300-schiltigheim), consultée le 20 octobre 2026. Les 4 prestations par téléphone restent visibles en ligne, avec leur prix, leur durée et un bouton d'appel.

## Parcours de réservation

Le parcours reprend celui de Planity, que vos clients connaissent déjà : une seule page, où chaque étape validée se replie en un résumé modifiable. Ce que nous gardons et ce que nous améliorons tient en trois listes.

### Les cinq étapes

1. **Prestation** : la carte avec prix et durée ; un bouton « Ajouter une prestation à la suite ».
2. **Coiffeur** : un choix « Avec qui ? », réglé sur « Sans préférence » par défaut ; seuls les coiffeurs habilités apparaissent.
3. **Date et heure** : les prochains jours en accordéon, les créneaux libres du jour, « Voir plus », et un calendrier pour une date lointaine.
4. **Identification** : connexion ou création de compte ; déjà connecté, tout est pré-rempli. Une option : une note au salon de 300 caractères.
5. **Confirmation** : récapitulatif, rappel de la règle des 48 h, bouton Confirmer, puis email.

### L'espace client

- **Mes RDV** : à venir et passés, avec « Modifier », « Annuler » et « Reprendre le même RDV ».
- **Mes informations** : prénom, nom, téléphone, email, mot de passe, suppression du compte.
- Pas de favoris, contrairement à Planity : il n'y a qu'un salon.

### Ce que nous faisons mieux que Planity

- L'identité Elegance partout, là où Planity reste neutre.
- Aucun salon concurrent affiché, aucune pub pour l'application Planity.
- « Reprendre le même RDV » en un geste depuis l'historique.
- La date limite de modification affichée sur chaque RDV.
- Les prestations par téléphone avec un bouton d'appel direct.

### La fiche du salon à reprendre sur la vitrine

Planity montre une galerie de 6 photos, l'adresse avec carte, les horaires, l'équipe et des avis notés sur 4 critères : accueil, propreté, cadre et ambiance, qualité de la prestation. Le salon y répond aux avis. La vitrine Elegance reprend ces blocs, mis en scène dans l'identité de la marque.

## Règles métier

Ces 52 règles fixent le comportement du moteur de réservation : toutes sont décidées. Chacune deviendra un test automatique à l'étape Code ; changez son statut dès que vous la validez.

### Horaires et créneaux

| N° | Règle | Statut |
| --- | --- | --- |
| R-01 | Le salon est ouvert du mardi au samedi, de 10 h à 12 h et de 13 h à 19 h. | Décidé |
| R-02 | Tous les coiffeurs suivent ces horaires ; une exception individuelle passe par une absence (R-40). | Décidé |
| R-03 | Le gérant modifie les horaires et déclare les fermetures exceptionnelles : jours fériés, congés annuels. | Décidé |
| R-04 | Un créneau commence à l'heure pile ou à la demie, en ligne comme au salon, pour toutes les prestations (D-65, remplace D-39). Un RDV finit au plus tard à 19 h et ne chevauche jamais la pause. | Décidé |
| R-05 | Le dernier départ possible découle de la durée, sur la grille de 30 minutes ; la règle « dernier créneau à 18 h 30 » disparaît. Une prestation de 45 min part au plus tard à 18 h. | Décidé |
| R-06 | En ligne, un client réserve au plus tard 1 h avant le RDV et au plus tôt 6 semaines avant. | Décidé |
| R-07 | Le salon reçoit uniquement sur rendez-vous : pas de client sans RDV. | Décidé |

### Prestations et prix

| N° | Règle | Statut |
| --- | --- | --- |
| R-10 | Une prestation a un nom, une durée en multiple de 15 minutes et un prix. | Décidé |
| R-11 | Le gérant ajoute, modifie et retire des prestations. | Décidé |
| R-12 | Les apprentis ont leurs propres prestations « tarif formation », avec leur prix et leur durée. | Décidé |
| R-13 | Chaque prestation indique les coiffeurs habilités à la réaliser. | Décidé |
| R-14 | Le client ajoute des prestations à la suite dans un même RDV, avec le même coiffeur : durées et prix s'additionnent. | Décidé |
| R-15 | Toutes les prestations ont un prix fixe : aucune n'est sur devis. | Décidé |
| R-16 | Prix et durée sont figés dans le RDV ; une prestation retirée reste visible dans l'historique. | Décidé |
| R-17 | Une prestation non réservable en ligne reste affichée, avec prix, durée et bouton d'appel du salon. | Décidé |
| R-18 | Un RDV ne mélange pas prestations « Coiffeurs » et « Apprentis » : personne ne peut réaliser les deux ; l'autre catégorie est grisée, avec un message. | Décidé |

### Réservation

| N° | Règle | Statut |
| --- | --- | --- |
| R-20 | Le client choisit un coiffeur ou « Sans préférence », proposé par défaut. | Décidé |
| R-21 | Un coiffeur réalise une seule prestation à la fois et reste occupé pendant toute une coloration. | Décidé |
| R-22 | Un créneau n'est proposé que si le coiffeur est libre sur toute la durée : ni RDV, ni absence, ni pause. | Décidé |
| R-23 | Deux réservations sur le même créneau sont impossibles, même à la même seconde : la base refuse la seconde. | Décidé |
| R-24 | Un RDV créé est immédiatement confirmé. | Décidé |
| R-25 | Un client a au plus 5 RDV à venir en même temps (D-66, réglage), hors RDV répétés (D-87). | Décidé (précisée le 22/10/2026) |
| R-26 | Le salon réserve par téléphone ou au comptoir, pour un client inscrit ou pour une fiche sans compte qu'il crée sur place (D-70, D-76). | Décidé (modifiée le 21/10/2026) |
| R-27 | Pour réserver en ligne, le client s'inscrit lui-même ; le salon n'est pas soumis aux délais de R-06. | Décidé (modifiée le 21/10/2026) |
| R-28 | Un RDV est toujours au nom du titulaire de la fiche, même pris pour quelqu'un d'autre ; « Pour qui ? » donne le prénom du proche (D-80). | Décidé (précisée le 21/10/2026) |
| R-29 | Le client peut laisser une note au salon, de 300 caractères au plus. | Décidé |

### Modification et annulation

| N° | Règle | Statut |
| --- | --- | --- |
| R-30 | Le client modifie ou annule son RDV en ligne jusqu'à 1 h avant son début (D-63, réglage). | Décidé |
| R-31 | Passé ce délai, l'app affiche « Contactez le salon » avec un bouton d'appel. | Décidé |
| R-32 | Un RDV pris moins de 1 h avant ne se modifie pas en ligne : le client appelle le salon (D-63). | Décidé |
| R-33 | Le salon modifie ou annule un RDV à tout moment, et le client en est prévenu. | Décidé |

### Absences

| N° | Règle | Statut |
| --- | --- | --- |
| R-40 | Une absence couvre quelques heures, une journée ou une période, avec un motif ; elle remplace la notion d'indisponibilité. | Décidé |
| R-41 | Aucun créneau n'est proposé pendant une absence. | Décidé |
| R-42 | À la déclaration, l'app liste les RDV concernés ; pour chacun : confier à un collègue, proposer un autre créneau ou annuler avec excuses. | Décidé |
| R-43 | Aucun message ne part au client sans la confirmation du gérant ; chaque traitement est inscrit au journal. | Décidé |

### Statuts et chiffre d'affaires

| N° | Règle | Statut |
| --- | --- | --- |
| R-50 | Un RDV passe de Confirmé à Honoré, Non venu, Annulé par le client ou Annulé par le salon. | Décidé |
| R-51 | Une fois passé, un RDV est honoré par défaut ; l'équipe signale seulement les lapins, en un geste. | Décidé |
| R-52 | Chaque lapin s'ajoute à la fiche client ; après 2 lapins, le gérant peut bloquer la réservation en ligne du client, puis la débloquer. | Décidé |
| R-53 | Le chiffre d'affaires indicatif additionne les RDV honorés à leur prix figé, ajustable à la clôture. | Décidé |
| R-54 | Toute correction de montant à la clôture d'un RDV est inscrite au journal. | Décidé |
| R-55 | Ce chiffre sert de repère, sans valeur comptable : la caisse fait foi. | Décidé |

### Notifications

| N° | Règle | Statut |
| --- | --- | --- |
| R-60 | Un email de confirmation part dès la réservation, avec un lien d'ajout à l'agenda. | Décidé |
| R-61 | Un rappel par email part 24 h avant (D-64, réglage), pour les RDV pris plus tôt, avec la date limite de modification. | Décidé |
| R-62 | Pas de SMS en V1 : tous les messages partent par email ; le SMS pourra s'ajouter plus tard. | Décidé |
| R-63 | Quand le salon modifie ou annule un RDV, il appelle le client ; un email confirme le changement. | Décidé |
| R-64 | Le lendemain d'un RDV honoré, un email invite le client à laisser un avis. | Décidé |

### Comptes et accès

| N° | Règle | Statut |
| --- | --- | --- |
| R-70 | Le compte client demande prénom, nom, téléphone, email et mot de passe. | Décidé |
| R-71 | Le compte se crée à l'étape d'identification de la première réservation (avant le récapitulatif), avec acceptation des conditions (D-44). | Décidé |
| R-72 | La tablette reste connectée en mode équipe : planning, RDV et fiches clients. | Décidé |
| R-73 | Les fonctions gérant demandent un code : tarifs, équipe, horaires, chiffre d'affaires, suppressions. | Décidé |
| R-74 | Sur la tablette, qui modifie ou annule un RDV choisit son nom ; l'action est inscrite au journal. | Décidé |
| R-75 | Le gérant peut supprimer une fiche client, et un client peut supprimer son compte. | Décidé |
| R-76 | L'espace client regroupe ses RDV et ses informations. | Décidé |

**Liste d'attente et relance (lot 13)**

| R-80 | Un client connecté s'inscrit à la liste d'attente quand rien n'est libre : un ou plusieurs jours complets (14 au plus, dans l'horizon de réservation), un coiffeur ou « Sans préférence », une plage (matin avant midi, après-midi, journée). Refusé s'il reste une place qui lui convient (il la réserve) ; 5 inscriptions en cours au plus. | Décidé (D-73, D-99, D-101) |
| R-81 | Quand une place libre convient à une inscription, elle est offerte à **une seule personne** : la première inscrite, dans l'ordre d'inscription. Elle lui est gardée `waitlist_hold_minutes` (15 min, réglage), au plus jusqu'au délai minimal de réservation (R-06). | Décidé (D-100) |
| R-82 | Une place gardée n'est pas réservable en ligne par un autre client ; le salon peut la prendre. | Décidé (D-100) |
| R-83 | « Prendre cette place » crée le RDV par le chemin ordinaire (limite de RDV à venir R-25, délais, créneau encore libre revérifiés), clôt l'offre et l'inscription, et envoie la confirmation. À la limite de RDV, l'offre reste en cours : le client peut annuler un RDV, puis revenir avant la fin du délai. | Décidé |
| R-84 | « Pas cette fois » ou délai écoulé : la place passe à la personne suivante ; la même inscription ne se la voit pas reproposer, et reste sur la liste. Une place prise entre-temps rend l'offre « perdue ». | Décidé (D-100) |
| R-85 | « Quitter la liste d'attente » (page de l'offre) ou « Me retirer » (Mes rendez-vous) ferme l'inscription ; sa place gardée passe à la suivante. | Décidé |
| R-86 | Le traitement de la liste se lance après chaque place libérée (annulation, déplacement, absence ou fermeture retirée), après chaque réponse à une offre, et par le cron. Une inscription dont tous les jours sont passés se ferme. | Décidé (D-102) |
| R-87 | 15 jours (réglage `winback_after_days`) après son dernier RDV honoré, un client **avec compte** et sans RDV à venir reçoit une fois « Nous serions ravis de vous revoir » (une fois par visite, à partir de 8 h). Pas pour une fiche sans compte, un client désinscrit, bloqué en ligne ou supprimé. | Décidé (D-74, D-103) |
| R-88 | L'email de relance a un lien « Ne plus recevoir ces messages » (lien signé, page `/relance/desinscription`) ; désinscription, nouveau RDV ou lapin sont revérifiés à l'envoi. | Décidé (D-74) |
| R-89 | « Encaisser » (fiche RDV, tout RDV commencé qui n'est ni lapin ni annulé) envoie au terminal le montant de la fiche (le montant corrigé s'il y en a un, sinon le prix de la carte), signé d'un prénom (R-74). Refusé : montant à 0 € ou au-delà de 1 000 €, RDV déjà encaissé, terminal non relié ou injoignable. **Un seul encaissement en cours pour tout le salon** (un seul terminal) | Décidé (D-75, D-105) |
| R-90 | Le résultat du terminal ne compte qu'au succès : le montant réellement débité devient le montant encaissé du RDV (comme une correction, R-53) et le chiffre d'affaires du Bilan le lit, quel que soit le moyen de paiement ; l'entrée est au journal. Un refus ou une annulation ne change rien : le RDV reste à encaisser et on peut réessayer | Décidé (D-105) |
| R-91 | Le rappel de SumUp (webhook) est idempotent et ne se croit pas sur parole : l'adresse porte un secret, et le résultat est relu chez SumUp avant d'être enregistré. Un rappel en double, inconnu ou trop tôt est sans effet | Décidé (D-106) |
| R-92 | Un encaissement resté sans réponse plus de 5 minutes est clos « échoué » (terminal éteint, client parti) et le terminal est interrompu ; un paiement arrivé entre-temps l'emporte | Décidé (D-107) |
| R-93 | « Annuler sur le terminal » interrompt le terminal et clôt l'encaissement « annulé » ; si le client a déjà payé, le paiement est gardé et l'annulation est sans effet | Décidé (D-105) |

## Journal des décisions

Le 20 octobre 2026, 57 décisions ont fixé le cadre du projet ; le 21 octobre 2026, les demandes du salon ont ajouté D-63 à D-75, puis le lot 10 D-76 à D-82, le lot 11 D-83 à D-92 ; on ne revient sur l'une d'elles qu'en l'écrivant ici.

| N° | Décision | Raison |
| --- | --- | --- |
| D-01 | Un seul salon | Aucun second salon envisagé |
| D-02 | Site en français uniquement | Clientèle francophone |
| D-03 | Horaires communs : du mardi au samedi, 10 h–12 h et 13 h–19 h | Toute l'équipe travaille aux mêmes heures |
| D-04 | Une prestation occupe le coiffeur toute sa durée, coloration comprise | Pas de second client pendant une pose ; moteur plus simple |
| D-05 | Compte client complet, avec email et mot de passe | Un vrai compte, comme sur Planity ; connexion par code écartée |
| D-06 | Modification et annulation en ligne jusqu'à 48 h avant (remplacée par D-63) | Au-delà, le client appelle le salon |
| D-07 | Paiement au salon uniquement | Pas de paiement en ligne en V1 |
| D-08 | Chiffre d'affaires indicatif, sans comptabilité | La caisse existante reste l'outil d'encaissement |
| D-09 | Aucun import de fichier clients, même s'il était possible | Tous les clients se réinscrivent sur l'app Elegance |
| D-10 | Le gérant gère la carte | Carte évolutive |
| D-11 | Une tablette partagée au salon, une colonne par coiffeur | Organisation actuelle de l'équipe |
| D-12 | Maintenance assurée par vous, pour le compte du salon | Votre choix |
| D-13 | Lancement dès que possible | Aucune échéance imposée |
| D-14 | L'outil à remplacer est Planity, pas Treatwell | Constaté lors de la visite de la page du salon |
| D-15 | Pas de SMS en V1, emails uniquement | Votre choix ; le SMS reste possible plus tard |
| D-16 | Parcours de réservation calqué sur Planity, sur une seule page | Déjà connu des clients, éprouvé |
| D-17 | Apprentis : prestations « tarif formation » distinctes | Pratique actuelle sur Planity, plus simple qu'un prix par coiffeur |
| D-18 | Le salon réserve uniquement pour des clients qui ont un compte | Un client sans compte s'inscrit lui-même |
| D-19 | Coloration, tribal, défrisage et lissage brésilien : sur appel uniquement | Pratique actuelle sur Planity |
| D-20 | En cas de changement décidé par le salon, l'équipe appelle le client | Votre choix ; un email confirme ensuite |
| D-21 | Équipe de 4 : Orhan et Enes coiffeurs, Kaan et Taha apprentis | La seconde fiche de Kaan sur Planity est un doublon |
| D-22 | Taillage barbe à 12 € ; rasage complet retiré de la carte | Le rasage pourra être ajouté plus tard depuis l'app |
| D-23 | Uniquement sur rendez-vous | Pas de client sans RDV à gérer dans le planning |
| D-24 | Bascule dès que l'app est prête | Planity est sans engagement |
| D-25 | Nom de domaine visé : elegance-strasbourg.com | Votre choix ; disponibilité à vérifier avant achat |
| D-26 | Coloration à 15 € ; toutes les prestations ont un prix fixe | Votre choix ; plus de prestation sur devis |
| D-27 | Pas de réservation pour un proche : le RDV reste au nom du titulaire du compte | Éviter les fonctions peu utiles ; la note au salon suffit |
| D-28 | Site sombre | Votre choix |
| D-29 | L'animation d'intro est une référence de style, pas un élément du site | Le motion design est à créer à l'étape Design |
| D-30 | Pas de séance photo : le site utilise les 6 photos actuelles | Votre choix ; l'équipe est présentée sans portrait |
| D-31 | Logo manuscrit « Strasbourg » réservé au salon | Pas de fichier vectoriel ; à reconsidérer si l'enseigniste le fournit |
| D-32 | Direction artistique A « Lumière » ; police Sora ; aucun coin arrondi | Validée à l'étape Design |
| D-33 | Logo noir uniquement, toujours sur une plaque ivoire | Choix de l'étape Design ; la version ivoire n'est pas utilisée |
| D-34 | Paiement en ligne non développé en V1, même désactivé | D-07 ; les maquettes de paiement restent en archive |
| D-35 | Blocage après lapins décidé par le gérant, pas automatique | R-52 fait foi ; le design proposait une suspension automatique |
| D-36 | Soin du visage réservable en ligne, tribal sur appel | La carte de ce document fait foi ; la livraison design les avait inversés |
| D-37 | Pages ordinateur dérivées du mobile par Claude Code | Non dessinées ; conteneur de 1 200 px, grilles de 2 à 3 colonnes dès 1 024 px |
| D-38 | Avis développés mais masqués jusqu'à leur lancement | Prévu juste après la V1 ; aucun avis sur l'accueil |
| D-39 | Créneaux de 30 minutes en ligne, de 15 minutes au salon (modifie R-04) (remplacée par D-65) | Parcours familier de Planity ; le salon garde la finesse pour combler les trous laissés par un RDV de 45 min |
| D-40 | « Sans préférence » attribue le coiffeur qui a le moins de RDV ce jour-là ; à égalité, l'ordre d'affichage (précise R-20) | Répartition équitable de la charge, règle simple et prévisible |
| D-41 | Le salon est limité à 2 RDV à venir par client (R-25) mais peut réserver pour un client bloqué en ligne (R-52) (limite portée à 5 par D-66) | Le blocage ne vise que la réservation en ligne |
| D-42 | L'inscription ne bloque pas sur la vérification de l'email : l'email de confirmation en tient lieu (précise R-71) | Ne pas casser le parcours de réservation ; le mot de passe oublié passe par l'email |
| D-43 | La suppression d'un compte efface le nom, le téléphone et l'email, et garde les RDV passés sans identité (précise R-75) | Le chiffre d'affaires et le journal restent justes |
| D-44 | Le compte se crée à l'étape 4 du parcours (« Créer mon compte »), et non au clic sur « Confirmer » (précise R-71) | Parcours de la maquette ; un abandon laisse un compte sans RDV, sans conséquence |
| D-45 | « Mot de passe oublié » fait partie de la V1 : lien par email, réponse identique que l'adresse ait un compte ou non | Sans lui, un client qui oublie son mot de passe est bloqué (D-42) |
| D-46 | « Modifier » change le jour, l'heure et le coiffeur ; les prestations et leur prix restent ceux du RDV (précise R-30). Pour changer de prestation : annuler puis reprendre un RDV | Prix et durée figés (R-16) ; c'est le sens de l'email « Votre rendez-vous est déplacé » |
| D-47 | Un client peut déplacer son RDV vers un créneau dans moins de 48 h ; le RDV n'est plus modifiable en ligne ensuite (précise R-30, R-32) | Même souplesse qu'à la réservation ; R-32 se déduit de R-30 : modifiable si on est à 48 h ou plus du début |
| D-48 | Un client ne peut pas supprimer son compte tant qu'un RDV tombe dans les 48 h : « Contactez le salon ». Les RDV à plus de 48 h sont annulés avec la suppression (précise R-75) | On ne contourne pas la règle des 48 h en supprimant son compte |
| D-49 | Changer son email, changer son mot de passe ou supprimer son compte demande le mot de passe actuel (précise R-76) | Une session laissée ouverte ne suffit pas à prendre le compte |
| D-50 | La tablette du salon se connecte avec un compte « équipe » unique, session longue (précise R-72) | Plus sûr qu'un code partagé ; le compte se révoque si la tablette est perdue |
| D-51 | Quand le salon modifie un RDV, il change le jour, l'heure et le coiffeur ; pour une autre prestation, il annule et refait un RDV (précise R-33, comme D-46) | Prix et durée figés (R-16) |
| D-52 | Quand le salon modifie ou annule un RDV, l'email part automatiquement à la validation, avec un texte « suite à notre échange » (précise R-63) | Le client est toujours prévenu |
| D-53 | Le code gérant a 6 chiffres ; l'espace gérant se reverrouille 5 minutes après la dernière action ou en le quittant ; essais limités (précise R-73) | Sécurité des fonctions gérant sur une tablette partagée |
| D-54 | Un lapin se signale dès l'heure de début du RDV et se corrige ; un RDV terminé n'est ni modifié ni annulé par le salon ; le compteur de lapins se déduit des RDV « non venu » (précise R-33, R-51, R-52) | Pas de tâche programmée ; l'historique reste vrai |
| D-55 | L'équipe déclare une absence et prépare le traitement des RDV touchés depuis la tablette ; le code gérant n'est demandé que pour confirmer, donc avant tout email au client (précise R-42, R-43, R-73) | Un coiffeur malade ne doit pas attendre que le gérant déverrouille la tablette ; R-43 reste respectée |
| D-56 | Le traitement d'un RDV touché s'applique tout de suite au planning (déplacé ou annulé), mais ses emails restent en attente jusqu'à la confirmation du gérant, qui les envoie d'un coup ; l'équipe appelle les clients entre-temps (précise R-43, D-20, D-52) | Planning toujours vrai, créneaux libérés sans attendre, aucun message sans accord du gérant |
| D-57 | Fermeture exceptionnelle, nouveaux horaires, départ d'un coiffeur ou habilitation retirée qui touchent des RDV déjà pris suivent le même circuit que les absences : liste des RDV touchés, déplacement ou annulation avec excuses, confirmation du gérant avant email ; « confier à un collègue » n'est proposé que si un collègue habilité est libre (précise R-03, R-13, R-42) | Un seul circuit à apprendre et à tester ; aucun RDV oublié un jour de fermeture |
| D-58 | L'invitation à un avis (R-64) est un email avec un seul bouton « Laisser un avis », qui mène à la page d'avis externe du salon (lien dans les réglages, `review_url`). Pas de grille de notes dans l'email, aucun avis enregistré chez nous (précise R-64, D-38). Sans lien renseigné, aucune invitation ne part. Chaque email contient « Ne plus recevoir ces invitations » | Décidé par Florent le 20 octobre 2026 : une page externe ne reçoit pas la note choisie depuis un email ; le réglage évite d'envoyer un bouton qui ne mène nulle part |
| D-59 | Le rappel (R-61) est programmé à la réservation et à chaque déplacement, 72 h avant (réglage). Il ne part pas pour un RDV annulé ou déplacé depuis ; il attend tant que le RDV est « à traiter » (absence, fermeture…), puis part si le RDV tient encore (précise R-61, R-43) (délai porté à 24 h par D-64) | Le client ne reçoit jamais un rappel qui contredit ce que le salon lui a dit |
| D-60 | Le tableau de bord (« Bilan ») est une fonction gérant : il demande le code (précise R-73, R-53). Il montre aujourd'hui, la semaine (lundi au dimanche) ou le mois, avec des flèches « précédent / suivant » pour revenir en arrière, jamais dans le futur | Le chiffre d'affaires par membre ne se lit pas sur une tablette partagée ; flèches décidées par Florent le 20 octobre 2026 |
| D-61 | Au bilan, « Rendez-vous » compte les RDV non annulés de la période (honorés, en cours, à venir et lapins) ; le chiffre d'affaires compte seulement les honorés (R-51), au prix figé ou au montant corrigé (précise R-53) | Comme la maquette : la ligne d'un membre qui a un lapin le compte dans ses RDV, pas dans son chiffre |
| D-62 | Toute l'équipe peut corriger le montant encaissé d'un RDV, en choisissant son nom (R-74), dès qu'il a commencé et tant qu'il n'est ni lapin ni annulé. Montant de 0 à 1 000 €, ou retour au prix de la carte. Chaque correction est inscrite au journal avec l'ancien et le nouveau montant (précise R-53, R-54) | Le coiffeur qui encaisse note l'écart sur le moment, sans le code gérant ; décidé par Florent le 20 octobre 2026 |
| D-63 | Le client modifie ou annule son RDV en ligne jusqu'à **1 h** avant son début, au lieu de 48 h (modifie R-30, R-32, D-06 ; D-47 et D-48 suivent ce délai) | Demande du salon, 21 octobre 2026 ; la liste d'attente (D-73) reprendra les créneaux libérés tard |
| D-64 | Le rappel part **24 h** avant le RDV, au lieu de 72 h (modifie R-61, D-59) | Demande du salon, 21 octobre 2026 : avec un délai de 1 h, un rappel la veille suffit |
| D-65 | Un RDV commence **toujours à l'heure pile ou à la demie**, en ligne comme au salon, quelle que soit la prestation (modifie R-04, remplace D-39) | Demande du salon, 21 octobre 2026 ; après une prestation de 45 min, le quart d'heure suivant reste libre |
| D-66 | Un client a au plus **5** RDV à venir, au lieu de 2 (modifie R-25, D-41) | Demande du salon, 21 octobre 2026 : un parent réserve aussi pour ses enfants |
| D-67 | L'email d'avis mène au lien direct « Donner un avis » de Google et propose aussi « Prendre un nouveau RDV » (précise D-58) | Lien reçu le 21 octobre 2026 |
| D-68 | Au planning, les RDV pris en ligne et ceux pris par le salon ont deux couleurs ; le panneau de droite se replie pour agrandir le planning | Demandes du salon et de Florent, 21 octobre 2026 |
| D-69 | Icône de l'application : le « E » du logo, ivoire sur fond noir (exception à D-33). Le site s'installe sur l'écran d'accueil (tablette et téléphones) ; **pas d'App Store** pour l'instant | Florent, 21 octobre 2026 : publier un site emballé sur l'App Store est souvent refusé par Apple et coûte 99 $ par an |
| D-70 | **Codé (lot 10), précisé par D-76 à D-82.** Le salon réserve depuis la tablette pour une personne sans compte (nom et téléphone) ; le fichier clients du salon (export Treatwell) est importé en fiches sans compte, rattachées au compte si la personne s'inscrit ensuite (modifie R-26, D-09, D-18) | Florent, 21 octobre 2026 : fichier du salon lui-même ; le planning ne montre plus deux RDV au même nom |
| D-71 | **Codé (lot 11), précisé par D-83 à D-92.** Depuis la tablette, un RDV se répète : toutes les 1, 2, 3 ou 4 semaines, ou chaque mois (même date ou même jour, par exemple « 2e mardi »), jusqu'à une date ou un nombre de fois, 6 mois au plus. Les dates impossibles sont sautées et affichées ; la série échappe à la limite de R-25 ; on annule « ce RDV » ou « celui-ci et les suivants » ; un seul email liste les dates, chaque RDV a son rappel | Florent, 21 octobre 2026 : comme Planity, renouvelée au besoin |
| D-72 | **À coder (lot 12).** L'interface client devient une seule page de réservation, sans photos ni onglets, en motion design poussé, avec les horaires et un plan animés ; les pages légales restent, en liens discrets ; sur ordinateur, la même page centrée (remplace la vitrine du lot 6, D-30, D-37) | Le salon trouve la vitrine trop « site internet » ; maquettes à refaire avec Claude Design |
| D-73 | **Codé (lot 13), précisé par D-99 à D-104.** Liste d'attente : quand rien n'est libre, le client s'inscrit pour un ou plusieurs jours, un coiffeur ou « Sans préférence » et une plage (matin, après-midi, journée). Quand une place qui lui convient se libère, elle lui est gardée quelques minutes, une personne à la fois (D-100) | Demande du salon, 21 octobre 2026 |
| D-74 | **Codé (lot 13), précisé par D-103.** 15 jours après son dernier RDV honoré, un client avec compte et sans RDV à venir reçoit une fois « Nous serions ravis de vous revoir », avec un bouton pour réserver, « Reprendre le même RDV » et un lien de désinscription (délai en réglage) | Demande du salon, 21 octobre 2026 |
| D-75 | **Codé au lot 14 (D-105 à D-108).** La fiche RDV envoie le montant au terminal SumUp Solo (Cloud API SumUp) ; le résultat revient tout seul et devient le montant encaissé (précise D-08, R-53) | Le salon tape aujourd'hui le montant dans l'application SumUp ; le Solo accepte les paiements lancés à distance |
| D-76 | Une fiche sans compte, créée à la tablette, demande **prénom, nom et téléphone** ; l'email est facultatif. Un email ne sert qu'à une fiche ; un numéro déjà connu est signalé et la tablette propose de choisir la fiche existante, ou de créer quand même (une famille partage un numéro). L'équipe corrige une fiche sans compte en choisissant son nom (R-74) ; une fiche avec compte appartient à son titulaire (précise D-70, R-26) | Florent, 21 octobre 2026 |
| D-77 | Import du fichier du salon : seulement les clients **venus dans les 3 dernières années** et qui ont **un téléphone ou un email** ; seuls le prénom, le nom, le téléphone, l'email, le nombre de visites et la date de la dernière visite sont repris (rien d'autre : ni genre, ni dépense, ni adresse). L'import se fait par une commande lancée par Florent, rejouable sans doublon, sur la base locale d'abord ; en ligne seulement avec son accord (précise D-70) | Florent, 21 octobre 2026 : 1 968 fiches sur 3 313 lignes de l'export Treatwell du 25 août 2026 ; le salon prend aujourd'hui ses RDV sur Planity |
| D-78 | **Aucun email groupé** à l'import. Le salon prévient ses clients par ses réseaux, et le **premier email** reçu par une fiche importée dit d'où vient l'adresse (fichier clients du salon) et comment la faire effacer ; la page Confidentialité le dit aussi | Florent, 21 octobre 2026 ; plafond de Brevo gratuit (300 emails par jour) ; à faire valider avec les textes légaux |
| D-79 | Une personne qui **s'inscrit avec l'email d'une fiche sans compte** retrouve cette fiche (rattachement automatique, avec ses RDV et son historique). Le même téléphone seul ne rattache rien : les fiches au même numéro se signalent sur la fiche client, et le **gérant les fusionne** (code gérant) ; la fiche qui a un compte reste toujours, deux comptes ne se fusionnent pas | Florent, 21 octobre 2026 : le site ne vérifie pas l'email à l'inscription (D-42), risque de prise de fiche jugé faible |
| D-80 | « **Pour qui ?** » : en ligne comme à la tablette, un champ facultatif donne le prénom du proche (40 caractères au plus). Au planning, le proche en premier, le titulaire en petit (« Inès · Lina M. ») ; la fiche RDV, Mes rendez-vous et les emails le rappellent (précise R-28) | Florent, 21 octobre 2026 : le client en ligne garde cette possibilité |
| D-81 | Une fiche sans compte qui a un email reçoit les mêmes emails qu'un client inscrit (confirmation, rappel, modification, annulation, invitation à un avis) ; « Gérer mon rendez-vous » y devient « **Créer mon compte** », et les changements passent par le téléphone du salon. Sans email, rien ne part et la tablette le dit | Florent, 21 octobre 2026 |
| D-82 | Planning : la case du RDV est **entièrement remplie** de sa couleur (or en ligne, ivoire au salon, texte noir) ; un RDV honoré garde sa couleur assombrie, un lapin redevient sombre au contour brique. Replié, le résumé du jour ne prend plus de colonne : seule une **languette avec la flèche** dépasse du bord droit (précise D-68) | Retour de Florent sur le lot 9, 21 octobre 2026 |
| D-83 | Une série se crée **depuis la fiche d'un RDV** du planning (panneau de droite), bouton « **Répéter ce RDV** » : ce RDV devient le premier de la série. Toute l'équipe le peut, en choisissant son nom (R-74), sans code gérant ; jamais en ligne (précise D-71) | Florent, 22 octobre 2026 : comme l'application de son ami, tout se fait en touchant le RDV |
| D-84 | Coiffeur d'une série : un coiffeur précis (par défaut celui du RDV) ou « Sans préférence ». Avec un coiffeur précis, une date où il est pris ou absent est **sautée** ; avec « Sans préférence », chaque date prend un coiffeur libre, le moins chargé ce jour-là (D-40). Chaque date sautée est listée avec sa raison et un raccourci « Réserver à une autre heure » (précise D-71) | Florent, 22 octobre 2026 |
| D-85 | « Chaque mois » : **même date** (un RDV le 31 saute les mois sans 31) ou **même jour** (« 2e mardi », du 1er au 4e ; « dernier mardi » quand le premier RDV est le dernier mardi du mois) (précise D-71) | Florent, 22 octobre 2026 |
| D-86 | Fin d'une série : « **N rendez-vous en tout** », celui de départ compris, ou « **jusqu'au** » une date ; jamais plus de **6 mois** après le premier RDV. Avec N, une date impossible est remplacée par la suivante de la règle, pour obtenir N RDV dans la limite des 6 mois (précise D-71) | Florent, 22 octobre 2026 : la documentation de Planity ne dit pas comment il compte ; le client qui veut 6 coupes en attend 6 |
| D-87 | Les RDV d'une série **ne comptent pas** dans la limite de RDV à venir (R-25) : ni pour la série elle-même, ni quand le client réserve ensuite en ligne, ni quand le salon ajoute un RDV simple. La limite vaut pour les RDV hors série (précise R-25, D-71) | Florent, 22 octobre 2026 : un client qui a une série de 12 RDV doit pouvoir réserver seul en ligne |
| D-88 | Annulation par le salon : « **Ce RDV** », « **Celui-ci et les suivants** » et, quand des RDV à venir de la série le précèdent, « **Tous les RDV à venir de la série** » (comme Planity ; les RDV passés restent). En ligne, le client annule ou modifie chaque RDV un par un, jusqu'à 1 h avant (R-30) (précise D-71) | Florent, 22 octobre 2026 ; troisième choix repris de Planity (« Toute la série ») |
| D-89 | Un RDV de la série se **déplace seul** ; pas de déplacement groupé : pour changer l'heure ou le coiffeur de la suite, on annule les suivants et on répète le RDV voulu (précise D-71) | Florent, 22 octobre 2026 |
| D-90 | « **Prolonger la série** », dans la fiche d'un RDV de la série : la même règle reprend après la dernière date prévue, pour 6 mois au plus, avec les mêmes choix de fin. La fiche du dernier RDV dit « Dernier RDV de la série » ; pas d'alerte automatique (précise D-71) | Florent, 22 octobre 2026 : « renouvelée au besoin » |
| D-91 | Emails d'une série : **un seul email** à la création, qui liste les dates réservées (pas les sautées), avec « Ajouter à l'agenda » pour toutes les dates ; un email qui liste les nouvelles dates à la prolongation ; un seul email qui liste les dates annulées pour une annulation groupée ; un RDV annulé ou déplacé seul reçoit l'email habituel ; un rappel 24 h avant chaque RDV (R-61). Sans email sur la fiche, rien ne part (D-81) (précise R-60, D-71) | Florent, 22 octobre 2026 |
| D-92 | Affichage : symbole **↻** sur la case du planning ; la fiche RDV dit « RDV répété · toutes les 2 semaines · 3e sur 8 » et liste les dates à venir de la série ; Mes rendez-vous ajoute « RDV répété ». Chaque RDV garde le **prix de la carte du jour** où il est posé (création ou prolongation, R-16) | Florent, 22 octobre 2026 |
| D-93 | Polices de l'interface client (lot 12) : **Cormorant Garamond** (titres, chiffres, prix) et **Manrope** (texte) sur la page client, la réservation, Mes rendez-vous, les pages légales et **tous les emails aux clients**. La **tablette garde Sora** (précise D-72) | Florent, 22 octobre 2026 : maquettes « Lot12- », piste 1 de « Lot12-Polices » |
| D-94 | La page client `/` ne montre que l'arrivée (logo, « Bien plus qu'une coupe. », Réserver, Appeler), les **horaires** et l'**accès** ; **pas de section équipe** (les prénoms apparaissent à l'étape « Avec qui ? »). Sur cette page, le logo officiel est **ivoire, sans plaque**, allumé comme un néon. `/prestations` et `/salon` redirigent vers `/` (précise D-72) | Florent, 22 octobre 2026 : « comme dans les maquettes » |
| D-95 | Connexion du client par **email seul** et mot de passe (pas « Email ou téléphone » des maquettes) | Florent, 22 octobre 2026 : un même numéro peut appartenir à deux fiches (D-79) |
| D-96 | La bande de jours de la réservation couvre **tout l'horizon de réservation** (R-06, 42 jours aujourd'hui) et défile ; les jours fermés et complets y restent, marqués « fermé » et « complet » | Florent, 22 octobre 2026 |
| D-97 | Les **formes rondes** des maquettes sont gardées (repère de l'en-tête, pastilles, anneau de la confirmation, épingle du plan) : exception à « aucun coin arrondi » pour ces seuls détails | Florent, 22 octobre 2026 : « ça ne me dérange plus » |
| D-98 | Infos d'accès affichées : parking de l'Hôtel de ville, bus 60 et C3 arrêt Mairie, piste cyclable, boutons Google Maps et Waze ; plan dessiné d'après OpenStreetMap (mention obligatoire). Récapitulatif : « Total · sur place · carte ou espèces » | Florent, 22 octobre 2026 : « c'est juste », « c'est exact » |
| D-99 | **Tranché le 22 octobre 2026 (lot 13).** Les maquettes de la liste d'attente l'emportent sur D-73 : la place est gardée pour une seule personne à la fois (« Pas cette fois », « Quitter la liste »), plusieurs jours au choix ; l'email « ravis de vous revoir » ne propose **pas** les 3 horaires de la maquette (un seul bouton, D-74) | Florent, 22 octobre 2026 |
| D-100 | Une place libérée est **offerte à une seule personne**, la première inscrite, et **gardée 15 minutes** (réglage `waitlist_hold_minutes`), au plus jusqu'à une heure avant le RDV (R-06). Pendant ce temps elle n'est pas réservable en ligne par les autres (le salon peut la prendre) : le moteur de disponibilité lit les offres en cours (`holds`). Passé le délai, ou après « Pas cette fois », elle passe à la suivante | Florent, 22 octobre 2026 (écart D-99) |
| D-101 | Inscription : ni jour passé ni hors horizon, 14 jours et 5 inscriptions en cours au plus (anti-abus, limites techniques non réglables), refusée si une place convient déjà. La liste est liée au compte : un client non connecté est invité à se connecter | Lot 13 |
| D-102 | Le passage à la suivante à la minute près demande un déclencheur fréquent : les actions qui libèrent une place et les réponses aux offres réveillent la liste tout de suite (`wakeWaitlist`, après la réponse) ; le cron la fait aussi avancer. **Avec Vercel Hobby (cron une fois par jour), une offre sans réponse n'expire pour les autres qu'au prochain réveil** : le passage du cron à `* * * * *` (Vercel Pro, action 5 de la reprise) la rend exacte | Florent, 22 octobre 2026 |
| D-103 | La relance n'est envoyée qu'aux **comptes clients**, pas aux fiches sans compte ni importées (pas de consentement à ces emails) ; une fois par visite ; délai en réglage (`winback_after_days`) | Florent, 22 octobre 2026 |
| D-104 | La confidentialité cite la liste d'attente (données, email, retrait) et la relance (délais lus dans les réglages) | Lot 13 |
| D-105 | Encaissement au terminal SumUp Solo (Cloud API) depuis la fiche RDV, par toute l'équipe en choisissant son nom. Montant envoyé : celui de la fiche. Pas de pourboire, pas de bouton « espèces » (une correction manuelle du montant reste possible), pas de remboursement (à faire dans l'application SumUp). Un seul terminal. Le bilan additionne les montants sans distinguer le moyen de paiement. Code marchand et identifiant du terminal en base (réglages), clé d'API dans l'environnement | Réponses de Florent, 22 octobre 2026 |
| D-106 | SumUp ne signe pas ses rappels : l'adresse du rappel contient un secret (`SUMUP_WEBHOOK_SECRET`, sinon dérivé de `APP_SECRET`) et le contenu de l'appel ne sert qu'à retrouver l'encaissement ; l'état et le montant sont relus chez SumUp. La tablette relit aussi le résultat toutes les 2,5 s pendant l'attente : le paiement est enregistré même si le rappel n'arrive pas | Lot 14 |
| D-107 | Délai d'abandon d'un encaissement : 5 minutes (limite technique, pas un réglage) | Lot 14 |
| D-108 | Le terminal se relie dans l'espace gérant (« Terminal d'encaissement ») : code marchand du compte SumUp et code d'appairage affiché sur le terminal (Connexions, API, valable 5 minutes). Le client SumUp est écrit d'après la documentation et **pas encore essayé sur un vrai compte** (clé d'API en attente) | Lot 14 |

## Documents liés

Ce document fait foi ; les deux autres en découlent et le citent.

| Document | Pour | Contenu |
| --- | --- | --- |
| [Brief Claude Design](https://claude.ai/code/artifact/747fde4f-5264-49db-92f4-6742d4d6a7e4) | Étape Design | Identité, direction artistique, motion design, écrans, photos, livrables |
| [Transmission Claude Code](https://claude.ai/code/artifact/f9e017a6-e8b8-458f-9105-9bad2e795bbe) | Étape Code | Stack, principes d'architecture, modèle de données, lots, CLAUDE.md |
| [Canevas Claude Design](https://claude.ai/code/artifact/89f78eff-5469-48ae-9996-f775496f1782) | Étape Code | Maquettes validées, prototype de réservation, fiche des animations |

Une décision qui change en cours de route s'inscrit d'abord ici, au journal, puis dans le document concerné.

## Prochaine étape

L'étape Design est terminée : le projet est prêt pour Claude Code. Restent à fournir avant la mise en ligne : les textes légaux, à faire valider par un professionnel, et le nom de domaine définitif.
