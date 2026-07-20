#!/usr/bin/env bash
# Run on the provisioned EC2 host as root. This never calls AWS and never
# accepts secrets on the command line.
set -Eeuo pipefail

usage() {
  echo "Usage: $0 --source-dir DIR --public-host HOST --mode prepare|launch" >&2
  exit 64
}

source_dir=""
public_host=""
mode=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-dir) source_dir=${2:?missing source directory}; shift 2 ;;
    --public-host) public_host=${2:?missing public host}; shift 2 ;;
    --mode) mode=${2:?missing mode}; shift 2 ;;
    *) usage ;;
  esac
done

[[ $EUID -eq 0 ]] || { echo "must run as root" >&2; exit 1; }
[[ -f "$source_dir/Dockerfile" ]] || { echo "source directory has no Dockerfile" >&2; exit 1; }
[[ -f "$source_dir/deploy/aws/compose.yaml" ]] || { echo "source directory has no Compose file" >&2; exit 1; }
[[ $public_host =~ ^[a-z0-9][a-z0-9.-]*[a-z0-9]$ && $public_host != *.invalid ]] || {
  echo "a real lowercase DNS host is required" >&2; exit 1;
}
[[ $mode == prepare || $mode == launch ]] || usage

install -d -m 0755 /opt/sigil-chat/source /opt/sigil-chat/deploy
install -d -m 0700 /srv/sigil-chat/secrets
install -d -m 0700 -o 10004 -g 10004 /srv/sigil-chat/caddy-data /srv/sigil-chat/caddy-config
rsync -a --delete --exclude .git --exclude .env --exclude .data --exclude node_modules --exclude .output \
  "$source_dir/" /opt/sigil-chat/source/
cp /opt/sigil-chat/source/deploy/aws/compose.yaml /opt/sigil-chat/deploy/compose.yaml
cp /opt/sigil-chat/source/deploy/aws/Caddyfile /opt/sigil-chat/deploy/Caddyfile

for secret in better_auth_secret gonk_mcp_key; do
  path="/srv/sigil-chat/secrets/$secret"
  if [[ ! -s $path ]]; then
    umask 077
    openssl rand -base64 48 >"$path"
  fi
  chmod 0444 "$path"
done

if [[ $mode == prepare ]]; then
  docker build --target web -t sigil-chat-web:launch /opt/sigil-chat/source
  docker build --target migrate -t sigil-chat-migrate:launch /opt/sigil-chat/source
  docker build --target eve -t sigil-chat-eve:launch /opt/sigil-chat/source
  docker build --target gonk -t sigil-chat-gonk:launch /opt/sigil-chat/source
  cat >/opt/sigil-chat/deploy/deploy.env.local <<EOF
PUBLIC_HOST=$public_host
SIGIL_INSTALLATION_ID=sigil-chat-$(date -u +%Y%m%dT%H%M%SZ)
SIGIL_SECRET_DIR=/srv/sigil-chat/secrets
SIGIL_MIGRATE_IMAGE=sigil-chat-migrate:launch
SIGIL_WEB_IMAGE=sigil-chat-web:launch
SIGIL_EVE_IMAGE=sigil-chat-eve:launch
SIGIL_GONK_IMAGE=sigil-chat-gonk:launch
EOF
  chmod 0600 /opt/sigil-chat/deploy/deploy.env.local
  echo "Prepared images and local deployment environment at /opt/sigil-chat/deploy"
  exit 0
fi

cd /opt/sigil-chat/deploy
docker compose --env-file deploy.env.local up -d
docker compose --env-file deploy.env.local ps
echo "Started Sigil Chat. Verify https://$public_host/healthz from an external network."
