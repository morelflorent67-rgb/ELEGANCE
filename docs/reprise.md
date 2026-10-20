# Reprise du projet : où on en est

Ce document permet de reprendre le travail dans une **nouvelle conversation**, sans rien perdre. Il se met à jour à la fin de chaque lot.
À jour au **20 octobre 2026**, fin du lot 6 (validé par Florent le 20 octobre 2026). Les lots 0 à 6 sont validés.

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
| 7 à 8 | Emails et tableau de bord, recette | À venir (voir `transmission-code.md`) |

Tests à la fin du lot 6 : **605 Vitest** (unitaires et intégration sur Postgres réel) et **258 parcours Playwright** (206 exécutés ; 52 réservés à la tablette ou au mobile sont sautés selon le profil). Aucun ne doit casser. Lint, typecheck et build verts.

## Accès

- Dépôt : https://github.com/morelflorent67-rgb/ELEGANCE (public, branche `main`). Je pousse sans redemander ; l'intégration continue doit rester verte.  Règle à retenir : quand un lot ajoute une migration, l'appliquer à Supabase (avec l'accord de Florent) **avant** de pousser le code qui la lit.
- Site de test : https://elegance-git-main-elegance13.vercel.app (protection de déploiement désactivée volontairement, `noindex`).
- Supabase de test : Postgres 17, région UE. Les clés sont dans `.env.local` (jamais commité). `pnpm db:migrate:remote` et `pnpm db:seed:remote` modifient la base en ligne : annoncer ce qu'on fait.
- Florent est non technicien : français simple, étapes numérotées, noms exacts des boutons. Ne jamais lui demander de coller un secret dans le chat. Je ne saisis pas de secrets dans les formulaires de sites web : je le guide.

## Ce qui existe

