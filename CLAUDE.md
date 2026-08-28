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

**`next lint` still reports ~72 pre-existing errors**, all in the code slated for the purge (the
meeting cluster, `githubApi.ts`, the Project dashboard, the cancelled roles UI) or in unrelated
files (`firebase.ts`). Everything under `src/server/review/` is clean, as are `tsc` and `bun test`.
Don't let the pre-existing noise mask a new failure — diff the count.

`postinstall` runs `prisma generate`. Set `SKIP_ENV_VALIDATION=1` to build without a valid `.env`.

## Architecture

DevMe is a T3-stack app (Next.js 15 App Router, tRPC v11, Prisma, Tailwind v4, shadcn/ui). It is
**mid-pivot**: the product is now a spec-adherence GitHub pull request reviewer (`src/server/review/`),
and the original Q&A dashboard plus meeting transcription are legacy awaiting the purge. Vocabulary
for the new product is defined in `CONTEXT.md` — use it, and note its "Retired terms" section.

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

### Two API surfaces, deliberately split

- **tRPC** (`src/server/api/routers/project.ts`, mounted at `/api/trpc`) handles all CRUD. Everything is `protectedProcedure` — the `isAuthenticated` middleware in `src/server/api/trpc.ts` narrows `ctx.session` and adds `ctx.user`. `publicProcedure` carries a dev-only artificial delay; `protectedProcedure` does not.
- **Route handlers** (`src/app/api/qa/route.ts`) handle streaming, which tRPC isn't used for here. `/api/qa` returns a raw `ReadableStream` of Groq tokens and passes the matched source files back out-of-band in an `X-File-References` header (URI-encoded JSON), not in the body.

Add new routers to `src/server/api/root.ts` manually.

### The AI pipeline

All AI calls go through **`src/lib/groqApi.ts`**: Groq (`llama-3.1-8b-instant` by default, override with `GROQ_CHAT_MODEL`) for chat/summarization, HuggingFace `sentence-transformers/all-mpnet-base-v2` for **768-dimension** embeddings. That dimension is hard-coded in the Prisma schema as `Unsupported("vector(768)")` — changing the embedding model means a migration.

`src/lib/geminiApi.tsx` exports the same three function names (`summariseCode`, `aiSummarizeCommit`, `generateEmbeddingsFromAi`) but **nothing imports it**. It's a dead alternate implementation. When editing AI logic, confirm you're in `groqApi.ts`.

Indexing flow (`src/lib/githubRepoLoader.tsx`):
1. `loadGithubRepo` — LangChain `GithubRepoLoader` pulls the repo.
2. `filterDocsForEmbedding` — drops low-value files via `shouldProcessFile` / `IGNORE_PATHS` in `src/lib/utils.ts`.
3. `generateEmbeddings` — **sequential**, one file at a time, to respect free-tier rate limits. A failure on one file pushes `null` and continues rather than aborting the run.
4. Rows are written with Prisma, then the vector column is set by a separate `$executeRaw` `UPDATE ... ::vector` — Prisma can't write `Unsupported` columns directly. Both wrapped in `withDbRetry`.

Commit summarization (`src/lib/githubApi.ts`) follows the same shape: Octokit fetches commits, `filterUnProcessedCommits` diffs against the DB, `aiSummarizeCommit` summarizes.

### Vector search happens in raw SQL, in two places

Both `src/app/api/qa/route.ts` and `searchCodebase` in `src/app/(protected)/dashboard/actions.ts` run near-identical `$queryRaw` cosine-distance queries (`1 - (embedding <=> query::vector)`) — but with **different thresholds**: `/api/qa` uses `> 0.12` with a top-5 fallback when nothing passes; `searchCodebase` uses `> 0.5` with no fallback. If you change retrieval behavior, check whether both need it.

### Background work is fire-and-forget

`createProject` kicks off `indexGithubRepo` and `pollCommits` as unawaited promises with `.catch(console.error)`. `getCommits` re-triggers `pollCommits` on every query. There is no job queue, no status tracking, and no cancellation — indexing progress is only visible in server logs.

### Auth

Auth.js v5 (`next-auth@5.0.0-beta`) in `src/auth.ts`: **GitHub provider only** (Google was dropped), Prisma adapter, **database** session strategy (so `session.user.id` comes from the `user` callback, not a JWT).

