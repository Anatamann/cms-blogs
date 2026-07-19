#!/usr/bin/env bash
# Restore from a backup created by scripts/backup.sh
# Usage:
#   ./scripts/restore.sh backups/ainme-backup-YYYYMMDDTHHMMSSZ.tar.gz
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup.tar.gz>" >&2
  exit 1
fi

ARCHIVE="$(realpath "$1")"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${DATA_DIR:-$ROOT/data}"
UPLOADS_DIR="${UPLOADS_DIR:-$ROOT/public/uploads}"

if [[ ! -f "$ARCHIVE" ]]; then
  echo "Archive not found: $ARCHIVE" >&2
  exit 1
fi

echo "This will overwrite data in:"
echo "  $DATA_DIR"
echo "  $UPLOADS_DIR"
read -r -p "Continue? [y/N] " ans
if [[ "${ans:-}" != "y" && "${ans:-}" != "Y" ]]; then
  echo "Aborted."
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

tar -xzf "$ARCHIVE" -C "$TMP"
mkdir -p "$DATA_DIR" "$UPLOADS_DIR"

if [[ -d "$TMP/data" ]]; then
  cp -a "$TMP/data/." "$DATA_DIR/"
fi
if [[ -d "$TMP/uploads" ]]; then
  cp -a "$TMP/uploads/." "$UPLOADS_DIR/"
fi

echo "Restore complete. Restart the app (and prefer a short downtime around restore)."
