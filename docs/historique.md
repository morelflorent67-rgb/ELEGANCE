# Historique du projet

Sorti de `docs/reprise.md` le 22 octobre 2026 pour l'alléger. Rien ici n'est à faire.

Pour mémoire, fin du lot 11 : **814 Vitest** (254 unitaires et 560 d'intégration sur Postgres réel) et **312 parcours Playwright** (242 exécutés ; 70 réservés à la tablette ou au mobile sont sautés selon le profil), plus `pnpm smoke:auth` et `pnpm smoke:db`. Au passage, le parcours « aucun créneau » ferme maintenant la semaine de Paris (il échouait entre minuit et 2 h : la date de la base est en UTC). Aucun ne doit casser. Lint, typecheck et build verts. Vérification visuelle du lot 11 par captures à 1194 × 834 (répéter, fiche de série, annuler la suite) et 390 × 844 (répéter sur téléphone, Mes rendez-vous), pas sur appareil réel ; `pnpm smoke:db` non relancé (client de base inchangé).

Pour mémoire, fin du lot 10 : **771 Vitest** (236 unitaires et 535 d'intégration sur Postgres réel) et **300 parcours Playwright** (236 exécutés ; 64 réservés à la tablette ou au mobile sont sautés selon le profil), plus `pnpm smoke:auth` et `pnpm smoke:db`. Aucun ne doit casser. Lint, typecheck et build verts. Vérification visuelle du lot 10 par captures à 1194 × 834 et 390 × 844 (planning plein et replié, fiche RDV « Pour qui ? », fiche client importée, nouvelle fiche et même numéro), pas sur appareil réel.

Pour mémoire, fin du lot 9 : **729 Vitest** (218 unitaires et 511 d'intégration sur Postgres réel) et **292 parcours Playwright** (231 exécutés ; 61 réservés à la tablette ou au mobile sont sautés selon le profil), plus `pnpm smoke:auth` et `pnpm smoke:db`. Aucun ne doit casser. Lint, typecheck et build verts. Vérification visuelle du lot 9 par captures à 1194 × 834 (planning déplié et replié, icône) et 390 × 844 (Mes RDV, « moins d'une heure »), pas sur appareil réel.

Pour mémoire, au 21 octobre 2026 avant le lot 9 : **719 Vitest** (213 unitaires et 506 d'intégration sur Postgres réel) et **288 parcours Playwright** (228 exécutés ; 60 réservés à la tablette ou au mobile sont sautés selon le profil), plus deux contrôles manuels sur les services en ligne : `pnpm smoke:auth` et `pnpm smoke:db`. Aucun ne doit casser. Lint, typecheck et build verts. Vérification visuelle du 21 octobre par captures à 390 × 844 (prestations, le salon) et 1194 × 834 (planning, prestations), pas sur appareil réel.

Pour mémoire, à la fin du lot 7 : **699 Vitest** (197 unitaires et 502 d'intégration sur Postgres réel) et **284 parcours Playwright** (224 exécutés ; 60 réservés à la tablette ou au mobile sont sautés selon le profil). Aucun ne doit casser. Lint, typecheck et build verts. Vérification visuelle du lot 7 par captures à 1194 × 834 et 390 × 844 (Bilan, fiche RDV, emails), pas sur appareil réel.


**Lot 9 (fait le 21 octobre 2026)**
- Délai de modification et d'annulation en ligne : **1 h** (D-63 ; R-30, R-32, D-47, D-48 suivent). Les textes disent « jusqu'à une heure avant », « moins d'une heure » (`hoursPhrase`, `lessThanHours`).
- Rappel **24 h** avant (D-64). Attention : tant que le cron est quotidien (Vercel Hobby, 7 h UTC), un rappel de la veille peut partir le matin même, voire être abandonné si le RDV est passé : **Vercel Pro (cron chaque minute) est indispensable à l'ouverture**.
- Départs **à l'heure pile et à la demie seulement**, en ligne comme sur la tablette (D-65 ; `salon_slot_step_minutes = 30`). Horaires, absences et durées restent au quart d'heure.
- **5 RDV à venir** par client (D-66).
- Email d'avis : **lien direct Google** (`https://g.page/r/CV_HUH2O58tMEAE/review`, dans `review_url`) et bouton « Prendre un nouveau RDV » en plus de « Reprendre le même RDV » (D-67).
- Planning : liseré **or = en ligne**, **ivoire = salon**, légende dans l'en-tête ; le **résumé du jour se replie** (bouton flèche), le choix reste sur la tablette (D-68).
- **Icône « E »** (les trois barres du E du logo ; seule, elle rappelle un peu un menu « ≡ » : à faire valider par Florent, une variante reste possible) ivoire sur noir (iPad, iPhone, Android) et **application installable** : deux manifestes, la tablette s'ouvre sur le planning (D-69). Pas d'App Store. Pour Florent : sur l'iPad, **supprimer l'ancienne icône « P »** puis, depuis Safari sur `/equipe`, Partager, « Sur l'écran d'accueil ».
- Migration `0008_salon_requests_oct21` : valeurs par défaut et mise à jour de la ligne de réglages (y compris `review_url`). **Appliquée sur Supabase le 21 octobre 2026.**

**Lot 10 (fait le 21 octobre 2026) : clients sans compte (D-70, D-76 à D-82)**
- **Retours de Florent sur le lot 9** (D-82) : la case du RDV est **entièrement** or (en ligne) ou ivoire (salon), texte noir ; honoré = couleur assombrie, lapin = sombre au contour brique. Replié, le résumé du jour ne prend plus de colonne : une **languette** avec la flèche dépasse du bord droit.
- **Fiche sans compte à la tablette** (D-76) : dans « Nouveau RDV », bouton « Nouvelle fiche sans compte » (pré-rempli avec ce qui a été cherché) : prénom, nom, téléphone obligatoires, email facultatif. Email déjà pris : la tablette nomme la fiche et propose « Choisir cette fiche ». Numéro déjà connu : « est-ce la même personne ? », « Choisir » ou « Non, créer une nouvelle fiche ». Étiquette « Sans compte » partout ; « Corriger la fiche » sur la fiche client (avec « Qui corrige ? »). Sans email, la tablette dit qu'aucune confirmation ne part.
- **« Pour qui ? »** (D-80) : en ligne (étape « Vos coordonnées ») et à la tablette ; au planning « Inès · Lina M. », dans la fiche RDV « Pour Inès / Au nom de Lina Martin », dans Mes rendez-vous et les emails.
- **Rattachement** (D-79) : une inscription avec l'email d'une fiche sans compte reprend cette fiche (RDV, historique). Même numéro seul : rien d'automatique ; la fiche client montre « Même numéro » et le gérant **fusionne** (espace gérant, fiche du client, « Fusionner ») ; la fiche avec compte reste.
- **Emails** (D-78, D-81) : une fiche sans compte avec email reçoit tout ; « Créer mon compte » remplace « Gérer mon rendez-vous ». Le premier email d'une fiche importée dit d'où vient l'adresse.
- **Import** (D-77) : `pnpm customers:import "<chemin>"` (base locale) ou `:remote` (en ligne, avec accord). Clients venus depuis 3 ans, avec téléphone ou email ; prénom, nom, téléphone, email, nombre de visites, dernière visite (affichés « Avant le site : 7 visites… » sur la fiche). Bilan en nombres, rien sans « oui », rejouable, jamais d'écrasement d'un client connu, aucun email envoyé. Le fichier est refusé s'il est dans le dossier du projet ; `.gitignore` refuse `*.csv` et `*.xlsx`.
- Migration `0009_customers_without_account`. Aucune nouvelle dépendance. Décisions : D-76 à D-82 (`dossier-projet.md`), `decisions.md`.
- Le salon prend aujourd'hui ses RDV sur **Planity** (le fichier Treatwell du 25 août 2026 est plus ancien) : les RDV à venir seront repris depuis Planity à la bascule.

**Lot 11 (fait le 22 octobre 2026) : RDV répétés (D-71, D-83 à D-92)**
- **Réponses de Florent** : la série se crée en touchant le RDV au planning, dans le **panneau de droite** (« comme l'application de son ami »), pas dans « Nouveau RDV » ; la prolongation aussi. Le reste suit les recommandations. Question 4 (comment Planity compte « N fois ») : la documentation de Planity (support.planity.com, « Comment gérer mes rendez-vous récurrents », « Comment supprimer un rendez-vous répété ») ne le dit pas ; elle confirme la flèche en boucle sur les RDV répétés et les choix « Juste cet événement / Tous les événements futurs / Toute la série » : d'où D-86 (N RDV en tout) et le 3e choix d'annulation (D-88).
- **Fiche RDV** : « ↻ Répéter ce RDV » (le RDV devient le 1er de la série) : chaque semaine, toutes les 2, 3, 4 semaines, chaque mois (le 10 / le 2e mardi / le dernier mardi) ; coiffeur du RDV par défaut ou « Sans préférence » ; fin « N RDV en tout, celui-ci compris » ou « Jusqu'au », 6 mois au plus ; **aperçu** recalculé par le serveur (dates retenues avec leur coiffeur, dates sautées avec leur raison et « Réserver à une autre heure ») ; « Qui réserve ? » ; « Confirmer N RDV ».
- Fiche d'un RDV de série : « ↻ RDV répété · Toutes les 2 semaines · 3e sur 8 », dates à venir, « Dernier RDV de la série », « ↻ Prolonger la série » (« N RDV de plus » ou « Jusqu'au »). « Annuler » propose « Ce RDV », « Celui-ci et les suivants (N) », « Tous les RDV à venir de la série (N) ». Un RDV de série se déplace seul.
- Planning : ↻ devant l'heure ; Mes rendez-vous : étiquette « RDV répété ».
- Limite de 5 RDV à venir : les RDV de série n'y comptent pas (D-87), ni en ligne ni au salon.
- Emails : un seul email « Vos N rendez-vous sont confirmés » (règle, prestations, une ligne par date, « Ajouter à l'agenda » de toute la série), un rappel par RDV ; prolongation : « Vos N prochains rendez-vous sont réservés » ; annulation groupée : un seul email qui liste les dates, retenu pour le gérant si l'un des RDV est à traiter. Le RDV de départ a déjà eu sa confirmation ; il figure aussi dans la liste.
- Migration `0010_appointment_series`. Aucune nouvelle dépendance. Décisions : D-83 à D-92 (`dossier-projet.md`), `decisions.md`.


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
