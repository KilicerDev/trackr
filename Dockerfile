# syntax=docker/dockerfile:1.7

# ---------- Stage 1: install all dependencies (dev + prod) for the build ----------
FROM oven/bun:1 AS deps
WORKDIR /app
# python3 + build tools are required for native modules pulled in transitively
# by drizzle-kit (notably better-sqlite3, whose prebuilt binaries don't yet
# support Bun on Linux — it falls back to node-gyp). The app never loads them
# at runtime; they're only here so `bun install` completes.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---------- Stage 2: build the SvelteKit app ----------
FROM oven/bun:1 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Ensure the migrations directory exists even if empty so the runtime COPY succeeds.
RUN mkdir -p drizzle
RUN bun run build

# ---------- Stage 3: install only production dependencies ----------
FROM oven/bun:1 AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ---------- Stage 4: runtime ----------
FROM oven/bun:1-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# Slim runtime: only production node_modules, the built server, migrations,
# the migrate/seed scripts, and package.json (needed for module resolution).
COPY --from=prod-deps /app/node_modules         ./node_modules
COPY --from=build     /app/build                ./build
COPY --from=build     /app/drizzle              ./drizzle
COPY --from=build     /app/scripts              ./scripts
# Imported by the standalone scripts (schema, resolve-url). The SvelteKit
# bundle in ./build does not depend on src/ at runtime.
COPY --from=build     /app/src/lib/server/db    ./src/lib/server/db
COPY --from=build     /app/package.json         ./

# Drop privileges. The `bun` user/group is provided by the base image.
USER bun

EXPOSE 3000

# Liveness probe — passes on any non-5xx response from the SvelteKit server.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD bun -e "fetch('http://127.0.0.1:'+process.env.PORT).then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

# Apply pending migrations, seed the root user if missing, then start the
# server. Any step's failure aborts boot. The seed step is idempotent — it
# no-ops once a superadmin user exists, so subsequent restarts skip the work.
# On a fresh database, ROOT_PASSWORD must be set or seeding (and boot) fails.
CMD ["sh", "-c", "bun scripts/migrate.ts && bun scripts/seed-root.ts && bun build/index.js"]