The GitHub OAuth token establishes **dashboard identity only — it grants no repository access.** Repository access always comes from a GitHub App installation token minted per Installation (`github/appClient.ts`); there is deliberately no module-level Octokit singleton and no stored PAT. Which Installations a signed-in user may see is asked of GitHub against their OAuth token and cached per session — this app stores no membership, roles, or invites. See `docs/adr/0001`.

`src/middleware.ts` guards routes by sniffing the `authjs.session-token` cookie — it does not call `auth()`, so it validates presence, not validity. Public routes: `/`, `/sign-in`, `/sign-up`, `/api/auth/*`. Real authorization lives in `protectedProcedure`.

Routes under `src/app/(protected)/` are the authenticated app; `src/app/page.tsx` plus the `*Section.tsx` components in `src/components/` are the marketing landing page.

### Database

PostgreSQL with the **pgvector** extension (`extensions = [vector]`, `previewFeatures = ["postgresqlExtensions"]`). `src/server/db.ts` is not the stock T3 file: it adds SIGINT/SIGTERM disconnect handlers and `withDbRetry`, which retries connection-shaped errors with backoff and a reconnect. Use `withDbRetry` for writes in long-running loops.

The vector column has an **HNSW index** (`vector_cosine_ops`), added in the `20260827090000_pull_request_review` migration — it cannot be expressed in the Prisma schema because the column is `Unsupported`, so it lives in raw migration SQL.

Two ownership models coexist during the pivot: `SourceCodeEmbedding.projectId` is legacy and now nullable; new rows are written against `repositoryId`. Legacy access is user-scoped through `UserToProject`; Project deletion is soft (`deletedAt`), meeting deletion is hard.

Background work runs through **BullMQ** against Redis (`REDIS_URL`), with `src/worker.ts` as a separate process — not the fire-and-forget unawaited promises the legacy indexing path uses. See `docs/adr/0002`.

## Conventions

- Path alias `@/*` → `./src/*`.
- `strict` and **`noUncheckedIndexedAccess`** are on — indexed access yields `T | undefined`, hence the `!` and `?? continue` patterns in the loops.
- ESLint enforces `@typescript-eslint/consistent-type-imports` (use `import type`) and flags unused vars unless prefixed `_`.
- Env vars are validated by Zod in `src/env.js` and imported by `next.config.js`, so a missing required var fails the build. Adding one means editing both the schema block and `runtimeEnv`.
- shadcn/ui components live in `src/components/ui/` and are generated (`components.json`) — prefer regenerating over hand-editing. `eslint.config.js` turns off type-aware rules for that directory for the same reason.
- Provider Keys are encrypted with AES-256-GCM under `ENCRYPTION_MASTER_KEY` (32 bytes, base64). Ciphertext, IV, and auth tag are separate columns. The plaintext is never logged and never returned to a client — only `hint`, the last four characters, ever reaches the dashboard.

## Known gotchas

- `src/app/api/process-meeting/routes.ts` is named `routes.ts`, not `route.ts`, so Next.js never registers it. `meetingCard.tsx` POSTs to `/api/process-meeting` and gets a 404 — meeting processing via AssemblyAI (`src/lib/assembly.ts`) is wired up but unreachable until the file is renamed.
- `PROJECT_GUIDE.md` (1200 lines) is **stale on three major points now**: it describes Clerk for auth, Google Gemini for AI, and a roles/invites workstream. Auth is Auth.js with **GitHub** OAuth, indexing is Groq + HuggingFace, and the roles workstream is **cancelled outright** by `docs/adr/0001` — access is decided by GitHub's own permissions. Treat those sections as historical.
- The review models require env vars that legacy `.env` files won't have: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `ENCRYPTION_MASTER_KEY`, `REDIS_URL`. `bun run dev` and `bun run build` fail without them; `bun run check` does not.
- The `20260827090000_pull_request_review` migration was **hand-written**, not generated by `prisma migrate dev` — it has to be, for the HNSW index. It has not been applied to any database yet.
- `AZURE_MIGRATION_GUIDE.md` is a forward-looking proposal (Azure OpenAI, Redis, etc.), not a description of the current system. None of it is implemented.
- `2a` at the repo root is a stray dump of an old Prisma schema, not a source file.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, used verbatim as `Status:` values. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
