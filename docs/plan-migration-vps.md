# Plan de migration vers le VPS (lots 21 à 23)

> **État au 16 novembre 2026 : lot 21 fait** (voir `docs/reprise.md`). Réponses de Florent : section 0 tranchée (voir D-115 à D-118). **Écart : le VPS n'est pas réinstallé** (il héberge déjà n8n, un site et Docker) : la tâche 22.1 devient « relever l'existant et sécuriser sans casser », et 22.2 « installer à côté » (ports, proxy et PostgreSQL existants à relever d'abord).

> **Pour l'assistant qui exécute ce plan :** utiliser `superpowers:executing-plans` (une tâche après l'autre, TDD). Les étapes sont des cases `- [ ]` à cocher dans ce fichier au fil de l'eau. Lire d'abord `CLAUDE.md`, puis `docs/reprise.md`, puis ce plan en entier.

**Objectif :** faire tourner tout Elegance Strasbourg (site Next.js, base Postgres, comptes, cron, sauvegardes) sur le VPS de Florent, sans Vercel ni Supabase.

**Architecture :** un seul serveur Ubuntu. Caddy (HTTPS automatique) reçoit le trafic et le passe à `next start` (service systemd, écoute 127.0.0.1:3000). PostgreSQL 17 est sur la même machine, accessible en local seulement. Un minuteur systemd appelle le cron d'emails chaque minute, un autre fait la sauvegarde chiffrée de la nuit vers un stockage extérieur. Supabase Auth est remplacé par un pilote d'authentification maison (`postgres-driver.ts`) qui implémente l'interface `AuthDriver` existante : le reste du code ne change pas.

**Technologies :** Next.js 16, Node 24, pnpm, PostgreSQL 17, Drizzle, `node:crypto` (scrypt), Caddy, systemd, restic.

**Pourquoi :** décision de Florent du 16 novembre 2026 (voir mémoire et D-115 ci-dessous). L'app n'a jamais servi : **aucune donnée à reprendre**, on part d'une base neuve (seed + compte équipe + code gérant).

