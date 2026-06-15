# syntax=docker/dockerfile:1

# ---- Dependencies (with build tools for native modules like better-sqlite3) ----
FROM node:20-bookworm-slim AS deps
WORKDIR /app
# better-sqlite3 compiles a native addon; needs python3 + build-essential.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# --legacy-peer-deps: next-auth's optional nodemailer peer conflicts with the
# app's nodemailer v8 (we don't use next-auth's email provider).
RUN npm ci --legacy-peer-deps

# ---- Builder ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build does not call the model; provide a placeholder so import-time reads pass.
ENV XAI_API_KEY=ci-placeholder-key
ENV AUTH_SECRET=build-time-placeholder-override-at-runtime
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Runner (standalone output) ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# gosu lets the entrypoint drop from root to the unprivileged user after it has
# fixed ownership of the mounted data volume.
RUN apt-get update && apt-get install -y --no-install-recommends gosu \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

# Next standalone server + static assets.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Entrypoint fixes volume ownership at runtime, then drops privileges.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Writable data dir for the SQLite DB + uploads (mount a persistent volume here).
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

# NOTE: we intentionally stay root here so the entrypoint can chown a freshly
# mounted volume; the entrypoint immediately drops to 'nextjs' via gosu.
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
