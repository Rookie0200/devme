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
