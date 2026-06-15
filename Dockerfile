# syntax=docker/dockerfile:1

# ---- Dependencies (with build tools for native modules like better-sqlite3) ----
FROM node:20-bookworm-slim AS deps
WORKDIR /app
# better-sqlite3 compiles a native addon; needs python3 + build-essential.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

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
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Runner (standalone output) ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

# Next standalone server + static assets.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Writable data dir for the SQLite DB (mount a volume here in compose).
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
