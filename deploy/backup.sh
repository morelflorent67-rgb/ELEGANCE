#!/usr/bin/env bash
# Sauvegarde de la base (lot 23, D-120) : pg_dump du conteneur elegance-db, envoyé chiffré chez Backblaze B2 (restic).
# Lancé chaque nuit à 3 h (heure de Paris) par le crontab de n8nadmin. Journal : ~/elegance-backup.log.
# Secrets dans deploy/backup.env (droits 600, jamais dans le dépôt). Voir deploy/restore.md pour restaurer.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$HOME/elegance-backups"
STAMP="$(date +%Y%m%d-%H%M)"
FILE="elegance-$STAMP.dump"
mkdir -p "$OUT" "$HOME/.cache/restic"

set -a
# shellcheck disable=SC1091
. "$DIR/backup.env"
set +a

ping_monitor() { # $1 = "" (réussi), "/start" ou "/fail" ; sans HEALTHCHECK_URL, rien n'est envoyé
  [ -n "${HEALTHCHECK_URL:-}" ] && curl -fsS -m 10 --retry 3 "${HEALTHCHECK_URL}$1" >/dev/null 2>&1 || true
}
fail() {
  echo "$(date -Is) ÉCHEC de la sauvegarde (ligne $1)" >> "$HOME/elegance-backup.log"
  ping_monitor "/fail"
}
trap 'fail $LINENO' ERR
ping_monitor "/start"

R() { docker run --rm -h elegance --env-file "$DIR/backup.env" -v "$OUT:/data:ro" -v "$HOME/.cache/restic:/root/.cache/restic" restic/restic:latest "$@"; }

# 1. Copie de la base (format personnalisé, restaurable avec pg_restore)
docker exec elegance-db pg_dump -U elegance -d elegance -Fc > "$OUT/$FILE.part"
[ -s "$OUT/$FILE.part" ] || { echo "dump vide"; false; }
docker exec -i elegance-db pg_restore --list < "$OUT/$FILE.part" > /dev/null   # le fichier est lisible
mv "$OUT/$FILE.part" "$OUT/$FILE"

# 2. Envoi chiffré (le dépôt est créé au premier passage)
R cat config > /dev/null 2>&1 || R init
R backup "/data/$FILE" --tag db --host elegance --quiet

# 3. Rotation : 7 jours, 4 semaines ; contrôle d'un échantillon des données chez Backblaze
R forget --host elegance --tag db --keep-daily 7 --keep-weekly 4 --prune --quiet
R check --read-data-subset=2% --quiet

# 4. Ménage local : on garde 3 jours de copies sur le serveur
find "$OUT" -name 'elegance-*.dump' -mtime +3 -delete

echo "$(date -Is) sauvegarde OK ($FILE, $(du -h "$OUT/$FILE" | cut -f1))" >> "$HOME/elegance-backup.log"
ping_monitor ""
