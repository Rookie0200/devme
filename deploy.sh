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

# The box's SSH login user. OVHcloud (the default provider in the wizard)
# assigns a non-root user named after the OS image ('ubuntu' for Ubuntu) and
# the box's docker group is what lets that user run compose without sudo — see
# the bootstrap stage in scripts/provisionProduction.sh. A Hetzner box
# provisioned before that stage existed logs in as root, which is why this
# still defaults to root when REMOTE_USER isn't in the provisioning env.
user="${DEVME_USER:-}"
if [[ -z "$user" && -f "$PROVISION_ENV" ]]; then
  user=$(grep -E '^REMOTE_USER=' "$PROVISION_ENV" | tail -n1 | cut -d= -f2- || true)
fi
user="${user:-root}"

branch="${DEVME_BRANCH:-main}"

echo "▸ deploying ${branch} to ${user}@${host}"

ssh -o StrictHostKeyChecking=accept-new "${user}@${host}" \
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

# Every compose call needs --env-file. The environment lives at
# $REMOTE_ROOT/.env, outside the checkout, so a bare `docker compose` finds no
# .env beside docker-compose.yml and dies interpolating ${TUNNEL_TOKEN:?...}
# before it can print anything — which reads as a failed deploy immediately
# after a successful one. Same helper, for the same reason, as scripts/backup.sh.
dc() { docker compose --env-file "${REMOTE_ROOT}/.env" "$@"; }

echo "▸ building and starting"
# The `migrate` service runs the deploy gate (env validation, migrations, the
# HNSW index check) and web/worker wait for it to exit 0, so a bad env or a
# failed migration stops here rather than serving.
dc up -d --build

echo "▸ state"
dc ps

echo "▸ pruning old images"
docker image prune -f >/dev/null
REMOTE

echo
echo "✓ deployed. Recent worker output:"
ssh "${user}@${host}" "cd ${REMOTE_APP} && docker compose --env-file ${REMOTE_ROOT}/.env logs --tail 20 worker"
