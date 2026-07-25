# Deploy & operations — Ainme

Production deploy for **Ainme** (*Anime in Me*): Express app + SQLite + Nginx reverse proxy, all via Docker Compose.

## Architecture

```
Browser → Nginx (:8080 host → :80) → app container (:3000)
                │
                ├── /css, /js, /videos, /uploads  (proxied, cached headers)
                └── /*  (SSR + CMS at /mantri)

Volumes:
  ainme_data     → /app/data          (SQLite)
  ainme_uploads  → /app/public/uploads
```

| File | Role |
|------|------|
| `docker/Dockerfile` | Multi-stage Node 20 Alpine image (non-root) |
| `docker/nginx.conf` | Reverse proxy, body size, security headers |
| `docker-compose.yml` | `app` + `nginx` services, named volumes |
| `.env.docker.example` | Production-oriented env template |
| `.env.example` | Local dev defaults |

## Prerequisites

- Docker Engine 24+ and Docker Compose v2 (`docker compose`)
- Open ports: host `NGINX_HTTP_PORT` (default **8080**)
- For real domains: a TLS terminator in front (Caddy, Traefik, Cloudflare, host Nginx)

## Quick deploy

```bash
# 1. Clone / copy the project onto the server
cd ainmeblog

# 2. Production env
cp .env.docker.example .env

# 3. Strong session secret (required — app will refuse weak values in production)
#    Paste the output into SESSION_SECRET in .env
openssl rand -hex 32

# 4. Edit .env
#    SITE_NAME=Ainme
#    APP_URL=https://your.domain          # public origin browsers use
#    SESSION_SECRET=<from step 3>
#    AUTO_SEED=true                       # first boot only
#    SEED_ADMIN_PASSWORD=<strong password>
#    NGINX_HTTP_PORT=8080

# 5. Build and start
docker compose up --build -d

# 6. Check
docker compose ps
curl -sS http://localhost:8080/health
curl -sS http://localhost:8080/health/ready
```

| URL | Purpose |
|-----|---------|
| `http://localhost:8080/` | Public site |
| `http://localhost:8080/mantri` | CMS (not linked in public nav) |
| `http://localhost:8080/health` | Liveness + DB status |

### First boot seed

With `AUTO_SEED=true`, the app inserts sample authors/posts if the DB is empty.

| Login | Password |
|-------|----------|
| `aria` | `SEED_ADMIN_PASSWORD` (default `changeme` — **change it**) |
| `gokun` | `Gokun` (seed user **Gokun Earthling**) |

After you have real content and passwords set:

1. Set `AUTO_SEED=false` in `.env`
2. `docker compose up -d` (recreates app with new env)

Seed is **idempotent** (skips if user `aria` already exists), but leave `AUTO_SEED=false` in production.

## Environment reference

| Variable | Required | Notes |
|----------|----------|--------|
| `NODE_ENV` | yes | `production` for compose |
| `SESSION_SECRET` | **yes** | ≥24 random chars; weak defaults are **rejected** at boot |
| `APP_URL` | yes | Public origin (`https://ainme.example`) for RSS/OG/canonical |
| `SITE_NAME` | no | Default `Ainme` |
| `AUTO_SEED` | no | Default `false` in compose; use `true` once on empty DB |
| `SEED_ADMIN_PASSWORD` | if seeding | Password for seed user `aria` |
| `NGINX_HTTP_PORT` | no | Host port mapped to Nginx (default `8080`) |
| `DATA_DIR` / `UPLOADS_DIR` | set in compose | `/app/data`, `/app/public/uploads` |
| `COMPRESS_VIDEO` | no | `true` uses ffmpeg in the image |
| `RATE_LIMIT_*` | no | Login / contact / admin write limits |

Compose **requires** `SESSION_SECRET` to be set (fails fast with a clear error if missing).

## Common operations

### Logs

```bash
docker compose logs -f app
docker compose logs -f nginx
```

### Rebuild after code pull

```bash
git pull
docker compose up --build -d
# SQLite migrations run automatically on app boot
```

### Shell into the app container

```bash
docker compose exec app sh
```

### One-off seed (if you started with AUTO_SEED=false)

```bash
docker compose exec -e AUTO_SEED=true -e SEED_ADMIN_PASSWORD='your-password' app node src/db/seed.js
```

### Catalog posts, tags, work titles (built into the image)

The image includes:

| Path | Role |
|------|------|
| `src/db/migrations/*.sql` | All schema migrations (0000–0005), applied on every boot via `getDb()` |
| `src/db/seed-data/catalog.json` | Post metadata: slugs, **work titles**, **tags**, categories |
| `src/db/seed-data/*.md` | Full post bodies (feature + test blogs) |
| `public/test-blogs/*.odt` | Original ODT sources (optional re-import) |

With **`AUTO_SEED=true`** (Compose default), boot runs an **idempotent** seed that:

