# Elegance Strasbourg — dossier de passation design → Claude Code

Direction artistique validée : **A « Lumière »**. Stack cible : **Next.js (App Router) + Tailwind CSS v4**.
Ce dossier contient les valeurs du système de design dans un format directement utilisable, les fichiers du logo et des photos, et les règles à respecter écran par écran.

Référence visuelle (maquettes, prototype cliquable, fiche des animations) : le canevas Claude Design
https://claude.ai/code/artifact/89f78eff-5469-48ae-9996-f775496f1782

---

## 1. Contenu du dossier

| Fichier | Rôle |
|---|---|
| `design-tokens.json` | Source unique de toutes les valeurs : couleurs, typographie, espacements, tailles, mouvement. |
| `theme.css` | Thème Tailwind v4 (`@theme`) + base + utilitaires du système + règle « réduire les animations ». À importer dans `app/globals.css`. |
| `motion.ts` | Durées, courbes, cascades, séquences d'ouverture et de confirmation, utilitaires (premier geste, réduction des animations). |
| `../../assets/logo/elegance-logo-noir.svg` | Logo officiel. **Seule version utilisée**, toujours posée sur une plaque ivoire `#efe9dd`. |
| `../../assets/photos/*.jpg` | Les 6 photos du salon, traitement sombre homogène appliqué, et leurs recadrages. |

---

## 2. Correspondance des couleurs

| Token | Classe Tailwind | Valeur | Usage |
|---|---|---|---|
| bg.base | `bg-ink` | #0b0a09 | Fond de toutes les pages ; texte sur ivoire |
| bg.raised | `bg-charcoal` | #141210 | Cartes, champs, carte d'accès |
| bg.elevated | `bg-graphite` | #1a1816 | Panneaux, résumés d'étape, cartes de RDV, blocs du planning |
| bg.hover | `bg-graphite-light` | #221f1c | Survol, appui, RDV en cours |
| text.primary / surface.ivory | `text-ivory` / `bg-ivory` | #efe9dd | Texte, plaque du logo, bouton principal |
| text.secondary | `text-ivory-soft` | #c9c3b7 | Paragraphes |
| text.muted | `text-stone` | #a8a297 | Étiquettes, durées, légendes |
| text.faint | `text-stone-dark` | #8f897e | Minimum autorisé pour du texte |
| accent.gold | `text-gold` | #b8935a | Détails : repères, chevrons, focus |
| light.led | `bg-led` | #ffffff | Lignes de lumière uniquement |
| state.error | `text-brick` / `border-brick` | #d9745f | Erreur, annulation, lapin (contour, jamais en aplat) |
| state.success | `text-sage` | #9bb58c | Validation discrète |
| line.* | `border-line-subtle` / `border-line` / `border-line-strong` | ivoire 12 / 16 / 28 % | Filets et contours 1 px |

Interdits : le rose du néon et le vert du mur végétal comme couleurs d'interface, les dégradés décoratifs, le marbre et la dorure, les coins arrondis.

---

## 3. Règles de design à respecter partout

- **Une seule action ivoire par écran** (bouton principal 56 px). Secondaires : contour `line-strong`, 52 px.
- **Logo** : `elegance-logo-noir.svg` uniquement, sur plaque ivoire (en-tête : 92 px de large ; accueil : 256 px ; pied de page : 190 px). Jamais le logo seul sur fond sombre.
- **Aucun coin arrondi** (`--radius-*: initial`).
- **Cibles tactiles ≥ 44 px**, champs à 16 px (pas de zoom iPhone), libellé toujours visible au-dessus du champ.
- **Contrastes** vérifiés (voir `design-tokens.json › color.$contrast`). Ne pas descendre sous `text-stone-dark` pour du texte.
- **Statuts lisibles sans la couleur** : chaque état porte aussi un mot (« En cours », « Lapin », « Salon », « Annulé »).
- **Bouton Réserver accessible depuis toutes les pages publiques** : barre collante en bas (88 px) avec Réserver + Appeler.
- **Icônes** au trait 1,4 px sur grille 24, ivoire ; bouton menu = les trois barres du E (3 barres égales dans un carré de 20 px).
- **Motifs signature** : trois barres du E (menu, chargement), ligne de lumière (1 px blanc qui se trace), nœud hexagonal (repère d'étiquette 12 px or, badge d'équipe 46/32/24 px).
- Français uniquement. Site mobile d'abord ; tablette du salon en paysage (1194 × 834).

