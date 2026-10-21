# Reprise du projet : où on en est

Ce document permet de reprendre le travail dans une **nouvelle conversation**, sans rien perdre. Il se met à jour à la fin de chaque lot.
À jour au **21 octobre 2026** (soir). Les lots 0 à 7 sont validés. Le lot 8 (recette et bascule) est **en pause** : le salon a demandé des changements (lots 9 à 14, section « Demandes du salon »), et Florent ne retourne le voir, et ne met en ligne, qu'une fois tout terminé. **Lot 9 fait** (en attente de validation par Florent).

## Avancement

| Lot | Contenu | État |
| --- | --- | --- |
| 0 | Socle : projet, dépôt, base, tests, déploiement | Validé |
| 1 | Moteur de créneaux, schéma, contrainte anti-chevauchement | Validé |
| 2 | Réservation client, comptes, email de confirmation | Validé |
| 3 | Espace client : Mes RDV, modifier ou annuler jusqu'à 48 h, « Reprendre le même RDV », Mes informations, suppression du compte | Validé |
| 4 | Planning tablette : 4 colonnes, fiche RDV, réservation par le salon, lapins, code gérant, choix de l'auteur | Validé |
| 5 | Gestion : carte et habilitations, équipe, horaires, fermetures, absences et RDV touchés | Validé |
| 6 | Vitrine : accueil, prestations, le salon, pages légales, référencement local, animations, version ordinateur | Validé |
| 7 | Emails (rappel, invitation à un avis) et tableau de bord, correction du montant encaissé | Validé (emails réels reçus) |
| 8 | Recette et bascule | En pause jusqu'à la fin du lot 14. Fait : lenteur de la tablette corrigée (pooler en mode session), clignotement de la vitrine corrigé, surveillance des emails dans `/api/health`, visuels de lancement faits ; le reste du plan attend les réponses de Florent (voir « Lot 8 ») |
| 9 | Réglages et petites demandes du salon : délai 1 h, rappel 24 h, créneaux à l'heure et à la demie partout, 5 RDV à venir, lien d'avis Google, couleurs en ligne/salon, résumé du planning repliable, icône E et application installable | Fait, à valider par Florent |
| 10 | Clients sans compte : le salon réserve pour une personne sans compte, import du fichier clients (CSV) | À faire |
| 11 | RDV répétés depuis la tablette | À faire |
| 12 | Nouvelle interface client : une seule page de réservation, motion design poussé | À faire (maquettes Claude Design d'abord) |
| 13 | Liste d'attente, email « Nous serions ravis de vous revoir » | À faire |
| 14 | Encaissement SumUp Solo depuis la fiche RDV | À faire |

Tests au 21 octobre 2026 (fin du lot 9) : **729 Vitest** (218 unitaires et 511 d'intégration sur Postgres réel) et **292 parcours Playwright** (231 exécutés ; 61 réservés à la tablette ou au mobile sont sautés selon le profil), plus `pnpm smoke:auth` et `pnpm smoke:db`. Aucun ne doit casser. Lint, typecheck et build verts. Vérification visuelle du lot 9 par captures à 1194 × 834 (planning déplié et replié, icône) et 390 × 844 (Mes RDV, « moins d'une heure »), pas sur appareil réel.

Pour mémoire, au 21 octobre 2026 avant le lot 9 : **719 Vitest** (213 unitaires et 506 d'intégration sur Postgres réel) et **288 parcours Playwright** (228 exécutés ; 60 réservés à la tablette ou au mobile sont sautés selon le profil), plus deux contrôles manuels sur les services en ligne : `pnpm smoke:auth` et `pnpm smoke:db`. Aucun ne doit casser. Lint, typecheck et build verts. Vérification visuelle du 21 octobre par captures à 390 × 844 (prestations, le salon) et 1194 × 834 (planning, prestations), pas sur appareil réel.

Pour mémoire, à la fin du lot 7 : **699 Vitest** (197 unitaires et 502 d'intégration sur Postgres réel) et **284 parcours Playwright** (224 exécutés ; 60 réservés à la tablette ou au mobile sont sautés selon le profil). Aucun ne doit casser. Lint, typecheck et build verts. Vérification visuelle du lot 7 par captures à 1194 × 834 et 390 × 844 (Bilan, fiche RDV, emails), pas sur appareil réel.

## Accès

- Dépôt : https://github.com/morelflorent67-rgb/ELEGANCE (public, branche `main`). Je pousse sans redemander ; l'intégration continue doit rester verte.  Règle à retenir : quand un lot ajoute une migration, l'appliquer à Supabase (avec l'accord de Florent) **avant** de pousser le code qui la lit.
- Site de test : https://elegance-git-main-elegance13.vercel.app (protection de déploiement désactivée volontairement, `noindex`).
- Supabase de test : Postgres 17, région UE. Les clés sont dans `.env.local` (jamais commité). `pnpm db:migrate:remote` et `pnpm db:seed:remote` modifient la base en ligne : annoncer ce qu'on fait.
- Florent est non technicien : français simple, étapes numérotées, noms exacts des boutons. Ne jamais lui demander de coller un secret dans le chat. Je ne saisis pas de secrets dans les formulaires de sites web : je le guide.

## Ce qui existe

- `src/modules/availability` (créneaux, fonctions pures), `booking` (`createAppointment`, `rescheduleAppointment`, `cancelAppointment` : seuls chemins d'écriture d'un RDV), `catalog` (lecture de la carte ; `manage.ts` : gestion par le gérant), `customers`, `auth`, `mail`, `calendar`, `appointments`, `audit` (`recordAudit`), `vitrine` (lecture en cache, horaires, textes légaux, données structurées), `security`, `staff` (accès équipe ; `manage.ts` : gestion de l'équipe), `schedule` (horaires et fermetures), `absences` (absences, RDV à traiter, emails retenus), `planning`, `dashboard` (bilan : périodes, totaux, lapins récents).
- Tablette, lot 7 : `/equipe/gerant/bilan` (le tableau de bord, derrière le code gérant). Public, lot 7 : `/avis/desinscription` (lien signé de l'email d'avis).
- Vitrine (lot 6) : `/`, `/prestations`, `/salon`, `/mentions-legales`, `/confidentialite`, `/conditions`, `/robots.txt`, `/sitemap.xml`.
- Pages clients : `/reservation`, `/reservation/confirmation`, `/connexion`, `/inscription`, `/mot-de-passe-oublie`, `/mot-de-passe/nouveau`, `/compte/rendez-vous`, `/compte/informations`, `/compte/supprime`.
- Tablette : `/equipe` (planning), `/equipe/reserver`, `/equipe/clients/[id]`, `/equipe/absences`, `/equipe/gerant` (code gérant) et, derrière le code, `/equipe/gerant/carte`, `/equipe/gerant/equipe`, `/equipe/gerant/horaires`, `/equipe/gerant/clients/[id]`.
- Toutes les décisions techniques sont dans `docs/decisions.md`. Les règles et décisions métier sont dans `docs/dossier-projet.md` (R-xx, D-01 à D-57).
- Maquettes : canevas Claude Design (lien dans `docs/design/README.md`, lisible avec l'outil Artifact, action `read`, puis `path` pour un fichier). Pour le lot 7, lire dans le canevas : `Email-Rappel`, `Email-Avis`, `Email-Modification`, `Email-Annulation`, `Tablette-Dashboard`, et les `DS-*` pour les composants. « Atelier » et « Lumiere-Mur » sont des archives : ne pas les utiliser.

## Actions en attente (à demander à Florent, jamais sans son accord)

1. ~~Migration 0006 sur Supabase~~ : **appliquée le 20 octobre 2026** avec l'accord de Florent (colonne `email_outbox.held_for_manager` vérifiée), puis code poussé.
2. ~~Compte équipe de la tablette~~ et ~~code gérant~~ : faits le 20 octobre 2026. Pour les changer : `pnpm staff:account`, `pnpm manager:set-code` (base locale) ou `pnpm manager:set-code:remote` (base Supabase, modifie la base en ligne). Florent tape lui-même ses secrets dans le terminal, jamais dans le chat.
3. **Brevo** (compte ouvert) : créer une clé d'API, faire vérifier une adresse d'expéditeur, puis ajouter `BREVO_API_KEY`, `EMAIL_FROM` et `CRON_SECRET` dans Vercel (Settings, Environment Variables). Tant que ce n'est pas fait, les emails restent en file en production (confirmations, **rappels**, **invitations à un avis**, annulations, déplacements, et ceux que le gérant libère). Les rappels et invitations partent au passage du cron : en Hobby, une fois par jour (7 h UTC) ; avec Vercel Pro, `* * * * *`.
4. **Supabase** : Authentication, URL Configuration (Site URL et adresse de redirection `…/auth/callback`), puis SMTP Brevo pour le mot de passe oublié.
5. **Vercel Pro** : à prendre avec le client juste avant la livraison (c'est lui qui paie). Passer alors le cron de `vercel.json` à `* * * * *`. D'ici là, l'envoi immédiat des emails couvre le cas normal. **Région : faite le 21 octobre 2026** (`"regions": ["dub1"]`, Dublin, à côté de la base Supabase `eu-west-1`), possible dès l'offre Hobby. Avant, les fonctions tournaient à Washington (`iad1`). Mesures depuis la France : `/api/health` 0,25 s → 0,10 s ; `/reservation` 0,36 s → 0,16 s. La vraie cause de la lenteur était ailleurs (pooler en mode transaction, voir « PRIORITÉ 1 », corrigée le 21 octobre). **Reste à faire** : l'avis de Florent sur la vraie tablette.
6. Les clés Supabase et le mot de passe de la base, passés dans le chat, sont laissés tels quels par décision de Florent.
7. Domaine définitif : à poser dans `SITE_URL` (Vercel) ; ensuite `ALLOW_INDEXING=true` ouvre l'indexation (robots, plan du site et données structurées suivent tout seuls).
8. **Textes légaux** (lot 6, Florent les complétera quand il aura les informations) : rédigés d'après ce que le site fait réellement, mais **à faire valider par un professionnel** avant l'ouverture. À fournir par le salon (champs entre crochets visibles sur les pages ; `placeholdersOf` dans `src/modules/vitrine/legal.ts` les liste) : forme juridique, capital, SIRET, directeur de la publication, adresse de l'hébergeur (Vercel), email de contact, durée de conservation d'un compte inactif, modalités de réponse aux droits RGPD, conditions de suspension et responsabilité. L'invitation à donner son avis est citée automatiquement dans la confidentialité dès que `review_url` est renseigné.
9. **Vérifier la vitrine sur un vrai téléphone** (site de test) : accueil (ouverture animée, menu), prestations, le salon (galerie), pages légales. Vérifiée par captures à 390 × 844, 1194 × 834 et 1440 × 900, pas sur appareil réel.
10. **Vérifier sur la vraie tablette** (iPad, paysage ; tout a été vérifié par captures à 1194 × 834 et 390 × 844, pas sur l'appareil réel) : planning, réservation, espace gérant (carte, équipe, horaires) et absences.
11. ~~Migration 0007 sur Supabase~~ : **appliquée le 21 octobre 2026** avec l'accord de Florent (colonnes `customer.review_opt_out` et `salon_settings.review_url` vérifiées), puis code poussé. Le lien d'avis provisoire est remplacé par le lien direct dans la migration 0008 (lot 9).
11 bis. **Brevo et Supabase branchés le 21 octobre 2026** : clé d'API, expéditeur (adresse Gmail de Florent, provisoire), `BREVO_API_KEY`, `EMAIL_FROM` et `CRON_SECRET` dans Vercel ; un email de confirmation réel est parti en 3 secondes. SMTP Brevo actif dans Supabase (« mot de passe oublié » reçu). Piège rencontré : Brevo refusait Supabase avec `525 5.7.1 Unauthorized IP address` tant que le blocage des adresses IP n'était pas désactivé (Brevo, Sécurité). Modèles d'emails de Supabase en français dans `docs/supabase-emails/` (à coller dans Authentication, Emails, Templates ; le logo y pointe vers l'adresse du site de test : **à changer avec le nom de domaine**). À la fin : remplacer l'expéditeur par une adresse du domaine et authentifier le domaine dans Brevo (DKIM, DMARC), puis mettre à jour Site URL et Redirect URLs de Supabase.
12. **Après Brevo** : essayer un vrai rappel et une vraie invitation à soi-même (aucun email réel n'a été envoyé pendant le lot : les tests utilisent un faux transport et les modèles ont été vérifiés par captures). Vérifier l'affichage dans Gmail, Apple Mail et Outlook, mode sombre compris.
13. ~~Migration 0008 sur Supabase~~ : **appliquée le 21 octobre 2026** avec l'accord de Florent ; réglages vérifiés en ligne (grille 30 min partout, délai 1 h, 5 RDV, rappel 24 h, lien d'avis Google direct).

## Demandes du salon (21 octobre 2026) : lots 9 à 14

Florent a transmis en vrac les demandes du salon ; l'analyse et ses réponses ont fixé **D-63 à D-75** (`dossier-projet.md`). Ordre retenu : d'abord les réglages rapides, puis ce qui change le modèle de données (clients sans compte), puis la nouvelle page client, sur laquelle se greffe la liste d'attente.

**Lot 9 (fait le 21 octobre 2026)**
- Délai de modification et d'annulation en ligne : **1 h** (D-63 ; R-30, R-32, D-47, D-48 suivent). Les textes disent « jusqu'à une heure avant », « moins d'une heure » (`hoursPhrase`, `lessThanHours`).
- Rappel **24 h** avant (D-64). Attention : tant que le cron est quotidien (Vercel Hobby, 7 h UTC), un rappel de la veille peut partir le matin même, voire être abandonné si le RDV est passé : **Vercel Pro (cron chaque minute) est indispensable à l'ouverture**.
- Départs **à l'heure pile et à la demie seulement**, en ligne comme sur la tablette (D-65 ; `salon_slot_step_minutes = 30`). Horaires, absences et durées restent au quart d'heure.
- **5 RDV à venir** par client (D-66).
- Email d'avis : **lien direct Google** (`https://g.page/r/CV_HUH2O58tMEAE/review`, dans `review_url`) et bouton « Prendre un nouveau RDV » en plus de « Reprendre le même RDV » (D-67).
- Planning : liseré **or = en ligne**, **ivoire = salon**, légende dans l'en-tête ; le **résumé du jour se replie** (bouton flèche), le choix reste sur la tablette (D-68).
- **Icône « E »** (les trois barres du E du logo ; seule, elle rappelle un peu un menu « ≡ » : à faire valider par Florent, une variante reste possible) ivoire sur noir (iPad, iPhone, Android) et **application installable** : deux manifestes, la tablette s'ouvre sur le planning (D-69). Pas d'App Store. Pour Florent : sur l'iPad, **supprimer l'ancienne icône « P »** puis, depuis Safari sur `/equipe`, Partager, « Sur l'écran d'accueil ».
- Migration `0008_salon_requests_oct21` : valeurs par défaut et mise à jour de la ligne de réglages (y compris `review_url`). **Appliquée sur Supabase le 21 octobre 2026.**

**Lot 10 : clients sans compte (D-70)**
- Sur la **tablette seulement** : réserver pour une personne sans compte (nom, téléphone ; email facultatif ?). Le planning affiche son nom : fini les deux RDV au même nom.
- Import du **fichier CSV** du salon (Planity ou Treatwell, Florent ne sait plus) en fiches sans compte, rattachées au compte si la personne s'inscrit ensuite avec le même email ou téléphone. **Le dépôt est public : le fichier ne doit jamais y entrer** (script qui lit un chemin hors du dépôt, ou dossier ignoré par git). Premier email aux clients importés : dire d'où vient leur adresse (RGPD).
- **Question ouverte (à poser en début de lot 10)** : Florent a répondu « uniquement tablette » à « la tablette doit-elle pouvoir réserver pour quelqu'un sans compte ? ». Reste à savoir si le **client en ligne** garde la possibilité d'indiquer « Pour qui ? (prénom) » quand il réserve pour un proche (demande initiale du salon) ou si tout passe par la tablette.
- Autres questions : champs obligatoires d'une fiche sans compte ; emails (confirmation, rappel) à une fiche sans email ; colonnes du CSV (Florent doit montrer l'en-tête, sans données).

**Lot 11 : RDV répétés (D-71)** : toutes les 1, 2, 3 ou 4 semaines, ou chaque mois (même date ou même rang de jour : « flexible »), jusqu'à une date ou N fois, 6 mois au plus ; dates impossibles sautées et listées ; hors limite de R-25 ; « ce RDV » ou « celui-ci et les suivants » ; un email unique qui liste les dates ; un rappel par RDV.

**Lot 12 : nouvelle interface client (D-72)** : une seule page de réservation, pas de photos ni d'onglets, horaires et plan animés, légal en liens discrets, ordinateur = même page centrée. **Maquettes d'abord** : Florent les fait dans Claude Design avec les prompts de `docs/design/brief-lot12-claude-design.md`. Pas de projet de référence. Motion design « ultra poussé » : une bibliothèque d'animation pourra se justifier (`decisions.md`, aujourd'hui « pas de GSAP »). La vitrine du lot 6 (accueil, prestations, salon, galerie) disparaît ; garder les pages légales, le référencement local (données structurées) et `/compte`.

**Lot 13 : liste d'attente et relance (D-73, D-74)** : inscription jour + coiffeur ou « Sans préférence » + plage (matin, après-midi, journée) ; email à tous les inscrits concernés dès qu'un créneau se libère, le premier qui réserve l'obtient. Relance « Nous serions ravis de vous revoir » 15 jours après le dernier RDV honoré, sans RDV à venir, une fois par visite, désinscription (réglage). Mettre à jour la confidentialité.

**Lot 14 : SumUp (D-75)** : le terminal est un **SumUp Solo** (« SumUp One » est l'abonnement) : la Cloud API SumUp permet d'envoyer le montant au terminal depuis la fiche RDV, le résultat revient par webhook et devient le montant encaissé. À préparer avec Florent : clé d'API et code d'appairage du Solo depuis le compte SumUp du salon (il les tape lui-même), compte de test SumUp (« Virtual Solo ») pour développer sans le vrai terminal.

**Écarté** : App Store (D-69). L'application installable couvre le besoin.

## Lot 8 : recette et bascule

**Retour de Florent sur le lot 7 (21 octobre 2026)** : fonctions et visuel bons dans l'ensemble, tests d'emails réels réussis. La **tablette** est lente (affichage des RDV, chaque bouton) ; la vitrine lui paraît fluide. Il n'est pas entièrement satisfait du visuel de la vitrine : **détails à lui demander**.

**Fait**
- Fonctions Vercel à Dublin (action 5).
- Session lue avec `getClaims()` au lieu de `getUser()` (proxy et `currentUser`, voir `decisions.md`), commit `6f2d712`. Tous les tests verts : 202 unitaires, 502 d'intégration, 224 parcours.
- Je ne me connecte pas au site en ligne avec les identifiants de Florent, même provisoires (règle de sécurité de l'assistant : pas de vrai mot de passe sur un site public). Florent a écrit son mot de passe provisoire du compte équipe dans la conversation du 21 octobre : **il doit le changer** (`pnpm staff:account`, ou Supabase, Authentication, Users).
- Vidéo de lancement **validée par Florent** (21 octobre).
- **Lenteur de la tablette : cause trouvée et corrigée** (section suivante).
- **Clignotement de la vitrine corrigé** : ce qui est à l'écran au premier affichage reste affiché, sans fondu (`alreadyOnScreen`, classe `is-shown`) ; plus bas, la révélation au défilement est inchangée. Parcours Playwright qui relève l'opacité dès le premier affichage.
- **Surveillance** : `/api/health` répond 503 si la base ne répond pas ou si un email dû n'est pas parti depuis plus de 25 h (cron arrêté, Brevo injoignable ; emails retenus pour le gérant exclus), et compte les échecs définitifs des 7 derniers jours (`src/modules/mail/health.ts`). 25 h à cause du cron quotidien : à ramener à 1 h avec Vercel Pro (`OVERDUE_AFTER_HOURS`). Reste à brancher un service de surveillance externe gratuit, avec l'adresse d'alerte de Florent.

### PRIORITÉ 1 : lenteur de la tablette, cause trouvée et corrigée (21 octobre 2026)

**Symptômes (Florent, 21 octobre)** : planning et chaque écran très lents, chaque bouton aussi, connexion parfois **bloquée** sur `/equipe/connexion`, malgré Dublin et `getClaims()`. La vitrine, servie depuis le cache, restait fluide.

**Mesure en production** (`/api/diagnostic`, qui chronomètre depuis Dublin et ne renvoie que des durées)
- Base : 2 ms par requête, 70 à 80 ms pour ouvrir une connexion. Service d'authentification Supabase vu de Dublin : 20 ms environ (la clé publique, gardée 10 min en mémoire, parfois 0,5 s). Liste de l'équipe : 5 ms.
- Mais **chargement du planning et pastille « à traiter » bloqués** : plus de 8 s ; une première mesure sans délai a été coupée par Vercel à **300 s** (`FUNCTION_INVOCATION_TIMEOUT`). Sur la base, une requête du site restait « active » en attendant le site (`ClientRead`).
- `pnpm smoke:auth` (Florent) : jetons signés en **ES256**, donc `getClaims()` vérifie bien sur place (piste 1 écartée).

**Cause** : le pooler Supabase en **mode transaction (port 6543)**. Dès que plusieurs requêtes partent en même temps (le planning en lance jusqu'à 6, plus la barre, plus les préchargements), le client `postgres` les enchaîne sur une même connexion, et le mode transaction les bloque. Reproduit depuis le poste avec le vrai code : bloqué à chaque essai en 6543, jamais en 5432 (mode session, même adresse). En local il n'y a pas de pooler : les 502 tests d'intégration et les parcours ne pouvaient pas le voir. La connexion bloquait pour la même raison (la limite d'essais écrit en base avant d'appeler Supabase).

**Correction** (commit `5e58ed8`, tests d'abord) : `connectionOptions` passe le pooler Supabase de 6543 à 5432 ; client limité à 3 connexions par instance, fermées après 20 s sans requête, délai de connexion 10 s. **Après, en production** : planning 30 à 44 ms (115 ms à froid), pastille « à traiter » 20 à 26 ms. Nouveau contrôle **`pnpm smoke:db`** : les chargements de la tablette sur la base en ligne, en lecture seule ; il échoue sur l'ancien réglage. Détail et alternatives écartées : `decisions.md`.

**Reste à faire**
- **Avis de Florent sur la vraie tablette** (planning, boutons, connexion). S'il reste une lenteur, `/api/diagnostic` (ouvrir l'adresse dans un navigateur, une fois toutes les 10 s) dit où passe le temps côté serveur ; `scripts/measure-tablet.mjs` mesure les écrans sur le build local.
- Limite du mode session : chaque connexion ouverte occupe une session Postgres, une quinzaine pour tout le projet sur l'offre gratuite. Avec 3 par instance et la fermeture après 20 s, c'est large pour un salon ; Supabase Pro en donne davantage. Erreur à reconnaître : « max clients reached » dans les journaux.
- `/api/diagnostic` est à **retirer à la bascule** (liste de contrôle).
- Démarrages à froid (environ 1 s après une longue inactivité) : le service de surveillance qui appellera `/api/health` toutes les 5 minutes gardera une instance chaude.

**Autres travaux du lot 8**

- **Visuels de lancement** (`communication/lancement/`, outillage à part, voir `decisions.md`) : vidéo story 19 s, 1080 × 1920, 60 images/s, muette, qui s'ouvre sur le logo en néon dévoilé par deux lignes de lumière (demande de Florent : pas de texte au début) (Florent ajoute une musique dans Instagram) ; affiche A4 en PDF et PNG. Commandes, dans ce dossier : `npm install` une fois, puis `node render.mjs video`, `node render.mjs poster https://<domaine>` (QR code vers `/reservation`), `node render.mjs serve` pour l'aperçu. Fichiers produits dans `export/`. **L'affiche actuelle pointe vers le site de test : à régénérer avec le domaine avant impression.**

**Plan proposé, à confirmer avec Florent** (ses réponses aux questions du 21 octobre sont **toujours attendues** : le message de démarrage de la conversation du 21 octobre après-midi ne contenait que le résultat de `pnpm smoke:auth`)
1. Vitesse : tablette **corrigée** (priorité 1 ci-dessus, à confirmer sur l'iPad) ; **clignotement** de la vitrine **corrigé**. Reste l'**ouverture animée** de l'accueil (plaque ivoire vide pendant environ 1 s) : proposition, logo visible tout de suite et animation de moins de 1 s, **à valider par Florent** avant d'y toucher.
2. Retouches visuelles de la vitrine, selon les remarques de Florent.
3. Mise en ligne côté code : application installable (manifeste et icônes, sans hors-ligne ; prévue au socle du dossier, détails à confirmer), surveillance (**`/api/health` fait** ; service de surveillance externe gratuit à brancher avec l'adresse d'alerte), sauvegardes (Supabase Pro et export complet), liste de contrôle avant l'ouverture (y retirer `/api/diagnostic`), guide d'exploitation.
4. Recette réelle par Florent, avec une fiche à cocher (téléphone, tablette, emails).
5. Bascule : Vercel Pro, Supabase Pro, domaine, Brevo sur le domaine, changement des clés passées dans le chat, saisie des RDV Planity à venir, jour J, une semaine sans incident, fermeture de Planity.

Questions posées à Florent et encore ouvertes : ce qui lui déplaît dans le visuel, le choix pour l'ouverture animée, une base de production neuve ou celle de test vidée, le domaine, la date de bascule et le nombre de RDV Planity à reprendre, l'application installable, l'adresse des alertes, les appareils de recette.

## Ce que le lot 7 a ajouté

- **Rappel (R-61, D-59)** : email « Dans 3 jours » (maquette Email-Rappel), programmé dans la file **à la réservation et à chaque déplacement**, 72 h avant (`salon_settings.reminder_hours`), seulement pour un RDV pris plus tôt. Abandonné si le RDV est annulé, déplacé ou passé ; **repoussé** tant que le RDV est « à traiter » ou qu'un email attend le gérant. Si la date limite de modification est passée à l'envoi, le texte renvoie au téléphone.
- **Invitation à un avis (R-64, D-58)** : le cron programme, le lendemain d'un RDV honoré, un email avec **un seul bouton** « Laisser un avis » vers `salon_settings.review_url` (la grille de notes de la maquette est supprimée, décision de Florent), « Reprendre le même RDV » et « Ne plus recevoir ces invitations » (`/avis/desinscription`, lien signé, confirmation par bouton). **Sans `review_url`, aucune invitation ne part.** La confidentialité cite l'invitation seulement quand le lien existe.
- **Bilan** (`/equipe/gerant/bilan`, derrière le code gérant) : chiffre d'affaires indicatif, rendez-vous (en ligne / au salon), lapins, détail par membre, lapins récents (rang, client bloqué), périodes jour, semaine (lundi au dimanche) et mois avec flèches « Précédent / Suivant » (D-60, D-61). Le menu « Bilan » est actif.
- **Correction du montant encaissé** (R-53, R-54, D-62) : bouton « Corriger le montant » dans la fiche RDV, pour toute l'équipe (nom choisi, R-74), dès que le RDV a commencé et tant que ce n'est ni un lapin ni une annulation ; 0 à 1 000 €, retour possible au prix de la carte ; chaque correction est au journal. Le chiffre d'affaires lit ce montant.
- Au passage : le message de la fiche RDV sur l'email « envoyé aussitôt » dit maintenant la vérité pour un RDV à traiter (défaut connu du lot 5).
- **Migration 0007** (`customer.review_opt_out`, `salon_settings.review_url`). Aucune nouvelle dépendance. Décisions : D-58 à D-62 (`dossier-projet.md`) et `decisions.md`.

## Ce que le lot 6 a ajouté

- **Gabarit commun** (`src/app/(vitrine)`, `src/components/vitrine`) : en-tête (menu, logo sur plaque ivoire, compte), menu plein écran (focus gardé, Échap), pied de page, barre collante « Réserver + Appeler » (mobile) ; dès 1024 px, liens et bouton Réserver dans l'en-tête (D-37).
- **Accueil** : ouverture animée une fois par session (sautée au premier geste), valeurs, 3 prestations phares, aperçu du salon, équipe, horaires et accès. **Prestations** (groupes, sur appel, apprentis), **Le salon** (galerie et visionneuse `<dialog>`), **pages légales** à onglets.
- **Tout vient de la base** : `getVitrine()` (cache `use cache`, étiquette `vitrine`, renouvelé toutes les 5 min) ; les actions du gérant le vident aussitôt (`asManager` → `updateTag`). Textes composés (« Orhan, Enes, Kaan et Taha vous reçoivent du mardi au samedi »), fermetures à venir annoncées, règles citées dans les conditions (2 RDV, 48 h, lapins) lues dans `salon_settings`.
- **Référencement local** : métadonnées par page, données structurées `HairSalon`, `robots.txt`, `sitemap.xml`, image de partage. Indexation toujours coupée (`ALLOW_INDEXING`).
- **Passage vitrine → réservation** en fondu (`<ViewTransition>`, 160 ms / 240 ms), désactivé avec `prefers-reduced-motion`.
- **Mesure** (`pnpm measure:vitrine`, mobile, 4G lente, CPU ×4, build local) : FCP ≈ 0,75 s, LCP 0,7 à 2,1 s, CLS 0.
- Aucune migration, aucune nouvelle dépendance. Décisions dans `docs/decisions.md` (carte d'accès dessinée sans service tiers, avis reportés, pas de GSAP, etc.).
- Au passage : le test « R-26 : un client sans compte ne se trouve pas » (tablette) attendait la page avant qu'elle soit active ; il réessaie maintenant.

## Ce que le lot 5 a ajouté

- **Carte et habilitations** (`catalog/manage.ts`, R-10 à R-13, R-16, R-17) : ajouter, modifier, retirer et remettre en carte, ordonner, choisir qui réalise quoi. Une prestation n'est jamais supprimée. Le rôle (coiffeurs ou apprentis) ne change pas. Une prestation en ligne exige au moins un coiffeur actif habilité.
- **Équipe** (`staff/manage.ts`, R-02) : ajouter, renommer, ordonner, retirer, remettre. Un nouveau membre est habilité d'office pour les prestations de son rôle. Prénoms uniques parmi les actifs. Retirer le dernier d'une prestation réservable en ligne est refusé.
- **Horaires et fermetures** (`schedule/manage.ts`, R-01, R-03) : jusqu'à 3 plages par jour (la pause est le trou), grille de 15 minutes, fermetures sur jours entiers.
- **Absences** (`absences/`, R-40 à R-43, D-55 à D-57) : déclarées par l'équipe depuis `/equipe/absences`. La liste « RDV à traiter » se **déduit** de l'état (absence, fermeture, hors horaires, coiffeur parti, habilitation retirée) : rien n'est stocké. Pour chaque RDV : confier à un collègue libre, déplacer, annuler avec excuses ; le planning est à jour tout de suite, les **emails restent retenus** (`held_for_manager`) jusqu'à ce que le gérant confirme avec son code (bouton sur l'écran des absences). La retenue vaut aussi depuis la fiche RDV du planning (`needsHold`). Pastille du nombre de RDV à traiter dans la barre ; rappel dans l'espace gérant.
- Journal d'audit pour chaque changement (`service.*`, `staff.*`, `hours.changed`, `closure.*`, `absence.*`, `emails.released`, `appointment.*`).
- Migration `0006_email_held_for_manager`.

## Points d'attention pour la suite

- **Lot 8 (recette)** : la recette du lot 7 se fait avec de vrais emails (action 12) et la vraie tablette (Bilan, correction du montant). Le chiffre d'affaires compte `isHonored` (R-51), pas le champ `status = honored` ; c'est un repère, la caisse fait foi (R-55).
- **`pnpm build` lit la base** (vitrine prérendue). Sur Vercel : `DATABASE_URL` ou `POSTGRES_URL` doivent exister aussi à la construction ; à vérifier au premier déploiement du lot 6.
- **Avis (D-38, D-58)** : aucun avis n'est enregistré ni affiché chez nous ; l'invitation mène à la page d'avis externe du salon (`review_url`). Le lien se change en SQL (pas d'écran de saisie) : un champ dans l'espace gérant serait un petit ajout. La section Avis de la vitrine reste à faire si le salon veut afficher des avis un jour.
- Sur la vitrine, « Réserver » mène à `/reservation` sans présélection de prestation. Une présélection par lien (`?prestation=`) serait un petit ajout si Florent la veut.
- La carte d'accès est un plan dessiné avec un bouton « Itinéraire » (Google Maps) : aucune carte tierce.
- Le menu lit la session à chaque affichage d'une page publique (derrière `<Suspense>`) pour afficher « Connecté : … ».
- Le planning n'affiche que l'équipe active : les RDV d'un membre retiré ne se voient que dans `/equipe/absences` tant qu'ils ne sont pas traités.
- Pas de bouton « jours fériés » : le gérant saisit ses fermetures (R-03). À proposer à Florent si besoin.
- `DaySlots.closed` distingue « Fermé » et « Complet ».

## Pièges déjà rencontrés

- Le shell refuse parfois un long bloc avec plusieurs documents ou des apostrophes (`unexpected EOF`) : écrire les fichiers avec l'outil d'écriture ou d'édition (et les scripts Python avec un fichier), pas avec des heredocs.
- Next 16 : Cache Components activé. Les données dynamiques se lisent derrière `<Suspense>` ou après `await connection()`. La page précédente reste cachée dans le DOM : en test Playwright, `.filter({ visible: true })`. Un fichier `"use server"` ne peut exporter que des fonctions. ESLint refuse `Date.now()` pendant le rendu : utiliser `new Date()`. ESLint refuse aussi `setState` directement dans un effet : dériver l'état (voir `SiteMenu`).
- React 19 vide les champs non contrôlés d'un formulaire après chaque action, erreur comprise (voulu pour les mots de passe). Les formulaires à champs contrôlés appellent l'action dans `onSubmit` + `useTransition`.
- Drizzle modifie la conversion des dates du client `postgres` qu'on lui passe : pour du SQL brut avec des `Date`, utiliser un autre client. Dans une sous-requête écrite en `sql`, une colonne de la table externe s'écrit `"staff"."id"` : Drizzle la rend sans préfixe et elle se confond avec celle de la sous-requête.
- Les tests d'intégration vident toutes les tables entre deux tests (`tests/integration/helpers.ts`) : y ajouter toute nouvelle table. Les tests de bout en bout (`tests/e2e/helpers.ts`, `resetData`) vident aussi carte, équipe, horaires et réglages puis rejouent `seed.sql` : chaque test repart des données de départ.
- Le salon est limité à 2 RDV à venir par client (D-41) : un test qui pose plusieurs RDV pour un même client doit relever `max_upcoming_per_customer`.
- Tests Playwright : un serveur de test resté ouvert (port 3100) est **réutilisé avec son ancien build** et fait échouer les parcours au hasard. Avant de lancer `pnpm test:e2e` après un `pnpm build`, s'assurer qu'aucun `scripts/e2e-server.mjs` ne tourne. Les fichiers de test partagent une seule connexion à la base : ne jamais appeler `sql.end()` dans un fichier. Un champ rempli avant que la page soit active (hydratée) perd sa saisie : réessayer avec `expect(async () => …).toPass()`.
- Vitrine : le cache de la vitrine garde la base jusqu'à 5 minutes. Un test qui change la base en SQL direct (horaires, équipe, réglages) doit appeler `refreshVitrine()` avant de recharger la page. Dans un `getByText`, un lien du pied de page ou de l'en-tête peut doubler un texte de la page : restreindre à `main`, `article` ou `banner`. Un nom comme « Le salon » correspond aussi à « Appeler le salon » : `exact: true`. Le profil « tablette » (1194 px) a la mise en page ordinateur de la vitrine (dès 1024 px).
- Verrouillage gérant : `proxy.ts` ne voit pas les en-têtes de préchargement des liens de Next 16, et une Server Action n'a pas renvoyé le `Set-Cookie` d'une suppression : le verrouillage passe par `POST /equipe/verrouiller`. Un chargement complet de page (`goto`, `reload`) reverrouille, de façon pas toujours fiable : dans les tests, passer d'un écran à l'autre par les liens, et ressaisir le code après un `goto`.
- Playwright : le profil « tablette » est aussi `isMobile` ; distinguer le téléphone par la largeur (< 768 px). Un cookie `Secure` sur http n'est pas renvoyé par WebKit. Dans l'écran des absences, la liste des emails retenus est dans la même région que les cartes : compter les cartes avec le bouton « Déplacer », pas avec `listitem` seul.
- Mise en page : dans une colonne `flex` qui défile, les enfants rétrécissent (un bouton de 52 px devenait une barre). Ajouter `[&>*]:shrink-0` au conteneur.
- Un RDV pris à plus de 72 h met **deux** lignes dans `email_outbox` (confirmation et rappel) : un test qui compte les emails d'un RDV filtre sur `type`. Les jeux de test de l'invitation à un avis posent `salon_settings.review_url`.
- Un parcours Playwright qui a besoin du code gérant sur une page précise (le Bilan) fait `goto` puis saisit le code **sur la page même** (la saisie du code s'y affiche) : un chargement complet reverrouille.
- Le shell de l'outil Bash refuse parfois un heredoc avec apostrophes : écrire le script Python dans un fichier avec l'outil Write.
- `pastOpenDay(n)` recule un dimanche ou un lundi jusqu'au samedi : deux valeurs de `n` voisines peuvent donner le même jour. Un test qui pose plusieurs RDV passés pour le même coiffeur leur donne des heures différentes (sinon la contrainte R-23 les refuse, selon le jour où le test tourne).
- **Pooler Supabase** : jamais le mode transaction (port 6543) avec postgres-js, des requêtes simultanées s'y bloquent jusqu'à 300 s. `connectionOptions` force le mode session (5432). Les tests locaux n'ont pas de pooler : après tout changement du client de base, lancer `pnpm smoke:db` (lecture seule sur la base en ligne).
- **Intégration continue (21 octobre)** : depuis le 20 au soir, échecs intermittents sur la machine de GitHub, plus lente. Corrigés dans les tests : « fermeture exceptionnelle » et « retirer un coiffeur » (le rappel « N rendez-vous à traiter » existe aussi dans la page précédente cachée : `.filter({ visible: true })`), « changer d'email » (adresse tapée avant que la page soit active : `toPass()`), « RDV pris longtemps à l'avance » (jour calculé en UTC mais jour de la semaine en heure locale : `openDay`). Ce dernier a échoué une fois en local sans que l'erreur soit gardée, non reproduit ensuite (19 passages) : s'il revient, lire le rapport (`playwright-report` dans l'onglet Actions de GitHub, ou l'API publique `check-runs/<job>/annotations`).
- Ne pas enchaîner `pnpm test 2>&1 | tail` avec `&&` pour décider d'un commit : `tail` réussit toujours. Utiliser `set -o pipefail` ou lire le résultat avant de commiter.
- Un changement d'heure tombe le dernier dimanche d'octobre : les tests de dates autour du 25 octobre 2026 s'en souviennent (10 h à Paris = 8 h UTC avant, 9 h UTC après).

## Message à coller pour démarrer la prochaine conversation

```text
Tu es le développeur principal du site et de l'application de réservation d'Elegance Strasbourg.
Lis CLAUDE.md, puis docs/reprise.md : les lots 0 à 7 sont validés, le lot 8 (recette et bascule) est en pause, le lot 9 est fait.
On attaque le lot 10 (clients sans compte, D-70 : réservation par la tablette pour une personne sans compte, import du fichier clients CSV). Commence par me poser les questions ouvertes du lot 10 (section « Demandes du salon ») et propose-moi le plan du lot ; ne code rien avant mon accord.
Travaille comme avant : une règle R-xx = au moins un test, décisions notées dans docs/decisions.md, vérification sur mobile et sur tablette.
Le fichier clients ne doit jamais entrer dans le dépôt (il est public).
À la fin, mets à jour docs/reprise.md et prépare le message de la conversation suivante.
Mon retour sur le lot 9 :
- Tablette (couleurs en ligne / salon, résumé repliable, icône E) : [ok / à revoir : ...]
- Le client peut-il encore indiquer « Pour qui ? » en ligne quand il réserve pour un proche, ou tout passe par la tablette : [...]
- En-tête du fichier CSV (la première ligne seulement, sans données clients) : [...]
- Maquettes du lot 12 dans Claude Design : [pas commencées / en cours / finies]
```
