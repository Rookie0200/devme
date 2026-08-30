# One image, two commands: `bun run start` (web) and `bun run src/worker.ts`
# (worker). The worker's entry point is TypeScript executed directly, not a
# build artifact, so the runtime layer needs `src/` and `node_modules` present
# — which is also why there is no `output: "standalone"` here. See the
# correction note in .scratch/deploy-single-vm/spec.md.
#
# Node *and* bun are both installed. bun is the package manager and the
# worker's runtime; node is here because `next build` and the Prisma CLI both
# spawn it, and a base image without it fails in ways that are tedious to
# diagnose on a 2 vCPU box.

FROM node:22-bookworm-slim AS base
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
# openssl is required by Prisma's query engine at runtime, not just at build.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ── dependencies ───────────────────────────────────────────────────────────
# `postinstall` runs `prisma generate`, so the schema has to be present before
# install, not after.
FROM base AS deps
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile

# ── build ──────────────────────────────────────────────────────────────────
# SKIP_ENV_VALIDATION because a Docker build has no access to the runtime
# secrets and passing fifteen of them as build args would bake them into the
# image history. The env schema is still enforced before anything serves
# traffic — the `migrate` service validates it, and refuses to run migrations
# if it fails. See scripts/migrateAndValidate.sh.
FROM base AS build
ENV SKIP_ENV_VALIDATION=1
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# ── runtime ────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app ./
EXPOSE 3000
CMD ["bun", "run", "start"]
