#!/usr/bin/env bash
#
# The deploy gate. Runs as the one-shot `migrate` compose service, before web
# and worker are allowed to start.
#
# Two jobs, in this order:
#
#   1. Validate the environment against src/env.js. The image was built with
#      SKIP_ENV_VALIDATION=1 (a Docker build has no access to the secrets), so
#      this is where a missing or malformed variable is caught. Catching it
#      here means a bad deploy fails loudly at deploy time rather than quietly
#      on the first review — including ENCRYPTION_MASTER_KEY not decoding to
#      32 bytes, which env.js checks for exactly this reason.
#
#   2. Apply migrations with `prisma migrate deploy`. Never `migrate dev`,
#      which can decide the database needs resetting — and this database holds
#      other people's Provider Keys.

set -euo pipefail

echo "▸ validating environment against src/env.js"
bun -e 'await import("/app/src/env.js"); console.log("  env OK")'

echo "▸ applying migrations (prisma migrate deploy)"
bunx prisma migrate deploy

# The HNSW index cannot be expressed in the Prisma schema, because the column
# it covers is `Unsupported("vector(768)")`. It is created by raw SQL in
# 20260827090000_pull_request_review, and every *generated* migration since
# has tried to drop it. If it is ever missing, every Codebase Index search
# silently degrades to a sequential scan — no error, just a slow reviewer with
# worse context. Checked on every deploy because the failure is invisible.
echo "▸ checking the HNSW index survived"
bunx prisma db execute --stdin <<'SQL' >/dev/null
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'SourceCodeEmbedding_summaryEmbedding_hnsw_idx'
  ) THEN
    RAISE EXCEPTION 'SourceCodeEmbedding_summaryEmbedding_hnsw_idx is missing — vector search would fall back to a sequential scan';
  END IF;
END $$;
SQL
echo "  HNSW index present"

echo "✓ deploy gate passed"
