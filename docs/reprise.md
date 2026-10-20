# Reprise du projet : où on en est

Ce document permet de reprendre le travail dans une **nouvelle conversation**, sans rien perdre. Il se met à jour à la fin de chaque lot.
À jour au **20 octobre 2026**, fin du lot 5 (terminé, **à valider par Florent**).

## Avancement

| Lot | Contenu | État |
| --- | --- | --- |
| 0 | Socle : projet, dépôt, base, tests, déploiement | Validé |
| 1 | Moteur de créneaux, schéma, contrainte anti-chevauchement | Validé |
| 2 | Réservation client, comptes, email de confirmation | Validé |
| 3 | Espace client : Mes RDV, modifier ou annuler jusqu'à 48 h, « Reprendre le même RDV », Mes informations, suppression du compte | Validé |
| 4 | Planning tablette : 4 colonnes, fiche RDV, réservation par le salon, lapins, code gérant, choix de l'auteur | Validé |
| 5 | Gestion : carte et habilitations, équipe, horaires, fermetures, absences et RDV touchés | Terminé, à valider |
| 6 à 8 | Vitrine, emails et tableau de bord, recette | À venir (voir `transmission-code.md`) |

Tests à la fin du lot 5 : **558 Vitest** (unitaires et intégration sur Postgres réel) et **196 parcours Playwright** (146 exécutés ; 50 réservés à la tablette ou au mobile sont sautés selon le profil). Aucun ne doit casser. Lint, typecheck et build verts.

## Accès

- Dépôt : https://github.com/morelflorent67-rgb/ELEGANCE (public, branche `main`). Je pousse sans redemander ; l'intégration continue doit rester verte. **Exception du lot 5** : la migration 0006 doit être appliquée à Supabase **avant** de pousser (voir « Actions en attente », n° 1).
- Site de test : https://elegance-git-main-elegance13.vercel.app (protection de déploiement désactivée volontairement, `noindex`).
- Supabase de test : Postgres 17, région UE. Les clés sont dans `.env.local` (jamais commité). `pnpm db:migrate:remote` et `pnpm db:seed:remote` modifient la base en ligne : annoncer ce qu'on fait.
- Florent est non technicien : français simple, étapes numérotées, noms exacts des boutons. Ne jamais lui demander de coller un secret dans le chat. Je ne saisis pas de secrets dans les formulaires de sites web : je le guide.

## Ce qui existe

