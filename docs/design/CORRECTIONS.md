# Corrections de la passation design

La passation livrée par Claude Design (README.md de ce dossier) contient quatre écarts avec le dossier projet.
**Le dossier projet fait foi.** Appliquer ces corrections ; le reste de la passation s'applique tel quel.

| Sujet | Passation design | Ce qui s'applique | Référence |
|---|---|---|---|
| Soin du visage à la vapeur | Sur appel | **Réservable en ligne** | Carte du dossier projet, D-36 |
| Tribal | En ligne | **Sur appel uniquement** | Carte du dossier projet, D-19, D-36 |
| Paiement en ligne | Dessiné, branché derrière `NEXT_PUBLIC_ONLINE_PAYMENT=false` | **Non développé en V1** : ni drapeau, ni code, ni texte « Payé en ligne ». Les maquettes de paiement restent en archive. | D-07, D-34 |
| Lapins | Réservation suspendue automatiquement après [N] lapins | **Pas de suspension automatique.** Chaque lapin s'ajoute à la fiche client ; à partir de 2 lapins, le gérant peut bloquer la réservation en ligne du client, puis la débloquer. Le client bloqué voit le message factuel prévu, avec le bouton Appeler. | R-52, D-35 |

## Précision sur le choix du coiffeur

La passation prévoit, si le client mélange prestations « Coiffeurs » et « Apprentis », de ne proposer que « Sans préférence ».
Personne ne pouvant réaliser les deux catégories, **le mélange est interdit** : dès qu'une prestation d'une catégorie est choisie,
les prestations de l'autre catégorie sont grisées, avec un court message explicatif (R-18).

## Points confirmés

- Avis : développés mais masqués derrière `NEXT_PUBLIC_REVIEWS=false` jusqu'à leur lancement (D-38).
- Pages ordinateur : non dessinées ; appliquer la recommandation de la section 8 de la passation (D-37).
- Logo : version noire uniquement, toujours sur une plaque ivoire (D-33).
- Nom de domaine : elegance-strasbourg.com semble déjà pris ; le domaine définitif reste à choisir. Ne pas le coder en dur.
