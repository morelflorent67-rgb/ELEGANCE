# Elegance Strasbourg : site et réservation

## Sources de vérité
- docs/reprise.md : où en est le projet, ce qui reste à faire, pièges connus, message de démarrage. À lire en premier dans une nouvelle conversation, et à mettre à jour à la fin de chaque lot.
- docs/dossier-projet.md : règles métier R-xx et décisions D-xx. Elles font foi.
- docs/transmission-code.md : stack, principes d'architecture, lots.
- docs/design/ : passation design (README, design-tokens.json, theme.css, motion.ts). Maquettes : canevas Claude Design, lien dans le README.
- En cas d'écart, docs/dossier-projet.md l'emporte sur docs/design/ (voir docs/design/CORRECTIONS.md).
- docs/decisions.md : décisions techniques, à compléter à chaque choix.
- assets/ : logo et photos traitées, à copier dans public/ au lot 0.

## Règles de travail
- Une règle R-xx = au moins un test. Pas de règle codée sans test.
- Règle ambiguë ou contradictoire : poser la question, ne jamais supposer.
- Créneaux calculés uniquement côté serveur, dans le module de disponibilité.
- Heures stockées en UTC, calculées en Europe/Paris.
- Aucun accès à la base depuis le navigateur.
- Réglages du salon en base, jamais en dur dans le code.
- Aucune nouvelle dépendance sans justification dans docs/decisions.md.
- Interface en français ; code et noms techniques en anglais.

## Avant de dire qu'un lot est fini
- Tous les tests passent, ceux des lots précédents compris.
- Le parcours a été vérifié sur mobile, et sur tablette pour le salon.

## Commandes
- `pnpm dev` : serveur de développement ; `pnpm build` puis `pnpm start` : version de production.
- `pnpm db:start` : démarre la base Postgres locale (sans Docker, données dans `.local-db/`) et applique les migrations ; `pnpm db:stop`, `pnpm db:status`, `pnpm db:reset` (efface tout).
- `pnpm db:seed` : données de départ (équipe, carte, horaires, réglages), rejouable sans rien écraser ; `pnpm db:seed:remote` et `pnpm db:migrate:remote` visent la base Supabase (modifient la base en ligne : demander l'accord avant).
- `pnpm db:generate` : génère une migration depuis `src/db/schema.ts` ; `pnpm db:generate --custom --name=...` pour du SQL écrit à la main (contraintes) ; `pnpm db:migrate` l'applique.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (unitaires), `pnpm test:integration` (Postgres réel, instance temporaire démarrée toute seule), `pnpm test:e2e` (Playwright mobile et tablette ; démarre seul sa base temporaire, l'authentification en mémoire et le site : `scripts/e2e-server.mjs`), `pnpm test:all` : tout.
- `pnpm smoke:auth` : contrôle manuel de l'authentification Supabase réelle (crée puis supprime un compte jetable sur le projet de test).
- Variables : copier `.env.example` vers `.env.local`. Jamais de `NEXT_PUBLIC_` pour la base ni pour Supabase.

## Next.js 16
- Cette version diffère de ce qu'on connaît (Cache Components activé, `proxy` à la place de `middleware`, `LayoutProps` généré par `next typegen`). Lire `node_modules/next/dist/docs/` avant d'écrire du code Next.
- Données dynamiques (base, session, cookies) : lues derrière `<Suspense>` ou après `await connection()`.

## Modules métier
- `src/modules/availability` : `engine.ts` (fonctions pures : créneaux, vérification d'un créneau, attribution « Sans préférence »), puis chargement en base et `getDaySlots`.
- `src/modules/booking` : `createAppointment` (création), `rescheduleAppointment` et `cancelAppointment` (modification et annulation par le client, délai de 48 h revérifié, R-30 à R-32) : seuls chemins d'écriture d'un RDV (transaction, verrous, revérification, R-13/14/16/17/18/20 à 25).
- Les modules reçoivent la base en paramètre (`Database`), jamais le client global : ils se testent sur une base de test.
- Refus métier = `DomainError` avec un code stable (`src/lib/domain-error.ts`) ; l'interface le traduit en français.
- `src/modules/mail` : file d'envoi (`email_outbox`), modèles d'emails en TypeScript (tableaux HTML), envoi Brevo, reprise. Un email s'écrit dans la file dans la même transaction que son RDV ; l'envoi se fait après la réponse (`after`) et le cron reprend les échecs.
- `src/modules/auth` : interface d'authentification (Supabase en production, mémoire pour les tests, refusée sur Vercel). `src/modules/customers` : comptes clients, limitation d'essais, état de réservation, « Mes informations » et suppression de compte (`profile.ts`, anonymisation R-75). `src/modules/audit` : journal d'audit, à écrire dans la transaction de l'action.
- Next 16 garde la page précédente cachée dans le DOM : dans les tests Playwright, filtrer les textes avec `.filter({ visible: true })`.
