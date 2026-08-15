# v2-18 — integrate representative Fighter and Brute rigs

**Goal:** replace debug bodies with one generated Fighter and Brute whose rigs,
equipment, regions, wounds, and severance follow the frozen pose/event contract.

**Depends on:** passed visual gate `v2-09` and mechanical gate `v2-17`.

**Golden expectation:** no legacy or articulated hash moves; presentation only.

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
