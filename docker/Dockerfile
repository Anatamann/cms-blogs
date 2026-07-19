# syntax=docker/dockerfile:1

# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /app
# better-sqlite3 native build on Alpine
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# ---- runtime ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

# ffmpeg for video poster frames / optional compression; vips often bundled with sharp
RUN apk add --no-cache ffmpeg \
  && addgroup -S ainme && adduser -S ainme -G ainme

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY public ./public

RUN mkdir -p /app/data \
    /app/public/uploads/images \
    /app/public/uploads/gifs \
    /app/public/uploads/videos \
  && chown -R ainme:ainme /app

USER ainme
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "src/server.js"]
