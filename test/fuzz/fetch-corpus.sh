#!/usr/bin/env bash
#
# Fetch .ahk files from a set of GitHub repos into a local seed corpus.
#
# Sources are read from test/fuzz/corpus-sources.txt (one "owner/repo[@branch]"
# per line) plus any extra "owner/repo[@branch]" args on the command line. Each
# repo is shallow-cloned and every *.ahk/*.ah2 is copied into the output dir
# under a flattened, collision-proof name, deduplicated by content:
#
#     corpus/<owner_repo>__<path_within_repo>.ahk
#
# A flat pile of standalone files is what downstream fuzzers want as a seed
# corpus (tree-sitter fuzz-action / libFuzzer, tree-crasher). The soundness
# harness (soundness.ps1) parses each file independently in its default mode,
# so it doesn't need the repo tree either. Dedup drops the copies of vendored
# libraries these repos share, keeping the corpus lean and findings unique.
#
# The output dir is gitignored -- these files are NOT committed.
#
# Usage:
#   test/fuzz/fetch-corpus.sh [options] [owner/repo[@branch] ...]
#
# Options:
#   -o, --out DIR       Output directory (default: test/fuzz/corpus)
#   -m, --manifest FILE Sources manifest (default: test/fuzz/corpus-sources.txt)
#   -c, --clean         Wipe the output dir before fetching
#       --no-dedup      Keep byte-identical files from different repos
#   -h, --help          Show this help
#
# Requires: git, and one of sha256sum / shasum (for dedup).

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

out_dir="$script_dir/corpus"
manifest="$script_dir/corpus-sources.txt"
clean=0
dedup=1
cli_sources=()

usage() { sed -n '2,/^set -euo/{/^set -euo/d;s/^# \{0,1\}//p}' "${BASH_SOURCE[0]}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    -o|--out)      out_dir="$2"; shift 2 ;;
    -m|--manifest) manifest="$2"; shift 2 ;;
    -c|--clean)    clean=1; shift ;;
    --no-dedup)    dedup=0; shift ;;
    -h|--help)     usage; exit 0 ;;
    -*)            echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
    *)             cli_sources+=("$1"); shift ;;
  esac
done

command -v git >/dev/null 2>&1 || { echo "error: git not found on PATH" >&2; exit 1; }

# Pick a sha256 tool for dedup (optional).
sha_cmd=""
if [ "$dedup" -eq 1 ]; then
  if command -v sha256sum >/dev/null 2>&1; then
    sha_cmd="sha256sum"
  elif command -v shasum >/dev/null 2>&1; then
    sha_cmd="shasum -a 256"
  else
    echo "warning: no sha256sum/shasum found; disabling dedup" >&2
    dedup=0
  fi
fi

# Gather sources: manifest lines first, then CLI args.
sources=()
if [ -f "$manifest" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%%#*}"                       # strip comments
    line="$(printf '%s' "$line" | tr -d '[:space:]')"
    [ -n "$line" ] && sources+=("$line")
  done < "$manifest"
elif [ ${#cli_sources[@]} -eq 0 ]; then
  echo "error: manifest not found ($manifest) and no repos given on CLI" >&2
  exit 1
fi
sources+=("${cli_sources[@]:-}")

if [ "$clean" -eq 1 ] && [ -d "$out_dir" ]; then
  echo ">> cleaning $out_dir"
  rm -rf "$out_dir"
fi
mkdir -p "$out_dir"

tmp_root="$(mktemp -d)"
trap 'rm -rf "$tmp_root"' EXIT

# Track content hashes already written, for dedup across repos.
declare -A seen_hash=()
total=0

for src in "${sources[@]}"; do
  [ -n "$src" ] || continue

  repo="${src%@*}"
  branch=""
  [ "$src" != "$repo" ] && branch="${src##*@}"

  slug="$(printf '%s' "$repo" | tr '/' '_')"
  dest="$tmp_root/$slug"

  echo ">> ${repo}${branch:+@$branch}"
  clone_args=(--depth 1 --single-branch --no-tags --quiet)
  [ -n "$branch" ] && clone_args+=(--branch "$branch")
  if ! git clone "${clone_args[@]}" "https://github.com/${repo}.git" "$dest" 2>/dev/null; then
    echo "   !! clone failed, skipping" >&2
    continue
  fi

  count=0
  # -print0 / read -d '' handles paths with spaces safely.
  while IFS= read -r -d '' f; do
    rel="${f#"$dest"/}"
    # Flatten path into a unique, traceable name: owner_repo__dir_sub_file.ahk
    flat="${slug}__$(printf '%s' "$rel" | tr '/\\' '__')"

    if [ "$dedup" -eq 1 ]; then
      h="$($sha_cmd "$f" | cut -d' ' -f1)"
      if [ -n "${seen_hash[$h]:-}" ]; then continue; fi
      seen_hash[$h]=1
    fi

    cp "$f" "$out_dir/$flat"
    count=$((count + 1))
  done < <(find "$dest" -type f \( -iname '*.ahk' -o -iname '*.ah2' \) -print0)

  echo "   + $count file(s)"
  total=$((total + count))
  rm -rf "$dest"
done

echo ">> done: $total unique file(s) in $out_dir"
