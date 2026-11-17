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
- `pnpm db:seed` : données de départ (équipe, carte, horaires, réglages), rejouable sans rien écraser. Les scripts (`db:migrate`, `db:seed`, `staff:account`, `manager:set-code`, `customers:import`) visent la base de `DATABASE_URL` : `.env.production` s'il existe (sur le serveur), sinon `.env.local`. Sur le serveur, ils modifient la vraie base : annoncer avant.
- `pnpm db:generate` : génère une migration depuis `src/db/schema.ts` ; `pnpm db:generate --custom --name=...` pour du SQL écrit à la main (contraintes) ; `pnpm db:migrate` l'applique.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (unitaires), `pnpm test:integration` (Postgres réel, instance temporaire démarrée toute seule), `pnpm test:e2e` (Playwright mobile et tablette ; démarre seul sa base temporaire, l'authentification en mémoire et le site : `scripts/e2e-server.mjs`), `pnpm test:all` : tout.
- `pnpm staff:account` : crée le compte « équipe » de la tablette (table `auth_user`, rôle `staff`) ; `pnpm manager:set-code` : définit le code gérant à 6 chiffres. Les deux se tapent dans le terminal, rien dans le chat ni en ligne de commande.
- `pnpm measure:vitrine` : mesure ponctuelle de la vitrine (FCP, LCP, CLS, poids) sur un build lancé par `pnpm start -p 3300`.
- **`pnpm build` lit la base** (la vitrine est prérendue, `DATABASE_URL` requis, comme sur le serveur et en intégration continue).
- Variables : copier `.env.example` vers `.env.local` (`APP_SECRET` est obligatoire). Jamais de `NEXT_PUBLIC_` pour la base.
- **Faux pilotes** (`AUTH_DRIVER=memory`, `PAYMENT_DRIVER=fake`, emails « journal » en production) : refusés sans `ALLOW_TEST_DRIVERS=true` (`src/lib/test-drivers.ts`). Cette variable n'existe que dans les environnements de test, jamais sur le serveur.

## Next.js 16
- Cette version diffère de ce qu'on connaît (Cache Components activé, `proxy` à la place de `middleware`, `LayoutProps` généré par `next typegen`). Lire `node_modules/next/dist/docs/` avant d'écrire du code Next.
- Données dynamiques (base, session, cookies) : lues derrière `<Suspense>` ou après `await connection()`.

