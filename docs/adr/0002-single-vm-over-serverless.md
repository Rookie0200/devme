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
