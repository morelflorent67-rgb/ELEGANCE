# Lot 12 : maquettes de la nouvelle page de réservation (prompts pour Claude Design)

Le salon trouve la vitrine trop « site internet » (D-72). La nouvelle interface client tient en **une seule page de
réservation**, sans photos ni onglets, avec un motion design poussé. Florent prépare les maquettes dans Claude Design
avec les prompts ci-dessous, **dans le canevas existant** (lien dans `README.md`) pour garder le système de design.
Claude Code code ensuite d'après ces maquettes (lot 12).

Mode d'emploi pour Florent :
1. Ouvrir le canevas Claude Design du projet (lien en haut de `docs/design/README.md`).
2. Coller le **prompt 1** tel quel, attendre le résultat, le regarder sur la vue téléphone.
3. Coller ensuite les prompts 2 à 5, un par un, en corrigeant au fil de l'eau (« plus sobre », « plus lent »…).
4. Quand tout plaît, coller le **prompt 6** (la fiche des animations) : c'est elle que Claude Code suivra.

---

## Prompt 1 : la page et son ouverture

```text
Nouvelle direction pour l'interface client d'Elegance Strasbourg (salon de coiffure homme et barbe, Schiltigheim).
Le salon ne veut plus de site vitrine : il veut UNE SEULE PAGE DE RÉSERVATION, pensée pour le téléphone (390 × 844),
ultra simple, sans photos, sans menu ni onglets, mais avec un motion design très poussé, digne d'une marque de luxe.

Garde le système de design existant du canevas : direction « Lumière », fond noir #0b0a09, ivoire #efe9dd,
or #b8935a pour les détails seulement, lignes de lumière blanches, police Sora (300, 400, 500), aucun coin arrondi.
Reprends le langage de la vidéo de lancement : le logo qui s'allume comme un néon, révélé par deux lignes de lumière.

Écran d'arrivée (au-dessus de la ligne de flottaison) :
- le logo qui s'allume (moins d'1 seconde, sautable au premier geste, rejouée une fois par visite au plus) ;
- une phrase courte, puis un grand bouton « Réserver » et un bouton secondaire « Appeler » ;
- un lien discret « Mes rendez-vous » (pour les clients déjà inscrits).

Sous le bouton, en descendant, seulement trois informations animées :
1. Horaires : la semaine dessinée en lignes de lumière, le jour actuel mis en valeur, « Ouvert maintenant » ou
   « Ouvre mardi à 10 h » qui s'écrit en direct.
2. Accès : un plan stylisé dessiné au trait (pas de carte Google), le trajet qui se trace jusqu'au salon,
   l'adresse, et un bouton « Itinéraire ».
3. L'équipe : seulement les prénoms (pas de portraits), en typographie animée.
Tout en bas, en petit : Mentions légales, Confidentialité, Conditions.

Contraintes techniques à respecter dans les animations : uniquement transformations, opacité, tracés SVG et masques
(pas de vidéo de fond, pas d'image lourde) ; fluide à 60 images/s sur un téléphone moyen ; une version calme quand
le téléphone demande de réduire les animations. Sur ordinateur, la même page centrée dans une colonne de téléphone,
avec le fond qui vit autour (lignes de lumière lentes).
Montre l'écran d'arrivée, puis la page déroulée en entier.
```

## Prompt 2 : le parcours de réservation

```text
Au toucher de « Réserver », la page se transforme sans changer d'adresse : le parcours s'ouvre par-dessus, en
plein écran, avec une transition spectaculaire mais courte (ligne de lumière qui balaie l'écran, moins de 600 ms).
Les étapes s'enchaînent dans le même écran, chaque choix fait se range en résumé en haut (on peut le toucher pour
revenir) :
1. Prestations : liste par groupes (Coiffeurs / Apprentis), prix et durée ; on peut en ajouter plusieurs à la suite ;
   les prestations « sur appel » ont un bouton d'appel ; une catégorie se grise si l'autre est choisie.
2. Coiffeur : « Sans préférence » en premier, puis les prénoms.
3. Jour et heure : une bande de jours qui défile, puis les créneaux à l'heure pile et à la demie seulement
   (10:00, 10:30…), regroupés matin / après-midi. Les créneaux apparaissent en cascade.
4. Identification : connexion ou création de compte (prénom, nom, téléphone, email, mot de passe, conditions).
5. Récapitulatif avec note au salon (300 caractères), puis « Confirmer ».
6. Confirmation : une animation de célébration sobre et dorée (le seul endroit où l'or brille), « Ajouter à
   l'agenda », et le rappel « Modifiable jusqu'à une heure avant ».
Montre chaque étape sur téléphone, et l'état de chargement des créneaux.
```

## Prompt 3 : « Mes rendez-vous » et le compte

```text
« Mes rendez-vous » s'ouvre en panneau qui glisse depuis le bas (pas une nouvelle page) : les RDV à venir en cartes,
avec « Modifier », « Annuler » (jusqu'à une heure avant), « Reprendre le même RDV » pour les RDV passés, et l'accès
à « Mes informations » (coordonnées, mot de passe, suppression du compte). Même style, mêmes transitions que le
parcours. Montre aussi la feuille de confirmation d'annulation.
```

## Prompt 4 : la liste d'attente (lot 13)

```text
Quand aucun créneau n'est libre (jour complet, ou coiffeur choisi indisponible), l'écran des créneaux propose
« Me prévenir si une place se libère » : le client choisit la plage (matin, après-midi, journée) et confirme. Il
reçoit un email dès qu'un créneau se libère ; le premier qui réserve l'obtient. Dessine cet état vide élégant,
la petite feuille d'inscription, et la ligne « Liste d'attente » dans « Mes rendez-vous » (avec « Me retirer »).
Dessine aussi l'email « Une place s'est libérée » dans le style des emails existants du canevas.
```

## Prompt 5 : l'email « Nous serions ravis de vous revoir » (lot 13)

```text
Dessine l'email envoyé 15 jours après la dernière visite d'un client qui n'a pas repris rendez-vous :
objet court et chaleureux, un seul grand bouton « Réserver », un lien « Reprendre le même RDV », et en bas
« Ne plus recevoir ces emails ». Même gabarit que les emails existants du canevas (fond noir, logo, Sora).
```

## Prompt 6 : la fiche des animations

```text
Fais la fiche technique de toutes les animations de cette nouvelle page, pour le développeur : pour chacune,
le déclencheur (arrivée, défilement, toucher), les éléments animés, les propriétés (transformation, opacité,
tracé SVG, masque), la durée en millisecondes, la courbe (cubic-bezier), le décalage de cascade, et la version
« animations réduites ». Indique aussi l'ordre de la séquence d'ouverture image par image.
```
