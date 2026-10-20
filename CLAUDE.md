# Elegance Strasbourg : site et réservation

## Sources de vérité
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
- `pnpm db:generate` : génère une migration depuis `src/db/schema.ts` ; `pnpm db:generate --custom --name=...` pour du SQL écrit à la main (contraintes) ; `pnpm db:migrate` l'applique.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (unitaires), `pnpm test:integration` (Postgres réel, instance temporaire démarrée toute seule), `pnpm test:e2e` (Playwright mobile et tablette), `pnpm test:all` : tout.
- Variables : copier `.env.example` vers `.env.local`. Jamais de `NEXT_PUBLIC_` pour la base ni pour Supabase.

## Next.js 16
- Cette version diffère de ce qu'on connaît (Cache Components activé, `proxy` à la place de `middleware`, `LayoutProps` généré par `next typegen`). Lire `node_modules/next/dist/docs/` avant d'écrire du code Next.
- Données dynamiques (base, session, cookies) : lues derrière `<Suspense>` ou après `await connection()`.
