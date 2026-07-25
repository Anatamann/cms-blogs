#!/usr/bin/env bash
# Run ODT test-blog import inside the running app container.
# Prefer scripts/docker-load-local-db.sh if you already imported on the host.
#
# Usage:
#   ./scripts/docker-import-test-blogs.sh
#   DOCKER="sudo docker" ./scripts/docker-import-test-blogs.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DOCKER="${DOCKER:-docker}"
if ! $DOCKER info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then
    DOCKER="sudo docker"
  else
    echo "error: cannot talk to Docker. Try: DOCKER='sudo docker' $0" >&2
    exit 1
  fi
fi

COMPOSE="$DOCKER compose"

echo "==> Ensuring stack is up"
$COMPOSE up -d

echo "==> Importing public/test-blogs/*.odt inside app container"
$COMPOSE exec -T app node scripts/import-test-blogs.js

echo "==> Done. Check: http://localhost:${NGINX_HTTP_PORT:-8080}/blog"
