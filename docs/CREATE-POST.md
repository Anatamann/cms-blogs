# How to create a successful post (Admin panel)

This guide walks through writing and publishing a post in **Ainme Blog** from the admin CMS: login, fields, media, Markdown, preview, and publish.

---

## 1. Sign in

1. Open the CMS by typing the URI **`/mantri/login`** (not linked in the public navbar).
2. Sign in with an author account (credentials live in your private `.env` / CMS — not in public example files).
3. You land on the **Dashboard**.

### Managing authors (super-admin, no Docker shell)

Super-admins are listed in **private `.env`** as `SUPER_ADMIN_USERNAMES` (comma-separated).  
Only those logins see **Authors** in the CMS nav. Restart the app after changing `.env`.

| Task | Where |
|------|--------|
| Create / edit / delete authors | **Authors** (`/mantri/authors`) — super-admin only |
| Set another author’s password | **Authors → Edit** → optional new password |
| Edit your own display name / bio | **Settings** (`/mantri/settings`) |
| Who is super-admin? | Private `.env` → `SUPER_ADMIN_USERNAMES=…` (never commit real `.env`) |

Delete only works if the author has **zero posts**. Super-admin accounts (env list) cannot be deleted from the UI.

---

## 2. Start a new post

1. Click **New** in the admin nav, or **New post** on the dashboard / posts list.
2. You are on **New post** (`/mantri/posts/new`).

Fill these fields carefully:

| Field | Purpose | Tips |
|--------|---------|------|
| **Title** | Main headline | Clear, specific; used for the public page title. |
| **Slug** | URL segment | Lowercase kebab-case, e.g. `eva-rebuild-review`. Leave blank to auto-build from the title. Public URL: `/blog/your-slug` (never a UUID). |
| **Excerpt** | Short teaser | 1–2 sentences for cards, RSS, and meta description. |
| **Body (Markdown)** | Full article | See [Markdown format](#markdown-format-for-posts) below. |
| **Status** | Draft vs public | Use **Draft** while writing; **Published** when ready. |
| **Categories** | Browse filters | Pick one primary topic (e.g. Reviews, News). |
| **Tags** | Extra topics | Optional chips like `mecha`, `classic`. Comma-add new ones if needed. |

### Draft while you work

- **Save** writes the post to the database (even as draft).
- **Preview** renders the form **without saving** (banner: unsaved). Use **Back to editor** to keep editing.
- After the first save, the URL becomes **Edit** with a stable UUID (`/mantri/posts/<uuid>/edit`). Public readers still only see `/blog/<slug>`.

---

## 3. Add media (images, GIFs, video)

Do **not** leave the post via the top **Media** nav if you have unsaved text—you can lose the form. From the post editor:

1. Under **Insert media**, click **Upload / open library**.
2. Your post is stored as a **temporary session draft**.
3. Upload files in the media library.
4. After upload you are sent **back to the post editor** with your text restored (or use **Back to post editor**).
5. Click **Refresh list**, then click a thumbnail to **insert** Markdown / video embed at the cursor.
6. Or **Copy MD** / **Copy URL** from the library and paste into the body.

### What to upload

| Type | Formats | What the system does |
|------|---------|----------------------|
| **Photos** | JPEG, PNG, WebP | Converted to optimized **WebP** + thumbnail. |
| **GIFs** | GIF | **Animation preserved** under `/uploads/gifs/…`. |
| **Short video** | MP4, WebM, MOV | Max **30MB**. Stored under `/uploads/videos/…`. |

Set a short **Alt / description** on upload when the image matters for accessibility.

---

## 4. Write the body in Markdown

Use the **Body** field. The public site renders GitHub-flavored Markdown (safe HTML only). Prefer structure over giant walls of text:

1. Open with a short intro paragraph.
2. Use `##` subheadings for sections.
3. One idea per paragraph; blank line between paragraphs.
4. Embed media where it supports the point (not every other sentence).
5. Close with a clear takeaway or score.

Then use **Preview** to check layout before publishing.

---

## 5. Publish checklist

Before setting **Published** and clicking **Save**:

- [ ] Title and excerpt read well on the blog card list  
- [ ] Slug is clean (`my-post-title`, no spaces)  
- [ ] At least one category selected  
- [ ] Body has headings + short paragraphs  
- [ ] Images have meaningful alt text in Markdown  
- [ ] GIFs/videos play and are not oversized  
- [ ] **Preview** looks right (and draft is **Saved** when you are done)  
- [ ] Status = **Published**, then **Save**  

Open the public URL: `/blog/your-slug`.

---

## 6. After publish

- **View public** from the edit screen (when published).
- Readers can **react**, leave **comments** (moderated under Admin → **Comments**), and views increment once per browser session.
- To unpublish: set status to **Draft** and **Save** (post drops off the public blog).

---

# Markdown format for posts

Use this section as a cheat sheet for body content: paragraphs, subheadings, quotes, and media embeds (images, GIFs, short videos).

## Paragraphs

Separate paragraphs with a **blank line**:

```markdown
This is the first paragraph. It can be a few sentences long.

This is a second paragraph. Readers scan better when blocks stay short.
```

- Soft line breaks inside a paragraph are not forced (GFM does not treat single newlines as `<br>` by default).
- Prefer two short paragraphs over one long one.

## Subheadings

Use `#` through `######`. For article sections, prefer **`##` and `###`** (the page title already acts as the main heading).

```markdown
## First major section

Intro to this section.

### A smaller point

Details go here.

## Second major section
```

| Markdown | Use for |
|----------|---------|
| `## Heading` | Main sections (Review, Spoiler notes, Verdict) |
| `### Heading` | Sub-points under a section |
| `####` … | Rarely; keep the outline shallow |

## Quotes

Block quotes use `>` at the start of the line:

```markdown
> "Your own words, or a short line from the work."
>
> — Character or source (optional second line)
```

Multiple lines of a quote each start with `>`:

```markdown
> Line one of the quote.
> Line two continues the same block.
```

Inline emphasis:

```markdown
Use *italic* or **bold** sparingly. Combine ***bold italic*** only when needed.
`inline code` for tech terms or spell names.
```

## Lists and links

```markdown
- Bullet one
- Bullet two

1. Ordered step one
2. Ordered step two

Read more in [our archive](/archive) or an [external review](https://example.com).
```

## Inserting images

After upload, paths look like `/uploads/images/<uuid>.webp`.

**Standard Markdown image:**

```markdown
![Short description of the image](/uploads/images/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.webp)
```

- **Alt text** (between `[` `]`) should describe the image for screen readers and if the file fails to load.
- Prefer the path from **Insert media** or **Copy MD** so you do not mistype the UUID filename.
- Leave a blank line before and after the image so it sits in its own block.

### Cover / background stills vs body images

On the **public** post page:

| Source | Behavior |
|--------|----------|
| **Share / cover image** | Open Graph preview; also first ambient background still |
| **Background stills** (scroll covers) | Full-viewport stills only. With **2** images, the second appears after ~**50%** of the article scroll; with **N** images, equal bands (`1/N`, `2/N`, …) |
| **Body images / GIFs** | Stay **fully visible** in the article (clear figures for the story) |
| **Video** | In-flow with controls — never the full-page background |

Set covers under the post editor fields (not by placing them only in the body). Body media is for what readers must see clearly while reading.

Readers with **reduced motion** get a static first cover; body images still display normally.

**Example in context:**

```markdown
## Visuals

The color script still holds up on a big screen.

![Neon skyline at night from the opening sequence](/uploads/images/a1b2c3d4-e5f6-4a70-8b9c-0d1e2f3a4b5c.webp)

Lighting sells the mood more than dialogue.
```

Optional HTML (also allowed) if you need a title attribute:

```markdown
<img src="/uploads/images/a1b2c3d4-e5f6-4a70-8b9c-0d1e2f3a4b5c.webp" alt="Neon skyline" title="Episode 1 cold open">
```

## Inserting GIFs

Animated GIFs are stored under `/uploads/gifs/` and keep animation.

```markdown
![Character reaction loop](/uploads/gifs/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.gif)
```

Same rules as images: good alt text, blank lines around the embed, use **Copy MD** / **Insert media** from the library.

```markdown
## Reaction beats

When the twist lands, the show leans into pure motion.

![Crowd reaction GIF from episode 12](/uploads/gifs/f6a7b8c9-d0e1-4f25-8a4b-5c6d7e8f9012.gif)
```

## Inserting short videos

Videos are **not** standard Markdown images. The media library inserts an HTML5 `<video>` tag (max **30MB** upload):

```markdown
<video controls src="/uploads/videos/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.mp4"></video>
```

With a title from alt text (optional):

```markdown
<video controls src="/uploads/videos/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.mp4" title="Trailer clip"></video>
```

**Tips:**

- Prefer **short** clips (trailers, 10–30s moments), not full episodes.
- Stay under the **30MB** limit before upload.
- Put a short caption paragraph above or below the player.
- Leave blank lines around the `<video>` block.

```markdown
## Trailer

A quick look at the tone of the first cour:

<video controls src="/uploads/videos/e1f2a3b4-c5d6-44aa-8f90-123456789abc.mp4"></video>

Audio is as important as the cut—watch with sound if you can.
```

## Full mini example

Copy, adapt, and replace media paths with ones from **your** library:

```markdown
Opening thought in one or two sentences so the reader knows the angle.

## Story

Paragraph on plot without dumping the whole synopsis.

> "A short, memorable line."
>
> — Character

## Craft

### Direction and animation

Another paragraph. Then a still:

![Key frame of the final battle](/uploads/images/YOUR-IMAGE-UUID.webp)

### Sound and score

Mention OST or voice work.

## Motion extras

A reaction GIF:

![Spoiler-free reaction](/uploads/gifs/YOUR-GIF-UUID.gif)

A short video clip:

<video controls src="/uploads/videos/YOUR-VIDEO-UUID.mp4"></video>

## Verdict

Closing paragraph and a clear recommendation.
```

---

## Quick reference

| Goal | Syntax |
|------|--------|
| Paragraph | Text + blank line |
| Subheading | `## Title` / `### Title` |
| Quote | `> quoted text` |
| Bold / italic | `**bold**` / `*italic*` |
| Image / GIF | `![alt](/uploads/…)` |
| Short video | `<video controls src="/uploads/videos/….mp4"></video>` |
| Link | `[label](https://…)` |
| List | `- item` or `1. item` |

---

## Related docs

- Deploy and ops: [DEPLOY.md](./DEPLOY.md)
- Product overview: project `README.md`
- CMS login (local): `/mantri/login`
