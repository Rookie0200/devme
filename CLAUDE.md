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

Tests are `bun test`, no extra dependency. The review suite lives at
`src/server/review/review.test.ts` and enters at **one seam**: the GitHub webhook handler. Separately,
`routers/installation.test.ts` and `routers/reviewRun.test.ts` are *router authorization tests* —
each pins exactly one security property and nothing else. See "The review pipeline" below before
adding to any of them.

`bun run check` sets `SKIP_ENV_VALIDATION=1` for both lint and the tests, so the gate needs no
secrets — the router tests import `@/env` transitively and would otherwise fail on any `.env`
missing a required var, which is a property of the local machine rather than of the code.
`bun run build`
is what actually validates the env schema.

**`next lint` reports zero errors.** It used to carry a documented baseline of ~72, and that baseline
is what let two real build breakages hide inside it until `docs/adr/0004` cleared the dead code.
There is no acceptable-error count any more — if lint reports an error, you introduced it.

`postinstall` runs `prisma generate`. Set `SKIP_ENV_VALIDATION=1` to build without a valid `.env`.

**The suite cannot see changes to persistence.** It drives `InMemoryReviewStore` and
`FakeCodebaseIndex`, so `PrismaReviewStore` and `PrismaCodebaseIndex` are never exercised. A schema
change needs a live Review Run against a real pull request as evidence; a green suite is not it.

### Never push, never open a pull request

Committing locally is fine and expected. **Anything that reaches GitHub is the maintainer's to run** —
`git push`, `gh pr create`, `gh pr merge`, and any other command that publishes. Do not attempt them,
and do not look for a way around a failure.

Hand over the **content**, in the reply, ready to copy into the GitHub web interface: the branch name,
the title, and the pull request body as a fenced markdown block. Not a path to a file, and not a
`gh --body-file` invocation pointing at one — the maintainer opens pull requests in the browser, and a
scratchpad path is useless there and gone by the next session.

This is not only a credentials problem, though it is that too: the push remote is an SSH host alias
with a passphrase-protected key and no agent, and `gh` is not logged in, so the attempt fails anyway
and wastes a turn. The rule stands regardless of whether some future environment would let it
succeed.

## Architecture

DevMe is a T3-stack app (Next.js 15 App Router, tRPC v11, Prisma, Tailwind v4, shadcn/ui). It is a
spec-adherence GitHub pull request reviewer (`src/server/review/`). The original Q&A dashboard,
meeting transcription, and the cancelled roles workstream were removed in `docs/adr/0004` — they
exist only in git history. Vocabulary is defined in `CONTEXT.md`; use it, and note its "Retired
terms" section, which now lists things genuinely absent rather than merely deprecated.

**The interface is two screens, and the line between them is `docs/adr/0006`.**

- `/dashboard` lists the Installations the signed-in user can reach on GitHub and lets each be given,
  replaced, or stripped of a Provider Key. It shows a Repository *count* because `installation.list`
  already returns one, and warns when a key has been **refused** by the provider during a real Review
  Run, read from `ProviderKey.lastAuthFailureAt`. It still shows no Repository list.
- `/dashboard/runs` is the Review Run feed: the 50 most recent Runs across every reachable
  Installation, newest first, one row per Run, capped rather than paginated and saying so.

**GitHub owns "what the review said"; the dashboard owns "whether it ran, and why it didn't."** The
pull request comment is the only rendering of verdicts, Criterion Results, Findings, and Evidence.
The dashboard shows none of them and has no run detail view — that is ADR-0006, not an unfinished
edge, and it is the standing answer to "why doesn't the dashboard show review results?" The test for
a new dashboard feature is whether it answers *did the reviewer run* rather than *what did it
conclude*.

Still deliberately absent, each needing a new query or router: pagination, filtering (the
per-Installation filter should arrive as a query param on `/dashboard/runs`, not a control), cost
totals of any kind, and a cross-Installation operator view.

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
- **Orchestration**: `pipeline.ts` — start Run → unlinked decline → provider-key check → lazy
  indexing → criteria → Producer → Verifier → render → neutral Check Run.
