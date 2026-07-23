#!/usr/bin/env bash
# Re-extract WebP frames for homepage scroll scrub from public/videos/hero.mp4
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

mkdir -p "$OUT"
rm -f "$OUT"/frame-*.webp

echo "Extracting PNG @ ${FPS}fps, width ${WIDTH}…"
ffmpeg -y -i "$SRC" -vf "fps=${FPS},scale=${WIDTH}:-2" "$TMP/frame-%04d.png"

echo "Converting to WebP…"
node <<NODE
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const srcDir = ${JSON.stringify('$TMP')};
const destDir = ${JSON.stringify('$OUT')};
const quality = ${QUALITY};
const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.png')).sort();
(async () => {
  for (const f of files) {
    await sharp(path.join(srcDir, f))
      .webp({ quality })
      .toFile(path.join(destDir, f.replace('.png', '.webp')));
  }
  const meta = await sharp(path.join(destDir, files[0].replace('.png', '.webp'))).metadata();
  const manifest = {
    frameCount: files.length,
    fps: ${FPS},
    pattern: '/videos/hero-frames/frame-{i}.webp',
    pad: 4,
    width: meta.width,
    height: meta.height,
  };
  fs.writeFileSync(path.join(destDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('Wrote', files.length, 'frames', meta.width + 'x' + meta.height);
  console.log('Update home.ejs data-frame-count if count changed:', files.length);
})();
NODE
