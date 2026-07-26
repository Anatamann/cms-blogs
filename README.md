# Ainme

**Ainme** means *Anime in Me* — a lightweight anime blog and CMS for a small writing crew (one or two authors) who never really left the neon.

Reviews, recaps, news, and deep cuts with a 90s / millennial retro-modern look: dark CRT vibes, clean slug URLs, and no heavy WordPress stack.

![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![Stack](https://img.shields.io/badge/stack-Express%20%7C%20SQLite%20%7C%20Docker-blue)
![License](https://img.shields.io/badge/license-see%20repo-lightgrey)

---

## Highlights

- **Public blog** — home with scroll-scrub hero, post lists, search, archive, categories, genre tags, series (`/work/…`)
- **Markdown posts** — clean public URLs (`/blog/my-post`); stable UUIDs only in the CMS
- **CMS** — unlisted at `/mantri` (login, posts, media, tags, comments, settings)
- **Authors** — super-admins (from private env) can create and manage writers
- **Media** — images → WebP, GIFs, video up to 30MB
- **Engagement** — session-based views, reactions, moderated comments
- **Analytics** — first-party dashboard (views, reactions, devices, regions) — no third-party trackers
- **Ops** — Docker Compose + Nginx, health checks, backups, Helmet / CSRF / rate limits

---

## Stack

| Layer | Choice |
|--------|--------|
| Runtime | Node.js 20+ |
| App | Express, EJS |
| Database | SQLite + Drizzle ORM |
| Media | Sharp, optional ffmpeg |
| Deploy | Docker Compose, Nginx reverse proxy |

---

## Quick start (local)

**Requirements:** Node.js 20+, npm

```bash
git clone <your-repo-url> ainmeblog
cd ainmeblog
cp .env.example .env
```

Edit `.env` (private — never commit it):

- `SESSION_SECRET` — long random string (`openssl rand -hex 32`)
- `SEED_ADMIN_PASSWORD` — password for the first seeded author
- `SUPER_ADMIN_USERNAMES` — login(s) allowed to manage authors (comma-separated)

```bash
npm install
npm run dev
```

Open **http://localhost:3000**

| Command | What it does |
|---------|----------------|
| `npm run dev` | Dev server with reload; runs migrations on boot |
| `npm start` | Production-style start |
| `npm run db:seed` | Ensure sample catalog (idempotent) |
| `npm run backup` | Backup SQLite + uploads |

With `AUTO_SEED=true`, a sample catalog is ensured on first boot (posts live under `src/db/seed-data/`; your live DB is separate and gitignored).

---

## Docker

```bash
cp .env.docker.example .env
# Set SESSION_SECRET, APP_URL, SEED_ADMIN_PASSWORD, SUPER_ADMIN_USERNAMES
openssl rand -hex 32   # → SESSION_SECRET

docker compose up --build -d
```

| | |
|--|--|
| Site | http://localhost:8080 |
| CMS | http://localhost:8080/mantri |
| Health | `/health`, `/health/live`, `/health/ready` |

Data persists in Docker volumes (`ainme_data`, `ainme_uploads`). Full ops notes: **[docs/DEPLOY.md](docs/DEPLOY.md)**.

```bash
docker compose logs -f app
docker compose down          # volumes kept
docker compose up --build -d # after pull
```

---

## CMS

The admin UI is **not** linked in the public nav. Open:

```text
/mantri/login
```

- Write and publish Markdown posts  
- Upload media, manage tags, moderate comments  
- **Analytics** — views, reactions, devices, regions  
- **Authors** — super-admins only (`SUPER_ADMIN_USERNAMES` in `.env`)  
- **Settings** — site title, description, your profile  

Writing guide: **[docs/CREATE-POST.md](docs/CREATE-POST.md)**

---

## Features at a glance

### Readers

| | |
|--|--|
| Home | Scroll-driven frame sequence + latest posts |
| Blog | Paginated catalog |
| Filters | Categories, tags, work/series pages |
| Search & archive | Full-text style search; year archive |
| RSS / sitemap | `/rss.xml`, `/sitemap.xml` |
| Engagement | Reactions, moderated comments |

### Operators

| | |
|--|--|
| Security | Helmet CSP, sessions, CSRF, rate limits |
| SEO | Open Graph / Twitter meta, robots (CMS disallowed) |
| Privacy | No Google Analytics — optional first-party stats only |
| Secrets | Only in private `.env` — see **[SECURITY.md](SECURITY.md)** |

---

## Project layout

```text
├── public/           # CSS, JS, static assets, uploads/
├── src/
│   ├── db/           # Schema, migrations, seed + seed-data/
│   ├── services/     # Posts, tags, media, analytics, …
│   ├── routes/       # Public + CMS + health
│   ├── views/        # EJS templates
│   ├── app.js
│   └── server.js
├── docker/           # Dockerfile, nginx.conf
├── docker-compose.yml
├── docs/             # Deploy, authoring, taxonomy, animation
└── package.json
```

---

## Documentation

| Doc | Topic |
|-----|--------|
| [docs/DEPLOY.md](docs/DEPLOY.md) | Production Docker, TLS, backups |
| [docs/CREATE-POST.md](docs/CREATE-POST.md) | Writing posts in the CMS |
| [docs/TAXONOMY-TAGS.md](docs/TAXONOMY-TAGS.md) | Categories vs genre tags |
| [docs/HOME-SCROLL-ANIMATION.md](docs/HOME-SCROLL-ANIMATION.md) | Homepage scroll / frame assets |
| [SECURITY.md](SECURITY.md) | Secrets and public-clone hygiene |

---

## Configuration

Copy **`.env.example`** (local) or **`.env.docker.example`** (Compose). Important keys:

| Variable | Purpose |
|----------|---------|
| `SESSION_SECRET` | Cookie signing (required, strong in production) |
| `APP_URL` | Public site origin (use `https://…` behind TLS) |
| `SITE_NAME` | Brand name (default Ainme) |
| `SUPER_ADMIN_USERNAMES` | CMS logins that manage authors |
| `SEED_ADMIN_PASSWORD` | First seed author password (private only) |
| `AUTO_SEED` | Ensure sample catalog on boot |

Never put real passwords in committed example files.

---

## Contributing

Issues and pull requests are welcome if this repo is open for collaboration. Please:

1. Don’t commit `.env` or database files  
2. Keep example env files free of secrets  
3. Prefer small, focused changes  

---

## License

Proprietary / all rights reserved unless a `LICENSE` file is added to this repository. Contact the maintainer before commercial use or redistribution.

---

*Stay neon. The grid’s still on.*
