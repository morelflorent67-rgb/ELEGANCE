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
- `pnpm staff:account` : crée le compte « équipe » de la tablette sur Supabase ; `pnpm manager:set-code` (ou `:remote`) : définit le code gérant à 6 chiffres. Les deux se tapent dans le terminal, rien dans le chat ni en ligne de commande.
- `pnpm measure:vitrine` : mesure ponctuelle de la vitrine (FCP, LCP, CLS, poids) sur un build lancé par `pnpm start -p 3300`.
- `pnpm smoke:auth` : contrôle manuel de l'authentification Supabase réelle (crée puis supprime un compte jetable sur le projet de test).
- `pnpm smoke:db` : contrôle manuel, en lecture seule, des chargements de la tablette sur la base en ligne (pooler Supabase). À lancer après tout changement du client de base : les tests locaux n'ont pas de pooler. Jamais le mode transaction (6543), voir `src/db/connection-url.ts`.
- `/api/diagnostic` : durées mesurées côté serveur (base, planning, authentification), sans données ; à retirer à la bascule.
- **`pnpm build` lit la base** (la vitrine est prérendue, `DATABASE_URL` requis, comme sur Vercel et en intégration continue).
- Variables : copier `.env.example` vers `.env.local`. Jamais de `NEXT_PUBLIC_` pour la base ni pour Supabase.

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
- `src/modules/auth` : interface d'authentification (Supabase en production, mémoire pour les tests, refusée sur Vercel). `src/modules/customers` : comptes clients, limitation d'essais, état de réservation, « Mes informations » et suppression de compte (`profile.ts`, anonymisation R-75). `src/modules/audit` : journal d'audit, à écrire dans la transaction de l'action.
- Next 16 garde la page précédente cachée dans le DOM : dans les tests Playwright, filtrer les textes avec `.filter({ visible: true })`.

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
