#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
manifest="${1:-}"
deploy_env="${DEPLOY_ENV:-$script_dir/deploy.env.local}"
previous_images="$deploy_env.previous-images"
candidate_env="$deploy_env.candidate"
rollback_env="$deploy_env.rollback"
compose_file="$script_dir/compose.yaml"

if [[ -z "$manifest" || ! -f "$manifest" ]]; then
  echo "Usage: $0 <sigil-images.env>" >&2
  exit 64
fi

"$script_dir/verify-release.sh" "$manifest"
test -f "$deploy_env"

cp "$deploy_env" "$rollback_env"
cp "$deploy_env" "$candidate_env"
chmod 0600 "$rollback_env" "$candidate_env"
grep '^SIGIL_\(EVE\|GONK\|MIGRATE\|WEB\)_IMAGE=' "$deploy_env" > "$previous_images"
for key in SIGIL_EVE_IMAGE SIGIL_GONK_IMAGE SIGIL_MIGRATE_IMAGE SIGIL_WEB_IMAGE; do
  value="$(awk -F= -v key="$key" '$1 == key { print substr($0, length(key) + 2) }' "$manifest")"
  if grep -q "^${key}=" "$candidate_env"; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$candidate_env"
  else
    printf '%s=%s\n' "$key" "$value" >> "$candidate_env"
  fi
done
rm -f "$candidate_env.bak"

compose_candidate() {
  docker compose --env-file "$candidate_env" -f "$compose_file" "$@"
}

compose_current() {
  docker compose --env-file "$deploy_env" -f "$compose_file" "$@"
}

restore_previous_release() {
  cp "$rollback_env" "$deploy_env"
  compose_current up -d --wait --no-deps web gonk eve
  compose_current up -d --wait --no-deps edge
}

compose_candidate pull
compose_current stop edge web

if ! compose_candidate up --abort-on-container-exit --exit-code-from migrate migrate; then
  echo "Migration failed; restoring the previous application images." >&2
  restore_previous_release || true
  exit 1
fi

mv "$candidate_env" "$deploy_env"

if ! compose_current up -d --wait --no-deps web gonk eve; then
  echo "Private-service readiness failed; restoring the previous release." >&2
  restore_previous_release || true
  exit 1
fi

if ! compose_current up -d --wait --no-deps edge; then
  echo "Edge readiness failed; restoring the previous release." >&2
  restore_previous_release || true
  exit 1
fi

compose_current ps

rm -f "$rollback_env"

echo "Release healthy. Roll back to the immediately previous manifest with:"
echo "  DEPLOY_ENV=$deploy_env $0 $previous_images"
