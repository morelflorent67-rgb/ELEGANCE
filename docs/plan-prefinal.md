# Plan d'action « préfinal » : lots 17 à 20

Demandes du salon transmises par Florent le 16 novembre 2026, avant la mise en ligne. Analyse faite avec Florent dans une conversation dédiée ; ce document sert à l'**exécution** dans une nouvelle conversation, un lot à la fois (règle « une conversation par lot » : mettre à jour `docs/reprise.md` à chaque fin de lot).

Règles du projet inchangées (voir `CLAUDE.md`) : une règle R-xx = au moins un test ; réglages en base, jamais en dur ; interface en français ; aucune nouvelle dépendance sans justification dans `docs/decisions.md` ; vérifier sur mobile (et tablette pour le salon) avant de dire qu'un lot est fini ; une migration ne s'applique à Supabase qu'avec l'accord de Florent.

Numérotation : dernière règle **R-95**, dernière décision **D-110**. Les nouvelles commencent à **R-96** et **D-111**, à écrire dans `docs/dossier-projet.md`.

## Ce qui a été décidé avec Florent

| Sujet | Décision |
| --- | --- |
| « Sur appel » | Devient « Sur devis » partout (client et carte du gérant). Le bouton lance toujours l'appel. |
| « Appeler » (accueil) | Le texte devient « Contacter » ; le bouton lance **toujours l'appel** (pas de choix SMS ou WhatsApp). |
| Bandeau d'avis | « Plus de 1000 avis » + 5 étoiles, joliment présenté, sur l'accueil. |
| Fidélité | Carte de fidélité : 100 points = une coupe offerte. Points **selon la prestation**, réglables par le gérant. |
| 50 points pour un avis Google | **Abandonné.** Google interdit toute contrepartie à un avis (points, cadeau, roulette, tirage), et rien ne permet de vérifier qu'un client a publié un avis (un clic sur le lien ne prouve rien, la liste des avis ne donne qu'un nom d'affichage). Le risque : suppression des avis ou pénalité sur la fiche. L'invitation à l'avis par email (R-64) reste, sans récompense. Rien ne le remplace pour l'instant. |
| Fond animé | L'éclipse bleue animée derrière l'arrivée de l'accueil, qui s'atténue au défilement ; fond bleu nuit sur tout le côté client ; une version figée et discrète sur les autres pages client. Tablette inchangée. |
| Couleur dorée | Côté client, le doré est remplacé par une couleur cohérente avec l'éclipse (voir lot 18). Tablette inchangée. |

## Questions à poser à Florent au début de l'exécution

Ne rien supposer (règle du projet). Les poser au début du lot concerné.

1. **Lot 17 :** quelle est la **note Google réelle** du salon (par exemple 4,8) et le nombre exact d'avis ? Les étoiles affichées doivent correspondre à la vraie note (pas de 5 étoiles pleines si la note est de 4,7). Quelle adresse ouvrir sur « Voir les avis » (fiche Google Maps) ?
2. **Lot 17 :** pour une prestation « sur devis », garde-t-on le prix affiché, ou passe-t-on à « à partir de 15 € », ou plus de prix du tout ?
3. **Lot 18 :** les emails envoyés aux clients (confirmation, rappel…) passent-ils aussi au bleu, ou gardent-ils le doré ? (`src/modules/mail/layout.ts`)
4. **Lot 19 :** la coupe offerte peut-elle servir sur une « coupe & barbe » (le client paie la différence, 10 €) ? Sur une coupe « tarif formation » ?
5. **Lot 19 :** les points expirent-ils (par exemple 12 mois sans visite) ou jamais ?
6. **Lot 19 :** compte-t-on les RDV déjà honorés avant la mise en ligne (reprise de l'historique), ou tout le monde démarre à zéro ?
7. **Lot 19 :** barème proposé ci-dessous, à confirmer avec le salon.

## Lot 17 : textes de l'accueil et bandeau d'avis

Petit lot, sans risque, à faire en premier.

**« Sur devis »**
- `src/app/(client)/reservation/_components/service-step.tsx` : l'étiquette « Sur appel » devient « Sur devis » ; l'`aria-label` devient « Demander un devis pour {prestation} » (le lien reste `tel:`). Mettre à jour le commentaire (R-17).
- `src/app/equipe/(app)/gerant/carte/carte-manager.tsx` : « Sur appel » devient « Sur devis ».
- `docs/dossier-projet.md` : reformuler R-17 et le paragraphe « Carte des prestations » (les 4 prestations « sur devis »).
- Chercher « Sur appel » dans `tests/` et les emails : mettre à jour les textes attendus.
- Suivre la réponse à la question 2 pour l'affichage du prix.

**« Contacter »**
- `src/app/(client)/page.tsx`, fonction `Arrival` : le texte « Appeler » devient « Contacter » (icône téléphone et `SALON.phoneHref` inchangés). Barre fixe `BookingBar` : `aria-label` « Contacter le salon ». Les autres pages (« Appeler le salon » dans la réservation et le compte) ne changent pas.
- Mettre à jour les tests e2e qui cherchent le bouton « Appeler » de l'accueil.

**Bandeau « Plus de 1000 avis »**
- Données en base, pas en dur : ajouter à `salon_settings` `review_count` (entier, nul = bandeau masqué), `review_rating` (numérique, une décimale, entre 1 et 5) et `reviews_page_url` (adresse de la fiche, même contrôle que `review_url`). Migration avec `pnpm db:generate`, seed, et champs modifiables dans les réglages du gérant (là où se règle déjà `review_url`), avec `updateTag` du cache vitrine.
- Les charger dans `src/modules/vitrine/load.ts` (`getVitrine`).
- Composant `src/components/client/reviews-badge.tsx`, placé dans `page.tsx` entre `<Arrival />` et `<HoursLive />` :
  - 5 étoiles en SVG, remplies au prorata de la note (dernière étoile partielle par masque) ;
  - en grand, en Cormorant Garamond (`font-display`) : « Plus de 1000 avis » (texte généré depuis `review_count` : arrondi à la centaine inférieure, « Plus de 1 000 avis ») ;
  - en dessous, petites capitales : « 4,9 sur 5 · Google » ;
  - lien discret « Voir les avis » vers `reviews_page_url` (nouvel onglet, `rel="noopener"`).
  - Animation à l'entrée dans l'écran (système `data-inview` existant dans `client.css`) : les étoiles s'allument l'une après l'autre (60 ms d'écart), avec un léger halo de la couleur d'accent du lot 18 ; état final comme style de base, `prefers-reduced-motion` respecté.
