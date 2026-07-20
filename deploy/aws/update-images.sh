#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
manifest="${1:-}"
deploy_env="${DEPLOY_ENV:-$script_dir/deploy.env.local}"
previous_images="$deploy_env.previous-images"

if [[ -z "$manifest" || ! -f "$manifest" ]]; then
  echo "Usage: $0 <sigil-images.env>" >&2
  exit 64
fi

node "$script_dir/verify-release.mjs" "$manifest"
test -f "$deploy_env"

grep '^SIGIL_\(EVE\|GONK\|MIGRATE\|WEB\)_IMAGE=' "$deploy_env" > "$previous_images"
for key in SIGIL_EVE_IMAGE SIGIL_GONK_IMAGE SIGIL_MIGRATE_IMAGE SIGIL_WEB_IMAGE; do
  value="$(awk -F= -v key="$key" '$1 == key { print substr($0, length(key) + 2) }' "$manifest")"
  if grep -q "^${key}=" "$deploy_env"; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$deploy_env"
  else
    printf '%s=%s\n' "$key" "$value" >> "$deploy_env"
  fi
done
rm -f "$deploy_env.bak"

docker compose --env-file "$deploy_env" -f "$script_dir/compose.yaml" pull
docker compose --env-file "$deploy_env" -f "$script_dir/compose.yaml" up -d --remove-orphans
docker compose --env-file "$deploy_env" -f "$script_dir/compose.yaml" ps

echo "Updated from immutable image manifest. Roll back with:"
echo "  DEPLOY_ENV=$deploy_env $0 $previous_images"