- `src/modules/availability` (créneaux, fonctions pures), `booking` (`createAppointment`, `rescheduleAppointment`, `cancelAppointment` : seuls chemins d'écriture d'un RDV), `catalog` (lecture de la carte ; `manage.ts` : gestion par le gérant), `customers`, `auth`, `mail`, `calendar`, `appointments`, `audit` (`recordAudit`), `security`, `staff` (accès équipe ; `manage.ts` : gestion de l'équipe), `schedule` (horaires et fermetures), `absences` (absences, RDV à traiter, emails retenus), `planning`.
- Pages clients : `/reservation`, `/reservation/confirmation`, `/connexion`, `/inscription`, `/mot-de-passe-oublie`, `/mot-de-passe/nouveau`, `/compte/rendez-vous`, `/compte/informations`, `/compte/supprime`, pages légales provisoires.
- Tablette : `/equipe` (planning), `/equipe/reserver`, `/equipe/clients/[id]`, `/equipe/absences`, `/equipe/gerant` (code gérant) et, derrière le code, `/equipe/gerant/carte`, `/equipe/gerant/equipe`, `/equipe/gerant/horaires`, `/equipe/gerant/clients/[id]`.
- Toutes les décisions techniques sont dans `docs/decisions.md`. Les règles et décisions métier sont dans `docs/dossier-projet.md` (R-xx, D-01 à D-57).
- Maquettes : canevas Claude Design (lien dans `docs/design/README.md`, lisible avec l'outil Artifact, action `read`, puis `path` pour un fichier). Pour la vitrine, lire dans le canevas : `Main` (accueil), `Prestations`, `Salon`, `Legal`, `Lumiere-Mur`, `Atelier`, et les `DS-*` pour les composants.

## Actions en attente (à demander à Florent, jamais sans son accord)

1. **Migration 0006 sur Supabase** (`pnpm db:migrate:remote`) : ajoute la colonne `email_outbox.held_for_manager`. Le code du lot 5 la lit ; **pousser sur `main` avant de migrer casserait le site de test** (envoi des emails). Ordre : migrer, vérifier, pousser. Florent a accepté le principe (« je demande l'accord avant d'appliquer une migration sur Supabase ») : annoncer, puis lancer.
2. ~~Compte équipe de la tablette~~ et ~~code gérant~~ : faits le 20 octobre 2026. Pour les changer : `pnpm staff:account`, `pnpm manager:set-code` (base locale) ou `pnpm manager:set-code:remote` (base Supabase, modifie la base en ligne). Florent tape lui-même ses secrets dans le terminal, jamais dans le chat.
3. **Brevo** (compte ouvert) : créer une clé d'API, faire vérifier une adresse d'expéditeur, puis ajouter `BREVO_API_KEY`, `EMAIL_FROM` et `CRON_SECRET` dans Vercel (Settings, Environment Variables). Tant que ce n'est pas fait, les emails restent en file en production (confirmations, annulations, déplacements, et ceux que le gérant libère).
4. **Supabase** : Authentication, URL Configuration (Site URL et adresse de redirection `…/auth/callback`), puis SMTP Brevo pour le mot de passe oublié.
5. **Vercel Pro** : à prendre avec le client juste avant la livraison (c'est lui qui paie). Passer alors le cron de `vercel.json` à `* * * * *`. D'ici là, l'envoi immédiat des emails couvre le cas normal.
6. Les clés Supabase et le mot de passe de la base, passés dans le chat, sont laissés tels quels par décision de Florent.
7. Domaine définitif, textes légaux validés par un professionnel : avant la mise en ligne.
8. **Vérifier sur la vraie tablette** (iPad, paysage ; tout a été vérifié par captures à 1194 × 834 et 390 × 844, pas sur l'appareil réel) : planning, réservation, espace gérant (carte, équipe, horaires) et absences.

## Ce que le lot 5 a ajouté

- **Carte et habilitations** (`catalog/manage.ts`, R-10 à R-13, R-16, R-17) : ajouter, modifier, retirer et remettre en carte, ordonner, choisir qui réalise quoi. Une prestation n'est jamais supprimée. Le rôle (coiffeurs ou apprentis) ne change pas. Une prestation en ligne exige au moins un coiffeur actif habilité.
- **Équipe** (`staff/manage.ts`, R-02) : ajouter, renommer, ordonner, retirer, remettre. Un nouveau membre est habilité d'office pour les prestations de son rôle. Prénoms uniques parmi les actifs. Retirer le dernier d'une prestation réservable en ligne est refusé.
- **Horaires et fermetures** (`schedule/manage.ts`, R-01, R-03) : jusqu'à 3 plages par jour (la pause est le trou), grille de 15 minutes, fermetures sur jours entiers.
- **Absences** (`absences/`, R-40 à R-43, D-55 à D-57) : déclarées par l'équipe depuis `/equipe/absences`. La liste « RDV à traiter » se **déduit** de l'état (absence, fermeture, hors horaires, coiffeur parti, habilitation retirée) : rien n'est stocké. Pour chaque RDV : confier à un collègue libre, déplacer, annuler avec excuses ; le planning est à jour tout de suite, les **emails restent retenus** (`held_for_manager`) jusqu'à ce que le gérant confirme avec son code (bouton sur l'écran des absences). La retenue vaut aussi depuis la fiche RDV du planning (`needsHold`). Pastille du nombre de RDV à traiter dans la barre ; rappel dans l'espace gérant.
- Journal d'audit pour chaque changement (`service.*`, `staff.*`, `hours.changed`, `closure.*`, `absence.*`, `emails.released`, `appointment.*`).
- Migration `0006_email_held_for_manager`.

## Points d'attention pour la suite

- **Lot 7** : le chiffre d'affaires compte `isHonored` (R-51), pas le champ `status = honored`. Les emails de rappel (R-61) et d'avis (R-64) restent à faire ; ceux du salon (modification, annulation, retenue puis confirmation) sont faits. Un rappel ne doit pas partir pour un RDV annulé ni « à traiter ».
- Le planning n'affiche que l'équipe active : les RDV d'un membre retiré ne se voient que dans `/equipe/absences` tant qu'ils ne sont pas traités.
- Petit défaut connu : la fiche RDV du planning annonce, avant l'action, « un email d'annulation lui est envoyé aussitôt », même pour un RDV à traiter dont l'email sera retenu ; le message affiché après l'action dit la vérité. À corriger si on touche à ce panneau.
- Pas de bouton « jours fériés » : le gérant saisit ses fermetures (R-03). À proposer à Florent si besoin.
- `DaySlots.closed` distingue « Fermé » et « Complet ».

## Pièges déjà rencontrés

- Le shell refuse parfois un long bloc avec plusieurs documents ou des apostrophes (`unexpected EOF`) : écrire les fichiers avec l'outil d'écriture ou d'édition (et les scripts Python avec un fichier), pas avec des heredocs.
- Next 16 : Cache Components activé. Les données dynamiques se lisent derrière `<Suspense>` ou après `await connection()`. La page précédente reste cachée dans le DOM : en test Playwright, `.filter({ visible: true })`. Un fichier `"use server"` ne peut exporter que des fonctions. ESLint refuse `Date.now()` pendant le rendu : utiliser `new Date()`.
- React 19 vide les champs non contrôlés d'un formulaire après chaque action, erreur comprise (voulu pour les mots de passe). Les formulaires à champs contrôlés appellent l'action dans `onSubmit` + `useTransition`.
- Drizzle modifie la conversion des dates du client `postgres` qu'on lui passe : pour du SQL brut avec des `Date`, utiliser un autre client. Dans une sous-requête écrite en `sql`, une colonne de la table externe s'écrit `"staff"."id"` : Drizzle la rend sans préfixe et elle se confond avec celle de la sous-requête.
- Les tests d'intégration vident toutes les tables entre deux tests (`tests/integration/helpers.ts`) : y ajouter toute nouvelle table. Les tests de bout en bout (`tests/e2e/helpers.ts`, `resetData`) vident aussi carte, équipe, horaires et réglages puis rejouent `seed.sql` : chaque test repart des données de départ.
- Le salon est limité à 2 RDV à venir par client (D-41) : un test qui pose plusieurs RDV pour un même client doit relever `max_upcoming_per_customer`.
- Tests Playwright : un serveur de test resté ouvert (port 3100) est **réutilisé avec son ancien build** et fait échouer les parcours au hasard. Avant de lancer `pnpm test:e2e` après un `pnpm build`, s'assurer qu'aucun `scripts/e2e-server.mjs` ne tourne. Les fichiers de test partagent une seule connexion à la base : ne jamais appeler `sql.end()` dans un fichier.
- Verrouillage gérant : `proxy.ts` ne voit pas les en-têtes de préchargement des liens de Next 16, et une Server Action n'a pas renvoyé le `Set-Cookie` d'une suppression : le verrouillage passe par `POST /equipe/verrouiller`. Un chargement complet de page (`goto`, `reload`) reverrouille, de façon pas toujours fiable : dans les tests, passer d'un écran à l'autre par les liens, et ressaisir le code après un `goto`.
- Playwright : le profil « tablette » est aussi `isMobile` ; distinguer le téléphone par la largeur (< 768 px). Un cookie `Secure` sur http n'est pas renvoyé par WebKit. Dans l'écran des absences, la liste des emails retenus est dans la même région que les cartes : compter les cartes avec le bouton « Déplacer », pas avec `listitem` seul.
- Mise en page : dans une colonne `flex` qui défile, les enfants rétrécissent (un bouton de 52 px devenait une barre). Ajouter `[&>*]:shrink-0` au conteneur.
- Un changement d'heure tombe le dernier dimanche d'octobre : les tests de dates autour du 25 octobre 2026 s'en souviennent (10 h à Paris = 8 h UTC avant, 9 h UTC après).

## Message à coller pour démarrer la prochaine conversation

```text
Tu es le développeur principal du site et de l'application de réservation d'Elegance Strasbourg.
Lis CLAUDE.md, puis docs/reprise.md : les lots 0, 1, 2, 3, 4 et 5 sont validés.
Prépare le plan du lot 6, la vitrine (voir docs/transmission-code.md, docs/design/ et les maquettes du canevas), pose-moi les questions nécessaires, puis attends ma validation avant d'écrire du code.
Travaille ensuite comme avant : tests d'abord, une règle R-xx = au moins un test, décisions notées dans docs/decisions.md, vérification sur mobile et sur tablette.
À la fin du lot, mets à jour docs/reprise.md et prépare le message de la conversation suivante.
Point de départ : [Ajoutez ici le résultat de l'essai du lot 5 sur la vraie tablette, ou le message d'erreur s'il y en a un.]
```