1. Applies migrations  
2. Ensures users (`aria`, `gokun`)  
3. Ensures categories + genre tags  
4. Ensures catalog posts with **work_title / work_slug** and **tag links** (so cards show work names + #tags)

```bash
# Rebuild image (migrations + seed-data baked in) and start with AUTO_SEED=true
DOCKER='sudo docker' docker compose up --build -d

# If the volume was already seeded with the OLD thin seed, force-ensure catalog:
DOCKER='sudo docker' docker compose exec app node src/db/seed.js
```

Cards should show e.g. work **Dr. Stone** / **Mushoku Tensei…** and tags **#Action**, **#Isekai**, etc.

**Optional — copy host DB** (if you prefer your live local SQLite as-is):

```bash
DOCKER='sudo docker' npm run docker:load-db
```

**Optional — ODT re-import** inside the container:

```bash
DOCKER='sudo docker' npm run docker:import-test-blogs
```

### Backup (host-side volumes)

Named volumes hold production data. Options:

**A. Run backup script inside the app container** (writes under `/app/backups` unless you mount a host path):

```bash
docker compose exec app sh -c 'DATA_DIR=/app/data UPLOADS_DIR=/app/public/uploads BACKUP_DIR=/app/backups ./scripts/backup.sh'
```

To keep backups on the host, add a bind mount in an override file, or use option B.

**B. Docker volume backup**

```bash
# Database volume
docker run --rm \
  -v ainme_data:/data:ro \
  -v "$(pwd)/backups:/backup" \
  alpine tar czf /backup/ainme-data-$(date -u +%Y%m%dT%H%M%SZ).tar.gz -C /data .

# Uploads volume
docker run --rm \
  -v ainme_uploads:/data:ro \
  -v "$(pwd)/backups:/backup" \
  alpine tar czf /backup/ainme-uploads-$(date -u +%Y%m%dT%H%M%SZ).tar.gz -C /data .
```

**C. Local (non-Docker) project tree**

```bash
chmod +x scripts/backup.sh scripts/restore.sh
./scripts/backup.sh
# → backups/ainme-backup-<timestamp>.tar.gz
./scripts/restore.sh backups/ainme-backup-….tar.gz
```

Schedule daily cron on the host, e.g.:

```cron
15 3 * * * cd /path/to/ainmeblog && ./scripts/backup.sh >> /var/log/ainme-backup.log 2>&1
```

### Restore (volume)

```bash
docker compose down
# extract your tar into a temporary dir, then:
docker run --rm -v ainme_data:/data -v "$(pwd)/restore-data:/restore:ro" alpine \
  sh -c 'rm -rf /data/* && cp -a /restore/. /data/'
docker compose up -d
```

## TLS / reverse proxy

Compose exposes **HTTP only** on the host. Terminate TLS in front:

1. Point DNS at the host.
2. Put Caddy / Traefik / Cloudflare / host Nginx in front of `localhost:8080` (or change `NGINX_HTTP_PORT`).
3. Set `APP_URL=https://your.domain`.
4. Ensure the edge proxy forwards `X-Forwarded-Proto: https` so secure cookies work (`NODE_ENV=production` sets `secure` session cookies).

Example Caddy snippet:

```caddy
ainme.example {
  reverse_proxy 127.0.0.1:8080
}
```

## Security checklist

- [ ] `SESSION_SECRET` from `openssl rand -hex 32` (not a placeholder)
- [ ] Admin passwords changed (`aria` / `gokun` or your own users)
- [ ] `AUTO_SEED=false` after initial content
- [ ] `APP_URL` is the public `https://` origin
- [ ] TLS in front of Nginx
- [ ] Scheduled backups of `ainme_data` + `ainme_uploads`
- [ ] CMS path `/mantri` is unlisted (still protect with strong passwords)
- [ ] Host firewall: only 80/443 (and SSH) public if using an outer proxy

App posture (also enforced in code):

- Helmet CSP, HSTS in production, frame denial
- Session cookies: `httpOnly`, `sameSite=lax`, `secure` in prod
- CSRF on admin mutations
- Rate limits: login, contact, admin writes, media upload
- Markdown sanitized; upload MIME/size gates
- `/mantri` disallowed in `robots.txt`

## Graceful shutdown

The app handles `SIGTERM` / `SIGINT`: stops accepting connections, closes SQLite, exits within ~10s. Compose `stop_grace_period` is 15s.

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| App exits immediately | `docker compose logs app` — usually weak/missing `SESSION_SECRET` |
| `compose` error about `SESSION_SECRET` | Create `.env` from `.env.docker.example` and set a long secret |
| 502 from Nginx | App not healthy: `docker compose ps`, `logs app` |
| Empty site / no posts | `AUTO_SEED` was false on empty DB — run seed once |
| Uploads lost after rebuild | Ensure volumes `ainme_uploads` still present (`docker volume ls`) |
| Wrong links in RSS/OG | Fix `APP_URL` to public origin and recreate: `docker compose up -d` |
| Permission errors on volumes | Image runs as user `ainme`; named volumes are created with correct ownership on first start |

### Health endpoints

| Path | Meaning |
|------|---------|
| `/health` | Overall status (includes DB) |
| `/health/live` | Process up (used by Docker HEALTHCHECK) |
| `/health/ready` | Ready to serve (DB open) |

## Updating this guide

Product overview: [README.md](../README.md)  
Authoring posts: [CREATE-POST.md](./CREATE-POST.md)  
Homepage scroll assets: [HOME-SCROLL-ANIMATION.md](./HOME-SCROLL-ANIMATION.md)
