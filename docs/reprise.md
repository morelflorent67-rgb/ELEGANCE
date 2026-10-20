# Reprise du projet : où on en est

Ce document permet de reprendre le travail dans une **nouvelle conversation**, sans rien perdre. Il se met à jour à la fin de chaque lot.
À jour au **20 octobre 2026**, fin du lot 4 (validé par Florent le 20 octobre 2026).

## Avancement

| Lot | Contenu | État |
| --- | --- | --- |
| 0 | Socle : projet, dépôt, base, tests, déploiement | Validé |
| 1 | Moteur de créneaux, schéma, contrainte anti-chevauchement | Validé |
| 2 | Réservation client, comptes, email de confirmation | Validé |
| 3 | Espace client : Mes RDV, modifier ou annuler jusqu'à 48 h, « Reprendre le même RDV », Mes informations, suppression du compte | Validé |
| 4 | Planning tablette : 4 colonnes, fiche RDV, réservation par le salon, lapins, code gérant, choix de l'auteur | Validé |
| 5 à 8 | Gestion, vitrine, emails et tableau de bord, recette | À venir (voir `transmission-code.md`) |

Tests à la fin du lot 4 : **391 Vitest** (unitaires et intégration sur Postgres réel) et **134 parcours Playwright** (115 exécutés ; 19 réservés à la tablette sont sautés sur mobile). Aucun ne doit casser. Lint, typecheck et build verts.

## Accès

- Dépôt : https://github.com/morelflorent67-rgb/ELEGANCE (public, branche `main`). Je pousse sans redemander ; l'intégration continue doit rester verte.
- Site de test : https://elegance-git-main-elegance13.vercel.app (protection de déploiement désactivée volontairement, `noindex`).
- Supabase de test : Postgres 17, région UE. Les clés sont dans `.env.local` (jamais commité). `pnpm db:migrate:remote` et `pnpm db:seed:remote` modifient la base en ligne : annoncer ce qu'on fait.
- Florent est non technicien : français simple, étapes numérotées, noms exacts des boutons. Ne jamais lui demander de coller un secret dans le chat. Je ne saisis pas de secrets dans les formulaires de sites web : je le guide.

## Ce qui existe

