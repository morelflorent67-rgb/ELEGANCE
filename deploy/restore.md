# Restaurer la base depuis une sauvegarde

Les sauvegardes sont chiffrées (restic) chez Backblaze B2, bucket privé `elegance-strasbourg-backups`, région UE. Une chaque nuit à 3 h ; on garde 7 jours et 4 semaines. Les clés et le mot de passe de chiffrement sont dans `~/elegance/deploy/backup.env` (serveur) : **garder une copie du mot de passe `RESTIC_PASSWORD` dans un gestionnaire de mots de passe**, sinon les sauvegardes sont illisibles si le serveur disparaît.

Tout se tape sur le serveur : `ssh n8n-velto` (depuis PowerShell).

## Vérifier que la sauvegarde est exploitable (sans rien toucher)

```bash
bash ~/elegance/deploy/restore-test.sh
```

Restaure la dernière sauvegarde dans une base jetable, compare les nombres de lignes avec la vraie base, puis efface la base jetable. À refaire de temps en temps (une fois par mois).

## Voir les sauvegardes disponibles

```bash
cd ~/elegance/deploy && docker run --rm -h elegance --env-file backup.env restic/restic:latest snapshots
```

## Restaurer vraiment (la base actuelle est perdue ou abîmée)

1. Arrêter le site : `docker stop elegance`
2. Récupérer le fichier de la dernière sauvegarde :
   ```bash
   mkdir -p ~/restore && cd ~/elegance/deploy && docker run --rm -h elegance --env-file backup.env -v ~/restore:/restore restic/restic:latest restore latest --host elegance --tag db --target /restore
   ```
   (un ancien jour : remplacer `latest` par l'identifiant donné par `snapshots`)
3. Remplacer la base :
   ```bash
   F=$(find ~/restore -name 'elegance-*.dump' | sort | tail -1)
   docker exec elegance-db dropdb -U elegance elegance
   docker exec elegance-db createdb -U elegance elegance
   docker exec -i elegance-db pg_restore -U elegance -d elegance --no-owner < "$F"
   ```
4. Redémarrer : `docker start elegance`, puis ouvrir `/api/health` (doit répondre « ok »).
5. Effacer le dossier : `rm -rf ~/restore`

Annoncer à Florent avant l'étape 3 : elle efface la base actuelle. Les rendez-vous pris depuis la dernière sauvegarde (jusqu'à 24 h) sont perdus.

## Si le serveur entier est perdu

Nouveau serveur → refaire l'installation (docs/reprise.md, section Lot 22), recréer `deploy/backup.env` avec les mêmes clés Backblaze et **le même `RESTIC_PASSWORD`**, puis suivre « Restaurer vraiment » à partir de l'étape 2.
