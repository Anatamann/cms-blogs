#!/usr/bin/env bash
# Load the host project's SQLite DB (+ optional uploads) into Docker volumes.
# Use this to push local content (including imported test-blogs) into production.
#
# Usage:
#   ./scripts/docker-load-local-db.sh
#   DOCKER="sudo docker" ./scripts/docker-load-local-db.sh
#
# Requires: docker (or sudo docker), sqlite3 recommended
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
DATA_SRC="${DATA_SRC:-$ROOT/data}"
DB_FILE="${DATABASE_FILE:-ainme.sqlite}"
DB_PATH="$DATA_SRC/$DB_FILE"
UPLOADS_SRC="${UPLOADS_SRC:-$ROOT/public/uploads}"
VOL_DATA="${AINME_DATA_VOLUME:-ainme_data}"
VOL_UPLOADS="${AINME_UPLOADS_VOLUME:-ainme_uploads}"

if [[ ! -f "$DB_PATH" ]]; then
  echo "error: no database at $DB_PATH" >&2
  echo "  Import test blogs locally first: npm run db:import-test-blogs" >&2
  exit 1
fi

echo "==> Checkpoint / copy SQLite (avoids WAL half-state)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" ".backup '$TMP/$DB_FILE'"
else
  cp -a "$DB_PATH" "$TMP/$DB_FILE"
  cp -a "${DB_PATH}-wal" "$TMP/" 2>/dev/null || true
  cp -a "${DB_PATH}-shm" "$TMP/" 2>/dev/null || true
fi

echo "==> Stopping app (keeps nginx if up)"
$COMPOSE stop app 2>/dev/null || true

echo "==> Writing DB into volume: $VOL_DATA"
$DOCKER run --rm \
  -v "${VOL_DATA}:/data" \
  -v "$TMP:/src:ro" \
  alpine:3.20 \
  sh -c "rm -f /data/${DB_FILE} /data/${DB_FILE}-wal /data/${DB_FILE}-shm && cp -a /src/${DB_FILE} /data/ && ls -la /data"

if [[ -d "$UPLOADS_SRC" ]] && [[ "${SKIP_UPLOADS:-}" != "1" ]]; then
  echo "==> Syncing uploads into volume: $VOL_UPLOADS"
  $DOCKER run --rm \
    -v "${VOL_UPLOADS}:/dest" \
    -v "$UPLOADS_SRC:/src:ro" \
    alpine:3.20 \
    sh -c 'cp -a /src/. /dest/ && ls -la /dest | head'
fi

echo "==> Starting stack"
$COMPOSE up -d

echo "==> Waiting for health…"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf "http://127.0.0.1:${NGINX_HTTP_PORT:-8080}/health" >/dev/null 2>&1; then
    echo "OK: site healthy on :${NGINX_HTTP_PORT:-8080}"
    curl -sS "http://127.0.0.1:${NGINX_HTTP_PORT:-8080}/blog" | grep -oE 'mushoku-tensei|dr-stone|oshi-no-ko|Welcome to the feed' | sort -u || true
    exit 0
  fi
  sleep 2
done

echo "warn: health check timed out — run: $COMPOSE logs app" >&2
exit 1