- **Ne pas** ajouter de note `aggregateRating` au JSON-LD : Google refuse les avis « auto-déclarés » d'une entreprise sur sa propre page.
- Tests : unitaire du texte (« Plus de 1 000 avis » à partir de 1 043, masqué si nul) ; e2e : le bandeau apparaît sur l'accueil mobile avec la note de la base.

## Lot 18 : nouvelle direction artistique côté client

Références : `docs/design/maquette-accueil-bleu.webp` (la maquette du client) et `docs/design/elegance-fond-anime.html` (le fond animé WebGL créé par Florent, sans bibliothèque).

**Principe : ne rien changer pour la tablette.** Tout passe par des variables redéfinies sous la classe `.client` (posée par `src/app/(client)/layout.tsx`), pas dans `src/app/theme.css` global.

**1. Couleurs (D-111)**
- Fond : `#0a0908` (noir chaud) devient le bleu nuit de l'éclipse `#000d1d` (fond mesuré sur l'image). Endroits en dur à remplacer : `layout.tsx` (`bg-[#0a0908]` deux fois), barre fixe `bg-[rgb(10_9_8_/_0.94)]` dans `page.tsx`, `--color-bar`, `--color-scrim`, panneaux (`panel.tsx`, `sheet.tsx`). Faire une recherche de `#0a0908`, `10 9 8`, `11 10 9` dans `src/app/(client)` et `src/components/client`. Les surfaces surélevées (`charcoal`, `graphite`) passent à des bleus nuit un peu plus clairs (par exemple `#04172e`, `#0a1f3a`), à valider à l'écran.
- Doré : sous `.client`, `--color-gold` devient un **bleu lumineux** pris dans le halo (proposition `#3d8bff`, avec un reflet cyan `#5fd8ff` à la place de `--color-gold-shine`). Remplacer aussi les valeurs dorées écrites en dur (`184 147 90`, `b8935a`) dans : `access.tsx` (anneau et épingle du plan, ombre), `hours-live.tsx` (jour encadré), `ui.tsx` (`Mark`), `client.css` (`.m-gold`…), `appointments-view.tsx`, `reservation/confirmation/page.tsx` (confirmation « dorée » : reflet cyan), `booking-flow.tsx`, `limit-screen.tsx`, `staff-step.tsx`. Le plan d'accès (tracé `m-gold`, épingle) passe en bleu lumineux avec un halo, comme l'arc de l'éclipse.
- Bouton principal : garder le crème, avec le léger dégradé de la maquette (`#f7ead6` vers `#e9d7bc`).
- Vérifier le contraste (texte ivoire sur `#000d1d`, bleu d'accent jamais utilisé pour du texte courant ; focus visible).
- Montrer à Florent une capture avant / après de l'accueil, des horaires, du plan et de la confirmation de réservation avant de finir le lot.

**2. Le fond animé : composant `src/components/client/eclipse-background.tsx`** (`"use client"`)
- Reprendre le script WebGL du fichier HTML tel quel (shader, cadrage téléphone / écran large), en composant React : `useEffect` qui crée le contexte, nettoie tout au démontage (`cancelAnimationFrame`, `loseContext`).
- **Accueil :** `<canvas>` en `position: fixed` derrière la colonne, présent seulement sur `/`. La partie arrivée de la page a un fond transparent pour laisser voir l'éclipse ; les sections suivantes (avis, horaires, accès) gardent le fond bleu nuit opaque, qui recouvre l'éclipse en montant.
- **Au défilement :** l'opacité du canvas passe de 1 à 0 entre 0 et environ 600 px de défilement (écouteur `scroll` passif, mis à jour dans `requestAnimationFrame`), avec un léger zoom ou une légère montée pour donner de la profondeur. Quand l'opacité est à 0, **arrêter la boucle d'animation** (batterie), la relancer en remontant.
- **Coordination avec l'ouverture existante** (logo néon, `OpeningController`) : l'éclipse apparaît en fondu sous le logo, sans voler la vedette au néon ; si l'ouverture est sautée, l'éclipse s'affiche directement.
- **Autres pages client** (réservation, compte, connexion, pages légales) : une **image figée** de l'éclipse, discrète (opacité réduite), pour garder la lisibilité et la batterie. Le plus simple : exporter une image `.webp` légère de l'éclipse (mode `?static` du fichier HTML) dans `public/`, en fond CSS fixe. Pas de WebGL hors de l'accueil.
- **Ordinateur et tablette** (colonne de 430 px centrée) : l'éclipse remplace le fond vivant actuel (`LivingBackground` : lignes, hexagones) autour de la colonne sur l'accueil ; sur les autres pages, l'image figée. Retirer ce qui ne sert plus dans `layout.tsx` et `client.css`.

**3. Améliorations du script de Florent à intégrer**
- `breathMin` à 0 fait disparaître complètement le halo à chaque respiration : l'écran paraît vide une seconde. Proposer `0.25` (le halo reste un peu visible) et le montrer à Florent.
- Densité de pixels limitée à 1,5 sur téléphone (au lieu de 1,75) ; vérifier la fluidité sur un téléphone moyen.
- Gérer la perte du contexte WebGL (`webglcontextlost` / `webglcontextrestored`) et le repli : sans WebGL, le dégradé CSS du canvas suffit.
- Garder `prefers-reduced-motion` (image figée) et la pause quand l'onglet est caché (déjà dans le script).
- Le canvas est décoratif : `aria-hidden`, aucun effet sur le LCP. Vérifier avec `pnpm measure:vitrine` que FCP, LCP et CLS ne se dégradent pas par rapport au lot 12.

**Tests et vérification :** les tests e2e existants de l'accueil passent toujours ; vérifier à l'écran sur mobile (375 px), tablette et ordinateur, en mouvement réduit, et que la tablette du salon (`/equipe`) n'a pas changé de couleur.

## Lot 19 : carte de fidélité

Le plus gros lot : modèle de données, règles, tablette et espace client.

**Barème proposé (à confirmer, question 7)**, réglable par prestation dans la carte du gérant :

| Prestation | Points |
| --- | --- |
| Coupe homme | 10 |
| Coupe & taille de barbe | 10 |
| Soin du visage à la vapeur | 10 |
| Taillage barbe | 5 |
| Coupe, tarif formation | 5 |
| Coupe & taille de barbe, tarif formation | 5 |
| Prestations sur devis (coloration, tribal, défrisage, lissage) | 10 |

Seuil : **100 points = 1 coupe offerte** (environ 10 passages).

**Règles à écrire (R-96 et suivantes), chacune avec ses tests**
- R-96 : les points sont gagnés quand un RDV passe à « honoré » (`appointment.status = 'honored'`) ; total = somme des points de ses prestations (`appointment_item`). Rien pour un lapin ou une annulation. Seulement si le RDV est lié à un client (`customer`) ; l'encaissement hors RDV (lot 15) ne donne pas de points.
- R-97 : si un RDV honoré change de statut (correction du salon), ses points sont retirés (écriture inverse, jamais de suppression).
- R-98 : le client utilise sa coupe offerte **au salon**, sur la fiche RDV de la tablette : bouton « Utiliser la coupe offerte » visible dès 100 points, confirmation obligatoire, débit de 100 points, auteur choisi (comme les autres actions du salon, R-72). Le montant à encaisser baisse du prix de la coupe homme (lu en base). Suivre la réponse à la question 4 pour les autres prestations.
- R-99 : un RDV ne peut recevoir qu'une coupe offerte ; l'annulation de l'utilisation (erreur) recrédite les points.
- R-100 : le solde ne descend jamais sous 0 (contrainte en base).
- R-101 (selon la question 5) : expiration des points.
- Le gérant peut corriger un solde à la main (ajout ou retrait, motif obligatoire, journal d'audit), depuis la fiche client.

**Modèle de données** (migration `pnpm db:generate`, plus SQL écrit à la main pour les contraintes)
- `service.loyalty_points` (entier ≥ 0, défaut 0) ; valeurs du barème dans le seed (rejouable sans écraser).
- `salon_settings.loyalty_enabled` (booléen), `loyalty_reward_threshold` (défaut 100) : réglages en base.
- Table `loyalty_entry` : `id`, `customer_id`, `appointment_id` (nullable), `kind` (`earn`, `reversal`, `redeem`, `redeem_cancel`, `adjust`), `points` (signé), `reason`, `actor`, `created_at`. Index unique partiel pour qu'un RDV ne gagne qu'une fois (`kind = 'earn'`) et ne soit utilisé qu'une fois (`kind = 'redeem'`). Le solde = somme des points ; pas de colonne de solde à tenir à jour.
- Anonymisation d'un compte supprimé (R-75) : les entrées restent (comptabilité), rattachées au client anonymisé.

**Module `src/modules/loyalty`** (reçoit la base en paramètre, refus en `DomainError` avec code stable)
- `earnForAppointment(db, appointmentId)` et `reverseForAppointment`, appelés **dans la même transaction** que le passage à « honoré » : trouver tous les chemins qui écrivent ce statut (`src/modules/appointments/status.ts`, `src/modules/payments/pay.ts`, actions de la tablette) et y brancher l'appel.
- `redeemReward`, `cancelRedeem`, `adjustBalance`, `getLoyaltyCard(customerId)` (solde, progression, historique).
- Chaque action écrit son entrée au journal d'audit.
- Encaissement (lot 14) et Bilan : la coupe offerte réduit le montant à encaisser (`adjusted_amount_cents`) ; vérifier que le Bilan compte la remise correctement (un test).

**Côté client (avec les couleurs du lot 18)**
- Dans « Mon compte » (ou un onglet « Fidélité » du panneau) : une carte avec 10 cases qui se remplissent (une case = 10 points ; une case à moitié pour 5), le solde « 70 / 100 points », « Encore 3 passages avant votre coupe offerte » ; à 100 : « Votre coupe offerte vous attend : dites-le au salon lors de votre prochain passage ». Historique simple (date, prestation, points).
- Ligne courte dans l'email de confirmation de passage ou de réservation, « Ce RDV vous rapportera 10 points », seulement si Florent le veut (optionnel, à proposer).
- Phrase de présentation sur l'accueil (sous le bandeau d'avis ou dans la réservation) : « 10 passages = une coupe offerte », texte construit depuis la base.
- Pages légales : ajouter un paragraphe « Programme de fidélité » aux conditions (`src/modules/vitrine/legal.ts`) : règles, expiration, aucune valeur monétaire, le salon peut arrêter le programme.

**Côté tablette**
- Fiche RDV : solde du client et bouton « Utiliser la coupe offerte ».
- Fiche client (gérant) : solde, historique, correction manuelle.
- Carte du gérant : champ « Points de fidélité » par prestation.
- Réglages du gérant : activer ou désactiver le programme.

**Tests :** unitaires (calcul des points, solde, progression) ; intégration sur Postgres réel (gain à « honoré », retrait au changement de statut, double gain impossible, utilisation unique, solde jamais négatif, transaction annulée = pas de points) ; e2e mobile (le client voit sa carte et sa progression) et tablette (utiliser la coupe offerte, montant réduit).

## Lot 20 : recette d'ensemble

- `pnpm test:all` vert (tous les lots).
- Parcours complet sur mobile et tablette : accueil (éclipse, avis, Contacter), réservation (Sur devis, couleurs), compte (fidélité), tablette (fiche RDV, coupe offerte, encaissement, Bilan inchangé ailleurs).
- `pnpm measure:vitrine` comparé au lot 12.
- Mettre à jour `docs/reprise.md`, `docs/dossier-projet.md` (R-96 et suivantes, D-111 et suivantes), `docs/decisions.md`, `CLAUDE.md` (section « Fidélité (lot 19) » et « Fond animé (lot 18) »).
- Lister pour Florent les migrations à appliquer à Supabase (avec son accord) avant la bascule du lot 8.

## Message de démarrage pour la nouvelle conversation

> Lis `CLAUDE.md`, puis `docs/reprise.md` et `docs/plan-prefinal.md`. On exécute le **lot 17** du plan (puis on enchaînera les lots suivants dans de nouvelles conversations). Pose-moi d'abord les questions du plan qui concernent ce lot, puis travaille par étapes, avec les tests, et vérifie sur mobile avant de dire que c'est fini. Ne touche pas à Supabase sans mon accord.

Pour les lots suivants, remplacer « lot 17 » par « lot 18 », « lot 19 » puis « lot 20 ».
