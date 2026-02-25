#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

node "$SCRIPT_DIR/process-doc.mjs" "$@"
node "$SCRIPT_DIR/generate-latest.mjs"
node "$SCRIPT_DIR/generate-pages-index.mjs"

git -C "$REPO_ROOT" add \
  platforms \
  release-assets \
  latest.json \
  _site \
  meta/apps.json

git -C "$REPO_ROOT" status -sb
