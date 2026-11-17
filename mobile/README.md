# App iPhone « Elegance Strasbourg »

Application Expo (React Native). Elle n'a **aucune règle métier** : elle affiche et envoie, tout vient de
`https://elegance-strasbourg.fr/api/mobile/v1` (voir `docs/plan-app-store.md` à la racine du dépôt).

Projet à part du site : commandes à lancer **depuis ce dossier**, avec npm.

```bash
npm install
npm test            # fonctions pures et client de l'API (Jest)
npm run typecheck
npx expo start      # essai sur l'iPhone avec l'app Expo Go
```

Pour viser un serveur local : `EXPO_PUBLIC_API_BASE_URL=http://<adresse du PC>:3000 npx expo start`.
Vérifier que l'app se compile : `npx expo export --platform ios --output-dir .export-check` (puis supprimer le dossier).

Construction et envoi à Apple (lot 26, par Florent, depuis ce dossier) : `npx eas-cli login`, `npx eas-cli init`,
`npx eas-cli build -p ios`, `npx eas-cli submit -p ios`.
