#!/usr/bin/env bash
#
# Deploy to the single VM. Run this from your laptop.
#
#   ./deploy.sh
#
# It ssh's to the box, fast-forwards the checkout, rebuilds the image there,
# and brings compose up. The build happens on the box because there is one
# machine and nothing to pull an image from — see docs/adr/0002.
#
# Expects, on the box:
#   /opt/devme/.env      the environment, written by scripts/provisionProduction.sh
#   /opt/devme/app       this repository, checked out
#
# The host is read from SERVER_IP in your local provisioning env file, or from
# DEVME_HOST if you'd rather pass it explicitly:
#
#   DEVME_HOST=1.2.3.4 ./deploy.sh

set -euo pipefail

PROVISION_ENV="${PROVISION_ENV:-$HOME/devme-production.env}"
REMOTE_ROOT="/opt/devme"
REMOTE_APP="${REMOTE_ROOT}/app"

host="${DEVME_HOST:-}"
if [[ -z "$host" && -f "$PROVISION_ENV" ]]; then
  host=$(grep -E '^SERVER_IP=' "$PROVISION_ENV" | tail -n1 | cut -d= -f2- || true)
fi

if [[ -z "$host" ]]; then
  echo "No host. Set DEVME_HOST=<ip>, or run scripts/provisionProduction.sh first" >&2
  exit 1
fi

branch="${DEVME_BRANCH:-main}"

echo "▸ deploying ${branch} to ${host}"

ssh -o StrictHostKeyChecking=accept-new "root@${host}" \
  REMOTE_APP="$REMOTE_APP" REMOTE_ROOT="$REMOTE_ROOT" BRANCH="$branch" 'bash -s' <<'REMOTE'
set -euo pipefail

cd "$REMOTE_APP"

echo "▸ fetching"
git fetch --quiet origin "$BRANCH"
git checkout --quiet "$BRANCH"
# --ff-only: a deploy must never resolve a merge. If this fails, something was
# committed on the box, and that wants a human rather than a script.
git merge --ff-only "origin/${BRANCH}"
echo "  now at $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"

echo "▸ building and starting"
# The `migrate` service runs the deploy gate (env validation, migrations, the
# HNSW index check) and web/worker wait for it to exit 0, so a bad env or a
# failed migration stops here rather than serving.
docker compose --env-file "${REMOTE_ROOT}/.env" up -d --build

echo "▸ state"
docker compose ps

echo "▸ pruning old images"
docker image prune -f >/dev/null
REMOTE

echo
echo "✓ deployed. Recent worker output:"
ssh "root@${host}" "cd ${REMOTE_APP} && docker compose logs --tail 20 worker"