- `src/modules/availability` (créneaux, fonctions pures), `booking` (`createAppointment`, `rescheduleAppointment`, `cancelAppointment` : seuls chemins d'écriture d'un RDV), `catalog` (lecture de la carte ; `manage.ts` : gestion par le gérant), `customers`, `auth`, `mail`, `calendar`, `appointments`, `audit` (`recordAudit`), `vitrine` (lecture en cache, horaires, textes légaux, données structurées), `security`, `staff` (accès équipe ; `manage.ts` : gestion de l'équipe), `schedule` (horaires et fermetures), `absences` (absences, RDV à traiter, emails retenus), `planning`.
- Vitrine (lot 6) : `/`, `/prestations`, `/salon`, `/mentions-legales`, `/confidentialite`, `/conditions`, `/robots.txt`, `/sitemap.xml`.
- Pages clients : `/reservation`, `/reservation/confirmation`, `/connexion`, `/inscription`, `/mot-de-passe-oublie`, `/mot-de-passe/nouveau`, `/compte/rendez-vous`, `/compte/informations`, `/compte/supprime`.
- Tablette : `/equipe` (planning), `/equipe/reserver`, `/equipe/clients/[id]`, `/equipe/absences`, `/equipe/gerant` (code gérant) et, derrière le code, `/equipe/gerant/carte`, `/equipe/gerant/equipe`, `/equipe/gerant/horaires`, `/equipe/gerant/clients/[id]`.
- Toutes les décisions techniques sont dans `docs/decisions.md`. Les règles et décisions métier sont dans `docs/dossier-projet.md` (R-xx, D-01 à D-57).
- Maquettes : canevas Claude Design (lien dans `docs/design/README.md`, lisible avec l'outil Artifact, action `read`, puis `path` pour un fichier). Pour le lot 7, lire dans le canevas : `Email-Rappel`, `Email-Avis`, `Email-Modification`, `Email-Annulation`, `Tablette-Dashboard`, et les `DS-*` pour les composants. « Atelier » et « Lumiere-Mur » sont des archives : ne pas les utiliser.

## Actions en attente (à demander à Florent, jamais sans son accord)

1. ~~Migration 0006 sur Supabase~~ : **appliquée le 20 octobre 2026** avec l'accord de Florent (colonne `email_outbox.held_for_manager` vérifiée), puis code poussé.
2. ~~Compte équipe de la tablette~~ et ~~code gérant~~ : faits le 20 octobre 2026. Pour les changer : `pnpm staff:account`, `pnpm manager:set-code` (base locale) ou `pnpm manager:set-code:remote` (base Supabase, modifie la base en ligne). Florent tape lui-même ses secrets dans le terminal, jamais dans le chat.
3. **Brevo** (compte ouvert) : créer une clé d'API, faire vérifier une adresse d'expéditeur, puis ajouter `BREVO_API_KEY`, `EMAIL_FROM` et `CRON_SECRET` dans Vercel (Settings, Environment Variables). Tant que ce n'est pas fait, les emails restent en file en production (confirmations, annulations, déplacements, et ceux que le gérant libère).
4. **Supabase** : Authentication, URL Configuration (Site URL et adresse de redirection `…/auth/callback`), puis SMTP Brevo pour le mot de passe oublié.
5. **Vercel Pro et région** : à prendre avec le client juste avant la livraison (c'est lui qui paie). Passer alors le cron de `vercel.json` à `* * * * *`. D'ici là, l'envoi immédiat des emails couvre le cas normal. **Lenteur des pages de la tablette sur le site de test** : probablement la région des fonctions Vercel (par défaut les États-Unis) loin de la base Supabase (Irlande). Florent a décidé de reporter : à ce moment-là, ajouter `"regions": ["fra1"]` dans `vercel.json`, mesurer avant et après, et réduire au besoin les requêtes par page (le nombre de RDV à traiter de la barre est recalculé à chaque écran). La vitrine, elle, est mise en cache (lot 6) : elle n'appelle pas la base à chaque affichage.
6. Les clés Supabase et le mot de passe de la base, passés dans le chat, sont laissés tels quels par décision de Florent.
7. Domaine définitif : à poser dans `SITE_URL` (Vercel) ; ensuite `ALLOW_INDEXING=true` ouvre l'indexation (robots, plan du site et données structurées suivent tout seuls).
8. **Textes légaux** (lot 6, Florent les complétera quand il aura les informations) : rédigés d'après ce que le site fait réellement, mais **à faire valider par un professionnel** avant l'ouverture. À fournir par le salon (champs entre crochets visibles sur les pages ; `placeholdersOf` dans `src/modules/vitrine/legal.ts` les liste) : forme juridique, capital, SIRET, directeur de la publication, adresse de l'hébergeur (Vercel), email de contact, durée de conservation d'un compte inactif, modalités de réponse aux droits RGPD, conditions de suspension et responsabilité. Quand les avis seront lancés : citer l'invitation à donner son avis dans la confidentialité.
9. **Vérifier la vitrine sur un vrai téléphone** (site de test) : accueil (ouverture animée, menu), prestations, le salon (galerie), pages légales. Vérifiée par captures à 390 × 844, 1194 × 834 et 1440 × 900, pas sur appareil réel.
10. **Vérifier sur la vraie tablette** (iPad, paysage ; tout a été vérifié par captures à 1194 × 834 et 390 × 844, pas sur l'appareil réel) : planning, réservation, espace gérant (carte, équipe, horaires) et absences.

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

- **Lot 7** : le chiffre d'affaires compte `isHonored` (R-51), pas le champ `status = honored`. Les emails de rappel (R-61) et d'avis (R-64) restent à faire ; ceux du salon (modification, annulation, retenue puis confirmation) sont faits. Un rappel ne doit pas partir pour un RDV annulé ni « à traiter ». Le tableau de bord vit dans `/equipe/bilan` (la barre de la tablette affiche déjà « Bilan », pas encore actif).
- **`pnpm build` lit la base** (vitrine prérendue). Sur Vercel : `DATABASE_URL` ou `POSTGRES_URL` doivent exister aussi à la construction ; à vérifier au premier déploiement du lot 6.
- **Avis (D-38)** : rien n'est construit côté vitrine (ni section, ni drapeau `NEXT_PUBLIC_REVIEWS`) ; ils viendront avec le modèle de données des avis, après le lancement.
- Sur la vitrine, « Réserver » mène à `/reservation` sans présélection de prestation. Une présélection par lien (`?prestation=`) serait un petit ajout si Florent la veut.
- La carte d'accès est un plan dessiné avec un bouton « Itinéraire » (Google Maps) : aucune carte tierce.
- Le menu lit la session à chaque affichage d'une page publique (derrière `<Suspense>`) pour afficher « Connecté : … ».
- Le planning n'affiche que l'équipe active : les RDV d'un membre retiré ne se voient que dans `/equipe/absences` tant qu'ils ne sont pas traités.
- Petit défaut connu : la fiche RDV du planning annonce, avant l'action, « un email d'annulation lui est envoyé aussitôt », même pour un RDV à traiter dont l'email sera retenu ; le message affiché après l'action dit la vérité. À corriger si on touche à ce panneau.
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
- Un changement d'heure tombe le dernier dimanche d'octobre : les tests de dates autour du 25 octobre 2026 s'en souviennent (10 h à Paris = 8 h UTC avant, 9 h UTC après).

## Message à coller pour démarrer la prochaine conversation

```text
Tu es le développeur principal du site et de l'application de réservation d'Elegance Strasbourg.
Lis CLAUDE.md, puis docs/reprise.md : les lots 0, 1, 2, 3, 4, 5 et 6 sont validés.
Prépare le plan du lot 7, emails et tableau de bord (voir docs/transmission-code.md, docs/design/ et les maquettes du canevas : Email-Rappel, Email-Avis, Tablette-Dashboard), pose-moi les questions nécessaires, puis attends ma validation avant d'écrire du code.
Travaille ensuite comme avant : tests d'abord, une règle R-xx = au moins un test, décisions notées dans docs/decisions.md, vérification sur mobile et sur tablette.
À la fin du lot, mets à jour docs/reprise.md et prépare le message de la conversation suivante.
Point de départ : [Ajoutez ici le résultat de l'essai de la vitrine (lot 6) sur votre téléphone, et du lot 5 sur la vraie tablette, ou le message d'erreur s'il y en a un.]
```
