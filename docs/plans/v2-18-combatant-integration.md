# v2-18 — integrate representative Fighter and Brute rigs

**Goal:** replace debug bodies with one generated Fighter and Brute whose rigs,
equipment, regions, wounds, and severance follow the frozen pose/event contract.

**Depends on:** passed visual gate `v2-09` and mechanical gate `v2-17`.

**Golden expectation:** no legacy or articulated hash moves; presentation only.

## Amendment, 2026-08-16: partially discharged, and unblocked

Two things changed under this plan and it is amended rather than replaced.

**Its dependency is closer than it was.** `v2-17`'s mechanical gate failed on, among
other things, "fewer than 10% of trials reach the clock" measured at 99.0%. Smart134
doubled the arm bearing slew ceiling and the windmill control now reaches the clock in
3.5% of duels -- the first configuration to clear that criterion. The gate as a whole
is still unpassed; its other criteria and its thresholds still need the amendment
`docs/performance/v2-articulated-gate.md` calls for. But this plan's blocker is no
longer "the model cannot end a fight".

**Its visible half is being delivered without the assets.**
[`room-view-02-corner-joins-and-figure.md`](room-view-02-corner-joins-and-figure.md)
replaces the `#/game` cylinder with a **procedural** figure assembled from primitives
and driven by published fields, using the semantic joint names listed below so that an
authored rig is a drop-in replacement rather than a rewrite. That session therefore
discharges the *player-facing* result -- a character with arms that move because the
simulation moved them -- and leaves this plan owning what only an artist can deliver:
authored Fighter and Brute meshes, the `combatants.glb` asset contract, the locomotion
clips, and the calibration gates below.

Two constraints that session establishes and this one inherits:

- **The joint names are the seam.** `root/pelvis/torso/head`, `arm_*`, `hand_*`,
  `socket_weapon_*`, `socket_shield` already exist as a `TransformNode` hierarchy in
  the Arena, and the procedural figure reuses them. Keep the list below identical.
- **`room-assets.ts` cannot load a character.** Its URLs are module constants, it pins
  three SHA-256 values, it demands an exact mesh and material name closure, and it
  **requires zero skeletons and zero animations** -- which rejects a rigged body by
  construction. A sibling loader is needed; its fetch, byte-cap, magic-number and hash
  scaffolding is the reusable part.

`#/game` also has no articulated pose to drive a rig from -- every dungeon scenario
sets `articulated: None`, and only `Scenario::articulated_duel` carries joints. An
authored rig on that route is driven by the same legacy limb fields the procedural
figure uses. A rig driven by *pose rows*, as this plan's asset contract describes, is
`#/arena` today and `#/game` only if a future session gives the dungeon articulated
units -- which is a mechanics decision, not a presentation one, and is not authorized
here.

## Asset contract

Extend `tools/art/build_slice.py` with `fighter` and `brute` targets and commit
`web/assets3d/combatants.json` semantic names:

```text
root pelvis torso head
arm_left hand_left arm_right hand_right
socket_weapon_left socket_weapon_right socket_shield
region_head region_torso region_left_arm region_right_arm region_legs
idle walk stagger fall
```

Fighter and Brute share semantic names, not topology. Visual dimensions and equipment
sockets are validated against immutable sim metadata. Lower-body clips supply
locomotion/secondary motion; authoritative hands, weapon, and shield are driven from
pose rows. No attack animation creates a hit. Detachment and reactions begin only
from events, and cosmetics never feed back into simulation.

## Calibration and repeated gates

- Silhouettes/equipment read at 100--250 vertical pixels without cyan outlines.
- Feet match authoritative ground; both hands/endpoints agree throughout the range,
  including the intermediate height.
- Shield center/normal/extents agree during turning and height changes.
- Region reactions and either-arm severance agree with event identity/generation.
- Fog prevents hidden mesh, shadow, effect, sound, picking, and detached-part leaks.
- No per-facing/per-animation/per-asset correction enters TypeScript.

Re-run the named visual matrix with rigged bodies and grey/unskinned controls last.
The complete representative slice remains <=64 MiB compressed and <=512 MiB
estimated peak GPU residency. Re-run all `v2-17` mechanical recordings and stream
digests; assets must not move them.

## Verification

```powershell
node tools/check_toolchain.js
blender --background --python tools/art/build_slice.py -- --target combatants --verify
node tools/validate_assets.js web/assets3d/room_slice.glb web/assets3d/combatants.glb
npm run check
npm run build
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
git diff --check
```

Record `pass`, `revise`, or `stop` for the integrated slice. Bulk variants, full
roster, audio, voice, and campaign content remain deferred even after a pass.