- **Every delivery owns exactly one Review Run**, created before the first exit, and every exit path
  transitions it — including the two declines. A decline *is* a Run (`docs/adr/0005`); a system that
  records only its successes cannot explain its silences. Three consequences that are easy to undo
  by accident:
  - **`startRun` blocks only on `completed`, and on a `running` Run that still looks alive.** A
    `declined` or `failed` Run is taken over, and so is a `running` one whose worker died — on either
    the queue reporting a re-delivery (`attemptsStarted > 1`, *not* `attemptsMade`, which a stalled
    job never increments) or `isRunAbandoned` in `review/runLifecycle.ts`, the same predicate the
    feed uses to say "interrupted". Adding a missing Issue link and reopening fires at the *same*
    head commit, and so does every route back from a crash, so blocking there makes the pull request
    permanently unreviewable with no error raised anywhere. Only `completed` is absolute — that is
    the guard against charging a Provider Key twice. See the amendment in `docs/adr/0005`.
  - **`hasDeclinedRun` must be read before `startRun`.** Starting a Run supersedes the declined row
    that answers it, so asking afterwards re-renders the declining comment on every push.
  - **The queue does no de-duplication.** It used to, keyed on the head commit, and that claimed a
    commit for as long as BullMQ retained the completed job. The durable guard is the unique
    constraint on `(reviewId, headSha)`; do not add a `jobId` back.
- **A failed Run records why, and what it had already spent.** The reason is classified by the
  `ModelProvider` — never by the pipeline, which must not learn one vendor's error shapes — and
  anything unrecognised is `internal`. Do not guess `provider_auth`: it drives a dashboard warning
  accusing the customer's credential. `costUsd` of `null` means unknown and is deliberately not `0`.
- **Producers propose; they never publish.** `verifier/verify.ts` is the only path to a pull request.
  It re-checks each proposal against evidence it can independently locate and drops anything
  stylistic outright. Grounding is deliberately **asymmetric**: `unsatisfied` and `unclear` verdicts
  and all Findings are checked hard, `satisfied` passes cheaply — a false accusation costs more trust
  than a miss.
- **Criteria and Findings do not share a budget** (`docs/adr/0007`). Criteria are uncapped;
  `MAX_REPORTED_FINDINGS` caps Findings alone. A criterion with no verdict is a gap in the contract,
  a Finding that missed the cut is an opinion withheld — ranking them against each other let the
  model's chattiness decide how much of the spec got judged. Both lists come out in Producer order;
  there is deliberately no ranking pass left. A report that still omits criteria **states the
  count**, from the same helper the Check Run summary uses, so the two surfaces cannot disagree. One
  verdict per criterion, de-duplicated *after* grounding so a duplicate cannot cost a criterion its
  verdict.
- **Model calls**: only the Producer and Verifier spend the Installation's Provider Key. Indexing
  stays on the platform's cheap Groq + HuggingFace pipeline.

Tests enter only at `webhookHandler.ts` and assert only on what left the system — the comment
markdown on the fake GitHub client, the Check Run conclusion, the HTTP status. Do not add tests that
assert on prompt text, a Producer's intermediate proposal, internal call counts, or database rows.
Model output is **scripted, never sampled**, so the suite verifies the pipeline and says nothing
about whether the model's judgement is good.

That rule means **the outcome columns are untested by construction** — `outcomeReason`, cost on a
failed Run, `Review.title`, and `lastAuthFailureAt` are all rows, and rows are what the suite does
not assert on. What *is* covered is the behaviour those changes can break from the outside: a
declined commit still being reviewable after its Issue link is added, an Unlinked branch not being
nagged on every push, and an abandoned Run being taken over while a live one is not. All live at the
webhook seam. `InMemoryReviewStore` also enforces the unique constraint on
`(reviewRunId, criterionId)`, because a fake that accepts a payload Postgres rejects made duplicate
criterion results structurally unreachable — the obvious test passed before the fix existed. Teaching
a fake a constraint the real store has is not the same as asserting on rows, and the assertion is
still on the comment. It proves the de-duplication and nothing about `PrismaReviewStore`.
The takeover cases need a `running` Run, which the seam cannot produce — the pipeline's
catch block always writes `failed` — so the harness seeds one. Seeding is *arrange*; the assertions
are still only on the comment that left the system, and the negative control is what stops all of it
being satisfied by a guard that simply stopped blocking. The rest was verified against a real
pull request; do not "fix" the gap by reaching into the fake store.

