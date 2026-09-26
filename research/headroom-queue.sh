#!/usr/bin/env bash
# The headroom audit's runs, in the order they were queued (skill ceiling session 05; the write-up
# is docs/analysis/2026-09-26-headroom.md, which prices each one). Every run is resumable: rerun a
# line and it picks up from its results.jsonl.
#
#   bash research/headroom-queue.sh bouts     # the headroom bouts, every audit body
#   bash research/headroom-queue.sh drills    # the headroom drills, every audit body
#   bash research/headroom-queue.sh stone     # orderings, footwork, the idle gate, the attribute audit
#
# Lanes: the owner's budget is 16 for this session, beside other work on the machine.
set -u
cd "$(dirname "$0")/.."
which="${1:-}"
DRILL_EXPERTS="expert@c8,h1;expert-persist@c8,h1;expert@c4,h1"

case "$which" in
  bouts)
    node research/headroom.mjs --exp headroom --pairs 6 --curve-pairs 3 --ladder-pairs 12 --lanes "${LANES:-8}" --job-minutes 120
    ;;
  drills)
    bodies=$(node --input-type=module -e "import { AUDIT_BUILDS } from './research/headroom-builds.mjs'; console.log(AUDIT_BUILDS.map((b) => b.name).join(' '))")
    for body in $bodies; do
      minds=""
      case "$body" in human-*) minds="humanoid-duelist" ;; esac
      node research/drills.mjs --build "$body" --obuild default --runs "${RUNS:-24}" --drills survive-cut,punish-miss,land-clean-blow \
        --minds "$minds" --experts "$DRILL_EXPERTS" --lanes "${LANES:-8}" --job-minutes 60 --out "research/runs/headroom-drills/$body-1s"
      node research/drills.mjs --build "$body" --obuild default --runs "${GI_RUNS:-12}" --drills get-inside \
        --minds "$minds" --experts "$DRILL_EXPERTS" --lanes "${LANES:-8}" --job-minutes 60 --out "research/runs/headroom-drills/$body-gi"
    done
    ;;
  stone)
    node research/headroom.mjs --exp orderings --pairs 16 --ladder-pairs 48 --lanes "${LANES:-6}" --job-minutes 120
    node research/headroom.mjs --exp footwork --pairs 16 --lanes "${LANES:-6}" --job-minutes 120
    node research/headroom.mjs --exp idle --pairs 1 --lanes "${LANES:-6}" --job-minutes 60
    node research/headroom.mjs --exp attributes --pairs 8 --levels ends --lanes "${LANES:-6}" --job-minutes 120
    for build in default mace maul fists; do
      node research/headroom.mjs --exp attributes --minds golem-duelist --pairs 32 --levels ends --build "$build" --lanes "${LANES:-6}" \
        --tag "duelist-$build" --job-minutes 30
    done
    ;;
  *) echo "usage: bash research/headroom-queue.sh bouts|drills|stone" >&2; exit 2 ;;
esac
