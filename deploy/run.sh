#!/usr/bin/env bash
# Lance une commande pnpm du projet dans le conteneur outils, contre la base du serveur.
# Exemples : bash deploy/run.sh db:seed   |   bash deploy/run.sh staff:account   |   bash deploy/run.sh manager:set-code
# Les commandes qui posent une question (mot de passe, code gérant) demandent un terminal : ssh -t.
set -euo pipefail
cd "$(dirname "$0")/.."
exec docker compose -f deploy/docker-compose.yml run --rm tools pnpm "$@"