Outside the pipeline there is a second **category** of test — *router authorization tests* — and it
is deliberately not a general router suite. Each file drives one router through a server-side caller
with a stub `ctx.client` and a fake `ctx.github`, and pins **one property**, chosen because it is a
security property that fails *silently* and in a direction that looks like an improvement:

- `installation.test.ts` — an Installation the signed-in user cannot reach answers `NOT_FOUND`, never
  `FORBIDDEN`, because `FORBIDDEN` confirms to a stranger that the Installation is real.
- `reviewRun.test.ts` — a Review Run from an unreachable Installation is **absent from a non-empty
  result**. Assert absence, not a thrown error: dropping the filter does not throw, it returns extra
  rows, so an error-shaped assertion sails straight past the regression. In development it is
  invisible, because a developer can usually reach every Installation in their own database.

Adding a third means finding another property of that kind, not testing a happy path. Happy paths are
verified by hand against a real Installation.

Be clear about what these seams do **not** prove. They run against hand-written stubs for
`ctx.client`, so they say nothing about whether the real Prisma queries are correct — the same blind
spot recorded below for `PrismaReviewStore`. They exercise no part of either screen: there is no
component test, no browser automation, and nothing asserting that a key is masked, that removal takes
two clicks, that the feed's cap is stated, or that an unknown cost renders as unknown rather than
zero. All of that is verified by hand.

### The tRPC surface

`src/server/api/root.ts` mounts two routers at `/api/trpc`: `routers/installation.ts` and
`routers/reviewRun.ts`.
Everything is `protectedProcedure` — the `isAuthenticated` middleware in `src/server/api/trpc.ts`
narrows `ctx.session` and adds `ctx.user`. `publicProcedure` carries a dev-only artificial delay;
`protectedProcedure` does not. Add new routers to `root.ts` manually.

**Routers take their dependencies from `ctx`, never from a module import.** `createTRPCContext`
supplies `client` (Prisma) and `github` (`GitHubIdentity`, which answers *which Installations this
user can reach* against their own OAuth token). `github` is typed as the interface, not the concrete
class, so a test can substitute a fake with no cast. Its reachability cache lives **inside** the
implementation instance rather than at module scope — production shares one instance, and a test
constructing its own therefore gets an empty cache instead of reading the previous case's answer.

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
- **Every generated migration tries to drop the HNSW index.** Prisma cannot see
  `SourceCodeEmbedding_summaryEmbedding_hnsw_idx`, because the column it covers is `Unsupported`, so
  it reads as stale and `migrate dev` emits a `DROP INDEX` for it. Applying that turns every Codebase
  Index search into a sequential scan, silently. **Delete that line by hand and re-read the generated
  SQL before committing it** — `20260828154110_review_run_outcomes` carries a note saying so.
  Generate migrations against a throwaway local Postgres (`pgvector/pgvector` — the stock `postgres`
  image lacks the extension) rather than the real database.
- The review models require env vars that older `.env` files won't have: `GITHUB_APP_ID`,
  `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_OAUTH_CLIENT_ID`,
  `GITHUB_OAUTH_CLIENT_SECRET`, `GITHUB_APP_SLUG`, `ENCRYPTION_MASTER_KEY`, `REDIS_URL`.
  `bun run dev` and `bun run build` fail without them; `bun run check` does not.
- **Blank summaries still get embedded.** `generateEmbeddings` tolerates a per-file failure by
  pushing `null`, but a summarisation call that returns an *empty string* is not a failure — it gets
  embedded and occupies an index slot carrying no information. There is no guard for this yet.
- `bun run db:seed-key` is the **break-glass** path for giving an Installation a Provider Key; the
  ordinary path is `/dashboard`. It reads the key from `ANTHROPIC_API_KEY` or a prompt, never from
  argv, so it stays out of shell history. Keep it working — a web outage otherwise means nobody can
  be onboarded at all.
- **`installation.list` is a query that writes.** Installation rows are created by the
  `installation.created` webhook, and GitHub never retries a dropped delivery, so an Installation
  whose event was missed would be invisible forever. `list` reconciles: anything GitHub reports that
  has no live row is registered through the same `upsertInstallation` the webhook calls, which also
  revives a soft-deleted row on reinstall. The framing that makes this correct is that
  `Installation` is a *cache of GitHub's state*, not a record of our own.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, used verbatim as `Status:` values. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
