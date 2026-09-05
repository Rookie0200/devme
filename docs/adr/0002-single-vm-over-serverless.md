---
status: accepted
---

# Containers on a single VM, not Vercel

This is a T3 app, so Vercel is the assumed deployment target — we are deliberately not using it. The total infrastructure budget is roughly ₹5,000 (~$60), which Vercel Pro exhausts in three months while Hobby is non-commercial by its terms; and the repository indexing loop is a sequential per-file summarise-and-embed job measured in minutes, which no serverless invocation budget accommodates. One ~$5/month VM running Docker Compose — Next.js, Postgres with pgvector, Redis, and a BullMQ worker — removes the duration ceiling, removes the need for a separate hosted queue, and stays portable onto AWS credits later.

## Considered options

- **Vercel + Trigger.dev + Neon.** Lowest operational burden. Rejected on cost, and because Neon's 0.5 GB free tier cannot hold `sourceCode` at up to 50 KB per row alongside its embedding.
- **Cloudflare Workers + Queues + Hyperdrive.** ~$5/month and the credit programme would cover it, but it requires an OpenNext migration *before* shipping anything, and the Workers execution model fights the indexing loop. Cloudflare's free tier is still used in front of the VM for DNS and TLS.

## Consequences

- Backups, TLS renewal, and OS patching are ours. `pg_dump` on a cron, Cloudflare Tunnel for TLS. A restore must be tested before the first real customer.
- A single box means a single point of failure for webhook ingress. GitHub retries deliveries and supports manual redelivery, so this is recoverable rather than fatal.
- The job queue question does not arise: BullMQ against local Redis, no external service, no free-tier run limits.

## Verified live: the restore

**2026-09-05.** `scripts/backup.sh` and `scripts/restoreCheck.sh` (`.scratch/deploy-single-vm/spec.md`,
gate condition 3) ran for real against the production box, not a local dry-run. `crontab -l` came back
empty before this — the nightly schedule this ADR names had never actually been installed by any
script, only mentioned in passing — so the cron line from `backup.sh`'s own header comment was added by
hand first: `0 3 * * * /opt/devme/app/scripts/backup.sh >> /var/log/devme-backup.log 2>&1`.

A backup was then run immediately rather than waiting for 3am: `devme-2026-09-05T05-18-33Z.sql.gz`,
uploaded to the `devme-backups` R2 bucket. `restoreCheck.sh` pulled that dump into a scratch database
and confirmed all three things a `pg_dump`/restore cycle is most likely to lose silently: the `vector`
extension, `summaryEmbedding` still typed `vector(768)`, and
`SourceCodeEmbedding_summaryEmbedding_hnsw_idx` present by name. Row counts in the restored copy: 2
Users, 1 Installation, 1 Repository, 1 Review, 1 ReviewRun, 1 ProviderKey, 66 SourceCodeEmbedding rows.

What this does not prove: the cron entry itself has not yet fired unattended — everything above was a
manual invocation of the same script cron will run, not evidence the schedule survives a reboot or logs
correctly at 3am. That is condition 2 of the same gate (reboot recovery), closed separately below.

## Verified live: reboot recovery

**2026-09-05.** `sudo reboot` on the production box, then `docker compose ps`: all five services
(`postgres`, `redis`, `web`, `worker`, `cloudflared`) came back `Up` on their own, postgres and redis
`healthy`, with no command run on the box between the reboot and that check. `migrate` correctly stayed
exited rather than re-running — its `restart: "no"` policy is not re-evaluated by a plain reboot the
way `docker compose up`'s `depends_on` ordering would be, so this did not by itself prove `web`/`worker`
tolerate Postgres being unready; it only proved they didn't need to be gated by `migrate` again.

The real proof needed a pull request. A disposable Issue (#28) and a pull request against `main`
(`chore/reboot-recovery-smoketest`, closed without merging) produced a comment from `claimcheck-app` on
commit `9ff6ce5` — "Reviewed once" — with zero manual steps on the box beyond the reboot. The verdict
itself was "No acceptance criteria could be grounded in this diff," which is correct rather than a
defect: the criterion named in the Issue described existing repository state unconnected to the diff,
so `docs/adr/0007`'s "nothing is reported rather than guessing" is exactly what fired. What matters is
that the webhook was received, queued, worked, and answered — the whole path, post-reboot, unattended.

What this does not prove: it says nothing about `withDbRetry`'s backoff actually being exercised, since
Postgres was already `healthy` by the time `web`/`worker` needed it — the race this note flagged as a
risk was not observed to occur, not observed to be handled. If a future reboot lands with Postgres
slower to start (a larger index, a busier disk), and `web`/`worker` come up clean anyway, that is the
evidence this note is missing.

## Verified live: CI, the merge, and the redeploy

**2026-09-05.** PR #30 (`feat/deploy-single-vm` → `main`) ran `check.yml` on a machine that is not the
maintainer's laptop for the first time — check #7, green in 35s — and merging it re-ran the workflow
against `main` itself — check #8, green in 36s. Condition 4 of the gate is closed by both runs existing
and passing, not by either alone: the first proves the branch was clean, the second proves the merge
commit is too.

`./deploy.sh` then took `main` — including `b964657`, the `/sign-up` deletion — to the box: `migrate`
ran and exited 0, `web` and `worker` recreated. An anonymous request to `/sign-up` 307s to `/sign-in`,
which is `src/middleware.ts` redirecting any logged-out visitor away from a non-public route before
Next.js ever resolves it — indistinguishable by itself from the page still existing. Signed in, the
same URL renders Next.js's own 404. Condition 6 is closed on the authenticated check, not the curl.

What remains: condition 1 (a stranger's pull request, reviewed with the laptop closed) and condition 5
(`scripts/inspectRuns.ts` showing that stranger's Run), both of which need an actual invited user rather
than another rehearsal.

## Verified live: the stranger's pull request

**2026-09-05.** `Thebeast01` installed `claimcheck-app` on `nvim-config`, a repository `Rookie0200`
cannot reach on GitHub, was handed a scoped Provider Key to paste into `/dashboard` for that
Installation, opened Issue #1 stating one acceptance criterion, and opened PR #2 (`dbb39c3`) closing
it. `claimcheck-app` commented with a per-criterion verdict — `README.md:5` satisfying "states that the
leader key is the spacebar" — delivered by the production App on the box, with no laptop involved.
Condition 1 is closed.

`docker compose exec worker bun run scripts/inspectRuns.ts`, run on the box, then listed that Run —
`Thebeast01/nvim-config #2`, completed, `$0.0018`, `claude-haiku-4-5` — grouped under Installation
`159206683`, which a `Rookie0200`-authenticated dashboard session cannot see. That is the actual
property condition 5 checks: the operator script's deliberate disregard for reachability, not merely
that a row exists. Condition 5 is closed by the same command, on the Run condition 1's pull request
produced.

What this does not prove: the Provider Key on that Installation was scoped to this one test and revoked
immediately after, by design, which is why the script now shows `no provider key` beside it — expected,
not a regression. A second pull request against that Installation will decline with a missing-key
reason until a key is pasted in again.

**All six conditions of the live gate are closed.** The reviewer now has one Installation neither of us
owns, reviewed without our laptop, restorable from an off-box backup, recoverable from a reboot, gated
by CI on a machine that isn't a laptop, and visible to the operator script across Installations it
cannot otherwise reach.
