# ABOUTME: Immagine container per Cloud Run: build Next.js standalone + Litestream
# ABOUTME: Litestream replica il DB SQLite su GCS e lo ripristina all'avvio

FROM node:22-slim AS deps
WORKDIR /app
# build-essential/python3 servono solo se manca il prebuild di better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# ca-certificates: serve a Litestream per il TLS verso storage.googleapis.com
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# Solo linux/amd64 (build su Cloud Build); checksum verificato prima dell'estrazione
ADD https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.tar.gz /tmp/litestream.tar.gz
RUN echo "eb75a3de5cab03875cdae9f5f539e6aedadd66607003d9b1e7a9077948818ba0  /tmp/litestream.tar.gz" | sha256sum -c - \
    && tar -C /usr/local/bin -xzf /tmp/litestream.tar.gz && rm /tmp/litestream.tar.gz \
    && mkdir -p /data && chown node:node /data
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY deploy/litestream.yml /etc/litestream.yml
COPY deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
USER node
ENV DATABASE_PATH=/data/geremeas.db \
    PORT=8080 \
    HOSTNAME=0.0.0.0
EXPOSE 8080
CMD ["docker-entrypoint.sh"]
