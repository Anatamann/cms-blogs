#!/usr/bin/env bash
# Re-extract WebP frames for homepage scroll scrub from public/videos/hero.mp4
#
# Usage:
#   ./scripts/extract-hero-frames.sh
#   ./scripts/extract-hero-frames.sh /path/to/clip.mp4
#   FPS=30 WIDTH=1280 QUALITY=72 ./scripts/extract-hero-frames.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$ROOT/public/videos/hero.mp4}"
OUT="$ROOT/public/videos/hero-frames"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

FPS="${FPS:-16}"
WIDTH="${WIDTH:-1280}"
QUALITY="${QUALITY:-72}"

if [[ ! -f "$SRC" ]]; then
  echo "Missing source video: $SRC" >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required but not found in PATH" >&2
  exit 1
fi

if [[ ! -d "$ROOT/node_modules/sharp" ]]; then
  echo "sharp is required. Run: npm install (from project root)" >&2
  exit 1
fi

mkdir -p "$OUT"
rm -f "$OUT"/frame-*.webp

echo "Source:  $SRC"
echo "Output:  $OUT"
echo "Extracting PNG @ ${FPS}fps, width ${WIDTH}…"
ffmpeg -y -i "$SRC" -vf "fps=${FPS},scale=${WIDTH}:-2" "$TMP/frame-%04d.png"

PNG_COUNT="$(find "$TMP" -maxdepth 1 -name 'frame-*.png' | wc -l | tr -d ' ')"
if [[ "$PNG_COUNT" -lt 1 ]]; then
  echo "ffmpeg produced no PNG frames" >&2
  exit 1
fi
echo "PNG frames: $PNG_COUNT"

echo "Converting to WebP (quality ${QUALITY})…"
# Pass paths via env so bash does not mangle the Node script (quoted heredoc).
export EXTRACT_SRC_DIR="$TMP"
export EXTRACT_DEST_DIR="$OUT"
export EXTRACT_QUALITY="$QUALITY"
export EXTRACT_FPS="$FPS"

cd "$ROOT"
node <<'NODE'
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const srcDir = process.env.EXTRACT_SRC_DIR;
const destDir = process.env.EXTRACT_DEST_DIR;
const quality = Number(process.env.EXTRACT_QUALITY) || 72;
const fps = Number(process.env.EXTRACT_FPS) || 16;

const files = fs
  .readdirSync(srcDir)
  .filter((f) => f.endsWith('.png'))
  .sort();

if (!files.length) {
  console.error('No PNG files found in', srcDir);
  process.exit(1);
}

(async () => {
  for (const f of files) {
    await sharp(path.join(srcDir, f))
      .webp({ quality })
      .toFile(path.join(destDir, f.replace(/\.png$/i, '.webp')));
  }

  const firstWebp = path.join(destDir, files[0].replace(/\.png$/i, '.webp'));
  const meta = await sharp(firstWebp).metadata();
  const manifest = {
    frameCount: files.length,
    fps,
    pattern: '/videos/hero-frames/frame-{i}.webp',
    pad: 4,
    width: meta.width,
    height: meta.height,
  };
  fs.writeFileSync(
    path.join(destDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );

  console.log('Wrote', files.length, 'frames', `${meta.width}x${meta.height}`);
  console.log('');
  console.log('Next: set data-frame-count in src/views/pages/home.ejs to:', files.length);
  console.log('  data-frame-count="' + files.length + '"');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
NODE

echo "Done."
