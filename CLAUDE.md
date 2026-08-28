# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **bun** (`bun.lock`).

```bash
bun run dev            # next dev --turbo
bun run build          # next build
bun run check          # lint && tsc --noEmit && bun test  — run this before calling work done
bun run test           # bun test only
bun run typecheck      # tsc --noEmit only
bun run lint:fix       # next lint --fix
bun run format:write   # prettier --write

bun run db:generate    # prisma migrate dev   (creates a migration)
bun run db:migrate     # prisma migrate deploy (applies migrations)
bun run db:push        # prisma db push       (schema-only, no migration)
bun run db:studio      # prisma studio
./start-database.sh    # local Postgres in Docker/Podman, reads DATABASE_URL from .env
```

Tests are `bun test`, no extra dependency. The suite lives at `src/server/review/review.test.ts` and
enters at **one seam**: the GitHub webhook handler. See "The review pipeline" below.

`bun run check` runs lint with `SKIP_ENV_VALIDATION=1` so the gate needs no secrets; `bun run build`
is what actually validates the env schema.

**`next lint` reports zero errors.** It used to carry a documented baseline of ~72, and that baseline
is what let two real build breakages hide inside it until `docs/adr/0004` cleared the dead code.
There is no acceptable-error count any more — if lint reports an error, you introduced it.

`postinstall` runs `prisma generate`. Set `SKIP_ENV_VALIDATION=1` to build without a valid `.env`.

**The suite cannot see changes to persistence.** It drives `InMemoryReviewStore` and
`FakeCodebaseIndex`, so `PrismaReviewStore` and `PrismaCodebaseIndex` are never exercised. A schema
change needs a live Review Run against a real pull request as evidence; a green suite is not it.

## Architecture

DevMe is a T3-stack app (Next.js 15 App Router, tRPC v11, Prisma, Tailwind v4, shadcn/ui). It is a
spec-adherence GitHub pull request reviewer (`src/server/review/`). The original Q&A dashboard,
meeting transcription, and the cancelled roles workstream were removed in `docs/adr/0004` — they
exist only in git history. Vocabulary is defined in `CONTEXT.md`; use it, and note its "Retired
terms" section, which now lists things genuinely absent rather than merely deprecated.

**The reviewer has no user interface yet.** `/dashboard` is a placeholder. The only way to give an
Installation a Provider Key is `bun run db:seed-key`. Building the Installation and Provider Key
surfaces is the next piece of work.

### The review pipeline

Read `CONTEXT.md` first for the vocabulary (Installation, Repository, Acceptance Criterion, Review,
Review Run, Criterion Result, Finding, Evidence, Producer, Verifier, Codebase Index), and
`docs/adr/0001-0003` for the decisions that constrain it.

Flow: GitHub webhook → signature verify → enqueue → worker → `runReview`.

- **Entry**: `src/app/api/webhooks/github/route.ts` verifies the HMAC signature against the exact
  request bytes *before anything else*, then enqueues and returns 202. Nothing downstream of the
  queue runs on the request path.
- **Ports** (`src/server/review/ports.ts`): five narrow interfaces — `GitHubClient`, `ModelProvider`,
  `ReviewQueue`, `ReviewStore`, `CodebaseIndex`. Every one has a production implementation and a
  fake. This is what makes the single test seam viable; the queue interface in particular is
  **mandatory, not a nicety**.
- **Orchestration**: `pipeline.ts` — unlinked decline → provider-key check → duplicate guard →
  lazy indexing → criteria → Producer → Verifier → render → neutral Check Run.
- **Producers propose; they never publish.** `verifier/verify.ts` is the only path to a pull request.
  It re-checks each proposal against evidence it can independently locate, drops anything stylistic
  outright, and caps the report at ten items. Grounding is deliberately **asymmetric**: `unsatisfied`
  and `unclear` verdicts and all Findings are checked hard, `satisfied` passes cheaply — a false
  accusation costs more trust than a miss.
- **Model calls**: only the Producer and Verifier spend the Installation's Provider Key. Indexing
  stays on the platform's cheap Groq + HuggingFace pipeline.

Tests enter only at `webhookHandler.ts` and assert only on what left the system — the comment
markdown on the fake GitHub client, the Check Run conclusion, the HTTP status. Do not add tests that
assert on prompt text, a Producer's intermediate proposal, internal call counts, or database rows.
Model output is **scripted, never sampled**, so the suite verifies the pipeline and says nothing
about whether the model's judgement is good.

### The tRPC surface

`src/server/api/root.ts` mounts one router: `src/server/api/routers/installation.ts`, at `/api/trpc`.
Everything is `protectedProcedure` — the `isAuthenticated` middleware in `src/server/api/trpc.ts`
narrows `ctx.session` and adds `ctx.user`. `publicProcedure` carries a dev-only artificial delay;
`protectedProcedure` does not. Add new routers to `root.ts` manually.

The review pipeline does **not** go through tRPC. It enters at the webhook route handler and runs
entirely on the worker.

### The AI pipeline

All AI calls go through **`src/lib/groqApi.ts`**: Groq for chat/summarization, HuggingFace
`sentence-transformers/all-mpnet-base-v2` for **768-dimension** embeddings. That dimension is
hard-coded in the Prisma schema as `Unsupported("vector(768)")` — changing the embedding model means
a migration.

Groq retires hosted models. A stale default 404s on every call, and because indexing swallows
per-file failures the only symptom is an index that silently never fills. Override with
`GROQ_CHAT_MODEL`.

