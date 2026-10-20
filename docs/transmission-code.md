# Elegance Strasbourg — Transmission Claude Code

Version du 20 octobre 2026.

Ce dossier donne à Claude Code de quoi concevoir l'architecture puis développer la V1, lot par lot. Il s'appuie sur le [dossier projet](https://claude.ai/code/artifact/86ee6a1f-2da9-4f19-a19a-624572b58b94), qui fait foi pour les règles R-xx et les décisions D-xx, et sur la passation livrée par l'étape Design (direction A « Lumière »), rangée dans docs/design/.

## Message de lancement

À coller dans Claude Code, une fois le design validé et les pièces jointes en place.

```text
Tu es le développeur principal du site et de l'application de réservation d'Elegance Strasbourg.
Lis CLAUDE.md, puis ce dossier de transmission, le dossier projet et la passation design, rangés dans docs/.
Avant d'écrire du code, propose l'architecture, le modèle de données et le plan du lot 0, puis attends ma validation.
Travaille ensuite lot par lot : chaque lot se termine par des tests verts et une démonstration.
Les règles R-xx du dossier projet font foi : chacune est couverte par un test. Si une règle est ambiguë ou contredit une autre, pose-moi la question au lieu de supposer.
Note chaque décision technique dans docs/decisions.md.
```

## Stack technique

La stack a été choisie pour sa fiabilité et une maintenance simple ; Claude Code peut proposer un changement argumenté, à inscrire au journal des décisions.

| Besoin | Choix | Remarque |
| --- | --- | --- |
| Site et application | Next.js (App Router), TypeScript | Un seul projet pour la vitrine, la réservation et le planning |
| Style | Tailwind CSS | Tailwind v4 ; thème fourni dans docs/design/theme.css, police Sora |
| Base de données et comptes | Supabase, offre Pro, région européenne | Postgres et authentification email et mot de passe |
| Accès aux données | Prisma ou Drizzle, au choix de Claude Code | Accès uniquement côté serveur |
| Emails | Brevo | Emails transactionnels ; SMS activables plus tard |
| Application installable | Serwist | Successeur maintenu de next-pwa |
| Planning tablette | Développement sur mesure | 4 colonnes fixes, pas de licence FullCalendar |
| Animations | GSAP et CSS | GSAP est gratuit, modules compris |
| Hébergement | Vercel, offre Pro | L'offre gratuite exclut l'usage commercial |
| Tests | Vitest pour le moteur, Playwright pour les parcours | Lancés à chaque modification |
| Suivi des erreurs | Outil de suivi, au choix de Claude Code | Alerte en cas de panne de la réservation |

## Principes d'architecture

Ces huit principes protègent la fiabilité de la réservation ; ils ne se négocient pas.

1. **Les créneaux se calculent côté serveur**, dans un module isolé, sans dépendance à l'interface, couvert par des tests.
2. **La base refuse elle-même deux RDV qui se chevauchent** pour un même membre de l'équipe, par une contrainte d'exclusion Postgres (R-23).
3. **Toutes les heures sont stockées en UTC** et calculées dans le fuseau Europe/Paris, changements d'heure compris.
4. **Le prix et la durée sont figés dans chaque RDV** au moment de la réservation (R-16).
5. **Aucun accès à la base depuis le navigateur** : chaque action vérifie les droits côté serveur ; la sécurité par ligne de Supabase reste activée en seconde barrière.
6. **Toute action sur un RDV, une absence, un tarif ou un compte est inscrite au journal d'audit** (R-43, R-54, R-74).
7. **Les emails partent d'une file d'envoi avec reprise**, jamais pendant la réservation elle-même : une panne d'email ne bloque pas un RDV.
8. **Les réglages sont des données, pas du code** : horaires, fermetures, délai de 48 h, délai de 1 h, horizon de 6 semaines, 2 RDV à venir, seuil de 2 lapins.

## Modèle de données de départ

Un point de départ que Claude Code affine au lot 1 ; chaque entité renvoie aux règles qu'elle porte.

| Entité | Contenu | Règles |
| --- | --- | --- |
| Client | Prénom, nom, téléphone, email, compte bloqué ou non, nombre de lapins | R-52, R-70, R-75 |
| Membre de l'équipe | Prénom, rôle coiffeur ou apprenti, actif ou non | R-02, R-13 |
| Prestation | Nom, prix, durée, réservable en ligne, active, ordre d'affichage | R-10, R-11, R-15, R-17 |
| Habilitation | Lien prestation ↔ membre de l'équipe | R-12, R-13 |
| RDV | Client, membre, début, fin, statut, note, origine en ligne ou salon | R-22 à R-29, R-50 |
| Ligne de RDV | Prestation, prix et durée figés | R-14, R-16 |
| Absence | Membre, début, fin, motif | R-40 à R-43 |
| Réglages du salon | Horaires, fermetures, délais et seuils | R-01 à R-07 |
| Journal d'audit | Auteur, action, objet, avant, après, date | R-43, R-54, R-74 |
| Envoi d'email | Type, destinataire, RDV, statut, tentatives | R-60 à R-64 |

## Lots de développement

La V1 se construit en 9 lots, dans cet ordre ; un lot ne commence qu'une fois le précédent validé par vous. Les routes et les écrans de chaque lot sont listés dans docs/design/README.md.

| Lot | Contenu | Terminé quand |
| --- | --- | --- |
| 0. Socle | Projet, dépôt, environnements, base, authentification, déploiement de test, tests automatiques | Une page s'affiche en ligne et les tests tournent à chaque modification |
| 1. Moteur de créneaux | Modèle de données, réglages, calcul des créneaux, contrainte anti-chevauchement | R-01 à R-07 et R-20 à R-25 sont couvertes par des tests verts |
| 2. Réservation client | Les 5 étapes, inscription, connexion, email de confirmation | Un client réserve de bout en bout sur mobile, test Playwright compris ; R-14, R-17 et R-18 sont testées |
| 3. Espace client | Mes RDV, modifier ou annuler jusqu'à 48 h, reprendre le même RDV, Mes informations | R-30 à R-32 et R-75, R-76 sont testées |
| 4. Planning tablette | 4 colonnes, fiche RDV, réservation par le salon, lapins, code gérant, choix de l'auteur | R-26, R-27, R-51, R-52, R-72 à R-74 sont testées |
| 5. Gestion | Carte, habilitations, équipe, horaires, fermetures, absences et RDV touchés | R-03, R-11, R-13, R-40 à R-43 sont testées |
| 6. Vitrine | Accueil, prestations, le salon, pages légales, référencement local, animations | Les maquettes sont respectées, la version ordinateur suit D-37 et les pages se chargent vite sur mobile |
| 7. Emails et tableau de bord | Rappel 3 jours avant, emails de modification et d'annulation, invitation à un avis, chiffre d'affaires indicatif | R-53 à R-55 et R-60 à R-64 sont testées |
| 8. Recette et bascule | Tests sur vrais téléphones et sur la tablette, sauvegardes, surveillance, mise en ligne, invitation des clients, fermeture de Planity | Une semaine sans incident en conditions réelles |

## Cadre de travail

Claude Code ne crée aucun compte et ne saisit aucun mot de passe : vous ouvrez les comptes, il vous guide pour les relier au projet.

### Comptes à ouvrir

Budget estimé entre 45 et 60 € par mois, sans SMS.

- [ ] Nom de domaine : elegance-strasbourg.com semble déjà pris, une alternative est à choisir.
- [ ] GitHub, pour le dépôt du code.
- [ ] Vercel, offre Pro.
- [ ] Supabase, offre Pro, région européenne.
- [ ] Brevo, avec le domaine vérifié pour l'envoi d'emails.

### Hors périmètre de la V1, même dessiné

SMS, paiement en ligne (ni drapeau ni code, D-34), plusieurs langues, réservation pour un proche, import de fichier clients, second salon, prestations sur devis, clients sans rendez-vous.

### Définition de « terminé »

Un lot est terminé quand :

- chaque règle qu'il touche est couverte par un test vert ;
- il a été montré sur mobile, et sur tablette pour le salon ;
- aucun test des lots précédents n'est cassé ;
- les décisions techniques prises sont notées dans docs/decisions.md ;
- vous l'avez validé.

## Le fichier CLAUDE.md

Claude Code lit automatiquement le fichier CLAUDE.md à la racine du projet, à chaque session. Ce brouillon est à placer au lot 0, puis à tenir à jour.

```markdown
# Elegance Strasbourg : site et réservation

## Sources de vérité
- docs/dossier-projet.md : règles métier R-xx et décisions D-xx. Elles font foi.
- docs/transmission-code.md : stack, principes d'architecture, lots.
- docs/design/ : passation design (README, design-tokens.json, theme.css, motion.ts). Maquettes : canevas Claude Design, lien dans le README.
- En cas d'écart, docs/dossier-projet.md l'emporte sur docs/design/ (voir docs/design/CORRECTIONS.md).
- docs/decisions.md : décisions techniques, à compléter à chaque choix.

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
```

## À réunir avant de lancer Claude Code

- [x] Le système de design et les maquettes, validés à l'étape Design.
- [x] Le dossier projet, exporté en Markdown dans docs/.
- [x] Ce dossier de transmission, exporté en Markdown dans docs/.
- [x] Le logo web (version noire, D-33).
- [x] Les photos du salon, traitées par l'étape Design.
- [ ] Les comptes ouverts : domaine, GitHub, Vercel, Supabase, Brevo.
