# Room view 02 -- corner joins and the procedural figure

**Status: completed 2026-08-16**, except the visible foreground check, which is owed
to a person at `/#/game` and recorded in the room matrix when it happens.

- Corners synthesized as planned, and tees/crosses with them: `chooseRoomWall` now
  returns placements -- one centreline `wall_straight` run per solid axis on every
  multi-neighbour tile, `wall_end` kept for stubs -- with the decision and its
  reversal path commented at the rule. Mirrored into `arenaWall`; the cross-rule
  test compares the two per tile over all 84 ring tiles and pins the ring at 88
  instances of one piece. Histogram moved as predicted before running: 184/0/0/4
  (160 + 2 * (4 + 8)), stress geometry 1712 -> 1724, draws 20 -> 18, compact review
  208 -> 212; the same numbers updated together in `room-stress.ts`,
  `tools/art/export.py` and the room matrix. Red-first: the rewritten orientation
  test, the fixture census and the arena cross-rule all failed against the old
  authored-corner rule before the change landed.
- The figure landed behind the seam: `render/rig-names.ts` (the v2-18 name lists,
  Babylon-free so `arena/geometry.ts` re-exports them under its "no Babylon"
  contract) and `render/rig-nodes.ts` (the shared hierarchy builder, now also used
  by the arena's `#rigFor`, so the two pages build one chain). `render/figure.ts`
  maps the published frame row onto those joints -- blade as the exact
  `World::blade` segment, walk from the published stride clock gated by published
  velocity, Canvas-rig proportions with provenance -- and `actors.ts` builds one
  fixed-part figure per unit (12 upright, 7 crawler; blade/shield toggle rather
  than churn). One deviation from this file's driving table, with reason: the
  frame's `UNIT_LIMB_SWING_LEFT` is the swing phase's remaining ticks
  (`web/main.js` reads it as `swingLeft`), not a left-arm channel, and
  `UNIT_STRIDE_PHASE` is a published walk clock -- so the off arm is a carry pose
  plus walk swing and the legs read the sim's own stride phase instead of a
  differenced displacement, which is stricter than the plan asked (no client
  clock at all; a pinned snapshot pins the whole pose).
- `the_procedural_figure_carries_the_v2_18_joint_names_and_published_fields_drive_it`
  pins the joint list against the arena's, the exact blade endpoints from both
  sides, mutate-not-rebuild posing, the blade/shield role gates, walk gating, and
  radius scaling; its teeth were shown by flipping the chirality (`left = -sin`)
  and watching the hilt assertion fail. The registry test now counts live scene
  meshes against `FIGURE_UPRIGHT_PARTS` from both sides.
- Gates: render contract 83/83; `npx tsc --noEmit` pass; `npm run build` pass;
  studio-shell 23/23; `node tools/check_docs.js` pass after recomputing nine
  drifted test anchors in `v2-reference-matrix.md`; `git diff --check` clean.
- No `crates/` file was touched; no registered pin can have moved.

The original plan follows.

**Status:** planned, not started. Client-only; no registered pin moves.
Depends on [session 01](room-view-01-walls-fog-and-camera.md). See
[the overview](room-view-00-overview.md).

## 1. The corner pieces cannot reach the straights

Fixing the rotation does not close the joins, because the authored pieces are on two
different alignment conventions. From `tools/art/room.py`:

| piece | where its wall sits |
|---|---|
| `wall_straight` | the **tile centreline**, `z` within about `+-0.09` |
| `wall_end` | centreline, but only **0.62 long in a 1.0 tile** |
| `wall_inside` | a centreline run **plus a spur hugging the tile edge** |
| `wall_outside` | both arms on the **tile edges**, around `+-0.41` |

An arm at the tile edge cannot meet a neighbour's run on the centreline. This is
authored into the GLB, and `docs/performance/v2-room-matrix.md` already records
**"Join coherence | fail"** for exactly it.

**Synthesize corners client-side from the straight piece.** A corner tile becomes two
rotated `wall_straight` instances -- one per solid neighbour direction -- meeting at
the tile centre, instead of one `wall_inside` or `wall_outside`. Both arms are then on
the same convention as every run they touch, so the joins close by construction.

The alternative, re-authoring the kit in Blender, means regenerating the GLB and
re-pinning four SHA-256 values across `client/src/render/room-asset.generated.ts`, the
sidecar, the validator report and the room matrix -- and it needs an artist. The
client-side route needs neither and moves only instance counts. Record the choice and
the reason in the room matrix beside the row it changes; the authored corner pieces
stay in the kit unused rather than being deleted, so the decision is reversible.

### The counts this moves, written down in three places

`the_fixed_room_stress_fixture_has_the_named_asset_hash_population_and_piece_counts`
pins the histogram `{straight: 160, inside: 4, outside: 8, end: 4}`, the geometry and
instance totals, and `draws: 20`. Synthesizing corners changes all of them. The same
numbers are duplicated in `client/src/render/room-stress.ts` and `tools/art/export.py`
-- update all three, or the next reader believes whichever they open first.

Predict the new histogram from the rule before running the fixture, and check the run
against the prediction. A count you can only produce by running the thing you are
testing is not a gate.

## 2. The character

Replace the cylinder in `client/src/render/actors.ts` -- `#source()` builds a
`CreateCylinder` per `faction:kind`, blue for faction 0, and that is the player in the
screenshot -- with a node hierarchy: pelvis, torso, head, two arms with hands, two
legs, and a weapon socket per hand.

**Reuse the shape the Arena already proved.** `#rigFor` in
`client/src/arena/scene.ts` builds exactly this -- `root/pelvis/torso/head`, `arm_*`,
`hand_*`, `socket_weapon_*`, `socket_shield` -- as `TransformNode`s with primitive
proxies. It is deliberately not a skinned skeleton, which is the right call here too.

**Extract, do not import across.** The arena may not import worker- or wasm-shaped
modules (`client/test/studio-shell.test.mjs` enforces it), so lift the rig builder into
a neutral module both sides consume rather than reaching from one into the other.

### What drives it

The legacy frame row carries more than enough
(`client/src/protocol/abi.generated.ts`):

| published field | joint |
|---|---|
| `UNIT_X`, `UNIT_Y`, `UNIT_FACING_RAW`, `UNIT_RADIUS` | `root` position, yaw, uniform scale |
| `UNIT_LIMB_ANGLE_RAW`, `UNIT_LIMB_REACH`, `UNIT_LIMB_SPIN`, `UNIT_LIMB_SWING` | `arm_r` |
| `UNIT_LIMB_SWING_LEFT` | `arm_l` |
| `UNIT_SLOT0_ACTION`, `UNIT_SLOT1_ACTION`, `UNIT_ACTION_LENGTH` | which weapon mesh hangs in which socket, and how long |
| `UNIT_HIT_FLASH`, `UNIT_BLOCK_FLASH`, `UNIT_PARRY_FLASH` | material response |

**Legs are not published and must not pretend to be.** Derive a walk phase from the
unit's own frame-to-frame displacement, client-side. That is honest presentation --
presentation owns no authority -- and it must be written down as derived rather than
observed, so nobody later reads a leg angle as simulation state.

### The GLB-ready seam

The whole point of doing it this way is that the binding, not the meshes, is the
durable part. Define one interface that maps the table above to **named joints**, and
have the procedural figure implement it. A future authored rig implements the same
interface and nothing else in the renderer moves. Keep the joint names identical to the
arena's so a rig authored for one works in the other.

A character GLB will additionally need a **new sibling loader**, because
`client/src/render/room-assets.ts` cannot be reused: its URLs are module constants, it
pins three SHA-256s, it requires an exact mesh and material name closure, and it
**requires zero skeletons and zero animations** -- which rejects a rigged character by
construction. Its fetch, byte-cap, magic-number and hash scaffolding *is* reusable, and
is the part to factor out when that day comes. Do not build the loader now.

### Tests this moves

`persistent_units_retire_every_registry_before_a_generation_is_reused` compares
`debug.snapshot()` exactly, and `actors.ts` publishes `meshes: #sources.size`, so a
multi-mesh figure moves that number. The test's *argument* -- that every registry is
retired before a generation is reused -- is unaffected and must stay green; only the
count moves. Retirement is the thing to be careful about: a figure is many nodes and
many instances, and leaking one per death is a slow leak that no current test would
name.

## Verification

```powershell
npx tsc --noEmit
npm run build
node --test client/test/render-contract.test.mjs
node tools/check_docs.js
git diff --check
```

Predicted pin movement: **none**. Update `docs/performance/v2-room-matrix.md`: the
piece counts, the draw count, and the **"Join coherence"** row this session exists to
change. Then the visible check, from a foreground tab, by a person: `npm run dev`,
`/#/game` -- corners closed, no stubs along the frontier, and a figure whose arms move
with its swings.

`docs/plans/v2-18-combatant-integration.md` is amended by this session, not replaced:
the procedural figure delivers the visible result while the authored representative
rigs remain outstanding.
