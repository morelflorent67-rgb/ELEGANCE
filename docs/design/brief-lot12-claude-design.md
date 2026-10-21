# Lot 12 : maquettes de la nouvelle page de réservation (prompt pour Claude Design)

Le salon trouve la vitrine trop « site internet » (D-72). La nouvelle interface client tient en **une seule page de
réservation**, sans photos ni onglets, avec un motion design poussé. Florent prépare les maquettes dans Claude Design
avec le prompt ci-dessous ; Claude Code code ensuite d'après ces maquettes (lot 12).

Version du 21 octobre 2026 (lot 10) : un seul prompt complet, à coller en une fois, qui fait travailler Claude Design
**par étapes** en s'arrêtant après chacune. Il tient compte des décisions du lot 9 (délai 1 h, créneaux à l'heure et
à la demie, 5 RDV à venir, lien d'avis Google) et du lot 10 (« Pour qui ? » en ligne).

## Méthode pour Florent

1. **Reprendre le même projet Claude Design**, celui du canevas actuel (lien en haut de `docs/design/README.md`).
   C'est lui qui contient le système de design (couleurs, police, logo, composants `DS-*`, emails) : un nouveau
   projet repartirait de zéro et les écrans ne se ressembleraient plus.
2. **La discussion** : si votre ancienne discussion de ce projet est encore ouverte, continuez-la, Claude Design se
   souvient alors de vos choix. Si elle est devenue très longue ou lente, ouvrez une nouvelle discussion **dans le
   même projet** : les écrans et le système de design restent, c'est l'historique de la conversation qui repart à
   zéro, et le prompt ci-dessous redonne tout le contexte nécessaire.
3. Coller **le prompt complet** ci-dessous, en une fois. Claude Design fait l'étape 1 puis s'arrête.
4. Regarder le résultat **en vue téléphone**. Corriger avec des phrases simples (« plus sobre », « plus lent »,
   « le bouton plus haut »…). Quand l'étape vous plaît, écrire : **« Étape validée, passe à la suivante. »**
5. Ne pas modifier les écrans de la tablette ni les emails existants : ils restent en service.
6. À la fin (étape 7, la fiche des animations), me donner le **nom des nouvelles pages du canevas** dans le message
   de démarrage du lot 12 : je les lirai directement.

## Le prompt complet

