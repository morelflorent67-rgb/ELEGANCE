# Reprise du projet : où on en est

Ce document permet de reprendre le travail dans une **nouvelle conversation**, sans rien perdre. Il se met à jour à la fin de chaque lot.
À jour au **20 octobre 2026**, fin du lot 2.

## Avancement

| Lot | Contenu | État |
| --- | --- | --- |
| 0 | Socle : projet, dépôt, base, tests, déploiement | Validé |
| 1 | Moteur de créneaux, schéma, contrainte anti-chevauchement | Validé |
| 2 | Réservation client, comptes, email de confirmation | Validé |
| 3 | Espace client : Mes RDV, modifier ou annuler jusqu'à 48 h, « Reprendre le même RDV », Mes informations | **À faire : proposer le plan, attendre la validation** |
| 4 à 8 | Planning tablette, gestion, vitrine, emails et tableau de bord, recette | À venir (voir `transmission-code.md`) |

Tests à la fin du lot 2 : 208 Vitest (unitaires et intégration sur Postgres réel) et 50 parcours Playwright (mobile et tablette). Aucun ne doit casser.

## Accès

- Dépôt : https://github.com/morelflorent67-rgb/ELEGANCE (public, branche `main`). Je pousse sans redemander ; l'intégration continue doit rester verte.
- Site de test : https://elegance-git-main-elegance13.vercel.app (protection de déploiement désactivée volontairement, `noindex`).
- Supabase de test : Postgres 17, région UE. Les clés sont dans `.env.local` (jamais commité). `pnpm db:migrate:remote` et `pnpm db:seed:remote` modifient la base en ligne : annoncer ce qu'on fait.
- Florent est non technicien : français simple, étapes numérotées, noms exacts des boutons. Ne jamais lui demander de coller un secret dans le chat. Je ne saisis pas de secrets dans les formulaires de sites web : je le guide.

## Ce qui existe

- `src/modules/availability` (créneaux, fonctions pures), `booking` (`createAppointment`, seul chemin d'écriture d'un RDV), `catalog`, `customers` (comptes, limitation d'essais), `auth` (Supabase ou mémoire), `mail` (file d'envoi, modèles, Brevo), `calendar`, `appointments` (lecture), `security`.
- Pages : `/reservation`, `/reservation/confirmation`, `/connexion`, `/inscription`, `/mot-de-passe-oublie`, `/mot-de-passe/nouveau`, `/compte/rendez-vous` (**provisoire, lecture seule : le lot 3 la remplace**), pages légales provisoires.
- Toutes les décisions techniques sont dans `docs/decisions.md`. Les règles et décisions métier sont dans `docs/dossier-projet.md` (R-xx, D-01 à D-45).
- Maquettes : canevas Claude Design (lien dans `docs/design/README.md`, lisible avec l'outil Artifact, action `read`). Copies utiles dans `docs/design/maquettes/`. Pour le lot 3, lire dans le canevas : `Compte-RDV`, `Compte-Annuler`, `Compte-Infos`, `Compte-Supprimer`, `Email-Modification`, `Email-Annulation`.

## Points d'attention pour le lot 3

- R-30 à R-32 (modifier ou annuler jusqu'à 48 h, jamais après, jamais pour un RDV pris à moins de 48 h), R-75 (suppression de compte = anonymisation, D-43), R-76. Les délais viennent de `salon_settings.change_cutoff_hours`.
- Réutiliser `createAppointment` pour « Reprendre le même RDV » et pour la modification (même transaction, mêmes verrous). Une modification libère l'ancien créneau et prend le nouveau dans la même transaction.
- Question à poser à Florent : l'email de modification et d'annulation (R-63, lot 7) part-il dès le lot 3 pour les changements faits par le client lui-même ? Les modèles existent dans la maquette.
- Le journal d'audit (`audit_log`) est vide : R-43, R-54, R-74 arrivent aux lots 4 et 5.

## Actions de Florent en attente (comptes)

1. **Brevo** (compte ouvert) : créer une clé d'API, faire vérifier une adresse d'expéditeur, puis ajouter `BREVO_API_KEY`, `EMAIL_FROM` et `CRON_SECRET` dans Vercel (Settings, Environment Variables). Tant que ce n'est pas fait, les emails restent en file en production.
2. **Supabase** : Authentication, URL Configuration (Site URL et adresse de redirection `…/auth/callback`), puis SMTP Brevo pour le mot de passe oublié.
3. **Vercel Pro** : à prendre avec le client juste avant la livraison (c'est lui qui paie). Passer alors le cron de `vercel.json` à `* * * * *`. D'ici là, l'envoi immédiat des emails couvre le cas normal.
4. Les clés Supabase et le mot de passe de la base, passés dans le chat, sont laissés tels quels par décision de Florent.
5. Domaine définitif, textes légaux validés par un professionnel : avant la mise en ligne.

## Pièges déjà rencontrés

- Le shell refuse parfois un long bloc avec plusieurs documents ici-même (`unexpected EOF`) : écrire les fichiers avec l'outil d'écriture, pas avec des heredocs.
- Next 16 : Cache Components activé. Les données dynamiques se lisent derrière `<Suspense>` ou après `await connection()`. La page précédente reste cachée dans le DOM : en test Playwright, `.filter({ visible: true })`. Un fichier `"use server"` ne peut exporter que des fonctions.
- Drizzle modifie la conversion des dates du client `postgres` qu'on lui passe : pour du SQL brut avec des `Date`, utiliser un autre client.
- Les tests d'intégration vident toutes les tables entre deux tests (`tests/integration/helpers.ts`) : y ajouter toute nouvelle table.

## Message à coller pour démarrer la prochaine conversation

```text
Tu es le développeur principal du site et de l'application de réservation d'Elegance Strasbourg.
Lis CLAUDE.md, puis docs/reprise.md : les lots 0, 1 et 2 sont validés.
Prépare le plan du lot 3 (voir docs/transmission-code.md et le dossier projet), pose-moi les questions nécessaires, puis attends ma validation avant d'écrire du code.
Travaille ensuite comme avant : tests d'abord, une règle R-xx = au moins un test, décisions notées dans docs/decisions.md, vérification sur mobile.
À la fin du lot, mets à jour docs/reprise.md et prépare le message de la conversation suivante.
```