**Le VPS :** offre « Cloud VPS 6 » (6 vCPU, 12 Go de RAM, 100 Go NVMe, 2 snapshots, Europe ; probablement Contabo, emplacement exact à lire dans l'espace client). Largement suffisant.

---

## 0. À demander à Florent avant d'écrire du code

Règle du projet : une question ouverte se pose, elle ne se suppose pas. Poser ces questions **en une fois**, en français simple, au début de la conversation. Les recommandations sont entre parenthèses : Florent peut répondre « comme tu proposes ».

1. **Authentification** : on remplace Supabase par une connexion écrite dans l'app, sans nouvelle bibliothèque (recommandé, voir D-116), ou par une bibliothèque toute faite (Better Auth : moins de code à écrire, mais une dépendance et ses propres tables) ?
2. **Durée de connexion** : un client ou la tablette reste connecté tant qu'il revient au moins une fois tous les **90 jours** (recommandé) ?
3. **Hébergeur et emplacement du VPS** : nom exact (Contabo ?), ville du centre de données, adresse postale de l'hébergeur (pour les mentions légales).
4. **Système** : Florent accepte-t-il de **réinstaller** le VPS en **Ubuntu 24.04 LTS** depuis son espace client (recommandé, tout est effacé) ? Y a-t-il déjà quelque chose dessus ?
5. **Nom de domaine** : lequel, chez quel registraire, est-il déjà pointé quelque part ?
6. **Stockage des sauvegardes** : Backblaze B2, région « EU Central » (Amsterdam), gratuit sous 10 Go (recommandé) ? Florent crée le compte lui-même.
7. **Adresse email des alertes** (site en panne, sauvegarde manquée).
8. **Quand couper Vercel et Supabase** : juste après une semaine sans incident sur le VPS (recommandé) ?

Noter les réponses dans `docs/decisions.md` (et D-115 à D-118 dans `docs/dossier-projet.md`, tableau des décisions) avant de commencer le lot 21.

### Décisions proposées (à écrire dans `docs/dossier-projet.md` une fois validées)

| N° | Décision |
| --- | --- |
| D-115 | Hébergement de tout le service (site, base, comptes, tâches planifiées) sur le VPS de Florent ; Vercel et Supabase abandonnés. Remplace les lignes « Hébergement » et « Base de données et comptes » du tableau des prestataires. |
| D-116 | Comptes gérés par l'app : mots de passe hachés par scrypt (`node:crypto`, aucune dépendance), sessions en base (jeton aléatoire dans un cookie httpOnly, seule son empreinte SHA-256 est stockée), 90 jours glissants, lien de réinitialisation valable 1 h, à usage unique. |
| D-117 | Emails de réinitialisation du mot de passe envoyés par l'app via Brevo, **hors de la file** `email_outbox` (le lien est un secret : il ne doit pas dormir dans la base) ; en cas d'échec, le client redemande un lien. |
| D-118 | Sauvegarde chaque nuit (3 h, heure de Paris) : `pg_dump` chiffré par restic vers un stockage extérieur ; on garde 7 nuits et 4 semaines, le reste s'efface tout seul. Restauration essayée avant l'ouverture. |

---

## Contraintes globales (valent pour chaque tâche)

- Tout ce que dit `CLAUDE.md` : une règle R-xx = au moins un test ; heures en UTC ; aucun accès à la base depuis le navigateur ; réglages en base ; interface en français, code en anglais.
- **Aucune nouvelle dépendance npm** (scrypt, `randomBytes`, `createHash`, `timingSafeEqual` sont dans `node:crypto`). Les outils du serveur (Caddy, restic, PostgreSQL) s'installent par `apt`, pas par npm, et sont notés dans `docs/decisions.md`.
- **Pas de Docker** (choix de Florent).
- Les **secrets ne passent jamais dans le chat** : Florent les tape dans le terminal du VPS ou dans un fichier qu'il édite lui-même. L'assistant ne se connecte jamais au VPS avec un mot de passe : Florent lance les commandes, ou l'assistant les lance par SSH avec la clé de Florent s'il l'a autorisé.
- Toute commande qui modifie le VPS ou un compte en ligne est **annoncée avant**, avec l'accord de Florent.
- Florent est non technicien : étapes numérotées, noms exacts des boutons, une commande par bloc.
- Fin de chaque lot : tous les tests verts (`pnpm test:all`), vérification sur mobile et sur tablette, `docs/reprise.md` et `docs/decisions.md` à jour, commit.

## Points à surveiller (non couverts par un test existant, un test est ajouté dans la tâche indiquée)

1. **Connexion avec une adresse inconnue** : même réponse et même durée qu'un mauvais mot de passe (pas de fuite de l'existence d'un compte). Test : tâche 21.2.
2. **Majuscules dans l'email** (`Jean@Mail.fr` puis `jean@mail.fr`) : un seul compte, connexion possible des deux façons. Test : tâche 21.2.
3. **Lien de réinitialisation utilisé deux fois, ou après 1 h** : refusé, renvoi vers « lien invalide ». Test : tâche 21.3.
4. **Changement de mot de passe** : les autres sessions ouvertes (ex. un téléphone volé) sont fermées, la session en cours reste. Test : tâche 21.3.
5. **Faux pilotes en production** : si `AUTH_DRIVER=memory` ou `PAYMENT_DRIVER=fake` traînent dans l'environnement du VPS, l'app refuse de démarrer la connexion ou l'encaissement. Test : tâche 21.5.

---

## Lot 21 : le code sans Vercel ni Supabase (sur le poste, aucun serveur touché)

Le site doit tourner entièrement sur la base locale (`pnpm db:start`) avec la vraie authentification, comme il tournera sur le VPS.

### Tâche 21.1 : tables des comptes et des sessions

**Fichiers :**
- Modifier : `src/db/schema.ts` (nouvelles tables à la fin)
- Créer : migration `pnpm db:generate` (nom `0016_auth_tables`, vérifier le numéro suivant dans `drizzle/`)
- Test : `tests/integration/schema.test.ts` (ajouter des cas)

**Produit :**
- `authUser` (table `auth_user`) : `id uuid pk defaultRandom`, `email text not null` (toujours en minuscules), `passwordHash text not null`, `role text not null default 'customer'` avec contrainte `check (role in ('customer','staff'))`, `createdAt`, `updatedAt` (type `instant` du schéma). Index unique sur `email`.
- `authSession` (table `auth_session`) : `tokenHash text pk` (SHA-256 hex du jeton), `userId uuid not null references auth_user(id) on delete cascade`, `expiresAt instant not null`, `createdAt`. Index sur `userId`.
- `authRecovery` (table `auth_recovery`) : `tokenHash text pk`, `userId uuid not null references auth_user(id) on delete cascade`, `expiresAt instant not null`, `usedAt instant`.
- `customer.auth_user_id` : ajouter la clé étrangère vers `auth_user(id)` `on delete set null` (la colonne existe déjà ; commentaire « compte Supabase » à corriger).

- [ ] Écrire les tests : insertion d'un `auth_user` en double (même email) refusée ; `role = 'admin'` refusé ; suppression d'un `auth_user` supprime ses sessions et codes et vide `customer.auth_user_id`.
- [ ] Les lancer : `pnpm test:integration -- schema` → échec (tables absentes).
- [ ] Écrire le schéma, `pnpm db:generate --name=auth_tables`, `pnpm db:migrate`.
- [ ] Relancer : succès.
- [ ] Commit `Lot 21 : tables des comptes et des sessions`.

### Tâche 21.2 : hachage des mots de passe

**Fichiers :**
- Créer : `src/modules/auth/password.ts`, `src/modules/auth/password.test.ts`

**Produit :**
- `hashPassword(password: string): Promise<string>` : sel de 16 octets (`randomBytes`), scrypt N = 2^15, r = 8, p = 1, clé de 64 octets, `maxmem` 64 Mo. Format stocké : `scrypt$32768$8$1$<sel base64>$<hash base64>` (les paramètres sont dans la chaîne pour pouvoir les durcir plus tard).
- `verifyPasswordHash(password: string, stored: string): Promise<boolean>` : relit les paramètres de la chaîne, compare avec `timingSafeEqual` ; chaîne malformée = `false`, jamais d'exception.
- `DUMMY_HASH` : un hash calculé une fois, utilisé quand l'email est inconnu, pour que la réponse prenne le même temps (point à surveiller 1).
- **Aucun import `@/` ni `server-only` dans ce fichier** : `scripts/staff-account.mjs` l'importe directement avec Node (même règle que `import-file.ts`, voir `docs/reprise.md`).

- [ ] Tests : un hash vérifie son mot de passe ; un autre mot de passe échoue ; deux hash du même mot de passe diffèrent (sel) ; chaîne tronquée ou vide = `false` ; le format commence par `scrypt$32768$8$1$`.
- [ ] `pnpm test -- password` → échec, puis implémenter, puis succès.
- [ ] Commit.

### Tâche 21.3 : pilote d'authentification Postgres

**Fichiers :**
- Créer : `src/modules/auth/postgres-driver.ts`
- Créer : `tests/integration/auth-postgres.test.ts`
- Créer : `src/modules/mail/templates/password-reset.ts` et son test (email doré, même gabarit `layout.ts` que les autres)

**Consomme :** `AuthDriver` (`src/modules/auth/types.ts`, **inchangé**), `hashPassword`, `verifyPasswordHash`, `DUMMY_HASH` (21.2), `SessionStore` (déjà défini dans `memory-driver.ts` : le déplacer dans `types.ts` et l'importer des deux pilotes).

**Produit :** `createPostgresDriver(deps: { db: Database; store: SessionStore; now: () => Date; sendResetEmail: (to: string, link: string) => Promise<void> }): AuthDriver`

Comportement attendu, méthode par méthode (les codes de retour sont ceux de `types.ts`) :
- `signUp` : email en minuscules ; mot de passe de moins de 8 caractères → `weak_password` (même seuil que le pilote mémoire ; vérifier que `src/modules/customers/accounts.ts` ne demande pas déjà plus) ; violation d'unicité (code Postgres `23505`) → `email_taken` ; ouvre la session.
- `signIn` : email inconnu → vérifie quand même contre `DUMMY_HASH`, puis `invalid_credentials`.
- Session : jeton = 32 octets `randomBytes` en base64url, posé par `store.set` ; la base ne garde que `sha256(jeton)`. Expiration à 90 jours. `currentUser` lit la session ; expirée → `null` (et la supprime) ; s'il reste moins de 60 jours, repousse `expiresAt` à 90 jours (en base seulement, le cookie dure 400 jours : la base fait foi).
- `signOut` : supprime la session en base, puis `store.clear()`.
- `requestPasswordReset(email, redirectTo)` : si le compte existe, crée un code (32 octets, empreinte stockée, 1 h) et appelle `sendResetEmail(email, lien)` où `lien = redirectTo + (redirectTo contient "?" ? "&" : "?") + "code=" + code`. Ne lève jamais d'erreur et ne révèle rien (D-117 : hors de la file d'emails).
- `exchangeRecoveryCode(code)` : code inconnu, expiré ou déjà utilisé → `false` ; sinon marque `usedAt`, ouvre une session, `true`.
- `updatePassword(password)` : sans session → `failed` ; trop court → `weak_password` ; sinon nouveau hash **et suppression de toutes les autres sessions de l'utilisateur** (point 4).
- `deleteUser(id)` : supprime la ligne (sessions et codes suivent en cascade).
- `verifyPassword(email, password)` : ne touche pas à la session.
- `updateEmail(id, email)` : minuscules ; doublon → `email_taken`.

Branchement :
- `src/modules/auth/index.ts` : le pilote par défaut devient `createPostgresDriver` avec `db()` et un `SessionStore` sur le cookie `elegance-session` (`httpOnly`, `sameSite: "lax"`, `path: "/"`, `secure` hors `127.0.0.1`/`localhost`, `maxAge` 400 jours). `sendResetEmail` envoie avec `transportFromEnv()` le modèle `password-reset.ts`.
- `src/app/auth/callback/route.ts` et `src/app/_actions/account.ts` : **inchangés** (le lien garde la forme `/auth/callback?next=/mot-de-passe/nouveau&code=…`).

- [ ] Tests d'intégration (base réelle, `FakeSessionStore` en mémoire dans le test) : inscription puis `currentUser` ; email en double, y compris en majuscules (point 2) ; connexion avec `Jean@Mail.fr` d'un compte `jean@mail.fr` ; email inconnu → `invalid_credentials` (point 1) ; session expirée → `null` ; session prolongée quand il reste moins de 60 jours ; déconnexion ; lien de réinitialisation : bon code → session ; deuxième usage → `false` ; code de plus d'1 h → `false` (point 3) ; `updatePassword` ferme les autres sessions mais pas la courante (point 4) ; `sendResetEmail` n'est pas appelé pour une adresse inconnue ; `deleteUser` vide `customer.auth_user_id`.
- [ ] Test unitaire du modèle d'email : sujet, lien présent tel quel, mention « valable 1 heure ».
- [ ] Échec, implémentation, succès.
- [ ] `pnpm dev` (avec la base locale, **sans** `AUTH_DRIVER=memory`) : s'inscrire, se déconnecter, se reconnecter, mot de passe oublié (le lien s'affiche dans le terminal avec le transport « log »), sur mobile (390 × 844).
- [ ] Commit `Lot 21 : authentification sans Supabase (D-116, D-117)`.