```text
Bonjour. Nouvelle direction pour l'interface client d'Elegance Strasbourg (salon de coiffure homme et barbe,
Schiltigheim). Lis tout ce message, puis travaille ÉTAPE PAR ÉTAPE : fais seulement l'étape 1, montre-la, et
attends que j'écrive « Étape validée, passe à la suivante » avant de continuer. Ne modifie aucun écran existant du
canevas (tablette, emails) : crée de nouvelles pages dont le nom commence par « Lot12- ».

LE BESOIN
Le salon trouve son site actuel trop « site internet ». Il ne veut plus de vitrine (pas de pages Accueil,
Prestations, Le salon, pas de galerie) : il veut UNE SEULE PAGE DE RÉSERVATION, pensée d'abord pour le téléphone
(390 × 844), ultra simple, sans photos, sans menu ni onglets, mais avec un motion design très poussé, digne d'une
marque de luxe. Le client arrive, comprend tout de suite, et réserve en quelques touchers.

LE STYLE (garde le système de design existant du canevas, direction « Lumière »)
- Fond noir #0b0a09, ivoire #efe9dd, or #b8935a pour les détails seulement, lignes de lumière blanches de 1 px.
- Police Sora (300, 400, 500). Aucun coin arrondi. Une seule action ivoire par écran.
- Logo officiel noir, toujours sur sa plaque ivoire. Motifs signature : les trois barres du E, la ligne de lumière
  qui se trace, le nœud hexagonal.
- Reprends le langage de la vidéo de lancement : le logo qui s'allume comme un néon, révélé par deux lignes de
  lumière.
- Les archives « Atelier » et « Lumiere-Mur » du canevas ne sont pas à utiliser.

LES RÈGLES DU SALON À RESPECTER DANS LES ÉCRANS
- Départs à l'heure pile et à la demie seulement (10:00, 10:30, 11:00…).
- Le client peut modifier ou annuler en ligne jusqu'à une heure avant son RDV ; après, il appelle le salon.
- 5 RDV à venir au plus par client.
- Un compte est nécessaire pour réserver (prénom, nom, téléphone, email, mot de passe, acceptation des conditions).
- Le client peut réserver pour un proche : un champ facultatif « Pour qui ? (prénom) », le RDV reste à son nom.
- Note au salon facultative, 300 caractères au plus.
- Coiffeurs et apprentis : on ne mélange pas les deux dans un même RDV ; certaines prestations sont « sur appel ».

CONTRAINTES TECHNIQUES DES ANIMATIONS
Uniquement transformations, opacité, tracés SVG et masques (pas de vidéo de fond, pas d'image lourde). Fluide à
60 images/s sur un téléphone moyen. Toujours une version calme quand le téléphone demande de réduire les animations.
Toute animation d'ouverture se saute au premier geste. Sur ordinateur : la même page, centrée dans une colonne de la
largeur d'un téléphone, avec le fond qui vit autour (lignes de lumière lentes).

LES ÉTAPES

Étape 1 : la page et son ouverture
Écran d'arrivée : le logo qui s'allume (moins d'1 seconde, rejoué une fois par visite au plus), une phrase courte,
un grand bouton « Réserver », un bouton secondaire « Appeler », un lien discret « Mes rendez-vous ».
En descendant, seulement trois informations animées :
1. Horaires : la semaine dessinée en lignes de lumière, le jour actuel mis en valeur, « Ouvert maintenant » ou
   « Ouvre mardi à 10 h » qui s'écrit en direct ; une fermeture exceptionnelle à venir s'annonce ici.
2. Accès : un plan stylisé dessiné au trait (pas de carte Google), le trajet qui se trace jusqu'au salon,
   l'adresse et un bouton « Itinéraire ».
3. L'équipe : seulement les prénoms (pas de portraits), en typographie animée.
Tout en bas, en petit : Mentions légales, Confidentialité, Conditions.
Montre l'écran d'arrivée, la page déroulée en entier, et la version ordinateur.

Étape 2 : le parcours de réservation
Au toucher de « Réserver », la page se transforme sans changer d'adresse : le parcours s'ouvre en plein écran avec
une transition courte et spectaculaire (une ligne de lumière qui balaie l'écran, moins de 600 ms). Les étapes
s'enchaînent dans le même écran ; chaque choix fait se range en résumé en haut, et on le touche pour revenir :
1. Prestations : par groupes (Coiffeurs / Apprentis), prix et durée ; on peut en ajouter plusieurs ; une catégorie
   se grise quand l'autre est choisie ; les prestations « sur appel » ont un bouton d'appel.
2. Coiffeur : « Sans préférence » en premier, puis les prénoms.
3. Jour et heure : une bande de jours qui défile, puis les créneaux (à l'heure et à la demie) regroupés matin /
   après-midi, qui apparaissent en cascade. Montre aussi le chargement des créneaux et un jour complet.
4. Identification : connexion, ou création du compte (prénom, nom, téléphone, email, mot de passe, conditions).
5. Récapitulatif : le champ facultatif « Pour qui ? (prénom) », la note au salon, puis « Confirmer ».
6. Confirmation : une célébration sobre et dorée (le seul endroit où l'or brille), « Ajouter à l'agenda »,
   « Modifiable jusqu'à une heure avant ».
Montre chaque étape sur téléphone, et les messages d'erreur (créneau pris entre-temps, limite de 5 RDV atteinte).

Étape 3 : « Mes rendez-vous » et le compte
« Mes rendez-vous » s'ouvre en panneau qui glisse depuis le bas (pas une nouvelle page) : les RDV à venir en
cartes (avec « Pour qui » s'il y en a un), « Modifier », « Annuler » (jusqu'à une heure avant ; après, « Appeler le
salon »), « Reprendre le même RDV » pour les RDV passés, et l'accès à « Mes informations » (coordonnées, mot de
passe, suppression du compte). Montre aussi la feuille de confirmation d'annulation, et l'écran de connexion
quand le client n'est pas connecté.

Étape 4 : la liste d'attente
Quand aucun créneau n'est libre (jour complet, ou coiffeur choisi indisponible), l'écran des créneaux propose
« Me prévenir si une place se libère » : le client choisit la plage (matin, après-midi, journée) et confirme. Il
reçoit un email dès qu'une place se libère ; le premier qui réserve l'obtient. Dessine cet état vide élégant, la
petite feuille d'inscription, et la ligne « Liste d'attente » dans « Mes rendez-vous » (avec « Me retirer »).

Étape 5 : deux emails
Dans le même gabarit que les emails existants du canevas (fond noir, logo sur plaque ivoire, Sora) :
- « Une place s'est libérée » : le jour, l'heure, le coiffeur, un seul grand bouton « Réserver cette place ».
- « Nous serions ravis de vous revoir » (15 jours après la dernière visite, sans RDV à venir) : objet court et
  chaleureux, un grand bouton « Réserver », un lien « Reprendre le même RDV », et en bas « Ne plus recevoir ces
  emails ».

Étape 6 : le prototype
Relie les écrans en prototype cliquable sur téléphone : arrivée → Réserver → les étapes → confirmation, et
« Mes rendez-vous ».

Étape 7 : la fiche des animations
Fais la fiche technique de toutes les animations, pour le développeur : pour chacune, le déclencheur (arrivée,
défilement, toucher), les éléments animés, les propriétés (transformation, opacité, tracé SVG, masque), la durée en
millisecondes, la courbe (cubic-bezier), le décalage de cascade, et la version « animations réduites ». Indique aussi
l'ordre de la séquence d'ouverture image par image. Termine par la liste des pages « Lot12- » créées.

Commence par l'étape 1.
```
