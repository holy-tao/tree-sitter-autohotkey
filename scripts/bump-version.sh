#!/usr/bin/env bash
#
# Bump the grammar version, sync Cargo.lock, and commit the result.
#
# Usage: scripts/bump-version.sh [patch|minor|major]

set -euo pipefail

level="${1:-patch}"
case "$level" in
  patch | minor | major) ;;
  *)
    echo "Usage: $0 [patch|minor|major]" >&2
    exit 1
    ;;
esac

# Run from the repo root regardless of where the script is invoked.
cd "$(dirname "$0")/.."

tree-sitter version --bump "$level"
cargo generate-lockfile # tree-sitter updates Cargo.toml but not Cargo.lock

version="$(tree-sitter version)"

git ls-files -m | xargs git add
git commit -m "Bump $version version"

echo "Bumped to $version and committed."
