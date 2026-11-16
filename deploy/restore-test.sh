#!/usr/bin/env bash
# Test de restauration (lot 23) : récupère la dernière sauvegarde chez Backblaze, la restaure dans une base JETABLE
# (elegance_restoretest, dans le conteneur elegance-db), compte les lignes, puis supprime la base jetable.
# Ne touche jamais à la vraie base « elegance ». À lancer après la première sauvegarde, puis de temps en temps.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d "$HOME/restore-test.XXXXXX")"
trap 'rm -rf "$TMP"; docker exec elegance-db dropdb -U elegance --if-exists elegance_restoretest >/dev/null 2>&1 || true' EXIT

echo "Téléchargement de la dernière sauvegarde chez Backblaze…"
docker run --rm -h elegance --env-file "$DIR/backup.env" -v "$TMP:/restore" restic/restic:latest \
  restore latest --host elegance --tag db --target /restore --quiet
DUMP="$(find "$TMP" -name 'elegance-*.dump' | sort | tail -1)"
[ -n "$DUMP" ] || { echo "Aucun fichier restauré"; exit 1; }
echo "Fichier : $(basename "$DUMP") ($(du -h "$DUMP" | cut -f1))"

docker exec elegance-db dropdb -U elegance --if-exists elegance_restoretest
docker exec elegance-db createdb -U elegance elegance_restoretest
docker exec -i elegance-db pg_restore -U elegance -d elegance_restoretest --no-owner < "$DUMP"

count() { docker exec elegance-db psql -U "elegance" -d "$1" -Atc "select count(*) from $2"; }
for t in appointment customer service staff; do
  A="$(count elegance "$t" 2>/dev/null || echo '?')"; B="$(count elegance_restoretest "$t" 2>/dev/null || echo '?')"
  echo "$t : base réelle $A, restaurée $B"
done
echo "Test de restauration terminé : la sauvegarde est exploitable."
