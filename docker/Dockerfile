# syntax=docker/dockerfile:1
# Ainme — production Node image (multi-stage)
# Build: docker compose build
# Runtime user: non-root `ainme`

# ---- deps (native modules for Alpine) ----
FROM node:20-alpine AS deps
WORKDIR /app

# better-sqlite3 needs a compile toolchain on Alpine
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- runtime ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data \
    UPLOADS_DIR=/app/public/uploads \
    DATABASE_FILE=ainme.sqlite

# ffmpeg: optional video work · unzip: ODT import (test-blogs) · wget: HEALTHCHECK
RUN apk add --no-cache ffmpeg unzip \
  && addgroup -S ainme \
  && adduser -S ainme -G ainme

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
# Application + all Drizzle migrations (src/db/migrations/0000…0005)
COPY src ./src
# Static site + homepage frames + public/test-blogs ODTs
COPY public ./public
# Ops + ODT import helper
COPY scripts/backup.sh scripts/restore.sh scripts/import-test-blogs.js ./scripts/

# Verify migrations + seed catalog shipped in the image (fail build if missing)
RUN test -f src/db/migrations/0000_initial.sql \
  && test -f src/db/migrations/0005_post_work_slug.sql \
  && test -f src/db/seed-data/catalog.json \
  && test -f src/db/seed-data/dr-stone-season-2-stone-wars.md \
  && test -f src/db/seed-data/mushoku-tensei-season-1-recap.md \
  && test -f src/db/seed-data/oshi-no-ko-idol-billboard.md \
  && ls src/db/migrations/*.sql \
  && ls src/db/seed-data/*.md | wc -l

# Persist DB + uploads via volumes; seed dirs exist even before mount
RUN mkdir -p \
      /app/data \
      /app/public/uploads/images \
      /app/public/uploads/gifs \
      /app/public/uploads/videos \
      /app/backups \
  && chown -R ainme:ainme /app \
  && chmod +x /app/scripts/backup.sh /app/scripts/restore.sh

USER ainme
EXPOSE 3000

# Boot: getDb() runs all migrations → AUTO_SEED ensures catalog posts/tags/work titles
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health/live || exit 1

CMD ["node", "src/server.js"]