## Modules métier
- `src/modules/availability` : `engine.ts` (fonctions pures : créneaux, vérification d'un créneau, attribution « Sans préférence »), puis chargement en base et `getDaySlots`.
- `src/modules/booking` : `createAppointment` (création), `rescheduleAppointment` et `cancelAppointment` (modification et annulation par le client, délai de 48 h revérifié, R-30 à R-32) : seuls chemins d'écriture d'un RDV (transaction, verrous, revérification, R-13/14/16/17/18/20 à 25).
- Les modules reçoivent la base en paramètre (`Database`), jamais le client global : ils se testent sur une base de test.
- Refus métier = `DomainError` avec un code stable (`src/lib/domain-error.ts`) ; l'interface le traduit en français.
- `src/modules/booking/salon-changes.ts` : annulation, déplacement et lapins décidés par le salon (R-33, R-51, R-74) : auteur obligatoire, journal. `src/modules/staff` : accès équipe, auteurs, code gérant (R-72, R-73). `src/modules/planning` : planning du jour et fiche RDV. `src/modules/customers/staff-view.ts` : recherche, fiche, blocage, suppression par le gérant. `src/app/equipe` : la tablette ; chaque page et chaque action y vérifie elle-même l'accès (`requireStaff`, `asStaff`, `asManager`).
- Lot 5 (gestion, tout dans l'espace gérant sauf les absences) : `src/modules/catalog/manage.ts` (carte et habilitations), `src/modules/staff/manage.ts` (équipe), `src/modules/schedule/manage.ts` (horaires et fermetures), `src/modules/absences` (absences, RDV « à traiter » déduits de l'état, retenue et confirmation des emails, R-40 à R-43, D-55 à D-57). Chacune est une transaction qui écrit son entrée au journal, auteur « gérant » (ou « équipe » pour les absences). Pages `/equipe/gerant/{carte,equipe,horaires}` et `/equipe/absences`.
- `src/modules/mail` : file d'envoi (`email_outbox`), modèles d'emails en TypeScript (tableaux HTML), envoi Brevo, reprise. Un email s'écrit dans la file dans la même transaction que son RDV ; l'envoi se fait après la réponse (`after`) et le cron reprend les échecs. Un email peut être « retenu » (`held_for_manager`) jusqu'à la confirmation du gérant : ni l'envoi immédiat ni le cron ne le prennent.
- `src/modules/auth` : interface d'authentification (`postgres-driver.ts` en production : comptes et sessions en base, scrypt, D-116 ; mémoire pour les tests, interdite sans `ALLOW_TEST_DRIVERS`). Un fichier lu directement par Node (scripts) n'a aucun import `@/` : `password.ts`, `staff-account.ts`. `src/modules/customers` : comptes clients, limitation d'essais, état de réservation, « Mes informations » et suppression de compte (`profile.ts`, anonymisation R-75). `src/modules/audit` : journal d'audit, à écrire dans la transaction de l'action.
- Next 16 garde la page précédente cachée dans le DOM : dans les tests Playwright, filtrer les textes avec `.filter({ visible: true })`.

- Conservation (R-101, D-121) : `src/modules/customers/inactive.ts` supprime chaque jour (depuis `/api/cron/send-emails`) les fiches sans activité depuis 3 ans, via `anonymizeCustomer` (auteur `system`).

## API mobile (lot 25, D-123)
- `src/modules/mobile/api.ts` : `createMobileApi(env)` porte toute l'API de l'app iPhone (aucune règle : elle appelle `booking`, `waitlist`, `customers`, `loyalty`) ; `bearer.ts` : le jeton `Authorization: Bearer` tient lieu de cookie, même pilote `createPostgresDriver`. Routes fines dans `src/app/api/mobile/v1/**` (une route = `handle(request, (call) => call.api.xxx(...))`, `_lib.ts`). Ajouter une route : une méthode dans `api.ts` + son test dans `tests/integration/mobile-api.test.ts` + un fichier `route.ts`. Refus = `{ code }` (jamais de texte), l'app a la table de traduction. Même limites d'essais que le site : si on change un compteur dans une action du site, le changer aussi dans `api.ts`.

## Notifications (lot 27, R-102, D-124)
- `src/modules/push` : `apns.ts` (envoi direct à Apple), `devices.ts` (appareils), `for-email.ts` + `messages.ts` (la notification qui suit un email). `processOutbox` reçoit `push` (de `pushFromEnv()`, vide tant que `APNS_KEY` n'est pas posée) : **la notification part après l'email, jamais avant**, donc elle hérite de toutes ses règles. Un nouveau type de notification = un cas dans `for-email.ts` + son test dans `tests/integration/push.test.ts`. App : `mobile/src/notifications.ts`, `calendar.ts`, `calendar-button.tsx`.

## App iPhone (lot 26, `mobile/`)
- `mobile/` est un projet **à part** (npm, pas pnpm ; son `package.json`, `.npmrc`, `app.json`, `eas.json`) : ses commandes se lancent depuis ce dossier. `npm test` (Jest : fonctions pures, client de l'API), `npm run typecheck`, `npx expo export --platform ios --output-dir .export-check` (vérifie que l'app se compile, puis supprimer le dossier), `npx expo start` (essai sur l'iPhone avec Expo Go ; `EXPO_PUBLIC_API_BASE_URL=http://<ip du PC>:3000` pour viser un serveur local). Écrans : `app/` (expo-router : `(tabs)` accueil, rendez-vous, fidélité, compte ; `reserver/` une étape par écran ; `connexion`, `mot-de-passe`, `attente/[id]`). Code : `src/` (`api/client.ts` client de l'API, `session.tsx`, `booking.tsx`, `ui.tsx`, `theme.ts`, `lib/errors.ts` traduction des refus).
- **Voir l'app sans iPhone** (aperçu web, outil de développement) : le site local d'abord (`pnpm db:start`, `pnpm dev -p 3200`), puis `cd mobile` et `CI=1 EXPO_PUBLIC_API_BASE_URL=http://localhost:3200 npx expo start --web --port 8090 --clear` (**à relancer après chaque modification** : en mode CI le serveur ne recharge pas ; le port 8081 est celui de Florent pour son téléphone, ne pas y toucher). Les captures se font avec Playwright (viewport 390 × 844, `deviceScaleFactor` 2) en relayant les appels de l'API par `context.route` (le navigateur refuse l'appel d'une autre origine, l'app native non) ; le jeton se pose dans `localStorage` sous `elegance.session.token`. Dans Playwright, filtrer les boutons avec `.filter({ visible: true }).last()` et attendre 1,5 s après chaque navigation (la pile garde l'écran précédent). Le rendu web est proche de l'iPhone sans le remplacer.
- L'app est **fidèle au site**, pas inspirée de lui : pour tout écran, relire le composant du site (`src/components/client/`, `src/app/(client)/`) et comparer les captures. Le canevas Claude Design est dépassé. Ne jamais regrouper ou supprimer une étape ou un élément du site sans l'accord de Florent.
- **L'app n'a aucune règle** : tout vient de `/api/mobile/v1` (section précédente). Un nouveau `DomainErrorCode` du site doit être traduit dans `mobile/src/lib/errors.ts` ou déclaré réservé au salon dans `src/modules/mobile/app-sync.test.ts` (le test du site échoue sinon). `mobile/src/lib/shared/{hours,status}.ts` sont des copies exactes de `src/modules/vitrine/` : modifier l'original, recopier. Le site (tsc, ESLint, Vitest) ignore `mobile/`. Le shell refuse les heredocs avec apostrophes : écrire les fichiers avec l'outil d'écriture.

## Emails et bilan (lot 7)
- Rappel (R-61, D-59) : `scheduleReminder` (`src/modules/mail/reminders.ts`) le met en file dans la transaction de la réservation et du déplacement ; le programme d'envoi (`worker.ts`) l'abandonne si le RDV est annulé ou déplacé et le repousse (`Defer`) tant qu'il est « à traiter ».
- Invitation à un avis (R-64, D-58) : `scheduleReviewInvitations` (`mail/review-invitations.ts`), appelée par le cron avant l'envoi. Un seul bouton vers `salon_settings.review_url` (pas de lien, pas d'invitation) ; désabonnement par `/avis/desinscription` (lien signé, `customer.review_opt_out`).
- `src/modules/dashboard` : `period.ts`, `compute.ts` (fonctions pures) et `load.ts`. Page `/equipe/gerant/bilan`, derrière le code gérant (D-60). `src/modules/booking/adjust-amount.ts` : correction du montant encaissé (R-53, R-54, D-62).
- Les emails de RDV d'un même RDV sont plusieurs lignes de `email_outbox` (confirmation, rappel…) : un test qui compte les emails d'un RDV filtre sur `type`.

## Liste d'attente et relance (lot 13)
- `src/modules/waitlist` : `joinWaitlist`, `processWaitlist` (idempotent : offre une place à une seule personne à la fois, la garde `waitlist_hold_minutes`), `acceptOffer` (passe par `createAppointment`, `holdOfferId`), `declineOffer`, `leaveWaitlist`, `wakeWaitlist` (`run.ts`, à lancer dans `after` après tout ce qui libère une place). La place gardée est lue par le moteur de créneaux (`Snapshot.holds`, refus `held` pour le public « online » seulement).
- `src/modules/mail/winback.ts` : relance « Nous serions ravis de vous revoir » (R-87), programmée par le cron. Pages : `/attente/[offerId]`, `/relance/desinscription`. Un test qui pose une inscription en SQL écrit `"window"` entre guillemets (mot réservé).

## Page client (lot 12, remplace la vitrine du lot 6)
- `src/app/(client)` : toutes les pages client (accueil `/`, `/reservation`, `/compte/*`, connexion, inscription, pages légales, désinscription) ; son gabarit pose la colonne de 430 px (centrée dès 640 px, fond vivant autour) et la classe `.client`. Polices : Manrope (`font-sans`) et Cormorant Garamond (`font-display`) ; la tablette garde Sora (`.font-tablet`, gabarit `/equipe`) (D-93).
- Animations : `src/app/(client)/client.css` (fiche « Lot12-Animations » du canevas), sans bibliothèque ; chaque classe a pour style de base son état final. Composants dans `src/components/client` (`ui.tsx`, `in-view.tsx`, `hours-live.tsx`, `access.tsx`, `panel.tsx`, `sheet.tsx`).
- Accueil (D-94) : arrivée, horaires en direct (`src/modules/vitrine/status.ts`, calculé dans le navigateur), accès (plan dessiné, `SALON_ACCESS` dans `src/lib/salon.ts`). `/prestations` et `/salon` redirigent vers `/`.
- Réservation : une étape par écran (`BookingFlow`), l'historique du navigateur suit les étapes (même adresse) ; bande de jours sur tout l'horizon (D-96). « Mes rendez-vous », « Mon compte », connexion : panneau (`PanelFrame`) ; sans session, il propose la connexion sur place.
- `src/modules/vitrine` : `load.ts`, `cache.ts` (`getVitrine()`, `use cache`, étiquette `vitrine`), `hours.ts`, `status.ts`, `catalog-view.ts`, `legal.ts`, `seo.ts`. **Tout texte qui cite la carte, l'équipe, les horaires ou une règle vient de la base.**
- Les actions du gérant (`asManager`) vident le cache (`updateTag`). Un test qui change la base en SQL direct doit appeler `refreshVitrine()` (`tests/e2e/helpers.ts`) ; `resetData` le fait.
- Tests Playwright : `serviceButton`, `chooseService`, `chooseStaff`, `barButton`, `pickFirstSlot` (`tests/e2e/helpers.ts`) ; `page.clock.setFixedTime` pour l'état « Ouvert maintenant ».

## Encaissement SumUp Solo (lot 14)
- `src/modules/payments` : `startPayment` (R-89, un seul encaissement en cours : index unique), `settlePayment` / `refreshPayment` (relisent le résultat chez SumUp, R-90/91, idempotent), `expireStalePayments` (R-92), `cancelPayment` (R-93), `pairTerminal` (gérant). Le terminal est une interface (`PaymentProvider`) : `sumup.ts` en vrai, `fake.ts` aux tests (`PAYMENT_DRIVER=fake`, commandé par `/api/e2e/payment`). Rappel : `/api/sumup/webhook/[secret]`. Le montant encaissé écrit `appointment.adjusted_amount_cents` (le Bilan le lit déjà).
- Hors rendez-vous (lot 15, R-94) : `startWalkInPayment`, page `/equipe/encaisser` (`walk-in-payment.tsx`, pavé `src/lib/keypad.ts`), compté au Bilan par `computeDashboard(…, walkIns)`.
- Glisser-déposer (lot 16, R-95) : `src/lib/drag-move.ts` (pur), `use-appointment-drag.ts` (pointeurs), `move-confirm.tsx` ; le dépôt ouvre une confirmation, puis `moveAppointmentByDragAction` → `rescheduleAppointmentAsSalon`. Tests Playwright tactiles : événements `PointerEvent` synthétiques (`tests/e2e/glisser.spec.ts`).
- Fiche RDV : `payment-block.tsx` (relit le résultat toutes les 2,5 s). Gérant : `/equipe/gerant/terminal`. Un test qui compte les erreurs de fournisseur passe par `isProviderError` (jamais `instanceof`, paquets du serveur séparés).

## Fond animé et couleurs (lot 18)
- Côté client, les couleurs sont redéfinies sous `.client` dans `src/app/(client)/client.css` (`--color-ink`, `--color-gold` = bleu, `--accent-rgb`) : les utilitaires `bg-ink`, `text-gold`… les suivent ; un bleu écrit en dur s'écrit `rgb(var(--accent-rgb) / x)`. Jamais dans `theme.css` (la tablette, `/equipe`, garde le doré). Les emails restent dorés.
- `ClientBackdrop` (gabarit client) : éclipse WebGL sur `/` (`src/lib/eclipse.ts`, calculs dans `eclipse-math.ts`), image figée `public/fond/*.webp` ailleurs. La colonne est transparente : une section qui doit cacher le fond prend `bg-ink` (accueil : `.home-rest`). Ne jamais appeler `loseContext()` au démontage.

## Fidélité (lot 19)
- `src/modules/loyalty` : « honoré » est calculé (R-51), donc les gains se matérialisent à la demande (`settleLoyalty`, idempotent, sous le verrou de la fiche client) avant toute lecture du solde ; le solde est la somme de `loyalty_entry` (jamais une colonne). `redeemReward` / `cancelReward` (coupe offerte, fiche RDV de la tablette, `loyalty-block.tsx`), `adjustBalance` (gérant), `getLoyaltyCard` (page « Mes rendez-vous », `components/client/loyalty-card.tsx`). Barème et « coupe offerte possible » sont dans `service`, seuil et activation dans `salon_settings` (D-114, R-96 à R-100).
- Un test d'intégration ou e2e qui pose des RDV passés règle `salon_settings.loyalty_started_at` avant eux (par défaut : l'heure de la migration ou du seed). Le RDV de la coupe offerte ne rapporte aucun point.

## Déploiement sur le VPS (lot 22, D-119)
- `deploy/` : `docker-compose.yml` (conteneurs `elegance` et `elegance-db`, volumes `next_staging`/`next_live`), `update.sh` (pull, build de l'image, migrate, **seed**, compilation, recopie, redémarrage), `run.sh` (commande pnpm dans le conteneur outils), `cron.sh` (appelé chaque minute par le crontab de `n8nadmin`), `Caddyfile.elegance` (bloc à ajouter au Caddy de n8n). Secrets dans `deploy/.env` sur le serveur, jamais dans le dépôt ni le chat. Accès : `ssh n8n-velto` depuis PowerShell. Détails : `docs/reprise.md` (section Lot 22).
