#!/usr/bin/env bash
# Mise à jour du site sur le VPS : récupère le code, recompile, puis redémarre le site.
# S'arrête à la première erreur : si la compilation échoue, l'ancien site continue de servir (la compilation se fait
# dans un volume à part, recopié seulement en cas de succès). Le site est coupé quelques secondes au redémarrage :
# déployer en dehors des heures d'ouverture.
set -euo pipefail
cd "$(dirname "$0")/.."
C="docker compose -f deploy/docker-compose.yml"
git pull --ff-only
$C build tools
$C up -d --wait elegance-db
$C run --rm tools sh -c "pnpm db:migrate && pnpm build"
$C run --rm publish
$C up -d --force-recreate elegance
docker image prune -f >/dev/null
docker builder prune -f --keep-storage 2GB >/dev/null
echo "OK : site à jour."
