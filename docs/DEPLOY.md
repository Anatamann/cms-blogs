# Deploy & operations — Ainme Blog

## Quick deploy (Docker Compose)

```bash
cp .env.example .env
# Required in production:
#   NODE_ENV=production
#   SESSION_SECRET=<long random string, 32+ chars>
#   APP_URL=https://your.domain
#   AUTO_SEED=false   # after first seed, or seed once then disable
#   SEED_ADMIN_PASSWORD=<strong password>  # only if seeding

docker compose up --build -d
```

- HTTP via Nginx: `http://localhost:${NGINX_HTTP_PORT:-8080}`
- Health: `GET /health`, `GET /health/ready`, `GET /health/live`

Put TLS in front (Caddy, Traefik, Cloudflare, or host nginx) and set `APP_URL` to the public `https://` origin. App cookies use `secure` when `NODE_ENV=production`.

## Environment checklist

| Variable | Production notes |
|----------|------------------|
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | **Required** ≥24 random chars; app refuses weak defaults |
| `APP_URL` | Public origin (feeds, canonical, OG) |
| `AUTO_SEED` | `false` after initial setup |
| `SEED_ADMIN_PASSWORD` | Change from `changeme` |
| `DATA_DIR` / `UPLOADS_DIR` | Persist via Docker volumes |
| Rate limits | `RATE_LIMIT_LOGIN`, `RATE_LIMIT_CONTACT`, `RATE_LIMIT_WRITE` |

## Backups

```bash
chmod +x scripts/backup.sh scripts/restore.sh
./scripts/backup.sh
# → backups/ainme-backup-<timestamp>.tar.gz

./scripts/restore.sh backups/ainme-backup-….tar.gz
```

Backup includes:

1. SQLite file under `data/` (uses `sqlite3 .backup` when available)
2. `public/uploads/**`

Schedule daily cron on the host, e.g.:

```cron
15 3 * * * cd /path/to/ainmeblog && ./scripts/backup.sh >> /var/log/ainme-backup.log 2>&1
```

Docker volumes: back up named volumes `ainme_data` and `ainme_uploads` (or run the script inside a sidecar with volumes mounted).

## Security posture (Phase 6)

- Helmet CSP, HSTS (prod), `X-Content-Type-Options`, frame denial
- Session cookies: `httpOnly`, `sameSite=lax`, `secure` in prod
- CSRF tokens on admin mutations
- Rate limits: login, contact, admin writes, media upload
- Markdown sanitized; uploads MIME/size gated
- `/admin` disallowed in `robots.txt`
- Nginx: `server_tokens off`, extra security headers, body size cap

See also security checklist in README and `scripts/phase6-check.js`.

## Graceful shutdown

The app handles `SIGTERM`/`SIGINT`: stops accepting connections, closes SQLite, exits. Compose/K8s should send SIGTERM and allow ≥10s termination grace.

## Updating

```bash
git pull
docker compose up --build -d
# Migrations run on boot via Drizzle
```
