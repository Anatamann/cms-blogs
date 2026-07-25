# Ainme Blog

Lightweight, Dockerized anime blogging CMS for 1–2 authors. Hybrid 90s retro + modern UX. Stack: Express, EJS, SQLite (Drizzle), Nginx.

## Status

| Phase | Scope | State |
|-------|--------|--------|
| **0** | Scaffold, Docker, routes, slug/UUID helpers | Done |
| **1** | SQLite schema, migrations, seed, repositories | Done |
| **2** | Public SSR: posts, taxonomies, search, RSS | Done |
| **3** | Admin auth + CMS (posts, settings, preview) | Done |
| **4** | Media library (WebP, GIF, video ≤30MB) | Done |
| **5** | Retro-modern theme polish + a11y | Done |
| **6** | Hardening, SEO, deploy/ops | Done |
| 7 | Polish sample content & handoff | Optional |

## Quick start (local)

```bash
cp .env.example .env
npm install
npm run dev          # migrates DB on boot; set AUTO_SEED=true to seed
# or:
npm run db:seed      # sample users/posts/categories
```

Open [http://localhost:3000](http://localhost:3000).

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start with Node `--watch` (runs migrations) |
| `npm start` | Production-style start |
| `npm run db:seed` | Insert sample content (idempotent) |
| `npm run test:smoke` | Slug/UUID helpers |
| `npm run test:phase1` | DB migrate/seed/repository checks |
| `npm run test:phase2` | Markdown + public SSR (set `BASE_URL` for HTTP) |
| `npm run test:phase3` | Admin login/CRUD (set `BASE_URL` for HTTP) |
| `npm run test:phase4` | Media upload/WebP/delete (set `BASE_URL` for HTTP) |
| `npm run test:phase5` | Theme tokens / a11y (set `BASE_URL` for HTTP) |
| `npm run test:phase6` | Security headers / robots (set `BASE_URL` for HTTP) |
| `npm run backup` | Tar SQLite + uploads → `backups/` |
| `npm test` | All of the above |

Default seed logins: **aria** (password from `SEED_ADMIN_PASSWORD`, default `changeme`) and **gokun** / **Gokun** (display name: Gokun Earthling).

## Docker Compose

```bash
cp .env.example .env
docker compose up --build -d
```

- Site via Nginx: [http://localhost:8080](http://localhost:8080)
- Health: `GET /health` (includes database status)
- Volume `ainme_data` holds `ainme.sqlite`

## URL & ID conventions

**Public** — kebab-case slugs only (never UUIDs):

- `/blog/:slug` → e.g. `/blog/neon-genesis-evangelion-review`
- `/category/:slug`, `/tag/:slug`
- Pagination: `/blog?page=2`

**CMS** (Phase 3) — path prefix `/mantri` (not linked in public nav); UUID for stable edits:

- `/mantri/posts/:id/edit`

**Database** — UUID v4 TEXT, lowercase `8-4-4-4-12` for all content PKs/FKs. Unique `slug` columns power public routes.

Helpers: `src/utils/slug.js`, `src/utils/uuid.js`. Services: `src/services/*`.

## Project layout

```
├── public/              # Static assets + uploads/
├── src/
│   ├── config/
│   ├── db/              # schema, migrations, seed, client
│   ├── services/        # posts, categories, tags, settings, users
│   ├── middleware/
│   ├── routes/
│   ├── utils/
│   ├── views/
│   ├── app.js
│   └── server.js
├── data/                # SQLite file (gitignored)
├── docker/
├── docker-compose.yml
└── package.json
```

## Sample seed content

| Slug | Status |
|------|--------|
| `welcome-to-ainme` | published |
| `neon-genesis-evangelion-review` | published |
| `spring-season-spotlight` | published |
| `who-is-the-lcl` | published |
| `work-in-progress-notes` | draft (hidden from public list) |

Categories: `reviews`, `news`, `fan-theories`. Tags: `mecha`, `shonen`, `classic`.

## Public routes (Phase 2)

| Path | Description |
|------|-------------|
| `/` | Home + latest posts |
| `/blog` | Paginated list (`?page=`) |
| `/blog/:slug` | Post detail (Markdown → HTML) |
| `/category/:slug` | Category archive |
| `/tag/:slug` | Tag archive |
| `/search?q=` | Search published posts |
| `/archive` | Year-grouped archive |
| `/about`, `/contact` | Static pages |
| `/rss.xml`, `/sitemap.xml` | Feeds / SEO |

Draft posts are never listed or reachable by public slug.

### Engagement

| Feature | Behavior |
|---------|----------|
| **Views** | Simple integer on each post; +1 once per browser session per post |
| **Reactions** | 👍 🔥 💜 😮 — toggle per visitor (session); counts on the post |
| **Comments** | Name + optional email + body; **pending until approved** in Admin → Comments |

Public routes: `POST /blog/:slug/comments`, `POST /blog/:slug/reactions` (slug URLs only).

## CMS — `/mantri` (Phase 3)

Not shown in the public navbar. Open via URL, e.g. `/mantri/login`.

| Path | Description |
|------|-------------|
| `/mantri/login` | Session login (bcrypt) |
| `/mantri` | Dashboard stats |
| `/mantri/posts` | List / filter draft·published |
| `/mantri/posts/new` | Create (Markdown) |
| `/mantri/posts/:id/edit` | Edit by **UUID** |
| `/mantri/posts/:id/preview` | Auth-only preview (drafts OK) |
| `/mantri/settings` | Site title, description, author bios |
| `/mantri/media` | Media library (upload / copy / delete) |
| `/mantri/logout` | POST logout |

Public URLs stay slug-based (`/blog/my-post`). CMS edit URLs use stable UUIDs.

## Media (Phase 4)

| Kind | Behavior |
|------|----------|
| JPEG/PNG/WebP | Converted to WebP (max edge 1920) + 400px thumb |
| GIF | Animation preserved under `/uploads/gifs/{uuid}.gif` |
| Video | Max **30MB**; `/uploads/videos/`; optional `COMPRESS_VIDEO=true` + ffmpeg |

Files are named with **UUID**s; post editor has an **Insert media** panel for Markdown embeds. Upload rate limit: 40 / 15 minutes.

## Theme (Phase 5)

- Dark CRT default: neon **magenta** `#FF00FF`, **cyan** `#00FFFF`, **green** accents
- Grid + scanlines + soft vignette (CSS-only; no heavy assets)
- Logo / title glitch hover (disabled under `prefers-reduced-motion`)
- `:focus-visible` rings, skip link, `aria-current` on active nav
- Markdown images get `loading="lazy"`
- Admin uses a calmer version of the same tokens

## Hardening & ops (Phase 6)

| Control | Detail |
|---------|--------|
| Helmet CSP | `default-src 'self'`; frames denied; HSTS in production |
| Sessions | `httpOnly` + `sameSite=lax`; `secure` in prod; weak `SESSION_SECRET` refused in prod |
| CSRF | Tokens on admin POST/DELETE/upload |
| Rate limits | Login, contact, admin writes, media upload |
| SEO | `/robots.txt` (disallow `/mantri`), OG/Twitter meta, `/security.txt` |
| Health | `/health`, `/health/live`, `/health/ready` |
| Backup | `npm run backup` / `scripts/restore.sh` |

Deploy guide: **[docs/DEPLOY.md](docs/DEPLOY.md)**  
Author guide (how to write a post + Markdown): **[docs/CREATE-POST.md](docs/CREATE-POST.md)**  
Homepage scroll animation assets: **[docs/HOME-SCROLL-ANIMATION.md](docs/HOME-SCROLL-ANIMATION.md)**  
Categories vs tags: **[docs/TAXONOMY-TAGS.md](docs/TAXONOMY-TAGS.md)**

### Security checklist

- [ ] Strong `SESSION_SECRET` (32+ random chars)
- [ ] Changed admin passwords (`SEED_ADMIN_PASSWORD` / re-seed or DB update)
- [ ] `AUTO_SEED=false` after initial content
- [ ] TLS terminator in front of Nginx; `APP_URL` is `https://…`
- [ ] Scheduled backups of `data/` + uploads
- [ ] `NODE_ENV=production`

Product brief: `website-instructions-draft.md`.
