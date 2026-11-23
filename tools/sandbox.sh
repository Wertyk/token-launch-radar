#!/usr/bin/env bash
set -euo pipefail

worktree=false
case "${1:-}" in
  '') ;;
  --worktree) worktree=true; shift ;;
  *) printf 'Usage: bash tools/sandbox.sh [--worktree]\n' >&2; exit 1 ;;
esac
if (( $# != 0 )); then
  printf 'Usage: bash tools/sandbox.sh [--worktree]\n' >&2
  exit 1
fi

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
kit_input=$(cd -- "${RADAR_KIT_INPUT:-../token-radar-kit/token-radar-01-kit/input}" && pwd -P)
tmp_base=${TMPDIR:-/tmp}
scratch=$(mktemp -d "${tmp_base%/}/radar-sandbox.XXXXXXXX")
bot="$scratch/bot"
container=
cleanup() {
  if [[ -n "$container" ]]; then docker rm -f "$container" >/dev/null 2>&1 || true; fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$bot" "$scratch/o1" "$scratch/o2"
if "$worktree"; then
  printf 'Copying the working tree into /bot\n'
  COPYFILE_DISABLE=1 tar --exclude='./node_modules' --exclude='./out' --exclude='./.git' -cf - . |
    tar -xf - -C "$bot"
else
  printf 'Archiving committed HEAD into /bot (%s)\n' "$(git rev-parse --short HEAD)"
  git archive HEAD | tar -x -C "$bot"
fi

timer=timeout
if ! command -v "$timer" >/dev/null; then timer=gtimeout; fi
if ! command -v "$timer" >/dev/null; then
  printf 'sandbox needs timeout or gtimeout to enforce the 120 second limit\n' >&2
  exit 1
fi

run() {
  local iteration=$1 output=$2 started=$SECONDS status=0
  container="radar-${scratch##*/}-$iteration"
  "$timer" --kill-after=5s 120s docker run --rm --name "$container" --pull=never \
    --network none --cpus 1 --memory 1g \
    -v "$bot:/bot:ro" -v "$kit_input:/input:ro" -v "$output:/output" \
    node:22.23.4-slim node /bot/main.ts || status=$?
  local elapsed=$(( SECONDS - started ))
  printf 'Run %s took %s s (exit %s)\n' "$iteration" "$elapsed" "$status"
  if (( status == 124 || status == 137 || elapsed > 120 )); then
    printf 'Run %s exceeded the 120 s limit or was killed\n' "$iteration" >&2
    return 1
  fi
  if (( status != 0 )); then return "$status"; fi
  container=
}

run 1 "$scratch/o1"
run 2 "$scratch/o2"
diff -r "$scratch/o1" "$scratch/o2"
node tools/gate.ts --out "$scratch/o1" --input "$kit_input/snapshot.json"
printf 'Sandbox passed. Both runs met the time limit, wrote identical bytes, and passed the gate.\n'
