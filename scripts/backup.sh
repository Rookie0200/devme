#!/usr/bin/env bash
#
# Nightly backup. Runs ON the box, from cron:
#
#   0 3 * * * /opt/devme/app/scripts/backup.sh >> /var/log/devme-backup.log 2>&1
#
# pg_dump inside the Postgres container, gzipped, streamed to Cloudflare R2.
# Nothing touches the local disk, so a full disk cannot corrupt a backup, and
# nothing is left behind to leak.
#
# docs/adr/0002 makes a *tested restore* a precondition of the first real
# customer, not a follow-up to them. This script only writes; the reading half
# is scripts/restoreCheck.sh, and it is the half that actually proves anything.
#
# WHAT THIS DOES NOT BACK UP: ENCRYPTION_MASTER_KEY. Every Provider Key in the
# dump is ciphertext under that key, so a dump without it restores rows nobody
# can read. It lives in /opt/devme/.env and must also live somewhere that is
# neither this box nor this bucket.

set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/devme/.env}"
APP_DIR="${APP_DIR:-/opt/devme/app}"
RETAIN_DAYS="${RETAIN_DAYS:-7}"

# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

: "${R2_BUCKET:?R2_BUCKET missing from $ENV_FILE}"
: "${R2_ENDPOINT:?R2_ENDPOINT missing from $ENV_FILE}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID missing from $ENV_FILE}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY missing from $ENV_FILE}"

stamp=$(date -u +%Y-%m-%dT%H-%M-%SZ)
key="devme-${stamp}.sql.gz"

echo "[$(date -uIs)] dumping to s3://${R2_BUCKET}/${key}"

cd "$APP_DIR"

# -T: no TTY, this is a pipe. --clean --if-exists so the dump can be restored
# over an existing database without hand-editing it first.
docker compose exec -T postgres \
  pg_dump --username=devme --dbname=devme --clean --if-exists \
  | gzip -9 \
  | docker run --rm -i \
      -e AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
      -e AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
      -e AWS_DEFAULT_REGION=auto \
      amazon/aws-cli s3 cp - "s3://${R2_BUCKET}/${key}" \
      --endpoint-url "$R2_ENDPOINT"

echo "[$(date -uIs)] uploaded ${key}"

# Retention. Deliberately simple: list, keep the newest RETAIN_DAYS, delete the
# rest. A rotation policy that is understood beats one that is clever.
cutoff=$(date -u -d "${RETAIN_DAYS} days ago" +%Y-%m-%d)
docker run --rm \
  -e AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  -e AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  -e AWS_DEFAULT_REGION=auto \
  amazon/aws-cli s3 ls "s3://${R2_BUCKET}/" --endpoint-url "$R2_ENDPOINT" \
  | awk '{print $4}' | grep -E '^devme-' \
  | while read -r old; do
      old_date="${old#devme-}"
      old_date="${old_date%%T*}"
      if [[ "$old_date" < "$cutoff" ]]; then
        echo "[$(date -uIs)] pruning ${old}"
        docker run --rm \
          -e AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
          -e AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
          -e AWS_DEFAULT_REGION=auto \
          amazon/aws-cli s3 rm "s3://${R2_BUCKET}/${old}" \
          --endpoint-url "$R2_ENDPOINT" >/dev/null
      fi
    done

echo "[$(date -uIs)] done"
