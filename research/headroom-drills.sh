#!/usr/bin/env bash
# The headroom audit's drills (skill ceiling session 05; docs/analysis/2026-09-26-headroom.md): every
# audit body, played by the subject against the stone default, on the four drills that read a body's
# skill (survive-cut, punish-miss, land-clean-blow, and get-inside at half the runs). Rungs: the
# ladder, the family's duelist for a human, and the three experts.
#
#   LANES=4 UNTIL=2026-09-26T14:00 bash research/headroom-drills.sh [reverse]
#
# Several copies may run at once, over the same list or in reverse: each claims a body by making
# research/runs/headroom-drills/<body>.claim (mkdir is atomic) and skips a body another has claimed,
# so no two runs ever write one directory. Every run is resumable; to resume a body after a cut,
# remove its claim and rerun.
set -u
cd "$(dirname "$0")/.."
DRILL_EXPERTS="expert@c8,h1;expert-persist@c8,h1;expert@c4,h1"
base=research/runs/headroom-drills
mkdir -p "$base"
bodies=$(node --input-type=module -e "import { AUDIT_BUILDS } from './research/headroom-builds.mjs'; console.log(AUDIT_BUILDS.map((b) => b.name).join(' '))")
if [ "${1:-}" = "reverse" ]; then bodies=$(echo "$bodies" | tr ' ' '\n' | tac | tr '\n' ' '); fi
until_arg=()
if [ -n "${UNTIL:-}" ]; then until_arg=(--until "$UNTIL"); fi
for body in $bodies; do
  mkdir "$base/$body.claim" 2>/dev/null || continue
  minds=""
  case "$body" in human-*) minds="humanoid-duelist" ;; skeleton-*) minds="skeleton-duelist" ;; esac
  echo "== $body $(date -Iseconds)"
  node research/drills.mjs --build "$body" --obuild default --runs "${RUNS:-24}" --drills survive-cut,punish-miss,land-clean-blow \
    --minds "$minds" --experts "$DRILL_EXPERTS" --lanes "${LANES:-4}" --job-minutes 60 "${until_arg[@]}" --out "$base/$body-1s"
  node research/drills.mjs --build "$body" --obuild default --runs "${GI_RUNS:-12}" --drills get-inside \
    --minds "$minds" --experts "$DRILL_EXPERTS" --lanes "${LANES:-4}" --job-minutes 60 "${until_arg[@]}" --out "$base/$body-gi"
done
