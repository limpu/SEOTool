# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────
# Phase 34 (Production Readiness) — multi-stage Dockerfile for the Next.js
# app itself. Phases 0-2 already containerize Postgres via a plain
# `docker run` (see read.md "Database Credentials") — this Dockerfile is
# the separate, previously-missing piece: containerizing the application
# process that talks to that database.
#
# IMPORTANT — Lighthouse / PageSpeed (Phase 20) requires real Chrome:
# `src/lib/pagespeed/lighthouse-runner.ts` shells out to a real, installed
# Chrome/Chromium binary via `chrome-launcher` (it does not bundle one).
# This image installs `chromium` in the runtime stage and points
# `PAGESPEED_CHROME_PATH` at it specifically so the PageSpeed/Lighthouse
# feature keeps working in a container, not just on the developer's own
# Windows machine (which has a full desktop Chrome install already).
# Omitting this would silently break Phase 20/21 in production the first
# time a user clicks "Run PageSpeed Audit" — see read.md's Phase 20/21
# write-ups and the Phase 34 section for the full explanation. If your
# deployment target image/base does not support installing Chromium
# (e.g. a locked-down distroless runtime), PageSpeed/Lighthouse must be
# run as a separate service/sidecar instead — do not ship this image
# without Chrome and silently let that feature fail in production.
# ─────────────────────────────────────────────────────────────────────────

# ---- Stage 1: deps — install dependencies only (maximizes layer caching)
FROM node:24-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---- Stage 2: builder — compile the production Next.js build
FROM node:24-slim AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* vars must be present at BUILD time (they're inlined into
# the client bundle) — pass them via `docker build --build-arg` if the
# production URL differs from the default below.
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NODE_ENV=production
RUN pnpm run build

# ---- Stage 3: runtime — slim image, only what's needed to run the server
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Chrome/Chromium for Phase 20 (PageSpeed/Lighthouse) — see header comment.
# `chromium` (not `google-chrome-stable`) because Debian's own repo carries
# it directly with no extra apt source needed; `chrome-launcher`/Lighthouse
# work identically against Chromium.
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium \
  && rm -rf /var/lib/apt/lists/*
ENV PAGESPEED_CHROME_PATH=/usr/bin/chromium

# Run as a non-root user (standard Next.js `standalone` output convention)
#
# The home directory is NOT incidental. `adduser --system` gives the account
# `/nonexistent` as its home, and Chromium resolves its crash-database path
# (and its default profile path) from $HOME. With an unusable $HOME it spawns
# `chrome_crashpad_handler` with an EMPTY `--database` argument, the handler
# exits with "--database is required", and Chromium then aborts with SIGTRAP
# (`Trace/breakpoint trap`) before a single page loads.
#
# This failure is invisible to a presence check AND to `chromium --version`:
# both succeed. Only actually launching a browser reveals it. Verified in this
# image — `chrome-launcher` (the exact path `src/lib/pagespeed/lighthouse-runner.ts`
# uses) failed with ECONNREFUSED until this directory existed and $HOME pointed
# at it, and succeeded immediately afterwards. Without these two lines the
# image ships a PageSpeed/Lighthouse feature that is 100% broken in production
# while every static check reports Chromium as installed.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /home/nextjs \
  && chown -R nextjs:nodejs /home/nextjs
ENV HOME=/home/nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# The WORKING DIRECTORY ITSELF must be writable by the runtime user, and this
# is a correctness requirement, not a convenience.
#
# `src/lib/install/token.ts` writes the install token to `<cwd>/.install-token`
# and — deliberately, so that a broken DATABASE_URL can still be diagnosed —
# verifies every submitted token against THAT FILE and nothing else. Docker's
# COPY leaves /app itself owned by root:root 0755, so as `nextjs` the write
# fails. The failure is CAUGHT (a read-only filesystem is a legitimate
# deployment shape), the token is still printed to stdout, and the boot banner
# still says the token was stored — but no file exists, so
# `verifyInstallToken()` reads null and rejects EVERY token, including the one
# in the log. Result: /install is permanently unreachable in the container,
# which is the recommended deployment path.
#
# Observed in this image before this line existed: the exact token from
# `docker logs`, sent as `x-install-token`, returned 401 from
# /api/install/status. Nothing about the boot output hints at it.
#
# `chown` targets the DIRECTORY ENTRY ONLY, not `-R`. Application code, the
# standalone server and the static assets stay root-owned and unwritable by
# the runtime user; `nextjs` gains only the ability to create and remove
# entries in /app — which is exactly what the installer needs, since
# completing an installation must also DELETE the token file.
RUN chown nextjs:nodejs /app

USER nextjs
EXPOSE 3000

# GET /api/health (this phase) is the intended target for a container
# orchestrator's own HEALTHCHECK/readiness probe — see read.md's Phase 34
# section for the full 200/503 contract. Not declared as a Docker
# HEALTHCHECK instruction here since most production orchestrators
# (Kubernetes livenessProbe/readinessProbe, ECS health checks, a load
# balancer's own target-group health check) manage this externally and a
# baked-in HEALTHCHECK would just duplicate/conflict with that — documented
# here instead so whichever orchestrator is used points at the right path.
CMD ["node", "server.js"]
