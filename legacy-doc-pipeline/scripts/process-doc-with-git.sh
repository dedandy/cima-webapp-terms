#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

node "$SCRIPT_DIR/process-doc.mjs" "$@"

if git -C "$REPO_ROOT" add \
  platforms \
  release-assets \
  meta/apps.json; then
  echo "Staged updated files via git add."
else
  echo "Warning: git add failed. Please stage files manually." >&2
fi
