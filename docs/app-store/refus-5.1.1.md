# Refus Apple : règle 5.1.1(v)

## Mise à jour du 27 novembre 2026 : seul le téléphone bloque

La réponse de l'option A a été envoyée. Apple **accepte désormais le compte pour réserver**, mais demande que le **numéro de téléphone devienne facultatif**. Le message dit : « Update the app to not require users to provide the following personal information: phone number ».

**Décision de Florent (27 novembre 2026)** : le téléphone devient facultatif **partout**, sur le site comme dans l'app. Il faut mettre à jour R-70 et ajouter une décision D-xx en conséquence.

Correction à faire, en un petit lot :
- Rendre le téléphone facultatif à l'inscription et dans « Mes informations ».
  - Site : `src/modules/customers/schemas.ts`, où la constante `phone` est obligatoire (`signUpSchema` et le formulaire du profil) ; `src/components/account-forms.tsx` ; `src/app/(client)/compte/informations/informations-forms.tsx`.
  - App : `mobile/src/auth-form.tsx`, l'écran « Mon compte » et `mobile/src/api/types.ts`.
  - API : `src/modules/mobile/api.ts`, ainsi que `src/modules/customers/accounts.ts` et `profile.ts`, qui doivent écrire `null` quand le champ est vide.
- La colonne `customer.phone` accepte déjà `null` : aucune migration n'est nécessaire.
- Vérifier les affichages qui supposent un téléphone : planning, fiche RDV, fiche client, emails, fiche iCalendar, bouton « Appeler » côté salon.
- Libellé du champ : « Téléphone (facultatif) », éventuellement avec « pour que le salon puisse vous prévenir en cas d'imprévu ».
- Mettre à jour la règle R-70 et ajouter une décision D-xx dans `docs/dossier-projet.md` et `docs/decisions.md`. Écrire les tests d'abord : inscription sans téléphone acceptée, numéro invalide toujours refusé.
- Ensuite : tous les tests, déploiement, build 3, rattachement à la version 1.0, puis nouvelle soumission avec une note du type « Phone number is now optional at sign-up and in the account settings. »

