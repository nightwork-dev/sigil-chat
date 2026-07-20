#!/usr/bin/env bash
# Run on the provisioned EC2 host as root. This never calls AWS and never
# accepts secrets on the command line.
set -Eeuo pipefail

usage() {
  echo "Usage: $0 --public-host HOST --mode prepare" >&2
  exit 64
}

public_host=""
mode=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --public-host) public_host=${2:?missing public host}; shift 2 ;;
    --mode) mode=${2:?missing mode}; shift 2 ;;
    *) usage ;;
  esac
done

[[ $EUID -eq 0 ]] || { echo "must run as root" >&2; exit 1; }
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$script_dir/compose.yaml" ]] || { echo "deployment directory has no Compose file" >&2; exit 1; }
[[ $public_host =~ ^[a-z0-9][a-z0-9.-]*[a-z0-9]$ && $public_host != *.invalid ]] || {
  echo "a real lowercase DNS host is required" >&2; exit 1;
}
[[ $mode == prepare ]] || usage

install -d -m 0755 /opt/sigil-chat/deploy
install -d -m 0700 /srv/sigil-chat/secrets
install -d -m 0700 -o 10004 -g 10004 /srv/sigil-chat/caddy-data /srv/sigil-chat/caddy-config
cp "$script_dir/compose.yaml" /opt/sigil-chat/deploy/compose.yaml
cp "$script_dir/Caddyfile" /opt/sigil-chat/deploy/Caddyfile
cp "$script_dir/update-images.sh" /opt/sigil-chat/deploy/update-images.sh
cp "$script_dir/verify-release.sh" /opt/sigil-chat/deploy/verify-release.sh
cp "$script_dir/verify-release.mjs" /opt/sigil-chat/deploy/verify-release.mjs
chmod 0755 /opt/sigil-chat/deploy/update-images.sh /opt/sigil-chat/deploy/verify-release.sh

for secret in better_auth_secret gonk_mcp_key invite_token_pepper; do
  path="/srv/sigil-chat/secrets/$secret"
  if [[ ! -s $path ]]; then
    umask 077
    openssl rand -base64 48 >"$path"
  fi
  chmod 0444 "$path"
done

cat >/opt/sigil-chat/deploy/deploy.env.local <<EOF
PUBLIC_HOST=$public_host
SIGIL_INSTALLATION_ID=sigil-chat-$(date -u +%Y%m%dT%H%M%SZ)
SIGIL_SECRET_DIR=/srv/sigil-chat/secrets
SIGIL_MIGRATE_IMAGE=replace-with-release-manifest
SIGIL_WEB_IMAGE=replace-with-release-manifest
SIGIL_EVE_IMAGE=replace-with-release-manifest
SIGIL_GONK_IMAGE=replace-with-release-manifest
EOF
chmod 0600 /opt/sigil-chat/deploy/deploy.env.local
echo "Prepared local deployment environment at /opt/sigil-chat/deploy"
