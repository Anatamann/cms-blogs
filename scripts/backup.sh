#!/usr/bin/env bash
# Backup SQLite DB + uploads for Ainme Blog.
# Usage:
#   ./scripts/backup.sh
#   BACKUP_DIR=/var/backups/ainme ./scripts/backup.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${DATA_DIR:-$ROOT/data}"
UPLOADS_DIR="${UPLOADS_DIR:-$ROOT/public/uploads}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/ainme-backup-$STAMP.tar.gz"

mkdir -p "$BACKUP_DIR"

# Prefer sqlite online backup if sqlite3 CLI exists and DB is present
DB_FILE="${DATABASE_FILE:-ainme.sqlite}"
DB_PATH="$DATA_DIR/$DB_FILE"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/data" "$TMP/uploads"

if [[ -f "$DB_PATH" ]]; then
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$DB_PATH" ".backup '$TMP/data/$DB_FILE'"
  else
    # Safe-ish copy when WAL may be present
    cp -a "$DB_PATH" "$TMP/data/" 2>/dev/null || true
    cp -a "${DB_PATH}-wal" "$TMP/data/" 2>/dev/null || true
    cp -a "${DB_PATH}-shm" "$TMP/data/" 2>/dev/null || true
  fi
else
  echo "warn: no database at $DB_PATH" >&2
fi

if [[ -d "$UPLOADS_DIR" ]]; then
  # Copy tree but skip empty .gitkeep-only noise is fine
  cp -a "$UPLOADS_DIR/." "$TMP/uploads/" 2>/dev/null || true
fi

tar -czf "$OUT" -C "$TMP" data uploads
echo "Backup written: $OUT"
ls -lh "$OUT"