**Fait le 27 novembre 2026 (code)** : R-70 mis à jour, décision D-126. Le schéma `phone` (`src/modules/customers/schemas.ts`) accepte un champ vide ou absent (`null` en base), un numéro saisi reste vérifié ; l'API mobile en hérite. Site : « Téléphone · facultatif » avec l'aide « Pour que le salon puisse vous prévenir en cas d'imprévu. » à l'inscription (et à l'étape 4 de la réservation) et dans « Mes informations », qui permet aussi d'effacer le numéro. App : même champ (`mobile/src/lib/phone-field.ts`, textes comparés à ceux du site par `src/modules/mobile/app-sync.test.ts`). Tablette : « Pas de téléphone » au lieu d'un lien d'appel vide (fiche RDV, fiche client, réserver pour un client, espace gérant) ; les fiches créées par le salon gardent le téléphone obligatoire. Les emails, l'iCalendar et les notifications n'utilisent pas le téléphone du client.

Note à joindre à la nouvelle soumission (App Review, « Notes ») :

```
Phone number is now optional at sign-up and in the account settings.
```

---

## Premier refus (23 novembre 2026)

Soumission 0d9a753f-478d-482b-b5b2-55a72ef5606d, version 1.0 (build 2), examinée sur iPad Air 11 pouces (M3), en mode iPhone, car `supportsTablet` vaut false.

## Ce qu'Apple reproche

L'app oblige à créer un compte pour accéder à des services qui n'en ont pas besoin. Apple accepte un compte pour les fonctions qui en dépendent vraiment, pas pour le reste.

## Ce que fait l'app aujourd'hui (vérifié dans le code)

- **Libre, sans compte** : l'accueil (horaires en direct, plan, appel, itinéraire) et les étapes 1 à 3 de la réservation (prestations et prix, coiffeur, jour et créneau).
- **Compte obligatoire** :
  - Étape 4 : `mobile/app/reserver/compte.tsx`, formulaire d'inscription complet avec prénom, nom, téléphone, email et **mot de passe**, plus l'acceptation des conditions. Le passage par cet écran est décidé par `routeAfterSlot` dans `mobile/src/flow.ts`.
  - Onglets « Mes RDV », « Fidélité » et « Compte ». Ceux-là dépendent réellement d'un compte, Apple les accepte.
- **Côté site, c'est la même règle** : R-70 et R-71, ainsi que D-44 (`docs/dossier-projet.md`). La réservation passe par un compte créé à l'étape 4.

Le point bloquant est donc qu'il faut **créer un compte avec mot de passe pour prendre un simple rendez-vous**. Pour Apple, réserver n'est pas une fonction « liée à un compte » : il suffit des informations utiles au salon (nom, téléphone, email).

## Deux façons d'en sortir

### Option A : répondre à Apple sans rien changer (rapide, gratuit, résultat incertain)

On explique que le compte sert à gérer le rendez-vous : le modifier ou l'annuler (délai de 48 h), recevoir les rappels et les notifications, limiter les réservations abusives (lapins, nombre maximal de RDV à venir) et cumuler la fidélité. On rappelle aussi que tout le reste se consulte sans compte. Apple accepte parfois cet argument pour la prise de rendez-vous, mais pas toujours. En cas de second refus, on passe à l'option B.

Brouillon de réponse, à coller dans App Store Connect, section « App Review », en réponse au message :

```
Hello,

Thank you for your review.

Elegance Strasbourg is the booking app of a real hair salon. Everything that is not tied to a customer can be used without an account: opening hours (open/closed now), the full service menu with prices, the hairdressers, the available time slots for every day, the map, directions and a call button.

An account is only requested at the last step, to confirm an appointment, because the appointment then belongs to the customer:
- the customer can change or cancel it later from the app (and the salon applies a 48-hour change policy per customer);
- the salon must be able to reach the customer (name and phone) and sends the confirmation, a reminder and push notifications about this appointment;
- the salon limits the number of upcoming appointments per customer and blocks customers who repeatedly do not show up, which requires identifying them;
- visits earn loyalty points (a free haircut after 100 points).

The account only contains what the salon needs for the appointment (first name, last name, phone, email) and can be deleted at any time from the app (Account > My account > Delete my account).

We believe booking is account-based functionality under guideline 5.1.1. If you still consider that a guest booking is required, please let us know and we will add it.

Best regards,
Florent Morel, FR Services
```

### Option B : permettre de réserver sans compte (sûr, mais c'est un vrai lot)

Proposer, à l'étape 4, un choix « Réserver sans compte » avec seulement prénom, nom, téléphone et email, sans mot de passe. La création de compte resterait proposée. C'est la solution qu'Apple attend en général.

C'est un changement de règle métier (R-70, R-71, D-44), qui doit donc être décidé par Florent, puis appliqué **au site comme à l'app**, puisque l'app doit rester fidèle au site. Questions à trancher avant de coder :

1. Comment un client sans compte gère-t-il son RDV ? Probablement par un lien signé dans l'email de confirmation, pour modifier ou annuler.
2. Comment appliquer la limite de RDV à venir (R-25) et le blocage des lapins (R-52) sans compte ? Une fiche client retrouvée par email ou téléphone pourrait servir.
3. Que deviennent la fidélité et les notifications ? Sans compte, il n'y aurait pas de notification, seulement les emails, et la fidélité ne compterait qu'à la création d'un compte.
4. La liste d'attente reste-t-elle réservée aux comptes ?

Une fois l'option choisie, il faut refaire une construction EAS (build 3), la rattacher à la version 1.0 et soumettre à nouveau, avec une note qui explique le changement.
