#!/usr/bin/env bash
#
# Prove the backups restore. Runs ON the box:
#
#   /opt/devme/app/scripts/restoreCheck.sh
#
# Pulls the newest dump from R2, restores it into a throwaway database beside
# the live one, and checks the three things that are most likely to be quietly
# lost in a dump/restore cycle and least likely to be noticed afterwards:
#
#   1. the `vector` extension
#   2. the `Unsupported("vector(768)")` column, with its dimension intact
#   3. SourceCodeEmbedding_summaryEmbedding_hnsw_idx
#
# (3) is the dangerous one. A missing HNSW index raises no error — every
# Codebase Index search silently becomes a sequential scan. A restore that
# "worked" and left it behind is exactly the kind of recovery you discover was
# broken weeks later.
#
# This is gate condition 3 of .scratch/deploy-single-vm/spec.md, and it must be
# run once, by hand, before anyone else's Provider Key is in the backups.
#
# The scratch database is dropped at the end, including on failure.

set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/devme/.env}"
APP_DIR="${APP_DIR:-/opt/devme/app}"
SCRATCH_DB="${SCRATCH_DB:-devme_restorecheck}"

# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

: "${R2_BUCKET:?R2_BUCKET missing from $ENV_FILE}"
: "${R2_ENDPOINT:?R2_ENDPOINT missing from $ENV_FILE}"

cd "$APP_DIR"

# docker-compose.yml lives in $APP_DIR, but the .env it interpolates
# (POSTGRES_PASSWORD, TUNNEL_TOKEN, ...) lives one level up at $ENV_FILE.
# Compose only auto-loads a .env from the current directory, so every
# invocation here needs --env-file explicitly or it fails before touching
# postgres at all.
dc() { docker compose --env-file "$ENV_FILE" "$@"; }

aws_cli() {
  docker run --rm -i \
    -e AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
    -e AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    -e AWS_DEFAULT_REGION=auto \
    amazon/aws-cli "$@" --endpoint-url "$R2_ENDPOINT"
}

psql_scratch() {
  dc exec -T postgres psql --username=devme --dbname="$SCRATCH_DB" -tAc "$1"
}

cleanup() {
  echo "▸ dropping ${SCRATCH_DB}"
  dc exec -T postgres \
    psql --username=devme --dbname=postgres -q \
    -c "DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE);" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "▸ finding the newest dump in s3://${R2_BUCKET}/"
latest=$(aws_cli s3 ls "s3://${R2_BUCKET}/" | awk '{print $4}' | grep -E '^devme-.*\.sql\.gz$' | sort | tail -n1)
if [[ -z "$latest" ]]; then
  echo "No dump found. Run scripts/backup.sh first." >&2
  exit 1
fi
echo "  ${latest}"

echo "▸ creating ${SCRATCH_DB}"
cleanup
dc exec -T postgres \
  psql --username=devme --dbname=postgres -q -c "CREATE DATABASE ${SCRATCH_DB};"

echo "▸ restoring"
# Errors from the dump's leading DROP statements are expected against an empty
# database, so this deliberately does not use ON_ERROR_STOP. The checks below
# are what decide whether the restore worked — not psql's exit code.
aws_cli s3 cp "s3://${R2_BUCKET}/${latest}" - \
  | gunzip \
  | dc exec -T postgres psql --username=devme --dbname="$SCRATCH_DB" -q 2>&1 \
  | grep -vE 'does not exist, skipping|NOTICE' || true

failures=0
check() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    printf '  ✓ %s\n' "$label"
  else
    printf '  ✗ %s — expected %q, got %q\n' "$label" "$expected" "$actual"
    failures=$((failures + 1))
  fi
}

echo "▸ checking what survived"

check "vector extension installed" "1" \
  "$(psql_scratch "SELECT count(*) FROM pg_extension WHERE extname = 'vector';")"

check "summaryEmbedding is vector(768)" "vector(768)" \
  "$(psql_scratch "SELECT format_type(a.atttypid, a.atttypmod)
                   FROM pg_attribute a
                   JOIN pg_class c ON c.oid = a.attrelid
                   WHERE c.relname = 'SourceCodeEmbedding'
                     AND a.attname = 'summaryEmbedding';")"

check "HNSW index present" "1" \
  "$(psql_scratch "SELECT count(*) FROM pg_indexes
                   WHERE indexname = 'SourceCodeEmbedding_summaryEmbedding_hnsw_idx';")"

# Not a pass/fail — a restore of an empty database is technically valid and
# tells you nothing, so the counts are printed to be read by a human.
echo "▸ row counts in the restored copy"
for table in User Installation Repository Review ReviewRun ProviderKey SourceCodeEmbedding; do
  count=$(psql_scratch "SELECT count(*) FROM \"${table}\";" 2>/dev/null || echo "—")
  printf '  %-22s %s\n' "$table" "$count"
done

echo
if (( failures > 0 )); then
  echo "✗ restore check FAILED: ${failures} problem(s). Do not invite anyone." >&2
  exit 1
fi
echo "✓ restore check passed against ${latest}"
echo "  Record the date and the dump name in docs/adr/0002."
