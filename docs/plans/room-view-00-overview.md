# Room view -- overview

**Status:** **complete, 2026-08-16. Both sessions landed and every gate is green.** Two
sessions, client-only, and **no registered pin moved**, as the topic promised.

What shipped: pair-derived corner, tee and stub rotations; a fog frontier that counts
undisclosed neighbours for topology without ever drawing one; `#/game` at zoom 8 with a
dead-zone hero follow; every multi-neighbour wall tile synthesized from crossing
`wall_straight` runs so joins close by construction; and a procedural warrior figure
driven by published fields through the `v2-18` joint names.

**One obligation is still owed to a person at a foreground tab**: the visible review
rows in `docs/performance/v2-room-matrix.md` are `fail`/`pending re-review` and were
deliberately not marked passed. An automated tab is always `visibilityState: "hidden"`,
which stops `requestAnimationFrame`, so no agent can discharge them.

The `#/game` room and the character in it are below the standard the rest of the
project holds itself to: wall runs that read as disconnected along the explored edge,
corners that do not close, a player drawn as a plain cyan cylinder, and a camera that
neither follows the hero nor starts near enough to read. This topic fixes those four
things and nothing else.

**Everything here is `client/` and `web/`. No `crates/` file is touched, so no golden
hash can move** -- not `ROOM_HASH`, not `LAB_HASH`, not `LEARNED_INFERENCE_DIGEST`,
and `cargo test` and `node --test tools/wasm_check.js` are not gates for this topic.
State that expectation in each commit anyway; a pin moving here would mean the change
was not the change it claimed to be.

## Two corrections this topic starts from

**`#/game` does not render the procedural greybox.** `client/src/v2.ts` sets
`representativeRoom = true` whenever no `room`, stress or review query is given, so the
default route loads the **authored GLB kit** through
`client/src/render/room-environment.ts`. The procedural per-tile-box path in
`client/src/render/environment.ts` is reachable only via `?room=procedural` or
`?stress=greybox`. The page copy in `web/index.html` still says "rendered through the
v2 procedural GPU greybox" and is stale prose; session 1 fixes it, because a wrong
comment is worse than no comment.

**The `#/game` hero has no articulated pose.** Every dungeon scenario sets
`articulated: None` in `crates/sim/src/scenario.rs`; only `Scenario::articulated_duel`
carries joints, and its own comment calls it "the only shipped articulated
construction fixture before v2-18". The pose channel `#/arena` draws does not exist on
this route. It is not needed: the legacy frame row already publishes
`UNIT_LIMB_ANGLE_RAW`, `UNIT_LIMB_REACH`, `UNIT_LIMB_SPIN`, `UNIT_LIMB_SWING`,
`UNIT_LIMB_SWING_LEFT`, `UNIT_SLOT0_ACTION`, `UNIT_SLOT1_ACTION` and the hit, block and
parry flashes (`client/src/protocol/abi.generated.ts`) -- both arms, both held items
and the swing state.

## Session order

| session | file | contents |
|---|---|---|
| 1 | [`room-view-01-walls-fog-and-camera.md`](room-view-01-walls-fog-and-camera.md) | corner rotation, the fog-frontier decision, camera zoom and follow |
| 2 | [`room-view-02-corner-joins-and-figure.md`](room-view-02-corner-joins-and-figure.md) | synthesized corner joins, the procedural figure behind a rig-shaped seam |

Session 1 is independent. Session 2 depends on session 1 only in that both touch
`chooseRoomWall`'s callers, and doing the rotation first keeps the join work honest --
there is no point synthesizing a join for a corner that is facing the wrong way.

## Constants introduced

- an initial fixed zoom for `#/game`, passed the way `review=room` already passes one;
- a follow dead-zone and easing rate for the camera;
- the figure's segment proportions, expressed as fractions of the published
  `UNIT_RADIUS` rather than as absolute units, so a Brute and a Fighter scale from one
  table.

Every one of them gets its provenance written beside it, and a test that bounds it
from **both** sides. `AGENTS.md` records two camera constants that shipped bounded from
one side only and were satisfied by ranges far wider than the decision; do not add a
third.

## What must not move

`docs/performance/v2-room-matrix.md` is a live obligation, not a report: it pins the
asset hashes, the piece counts, the wall-topology sentence, the "20 draws" figure, the
review-camera API and the `roomCamera` query contract, and it carries six visible-review
criteria that are **all currently `fail`**. Both sessions update it in place, and
"Join coherence | fail" is the row session 2 exists to change.

`#/arena` deliberately **restates** the wall rule rather than importing it
(`client/src/arena/environment.ts`, with the reason written above it). Any change to
`chooseRoomWall` is mirrored there in the same commit, or
`the_arena_room_lays_the_kit_out_by_the_same_rule_the_greybox_does` fails across all 84
of its wall tiles.

## Verification

```powershell
npx tsc --noEmit
npm run build
node --test client/test/render-contract.test.mjs
node tools/check_docs.js
git diff --check
```

The visible check is owed to a person at a foreground tab and **cannot** be done from
an automated browser -- an automated tab is always `visibilityState: "hidden"`, which
stops `requestAnimationFrame` outright rather than throttling it. Run `npm run dev`,
open `/#/game`, and record the result against the room matrix's visible-review rows.
