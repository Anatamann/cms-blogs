# Homepage scroll animation — how to set the media correctly

This site’s homepage background is a **scroll-scrubbed WebP frame sequence**, not a playing MP4.  
You manage a **master video**, export **numbered frames**, set a **poster**, and wire a **frame count** in the home template.

---

## What the homepage uses at runtime

| Asset | Path | Required? |
|--------|------|-----------|
| Frame stills | `public/videos/hero-frames/frame-0001.webp` … `frame-NNNN.webp` | **Yes** |
| Manifest (reference) | `public/videos/hero-frames/manifest.json` | Recommended (human/CI) |
| Poster | `public/videos/hero-poster.webp` | **Yes** (fallback / reduced motion) |
| Master video | `public/videos/hero.mp4` | Optional at runtime; needed to re-export frames |

**Public URLs** (served by Express from `public/`):

- `/videos/hero-frames/frame-0001.webp`
- `/videos/hero-poster.webp`
- `/videos/hero.mp4` (not used for scrub if frames are configured)

Config lives in **`src/views/pages/home.ejs`** on the root wrapper:

```html
<div
  class="home-scroll"
  data-scroll-hero
  data-frame-count="55"
  data-frame-pad="4"
  data-frame-pattern="/videos/hero-frames/frame-{i}.webp"
  data-frame-poster="/videos/hero-poster.webp"
>
```

| Attribute | Meaning |
|-----------|---------|
| `data-frame-count` | Number of frame files (must match files on disk) |
| `data-frame-pad` | Zero-pad width in filenames (`4` → `0001`) |
| `data-frame-pattern` | URL pattern; `{i}` is replaced by the padded index |
| `data-frame-poster` | Poster image URL while frames load / reduced motion |

JavaScript: `public/js/home-scroll.js` (loaded only on the home page).

---

## Folder structure (canonical)

```text
public/
  videos/
    hero.mp4                 # master clip (source for export)
    hero-poster.webp         # still fallback
    hero-frames/
      manifest.json          # written by extract script
      frame-0001.webp
      frame-0002.webp
      …
      frame-0055.webp        # example: 55 frames
```

**Do not** put the hero sequence under `public/uploads/` (that is for CMS media).  
**Do not** put frames under `src/` (they are not static-served from there).

---

## Step-by-step: install or replace the animation

### 1. Prepare a master video

- Prefer **short** clips (~3–8 seconds).
- H.264 MP4 is fine.
- Keep file size reasonable (a few MB is ideal).

Place or replace:

```text
public/videos/hero.mp4
```

### 2. Export WebP frames

From the project root:

```bash
./scripts/extract-hero-frames.sh
```

Or from another file:

```bash
./scripts/extract-hero-frames.sh /path/to/your-clip.mp4
```

Optional environment knobs:

```bash
FPS=16 WIDTH=1280 QUALITY=72 ./scripts/extract-hero-frames.sh
```

| Variable | Default | Effect |
|----------|---------|--------|
| `FPS` | 16 | Frames per second of source → more frames = smoother, heavier |
| `WIDTH` | 1280 | Output width (height auto) |
| `QUALITY` | 72 | WebP quality |

The script:

1. Clears old `public/videos/hero-frames/frame-*.webp`
2. Extracts PNGs with **ffmpeg**
3. Converts to **WebP** with **sharp** (Node)
4. Writes `manifest.json`

**Requirements:** `ffmpeg` and `npm install` (sharp) available.

### 3. Set the poster

Replace:

```text
public/videos/hero-poster.webp
```

Tips:

- Use a clear still (often first or mid frame).
- Same aspect as the frames helps avoid layout jump.

Example one-liner ideas:

```bash
# grab first frame as PNG, then convert with any tool / sharp to hero-poster.webp
ffmpeg -y -i public/videos/hero.mp4 -vf "scale=1280:-2" -vframes 1 /tmp/hero-poster.png
```

### 4. Set `data-frame-count` (required)

Open **`src/views/pages/home.ejs`** and set:

```html
data-frame-count="NN"
```

**`NN` = number of `frame-*.webp` files**, not video length in seconds.

Check:

```bash
ls public/videos/hero-frames/frame-*.webp | wc -l
# or
cat public/videos/hero-frames/manifest.json
# use the "frameCount" field
```

| Situation | Value |
|-----------|--------|
| Current default pack | `55` |
| After re-export with 80 files | `80` |

Leave these unless you change naming:

```html
data-frame-pad="4"
data-frame-pattern="/videos/hero-frames/frame-{i}.webp"
data-frame-poster="/videos/hero-poster.webp"
```

### 5. Verify in the browser

```bash
npm run dev
```

1. Open `http://localhost:3000`
2. Hard-refresh (`Ctrl+Shift+R` / `Cmd+Shift+R`) so old frames are not cached
3. Scroll the homepage — background should scrub through frames
4. Optional checks:

```text
http://localhost:3000/videos/hero-frames/frame-0001.webp
http://localhost:3000/videos/hero-frames/manifest.json
http://localhost:3000/videos/hero-poster.webp
```

---

## Naming rules (must match)

Files must be:

```text
frame-0001.webp
frame-0002.webp
…
```

- **1-based** index (`0001`, not `0000`)
- **4-digit** pad if `data-frame-pad="4"`
- Extension **`.webp`**
- Pattern URL uses `{i}` only for that padded number

Wrong examples:

```text
frame-1.webp          # missing pad
frame-0000.webp       # 0-based (script expects 0001…)
hero-001.webp         # wrong prefix unless you change data-frame-pattern
```

---

## Checklist (replace animation)

- [ ] New master at `public/videos/hero.mp4` (or path passed to extract script)
- [ ] Ran `./scripts/extract-hero-frames.sh`
- [ ] `public/videos/hero-frames/frame-*.webp` present
- [ ] `data-frame-count` in `src/views/pages/home.ejs` equals file count
- [ ] `hero-poster.webp` updated
- [ ] Hard-refreshed the homepage

---

## Tuning (no new video)

| Goal | Action |
|------|--------|
| Smoother scrub | Re-export with higher `FPS` (e.g. 20–24); update `data-frame-count` |
| Smaller download | Lower `FPS` / `QUALITY` / `WIDTH` |
| Different folder | Move frames, change `data-frame-pattern` and keep pad/count correct |
| Reduced motion | Users with `prefers-reduced-motion` see poster only (no scrub) |

Scroll feel (damping, parallax) is in **`public/js/home-scroll.js`** (`PROGRESS_DAMP`, `FRAME_DAMP`) — separate from asset management.

---

## What this is not

| System | Use for |
|--------|---------|
| **This pack** (`public/videos/…`) | Fixed homepage cinematic background |
| **Admin → Media** (`public/uploads/…`) | Images/GIFs/videos inside **blog posts** |

Replacing a post embed does not change the homepage hero. Replacing the homepage hero does not go through the media library unless you later build that feature.

---

## Related

- Author post guide: [CREATE-POST.md](./CREATE-POST.md)
- Deploy / ops: [DEPLOY.md](./DEPLOY.md)
- Extract script: `scripts/extract-hero-frames.sh`
- Home template: `src/views/pages/home.ejs`
- Scrub logic: `public/js/home-scroll.js`