---

## 4. Écrans et routes proposées

Le canevas est organisé en pages. Les artboards de la page « Directions » autres que *A — Lumière* (A2, B, comparatif des polices) sont des archives : ne pas les implémenter.

### Vitrine (mobile d'abord)
| Écran (artboard) | Route |
|---|---|
| A — Lumière · Accueil | `/` |
| Prestations et tarifs | `/prestations` |
| Le salon (galerie plein écran, équipe, horaires, accès, avis masqués) | `/salon` |
| Pages légales — gabarit unique à onglets | `/mentions-legales`, `/confidentialite`, `/conditions` |

### Réservation et compte
| Écran | Route |
|---|---|
| Réservation — une page, 5 étapes (prototype cliquable) | `/reservation` |
| Confirmation (état final du prototype, moment fort) | `/reservation/confirmation` |
| Réservation — cas particuliers (5 cas) | états de `/reservation` |
| Menu plein écran | composant global |
| Connexion / Inscription | `/connexion`, `/inscription` |
| Mes RDV (+ feuille d'annulation) | `/compte/rendez-vous` |
| Mes informations (+ feuille de suppression) | `/compte/informations` |

### Salon — tablette (accès réservé à l'équipe)
| Écran | Route |
|---|---|
| Planning du jour + fiche RDV (panneau droit) | `/equipe` |
| Réservation par le salon | `/equipe/reserver` |
| Absences | `/equipe/absences` |
| Tableau de bord | `/equipe/bilan` |
| Espace gérant — carte, équipe, horaires (code gérant) | `/equipe/gerant` |

### Emails (page « Emails »)
Confirmation · Rappel 3 jours avant · Modification · Annulation · Invitation à laisser un avis.
Largeur 600 px, montage en tableaux (React Email ou MJML), police de repli Arial : Sora ne s'affichera pas dans tous les clients. Prévoir le mode sombre forcé d'Outlook (le design est déjà sombre).

---

## 5. Règles métier visibles dans l'interface

### La carte
| Prestation | Prix | Durée | Réalisée par | Réservation |
|---|---|---|---|---|
| Coupe homme | 18 € | 30 min | Coiffeurs | En ligne |
| Coupe & taille de barbe | 28 € | 30 min | Coiffeurs | En ligne |
| Coupe, tarif formation | 10 € | 45 min | Apprentis | En ligne |
| Coupe & taille de barbe, tarif formation | 15 € | 45 min | Apprentis | En ligne |
| Taillage barbe | 12 € | 15 min | Coiffeurs | En ligne |
| Soin du visage à la vapeur | 25 € | 30 min | Coiffeurs | Sur appel |
| Coloration | 15 € | 30 min | Coiffeurs | Sur appel |
| Tribal | 10 € | 30 min | Coiffeurs | En ligne |
| Défrisage | 10 € | 30 min | Coiffeurs | Sur appel |
| Lissage brésilien | 60 € | 30 min | Coiffeurs | Sur appel |

- **Équipe** : Orhan et Enes (coiffeurs), Kaan et Taha (apprentis). Pas de portrait : prénom, rôle, badge hexagonal.
- **Coiffeur proposé** : prestations « Coiffeurs » → Sans préférence / Orhan / Enes ; « Apprentis » → Sans préférence / Kaan / Taha ; les deux mélangées → Sans préférence uniquement, avec un message. « Sans préférence » est sélectionné par défaut.
- **Horaires** : mardi → samedi, 10:00–12:00 et 13:00–19:00, pause commune 12:00–13:00, uniquement sur rendez-vous.
- **Coordonnées** : 162 route de Bischwiller, 67300 Schiltigheim · 03 88 97 74 68 (`tel:+33388977468`) · Instagram @elegance_strasbourg · Snapchat barb.hair · elegance-strasbourg.com.
- **Modification / annulation** en ligne jusqu'à 48 h avant ; ensuite « Appeler le salon ».
- **2 rendez-vous à venir maximum** par client en ligne.
- **Lapins** : signalés par l'équipe ; après [N] lapins, réservation en ligne suspendue (message factuel + Appeler).
- **Auteur** : sur la tablette partagée, chaque modification, annulation, lapin ou réservation demande « Qui fait la modification ? ».
- **Paiement** : sur place. Le paiement en ligne est **dessiné mais désactivé** : à brancher derrière un drapeau (ex. `NEXT_PUBLIC_ONLINE_PAYMENT=false`). Activé, l'étape 5 propose « Payer en ligne maintenant » / « Payer sur place » et la confirmation affiche « Payé en ligne ».
- **Avis** : section de la page Le salon et email d'invitation prêts, **masqués** jusqu'au lancement (drapeau `NEXT_PUBLIC_REVIEWS=false`). Pas d'avis sur l'accueil.
- **Emails** : confirmation immédiate, rappel 3 jours avant, modification, annulation, invitation à l'avis après la visite.
- Hors périmètre : SMS, réservation pour un proche.

---

## 6. Animations — mise en œuvre

Valeurs dans `motion.ts` et `theme.css`, détail visuel sur la planche « 4 — Fiche des animations ».

- **Ouverture de l'accueil** : une fois par session (`sessionStorage`), jamais bloquante ; `skipOpeningOnFirstGesture()` place tout à l'état final au premier toucher, défilement ou touche.
- **Révélations et lignes de lumière** : `IntersectionObserver` qui ajoute `.is-visible` (une seule fois) ; cascade via la variable `--i`.
- **Passage vitrine → réservation** : View Transitions API (sortie 160 ms, entrée 240 ms, ligne 280 ms), repli sur un fondu.
- **Étapes de la réservation** : repli et ouverture en 280 ms max (`grid-template-rows: 0fr → 1fr`), puis défilement vers l'étape ouverte.
- **Confirmation** : hexagone tracé, coche, reflet doré (`.gold-shine`) — seul usage de l'or animé.
- **Chargement** : les trois barres du E, affichées seulement au-delà de 300 ms.
- **Tablette** : uniquement le panneau de fiche (240 ms) et les messages.
- `prefers-reduced-motion: reduce` : état final direct partout (règle globale dans `theme.css`).

---

## 7. Photos

| Fichier | Utilisation |
|---|---|
| `hero-hex-v.jpg` | Accueil, premier écran (plafond hexagonal, cadrage vertical) |
| `salon-wide.jpg` | Accueil, section Le salon (pleine largeur) |
| `stitch-v.jpg` | Accueil (Les fauteuils), bandeau Prestations |
| `bulb-v.jpg` | Accueil (La lumière) |
| `lounge-salon.jpg` | Accueil (L'attente) |
| `row-wide.jpg`, `wall-full.jpg`, `chair-full.jpg`, `neon-full.jpg`, `room-green.jpg`, `lounge-wide.jpg` | Galerie de la page Le salon |

Traitement appliqué : saturation −45 %, hautes lumières compressées, légère chaleur, vignettage vers `#0b0a09`. Les fichiers fournis font environ 1 170 px de large : si des originaux plus grands existent, réappliquer le même traitement et exporter en AVIF/WebP via `next/image`.

---

## 8. Reste à fournir avant la mise en ligne

- Textes légaux complets (forme juridique, SIRET, hébergeur, durée de conservation, cookies) — **à faire valider par un professionnel**.
- Nombre de lapins avant suspension ; conditions de remboursement si le paiement en ligne est activé.
- Intégration de la carte d'accès (fournisseur à choisir) ; informations d'accès (tram, stationnement) si souhaitées.
- **Mises en page ordinateur** : non dessinées (le brief est mobile d'abord). Recommandation : conteneur de 1 200 px max, mêmes composants, grilles qui passent à 2–3 colonnes à partir de 1 024 px, barre Réserver remplacée par un bouton dans l'en-tête.
