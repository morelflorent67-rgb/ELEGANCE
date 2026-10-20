# Reprise du projet : où on en est

Ce document permet de reprendre le travail dans une **nouvelle conversation**, sans rien perdre. Il se met à jour à la fin de chaque lot.
À jour au **20 octobre 2026**, fin du lot 3 (terminé, en attente de validation de Florent).

## Avancement

| Lot | Contenu | État |
| --- | --- | --- |
| 0 | Socle : projet, dépôt, base, tests, déploiement | Validé |
| 1 | Moteur de créneaux, schéma, contrainte anti-chevauchement | Validé |
| 2 | Réservation client, comptes, email de confirmation | Validé |
| 3 | Espace client : Mes RDV, modifier ou annuler jusqu'à 48 h, « Reprendre le même RDV », Mes informations, suppression du compte | **Terminé, à valider par Florent** |
| 4 | Planning tablette : 4 colonnes, fiche RDV, réservation par le salon, lapins, code gérant, choix de l'auteur | **À faire : proposer le plan, attendre la validation** |
| 5 à 8 | Gestion, vitrine, emails et tableau de bord, recette | À venir (voir `transmission-code.md`) |

Tests à la fin du lot 3 : **294 Vitest** (unitaires et intégration sur Postgres réel) et **88 parcours Playwright** (mobile et tablette). Aucun ne doit casser. Lint, typecheck et build verts.

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

1. **Migration `0005_email_outbox_payload`** à appliquer à la base Supabase de test : `pnpm db:migrate:remote` (ajoute une colonne à `email_outbox`). Sans elle, le site de test en ligne ne sait pas écrire les emails de déplacement.
2. **`pnpm smoke:auth`** à lancer une fois : il vérifie sur le vrai Supabase le changement d'adresse email et le code « adresse déjà prise » (comptes jetables créés puis supprimés). Le code Supabase de `verifyPassword` et `updateEmail` n'a pas encore été vu fonctionner en vrai.
3. **Brevo** (compte ouvert) : créer une clé d'API, faire vérifier une adresse d'expéditeur, puis ajouter `BREVO_API_KEY`, `EMAIL_FROM` et `CRON_SECRET` dans Vercel (Settings, Environment Variables). Tant que ce n'est pas fait, les emails restent en file en production.
4. **Supabase** : Authentication, URL Configuration (Site URL et adresse de redirection `…/auth/callback`), puis SMTP Brevo pour le mot de passe oublié.
5. **Vercel Pro** : à prendre avec le client juste avant la livraison (c'est lui qui paie). Passer alors le cron de `vercel.json` à `* * * * *`. D'ici là, l'envoi immédiat des emails couvre le cas normal.
6. Les clés Supabase et le mot de passe de la base, passés dans le chat, sont laissés tels quels par décision de Florent.
7. Domaine définitif, textes légaux validés par un professionnel : avant la mise en ligne.

## Points d'attention pour le lot 4

- `cancelAppointment` et `rescheduleAppointment` sont **réservés au client** (délai de 48 h, RDV du client). Le salon modifie ou annule à tout moment (R-33) : écrire des variantes « salon » qui réutilisent les mêmes contrôles de créneau, sans le délai, avec l'auteur choisi sur la tablette (R-74) et une entrée au journal. `createAppointment` accepte déjà `source: "salon"` et `createdByStaffId`.
- Email d'annulation et de modification : les modèles actuels parlent au client qui a agi lui-même (« Merci de nous avoir prévenus »). Pour un changement décidé par le salon (R-63, D-20 : l'équipe appelle, un email confirme), prévoir un texte adapté ; la file `email_outbox` et son champ `payload` sont prêts.
- `anonymizeCustomer(db, { onImminent: "cancel", actor: { type: "manager" } })` existe pour « le gérant supprime une fiche client » (R-75) : il reste l'écran et le code gérant (R-73).
- R-51 (RDV honoré par défaut une fois passé) n'est pas encore codé : « Mes RDV » traite aujourd'hui un RDV confirmé et terminé comme passé. Le signalement des lapins (R-52) et le blocage par le gérant (colonne `online_booking_blocked`, déjà respectée par la réservation en ligne) arrivent au lot 4.
- « Non venu » n'est jamais montré au client dans « Passés ».
- Le journal d'audit reçoit déjà les actions du client ; R-43, R-54, R-74 arrivent aux lots 4 et 5.

## Pièges déjà rencontrés

- Le shell refuse parfois un long bloc avec plusieurs documents ou des apostrophes (`unexpected EOF`) : écrire les fichiers avec l'outil d'écriture (et les scripts Python avec un fichier), pas avec des heredocs.
- Next 16 : Cache Components activé. Les données dynamiques se lisent derrière `<Suspense>` ou après `await connection()`. La page précédente reste cachée dans le DOM : en test Playwright, `.filter({ visible: true })`. Un fichier `"use server"` ne peut exporter que des fonctions. ESLint refuse `Date.now()` pendant le rendu : utiliser `new Date()`.
- React 19 vide les champs non contrôlés d'un formulaire après chaque action, erreur comprise (voulu pour les mots de passe). Les formulaires à champs contrôlés (« Mes informations ») appellent l'action dans `onSubmit` + `useTransition`.
- Drizzle modifie la conversion des dates du client `postgres` qu'on lui passe : pour du SQL brut avec des `Date`, utiliser un autre client.
- Les tests d'intégration vident toutes les tables entre deux tests (`tests/integration/helpers.ts`) : y ajouter toute nouvelle table.
- Tests Playwright : un serveur de test resté ouvert (port 3100) est **réutilisé avec son ancien build** et fait échouer les parcours au hasard. Avant de lancer `pnpm test:e2e` après un `pnpm build`, s'assurer qu'aucun `scripts/e2e-server.mjs` ne tourne. Les fichiers de test partagent une seule connexion à la base : ne jamais appeler `sql.end()` dans un fichier.
- Un changement d'heure tombe le dernier dimanche d'octobre : les tests de dates autour du 25 octobre 2026 s'en souviennent (10 h à Paris = 8 h UTC avant, 9 h UTC après).

## Message à coller pour démarrer la prochaine conversation

```text
Tu es le développeur principal du site et de l'application de réservation d'Elegance Strasbourg.
Lis CLAUDE.md, puis docs/reprise.md : les lots 0, 1, 2 et 3 sont validés.
Prépare le plan du lot 4 (voir docs/transmission-code.md et le dossier projet), pose-moi les questions nécessaires, puis attends ma validation avant d'écrire du code.
Travaille ensuite comme avant : tests d'abord, une règle R-xx = au moins un test, décisions notées dans docs/decisions.md, vérification sur mobile et sur tablette.
À la fin du lot, mets à jour docs/reprise.md et prépare le message de la conversation suivante.
```
