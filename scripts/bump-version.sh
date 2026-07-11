#!/usr/bin/env bash
#
# Bump the grammar version, sync Cargo.lock, and commit the result.
#
# Usage: scripts/bump-version.sh [patch|minor|major]

set -euo pipefail

if ! git diff --exit-code --quiet; then
    echo "Error: tracked files have been modified." >&2
    exit 1
fi

level="${1:-error}"
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
tree-sitter generate  # grammar version is baked into parser.c :(
cargo generate-lockfile # tree-sitter updates Cargo.toml but not Cargo.lock

git ls-files -m | xargs git add
git commit -m "Bump $level version"

echo "Bumped and committed."
