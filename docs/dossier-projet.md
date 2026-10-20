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
| R-04 | En ligne, un créneau commence toutes les 30 minutes, comme sur Planity ; le salon, lui, réserve toutes les 15 minutes (D-39). Un RDV finit au plus tard à 19 h et ne chevauche jamais la pause. | Décidé |
| R-05 | Le dernier départ possible découle de la durée, sur la grille du moment ; la règle « dernier créneau à 18 h 30 » disparaît. En ligne, une prestation de 45 min part au plus tard à 18 h. | Décidé |
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
| R-25 | Un client a au plus 2 RDV à venir en même temps. | Décidé |
| R-26 | Le salon réserve par téléphone ou au comptoir, uniquement pour un client qui a déjà un compte. | Décidé |
| R-27 | Un client sans compte s'inscrit lui-même avant toute réservation ; le salon n'est pas soumis aux délais de R-06. | Décidé |
| R-28 | Un RDV est toujours au nom du titulaire du compte, même pris pour quelqu'un d'autre ; la note au salon peut le préciser. | Décidé |
| R-29 | Le client peut laisser une note au salon, de 300 caractères au plus. | Décidé |

### Modification et annulation

| N° | Règle | Statut |
| --- | --- | --- |
| R-30 | Le client modifie ou annule son RDV en ligne jusqu'à 48 h avant son début. | Décidé |
| R-31 | Passé ce délai, l'app affiche « Contactez le salon » avec un bouton d'appel. | Décidé |
| R-32 | Un RDV pris moins de 48 h avant ne se modifie pas en ligne : le client appelle le salon. | Décidé |
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
| R-61 | Un rappel par email part 72 h avant, pour les RDV pris plus tôt, avec la date limite de modification. | Décidé |
| R-62 | Pas de SMS en V1 : tous les messages partent par email ; le SMS pourra s'ajouter plus tard. | Décidé |
| R-63 | Quand le salon modifie ou annule un RDV, il appelle le client ; un email confirme le changement. | Décidé |
| R-64 | Le lendemain d'un RDV honoré, un email invite le client à laisser un avis. | Décidé |

### Comptes et accès

| N° | Règle | Statut |
| --- | --- | --- |
| R-70 | Le compte client demande prénom, nom, téléphone, email et mot de passe. | Décidé |
| R-71 | Le compte se crée au moment de confirmer la première réservation, avec acceptation des conditions. | Décidé |
| R-72 | La tablette reste connectée en mode équipe : planning, RDV et fiches clients. | Décidé |
| R-73 | Les fonctions gérant demandent un code : tarifs, équipe, horaires, chiffre d'affaires, suppressions. | Décidé |
| R-74 | Sur la tablette, qui modifie ou annule un RDV choisit son nom ; l'action est inscrite au journal. | Décidé |
| R-75 | Le gérant peut supprimer une fiche client, et un client peut supprimer son compte. | Décidé |
| R-76 | L'espace client regroupe ses RDV et ses informations. | Décidé |

## Journal des décisions

Le 20 octobre 2026, 43 décisions ont fixé le cadre du projet ; on ne revient sur l'une d'elles qu'en l'écrivant ici.

| N° | Décision | Raison |
| --- | --- | --- |
| D-01 | Un seul salon | Aucun second salon envisagé |
| D-02 | Site en français uniquement | Clientèle francophone |
| D-03 | Horaires communs : du mardi au samedi, 10 h–12 h et 13 h–19 h | Toute l'équipe travaille aux mêmes heures |
| D-04 | Une prestation occupe le coiffeur toute sa durée, coloration comprise | Pas de second client pendant une pose ; moteur plus simple |
| D-05 | Compte client complet, avec email et mot de passe | Un vrai compte, comme sur Planity ; connexion par code écartée |
| D-06 | Modification et annulation en ligne jusqu'à 48 h avant | Au-delà, le client appelle le salon |
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
| D-39 | Créneaux de 30 minutes en ligne, de 15 minutes au salon (modifie R-04) | Parcours familier de Planity ; le salon garde la finesse pour combler les trous laissés par un RDV de 45 min |
| D-40 | « Sans préférence » attribue le coiffeur qui a le moins de RDV ce jour-là ; à égalité, l'ordre d'affichage (précise R-20) | Répartition équitable de la charge, règle simple et prévisible |
| D-41 | Le salon est limité à 2 RDV à venir par client (R-25) mais peut réserver pour un client bloqué en ligne (R-52) | Le blocage ne vise que la réservation en ligne |
| D-42 | L'inscription ne bloque pas sur la vérification de l'email : l'email de confirmation en tient lieu (précise R-71) | Ne pas casser le parcours de réservation ; le mot de passe oublié passe par l'email |
| D-43 | La suppression d'un compte efface le nom, le téléphone et l'email, et garde les RDV passés sans identité (précise R-75) | Le chiffre d'affaires et le journal restent justes |

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
