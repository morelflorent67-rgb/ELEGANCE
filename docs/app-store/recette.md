# Recette de l'application iPhone (lot 26)

À cocher par Florent sur son iPhone (Expo Go pendant le développement, TestFlight ensuite). Les fonctions pures de l'app
(traduction des refus, prix, état du salon, client de l'API) sont testées par `npm test` dans `mobile/`.

## Accueil
- [ ] « Ouvert maintenant » ou « Ouvre … » est juste à l'heure de Paris
- [ ] Horaires, adresse, bandeau d'avis et phrase de fidélité viennent bien du salon
- [ ] « Appeler » ouvre le téléphone, « Itinéraire » ouvre Plans
- [ ] Hors ligne : message clair et bouton « Réessayer », pas d'écran blanc

## Compte
- [ ] Créer un compte (erreurs sous les champs si le téléphone ou l'email est invalide)
- [ ] Se déconnecter, se reconnecter, fermer l'app et la rouvrir : on reste connecté
- [ ] Mot de passe oublié : l'email arrive, le lien ouvre le site
- [ ] Modifier ses informations ; changer d'email demande le mot de passe
- [ ] Changer le mot de passe
- [ ] Mentions légales, confidentialité, conditions s'ouvrent
- [ ] **Supprimer mon compte** (avec mot de passe puis confirmation) : le compte disparaît, retour à l'accueil déconnecté

## Réserver
- [ ] Prestations : une prestation « sur devis » propose d'appeler, ne se réserve pas
- [ ] Coiffeur : « Sans préférence » et chaque coiffeur habilité
- [ ] Jours : fermé grisé, complet indiqué ; créneaux à l'heure et à la demie
- [ ] Jour complet : « Me prévenir si une place se libère »
- [ ] Sans connexion : « Se connecter pour réserver », puis retour au récapitulatif avec le choix gardé
- [ ] Réserver, voir la confirmation, recevoir l'email, voir le RDV sur la tablette du salon
- [ ] Réserver un créneau déjà pris : message « vient d'être pris » et retour au choix du créneau

## Mes rendez-vous
- [ ] À venir, avec « Modifiable jusqu'au … »
- [ ] Modifier : coiffeur et créneau, mêmes prestations
- [ ] Annuler (confirmation), l'email d'annulation arrive
- [ ] Dans le délai de modification : plus de boutons, « Appeler le salon »
- [ ] « Déjà venus » : « Reprendre le même rendez-vous » ouvre le choix du créneau
- [ ] Liste d'attente : inscription visible, « Me retirer de la liste »

## Fidélité
- [ ] Carte de 10 cases, solde, « Encore N points », historique
- [ ] Programme arrêté par le gérant : message adapté

## Cas limites
- [ ] Session expirée (supprimer la session depuis un autre appareil) : l'écran propose la connexion sans planter
- [ ] Mode avion pendant une réservation : « Pas de connexion », rien n'est perdu
- [ ] Texte agrandi (Réglages, Accessibilité) : rien ne déborde