Indexing flow (`src/lib/githubRepoLoader.tsx`):
1. `loadGithubRepo` — LangChain `GithubRepoLoader` pulls the repo. **`githubToken` is required and
   has no ambient fallback** — Repository access comes from an installation token only, per
   `docs/adr/0001`.
2. `filterDocsForEmbedding` — drops low-value files via `shouldProcessFile` / `IGNORE_PATHS` in
   `src/lib/utils.ts`.
3. `generateEmbeddings` — **sequential**, one file at a time, to respect free-tier rate limits. A
   failure on one file pushes `null` and continues rather than aborting the run. This is why
   `ensureIndexed` returns whether anything was actually written: a provider outage yields an empty
   index rather than an exception, and recording that as success would strand the Repository.

### Vector search happens in raw SQL

`PrismaCodebaseIndex.search` (`src/server/review/index/codebaseIndex.ts`) runs a `$queryRaw`
cosine-distance query (`1 - (embedding <=> query::vector)`) with a `0.12` threshold and **no top-N
fallback** — an empty result means the Producer gets no codebase context and says so, which beats
feeding it the least-irrelevant files.

Rows are written with Prisma, then the vector column is set by a separate `$executeRaw`
`UPDATE ... ::vector` — Prisma can't write `Unsupported` columns directly. Both wrapped in
`withDbRetry`.

### Auth

Auth.js v5 (`next-auth@5.0.0-beta`) in `src/auth.ts`: **GitHub provider only** (Google was dropped), Prisma adapter, **database** session strategy (so `session.user.id` comes from the `user` callback, not a JWT).

The GitHub OAuth token establishes **dashboard identity only — it grants no repository access.** Repository access always comes from a GitHub App installation token minted per Installation (`github/appClient.ts`); there is deliberately no module-level Octokit singleton and no stored PAT. Which Installations a signed-in user may see is asked of GitHub against their OAuth token and cached per session — this app stores no membership, roles, or invites. See `docs/adr/0001`.

`src/middleware.ts` guards routes by sniffing the `authjs.session-token` cookie — it does not call `auth()`, so it validates presence, not validity. Public routes: `/`, `/sign-in`, `/sign-up`, `/api/auth/*`. Real authorization lives in `protectedProcedure`.

Routes under `src/app/(protected)/` are the authenticated app — currently just the `/dashboard` placeholder. `src/app/page.tsx` is a minimal public landing page.

### Database

PostgreSQL with the **pgvector** extension (`extensions = [vector]`, `previewFeatures = ["postgresqlExtensions"]`). `src/server/db.ts` is not the stock T3 file: it adds SIGINT/SIGTERM disconnect handlers and `withDbRetry`, which retries connection-shaped errors with backoff and a reconnect. Use `withDbRetry` for writes in long-running loops.

The vector column has an **HNSW index** (`vector_cosine_ops`), added in the `20260827090000_pull_request_review` migration — it cannot be expressed in the Prisma schema because the column is `Unsupported`, so it lives in raw migration SQL.

`SourceCodeEmbedding` is owned by `repositoryId` alone. The legacy `projectId` column and the six tables behind it were dropped in `20260828150000_purge_legacy_product`; see `docs/adr/0004`.

Background work runs through **BullMQ** against Redis (`REDIS_URL`), with `src/worker.ts` as a separate process. See `docs/adr/0002`.

## Conventions

- Path alias `@/*` → `./src/*`.
- `strict` and **`noUncheckedIndexedAccess`** are on — indexed access yields `T | undefined`, hence the `!` and `?? continue` patterns in the loops.
- ESLint enforces `@typescript-eslint/consistent-type-imports` (use `import type`) and flags unused vars unless prefixed `_`.
- Env vars are validated by Zod in `src/env.js` and imported by `next.config.js`, so a missing required var fails the build. Adding one means editing both the schema block and `runtimeEnv`.
- shadcn/ui components live in `src/components/ui/` and are generated (`components.json`) — prefer regenerating over hand-editing. `eslint.config.js` turns off type-aware rules for that directory for the same reason.
- Provider Keys are encrypted with AES-256-GCM under `ENCRYPTION_MASTER_KEY` (32 bytes, base64). Ciphertext, IV, and auth tag are separate columns. The plaintext is never logged and never returned to a client — only `hint`, the last four characters, ever reaches the dashboard.

## Known gotchas

- **Two hand-written migrations.** `20260827090000_pull_request_review` (the HNSW index, which the
  Prisma schema cannot express because the column is `Unsupported`) and
  `20260828150000_purge_legacy_product` (the row deletion has to run before the column identifying
  the rows is dropped). Both are applied. Prefer `prisma migrate deploy` over `migrate dev` against
  any database holding a Provider Key — `migrate dev` can decide the database needs resetting.
- The review models require env vars that older `.env` files won't have: `GITHUB_APP_ID`,
  `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_OAUTH_CLIENT_ID`,
  `GITHUB_OAUTH_CLIENT_SECRET`, `ENCRYPTION_MASTER_KEY`, `REDIS_URL`. `bun run dev` and
  `bun run build` fail without them; `bun run check` does not.
- **Blank summaries still get embedded.** `generateEmbeddings` tolerates a per-file failure by
  pushing `null`, but a summarisation call that returns an *empty string* is not a failure — it gets
  embedded and occupies an index slot carrying no information. There is no guard for this yet.
- `bun run db:seed-key` is currently the only way to give an Installation a Provider Key. It reads
  the key from `ANTHROPIC_API_KEY` or a prompt, never from argv, so it stays out of shell history.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, used verbatim as `Status:` values. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
