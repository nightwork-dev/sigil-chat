#!/usr/bin/env bash
set -euo pipefail

manifest="${1:-}"

if [[ -z "$manifest" || ! -f "$manifest" ]]; then
  echo "Usage: $0 <sigil-images.env>" >&2
  exit 64
fi

declare -A seen=()

while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
  line="${raw_line#"${raw_line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  [[ -z "$line" || "$line" == \#* ]] && continue

  [[ "$line" == *=* ]] || {
    echo "Invalid manifest line: $line" >&2
    exit 1
  }

  key="${line%%=*}"
  value="${line#*=}"
  case "$key" in
    SIGIL_EVE_IMAGE) target="eve" ;;
    SIGIL_GONK_IMAGE) target="gonk" ;;
    SIGIL_MIGRATE_IMAGE) target="migrate" ;;
    SIGIL_WEB_IMAGE) target="web" ;;
    *)
      echo "Unexpected manifest key: $key" >&2
      exit 1
      ;;
  esac

  [[ -z "${seen[$key]:-}" ]] || {
    echo "Duplicate manifest key: $key" >&2
    exit 1
  }
  [[ "$value" =~ ^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com/sigil-chat-${target}@sha256:[a-f0-9]{64}$ ]] || {
    echo "Image is not an immutable private ECR digest: $key" >&2
    exit 1
  }
  seen[$key]=1
done < "$manifest"

for key in SIGIL_EVE_IMAGE SIGIL_GONK_IMAGE SIGIL_MIGRATE_IMAGE SIGIL_WEB_IMAGE; do
  [[ -n "${seen[$key]:-}" ]] || {
    echo "Missing manifest key: $key" >&2
    exit 1
  }
done

echo "release manifest valid"