### Tâche 21.4 : retirer Supabase

**Fichiers :**
- Supprimer : `src/modules/auth/supabase-driver.ts`, `src/modules/auth/claims.ts`, `claims.test.ts`, `src/proxy.ts` (il ne servait qu'à rafraîchir le jeton Supabase), `scripts/smoke-supabase-auth.mjs`, `docs/supabase-emails/`, `tests/smoke/` et `vitest.smoke.config.mts` (le pooler n'existe plus)
- Modifier : `package.json` (retirer `@supabase/ssr`, `@supabase/supabase-js`, les scripts `smoke:auth`, `smoke:db`, et les variantes `:remote`), `src/lib/env.ts`, `src/db/connection-url.ts` et son test, `scripts/staff-account.mjs`, `.env.example`, `src/app/api/diagnostic/route.ts` (retirer la mesure Supabase, ou la route entière : elle était « à retirer à la bascule »)

**Produit :**
- `env.ts` : `supabaseSchema` et `supabaseEnv` supprimés ; `databaseEnv` ne lit plus `POSTGRES_URL` ; `appSecret()` exige `APP_SECRET` (plus de repli sur la clé Supabase) ; `siteUrl()` : `SITE_URL`, sinon `http://localhost:3000` (plus d'adresse Vercel).
- `connection-url.ts` : la réécriture du port du pooler Supabase disparaît ; SSL seulement hors base locale (inchangé). `CLIENT_OPTIONS` : `max: 10` (serveur permanent, plus de limite de sessions Supabase), le reste inchangé. Noter dans `decisions.md`.
- `scripts/staff-account.mjs` : crée ou met à jour le compte `staff` dans `auth_user` de la base de `DATABASE_URL` (`.env.local`), hash par `hashPassword` de `src/modules/auth/password.ts` ; mêmes questions et mêmes refus qu'aujourd'hui (12 caractères, adresse d'un compte client refusée). Sur le VPS, Florent le lance sur le serveur.
- Les scripts `:remote` disparaissent : sur le VPS, on lance `pnpm db:migrate`, `pnpm db:seed`, `pnpm manager:set-code`, `pnpm customers:import` **sur le serveur**, contre sa base locale. `scripts/migrate-remote.mjs` est supprimé ; l'option `--remote` des autres scripts aussi.

- [ ] `grep -ri supabase src scripts tests` ne renvoie plus que des commentaires historiques à corriger.
- [ ] `pnpm install`, `pnpm test:all` : tout vert.
- [ ] Commit `Lot 21 : Supabase retiré`.

### Tâche 21.5 : garde-fous sans Vercel

**Fichiers :**
- Modifier : `src/modules/auth/index.ts`, `src/modules/payments/from-env.ts`, `src/modules/mail/transport-from-env.ts`, `scripts/e2e-server.mjs`
- Créer : `src/lib/test-drivers.ts` et son test

**Produit :**
- `assertTestDriversAllowed(name: string): void` : lève une erreur sauf si `process.env.ALLOW_TEST_DRIVERS === "true"`. Remplace les deux `if (process.env.VERCEL)` (pilote mémoire et faux terminal) : **interdit par défaut**, autorisé seulement là où on le demande. `scripts/e2e-server.mjs` (et la configuration `dev-memoire` de `.claude/launch.json`) posent `ALLOW_TEST_DRIVERS: "true"`.
- `transport-from-env.ts` : le refus « Brevo non configuré » se déclenche sur `NODE_ENV === "production"` **et** `ALLOW_TEST_DRIVERS !== "true"` (les tests e2e tournent sur un build de production sans Brevo).
- `callerIp()` (`src/lib/request-ip.ts`) : inchangé, mais commentaire mis à jour : derrière Caddy, `X-Forwarded-For` est réécrit par Caddy (les en-têtes envoyés par le visiteur ne sont pas crus) et Next n'écoute que sur 127.0.0.1.

- [ ] Tests (point 5) : sans la variable, `assertTestDriversAllowed` lève ; avec `"true"`, non ; `AUTH_DRIVER=memory` sans la variable → `getAuthDriver()` lève ; idem `PAYMENT_DRIVER=fake`.
- [ ] `pnpm test:all` vert (les e2e prouvent que la variable est bien passée).
- [ ] Commit.

### Tâche 21.6 : cron à la minute et textes

**Fichiers :**
- Supprimer : `vercel.json`
- Modifier : `src/modules/mail/health.ts` (`OVERDUE_AFTER_HOURS` 25 → 1) et ses tests ; commentaire de `src/app/api/cron/send-emails/route.ts` (« appelé par le minuteur du serveur ») ; `src/modules/vitrine/legal.ts` et `legal.test.ts` (Vercel et Supabase remplacés par l'hébergeur du VPS, avec son adresse, réponse 3 de la section 0, et le stockage des sauvegardes, réponse 6 ; un élément encore inconnu reste entre crochets pour `placeholdersOf`)

- [ ] Adapter les tests de `health` (un email dû depuis 2 h compte, depuis 30 min non) et de `legal` (plus de « Vercel » ni « Supabase »).
- [ ] `pnpm test:all` vert ; vérifier les pages légales sur mobile.
- [ ] Mettre à jour `CLAUDE.md` (commandes : retirer `smoke:*`, `:remote`, `db:migrate:remote` ; ajouter `ALLOW_TEST_DRIVERS` ; « refusée sur Vercel » → « interdite sans `ALLOW_TEST_DRIVERS` »), `.env.example`, `docs/decisions.md`, `docs/reprise.md`.
- [ ] Commit `Lot 21 : cron à la minute, textes légaux` et pousser (CI verte).

**Fin du lot 21 :** Florent essaie en local avec l'assistant (`pnpm db:start`, `pnpm dev`) : inscription, réservation, tablette (`pnpm staff:account` sur la base locale), mot de passe oublié. Il valide avant le lot 22.

---

## Lot 22 : préparer le VPS et y mettre le site

Ce lot se fait surtout **sur le serveur**, Florent aux commandes, l'assistant le guide. Tous les fichiers de configuration sont **versionnés dans le dépôt** (`deploy/`), pour qu'on puisse refaire le serveur de zéro.

**Fichiers à créer dans le dépôt :**
- `deploy/README.md` : la procédure complète ci-dessous, en étapes numérotées pour Florent.
- `deploy/Caddyfile` : `<domaine> { reverse_proxy 127.0.0.1:3000 }` plus `www.<domaine>` redirigé ; en-têtes `encode zstd gzip`.
- `deploy/elegance.service` : service systemd, utilisateur `elegance`, `WorkingDirectory=/home/elegance/app`, `EnvironmentFile=/home/elegance/app/.env.production`, `ExecStart=/usr/bin/pnpm start -p 3000 -H 127.0.0.1`, `Restart=always`, `Environment=NODE_ENV=production`.
- `deploy/elegance-cron.service` et `deploy/elegance-cron.timer` : chaque minute, `curl -fsS -H "Authorization: Bearer ${CRON_SECRET}" http://127.0.0.1:3000/api/cron/send-emails` (le secret est lu dans le même `EnvironmentFile`).
- `deploy/deploy.sh` : `git pull --ff-only`, `pnpm install --frozen-lockfile`, `pnpm db:migrate`, `pnpm build`, `sudo systemctl restart elegance`. Le site est coupé une minute environ pendant le redémarrage : déployer en dehors des heures d'ouverture. S'arrête à la première erreur (`set -euo pipefail`) : en cas d'échec du build, l'ancien site tourne toujours.

### Tâche 22.1 : sécuriser le serveur (Florent, guidé)

- [ ] Réinstaller le VPS en Ubuntu 24.04 LTS depuis l'espace client de l'hébergeur (réponse 4).
- [ ] Sur le poste de Florent : créer une clé SSH (`ssh-keygen -t ed25519`), l'ajouter au serveur.
- [ ] Créer l'utilisateur `elegance` (sudo), interdire la connexion de `root` et par mot de passe (`/etc/ssh/sshd_config.d/`), redémarrer SSH **après avoir vérifié** qu'une deuxième fenêtre se connecte avec la clé.
- [ ] Pare-feu `ufw` : autoriser 22, 80, 443, puis activer.
- [ ] `unattended-upgrades` (mises à jour de sécurité automatiques) et `fail2ban` (bloque les essais de mot de passe SSH).
- [ ] Fuseau du serveur en UTC (le code calcule en Europe/Paris lui-même).
- [ ] Prendre un **snapshot** dans l'espace client (« serveur propre »).

### Tâche 22.2 : installer Node, pnpm, PostgreSQL, Caddy

- [ ] Node 24 (dépôt NodeSource) ; `corepack enable` (pnpm à la version du `packageManager`).
- [ ] PostgreSQL 17 (dépôt officiel PGDG) ; vérifier `listen_addresses = 'localhost'` ; créer le rôle `elegance` (mot de passe tapé par Florent) et la base `elegance`.
- [ ] Caddy (dépôt officiel), avec `deploy/Caddyfile`.
- [ ] Noter les versions installées dans `docs/decisions.md`.

### Tâche 22.3 : mettre le site en route

- [ ] `git clone` du dépôt dans `/home/elegance/app`.
- [ ] Florent crée `.env.production` lui-même (droits `600`), d'après `.env.example` : `DATABASE_URL=postgresql://elegance:<mdp>@127.0.0.1:5432/elegance`, `APP_SECRET` et `CRON_SECRET` (générés sur le serveur avec `openssl rand -hex 32`), `SITE_URL`, `BREVO_API_KEY`, `EMAIL_FROM`, `SUMUP_*`, `ALLOW_INDEXING=false` jusqu'à l'ouverture. **Jamais** `ALLOW_TEST_DRIVERS`, `AUTH_DRIVER` ni `PAYMENT_DRIVER`.
- [ ] `pnpm install`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm staff:account`, `pnpm manager:set-code`, `pnpm build` (les scripts lisent `.env.local` : soit un lien `.env.local → .env.production`, soit adapter `dotenv` pour lire `.env.production` quand il existe ; choisir l'un et le noter).
- [ ] Installer et démarrer `elegance.service` et `elegance-cron.timer` (`systemctl enable --now`).
- [ ] DNS : enregistrements A (et AAAA si le VPS a une IPv6) du domaine et de `www` vers le VPS (réponse 5). Caddy obtient le certificat seul.
- [ ] SumUp : mettre à jour l'adresse de rappel (webhook) avec le nouveau domaine si elle est enregistrée chez SumUp. Brevo : authentifier le domaine (SPF, DKIM) pour l'expéditeur.
- [ ] Vérifier : `https://<domaine>/api/health` → 200 ; `journalctl -u elegance-cron` montre un passage par minute ; `curl -I http://<IP>:3000` depuis le poste **échoue** (Next n'est pas exposé).
- [ ] Recette rapide sur le téléphone de Florent (390 × 844) et l'iPad (1194 × 834) : réservation, confirmation reçue, mot de passe oublié reçu, tablette, encaissement à 1 € si SumUp est relié.
- [ ] Commit `Lot 22 : déploiement sur le VPS` ; mettre à jour `docs/reprise.md` (accès : adresse du site, comment se connecter au serveur, sans aucun secret).

---

## Lot 23 : sauvegardes, surveillance, bascule

### Tâche 23.1 : sauvegarde de la nuit (D-118)

**Fichiers à créer :** `deploy/backup.sh`, `deploy/elegance-backup.service`, `deploy/elegance-backup.timer`, `deploy/restore.md`.

- [ ] Florent crée le compte de stockage (réponse 6) et une clé d'accès limitée au compartiment ; il la tape dans `/home/elegance/.backup.env` (droits `600`) avec `RESTIC_REPOSITORY`, `RESTIC_PASSWORD` et les clés. **Il garde `RESTIC_PASSWORD` dans son gestionnaire de mots de passe : sans lui, les sauvegardes sont illisibles.**
- [ ] `apt install restic` ; `restic init` une fois.
- [ ] `backup.sh` : `pg_dump -Fc elegance | restic backup --stdin --stdin-filename elegance.dump`, puis `restic forget --keep-daily 7 --keep-weekly 4 --prune`, puis, si tout a réussi, appel de l'adresse de contrôle de la surveillance (tâche 23.2). `set -euo pipefail`.
- [ ] Minuteur chaque nuit à 3 h, heure de Paris (`OnCalendar=*-*-* 03:00 Europe/Paris`, `Persistent=true`).
- [ ] Lancer une sauvegarde à la main, `restic snapshots` la montre.
- [ ] **Essai de restauration** (obligatoire) : restaurer la dernière copie dans une base `elegance_restore`, compter les lignes de quelques tables, supprimer la base d'essai. Écrire la procédure pas à pas dans `deploy/restore.md`.

### Tâche 23.2 : surveillance

- [ ] Service gratuit de surveillance (ex. UptimeRobot, déjà prévu dans `docs/exploitation.md`) : `https://<domaine>/api/health` chaque 5 minutes, alerte à l'adresse de la réponse 7.
- [ ] Contrôle « sauvegarde faite » (ex. Healthchecks.io, gratuit) : alerte si `backup.sh` n'a pas appelé son adresse depuis 26 h.
- [ ] Alerte disque : ajouter à `/api/health` ? **Non** (le site n'a pas à lire le disque) : un petit minuteur `deploy/disk-check` qui appelle l'adresse de contrôle seulement si le disque est rempli à moins de 80 %. À proposer à Florent, facultatif.

### Tâche 23.3 : guide d'exploitation

- [ ] Réécrire `docs/exploitation.md` pour le VPS : surveillance, sauvegardes et restauration, ce qui tourne tout seul (cron chaque minute, sauvegarde à 3 h, mises à jour de sécurité), **que faire si…** (site injoignable : `systemctl status elegance`, `journalctl -u elegance -n 100` ; base arrêtée ; disque plein ; certificat ; serveur perdu → nouveau VPS + `deploy/README.md` + `deploy/restore.md`), mise à jour du site (`deploy/deploy.sh`), redémarrage mensuel après mises à jour, mise à jour annuelle de Node et PostgreSQL (avec l'assistant).
- [ ] Variables d'environnement : liste à jour (section 5), sans Supabase ni Vercel.
- [ ] Liste de contrôle avant ouverture : `/api/diagnostic` retiré, `ALLOW_INDEXING=true`, affiche régénérée avec le domaine (`communication/lancement`), mentions légales relues.

### Tâche 23.4 : bascule et ménage (avec l'accord de Florent à chaque étape)

- [ ] Une semaine sans incident sur le VPS (réponse 8).
- [ ] Florent supprime le projet Vercel et le projet Supabase (l'assistant lui indique les boutons ; suppression définitive : confirmer avec lui avant).
- [ ] Changer les clés qui sont passées par Vercel (Brevo, SumUp) : nouvelles clés dans `.env.production`, redémarrer.
- [ ] Mettre à jour `docs/reprise.md` (avancement, accès, plus de Vercel ni Supabase), `docs/dossier-projet.md` (tableau des prestataires), `docs/decisions.md`, et la mémoire.
- [ ] Commit et push.

---

## Hors de ce plan

- **Publication sur l'App Store** : lot à part, après la migration. À prévoir alors : coquille native (ex. Capacitor) qui ouvre le site, notifications pour les rappels (Apple refuse souvent une app qui n'affiche qu'un site), compte développeur Apple (99 $ par an), suppression du compte depuis l'app (déjà faite, R-75). La session par cookie de D-116 fonctionne dans une coquille qui charge le site ; une vraie app native demanderait une connexion par jeton, à décider à ce moment-là.
- Lot 8 (recette réelle avec le salon) : reprend après le lot 23, sur le VPS.

## Message à coller pour démarrer la conversation de migration

```text
Tu es le développeur principal du site et de l'application de réservation d'Elegance Strasbourg.
Lis CLAUDE.md, puis docs/reprise.md, puis docs/plan-migration-vps.md en entier.
On migre tout sur mon VPS (site, base, comptes, cron, sauvegardes), sans Vercel ni Supabase et sans Docker. L'app n'a jamais servi : aucune donnée à reprendre.
Commence par la section 0 du plan : pose-moi toutes les questions en une fois, en français simple. Ensuite, lot 21 tâche par tâche (tests d'abord), puis lot 22 où tu me guides sur le serveur, puis lot 23.
Ne me demande jamais de coller un secret dans le chat. Annonce avant toute commande qui modifie le serveur ou un compte en ligne.
À la fin de chaque lot : tous les tests verts, docs/reprise.md et docs/decisions.md à jour, commit, et le message pour la conversation suivante.
```