- `src/modules/availability` (créneaux, fonctions pures), `booking` (`createAppointment`, `rescheduleAppointment`, `cancelAppointment` : seuls chemins d'écriture d'un RDV), `catalog`, `customers` (comptes, limitation d'essais, `profile.ts` : informations, mot de passe, suppression par anonymisation), `auth` (Supabase ou mémoire), `mail` (file d'envoi, modèles confirmation, modification, annulation, Brevo), `calendar`, `appointments` (lecture et présentation de « Mes RDV »), `audit` (`recordAudit`), `security`.
- Pages : `/reservation` (aussi `?modifier=<id>` et `?reprendre=<id>`), `/reservation/confirmation`, `/connexion`, `/inscription`, `/mot-de-passe-oublie`, `/mot-de-passe/nouveau`, `/compte/rendez-vous`, `/compte/informations`, `/compte/supprime`, pages légales provisoires.
- Toutes les décisions techniques sont dans `docs/decisions.md`. Les règles et décisions métier sont dans `docs/dossier-projet.md` (R-xx, D-01 à D-49).
- Maquettes : canevas Claude Design (lien dans `docs/design/README.md`, lisible avec l'outil Artifact, action `read`). Copies utiles dans `docs/design/maquettes/`. Pour le lot 4, lire dans le canevas : `Tablette-Planning`, `Tablette-Reserver`, `DS-Planning`.

## Actions en attente (à demander à Florent, jamais sans son accord)

1. ~~Compte équipe de la tablette~~ : **fait le 20 octobre 2026** par Florent (connexion testée sur le site de test). Pour le recréer ou changer le mot de passe : `pnpm staff:account` crée l'utilisateur Supabase de la tablette (email, mot de passe de 12 caractères au moins, tapés dans le terminal). Il modifie le projet Supabase en ligne : annoncer, guider pas à pas. Puis, sur la tablette : ouvrir `/equipe/connexion` une seule fois.
2. ~~Code gérant~~ : **fait le 20 octobre 2026** par Florent sur la base Supabase (espace gérant testé). Pour le changer : `pnpm manager:set-code` (base locale) ou `pnpm manager:set-code:remote` (base Supabase, modifie la base en ligne). Florent choisit lui-même ses 6 chiffres, tapés dans le terminal sans s'afficher ; ne jamais les lui faire écrire dans le chat. Tant qu'il n'est pas défini, l'espace gérant reste fermé et le dit.
3. **Brevo** (compte ouvert) : créer une clé d'API, faire vérifier une adresse d'expéditeur, puis ajouter `BREVO_API_KEY`, `EMAIL_FROM` et `CRON_SECRET` dans Vercel (Settings, Environment Variables). Tant que ce n'est pas fait, les emails restent en file en production (confirmations, et désormais aussi annulations et déplacements décidés par le salon).
4. **Supabase** : Authentication, URL Configuration (Site URL et adresse de redirection `…/auth/callback`), puis SMTP Brevo pour le mot de passe oublié.
5. **Vercel Pro** : à prendre avec le client juste avant la livraison (c'est lui qui paie). Passer alors le cron de `vercel.json` à `* * * * *`. D'ici là, l'envoi immédiat des emails couvre le cas normal.
6. Les clés Supabase et le mot de passe de la base, passés dans le chat, sont laissés tels quels par décision de Florent.
7. Domaine définitif, textes légaux validés par un professionnel : avant la mise en ligne.
8. **Vérifier sur la vraie tablette** (iPad, paysage ; la connexion a été testée sur ordinateur) : le planning, la réservation et l'espace gérant ont été vérifiés par captures à 1194 × 834 et 390 × 844, pas sur l'appareil réel.

## Ce que le lot 4 a ajouté

- `src/modules/staff` (accès équipe, auteurs, code gérant : `manager-code.ts` haché scrypt, `manager-unlock.ts` preuve de 5 minutes, `manager.ts` saisie limitée), `src/modules/booking/salon-changes.ts` (annulation, déplacement, lapins du salon), `src/modules/customers/staff-view.ts` (recherche, fiche, blocage, suppression par le gérant, clients à surveiller), `src/modules/planning` (planning du jour, fiche RDV), `src/modules/appointments/status.ts` (R-51 calculé, pas enregistré).
- Pages `/equipe/*` (voir `docs/decisions.md`, entrée « Écrans de la tablette »), route `POST /equipe/verrouiller`, scripts `pnpm staff:account` et `pnpm manager:set-code[:remote]`.
- Décisions métier D-50 à D-54 dans `docs/dossier-projet.md`.

## Points d'attention pour le lot 5

- **Absences** (R-40 à R-43) : le planning affiche déjà les absences et ne propose jamais de créneau pendant l'une d'elles. Il reste l'écran de saisie, la liste des RDV touchés (confier à un collègue, déplacer, annuler avec excuses : `salonRescheduleAppointment` et `salonCancelAppointment` existent et exigent un auteur) et la confirmation du gérant avant tout email (R-43). L'entrée « Absences » du menu est grisée.
- **Espace gérant** : `/equipe/gerant` est prêt à recevoir Carte et tarifs, Équipe et habilitations, Horaires et fermetures (entrées grisées « Bientôt »). Toute nouvelle fonction gérant : page derrière `managerUnlocked`, action derrière `asManager` (prolonge le déverrouillage), entrée au journal avec `actorType: "manager"`.
- Le chiffre d'affaires (lot 7) doit compter `isHonored` (R-51), pas le champ `status = honored`.
- `DaySlots.closed` existe : « Fermé » et « Complet » se distinguent.
- Les emails de rappel (R-61) et d'avis (R-64) restent au lot 7 ; ceux du salon (modification, annulation) sont faits.

## Pièges déjà rencontrés

- Le shell refuse parfois un long bloc avec plusieurs documents ou des apostrophes (`unexpected EOF`) : écrire les fichiers avec l'outil d'écriture (et les scripts Python avec un fichier), pas avec des heredocs.
- Next 16 : Cache Components activé. Les données dynamiques se lisent derrière `<Suspense>` ou après `await connection()`. La page précédente reste cachée dans le DOM : en test Playwright, `.filter({ visible: true })`. Un fichier `"use server"` ne peut exporter que des fonctions. ESLint refuse `Date.now()` pendant le rendu : utiliser `new Date()`.
- React 19 vide les champs non contrôlés d'un formulaire après chaque action, erreur comprise (voulu pour les mots de passe). Les formulaires à champs contrôlés (« Mes informations ») appellent l'action dans `onSubmit` + `useTransition`.
- Drizzle modifie la conversion des dates du client `postgres` qu'on lui passe : pour du SQL brut avec des `Date`, utiliser un autre client.
- Les tests d'intégration vident toutes les tables entre deux tests (`tests/integration/helpers.ts`) : y ajouter toute nouvelle table.
- Tests Playwright : un serveur de test resté ouvert (port 3100) est **réutilisé avec son ancien build** et fait échouer les parcours au hasard. Avant de lancer `pnpm test:e2e` après un `pnpm build`, s'assurer qu'aucun `scripts/e2e-server.mjs` ne tourne. Les fichiers de test partagent une seule connexion à la base : ne jamais appeler `sql.end()` dans un fichier.
- Verrouillage gérant : `proxy.ts` ne voit pas les en-têtes de préchargement des liens de Next 16 (il supprimait le cookie au survol d'un lien), et une Server Action n'a pas renvoyé le `Set-Cookie` d'une suppression : le verrouillage passe par `POST /equipe/verrouiller`. Un chargement complet de page (onglet rechargé) reverrouille aussi : dans les tests, ressaisir le code après chaque `page.goto`.
- Playwright : le profil « tablette » est aussi `isMobile` ; distinguer le téléphone par la largeur (< 768 px). Un cookie `Secure` sur http n'est pas renvoyé par WebKit.
- Un changement d'heure tombe le dernier dimanche d'octobre : les tests de dates autour du 25 octobre 2026 s'en souviennent (10 h à Paris = 8 h UTC avant, 9 h UTC après).

## Message à coller pour démarrer la prochaine conversation

```text
Tu es le développeur principal du site et de l'application de réservation d'Elegance Strasbourg.
Lis CLAUDE.md, puis docs/reprise.md : les lots 0, 1, 2, 3 et 4 sont validés.
Prépare le plan du lot 5 (voir docs/transmission-code.md et le dossier projet), pose-moi les questions nécessaires, puis attends ma validation avant d'écrire du code.
Travaille ensuite comme avant : tests d'abord, une règle R-xx = au moins un test, décisions notées dans docs/decisions.md, vérification sur mobile et sur tablette.
À la fin du lot, mets à jour docs/reprise.md et prépare le message de la conversation suivante.
```
