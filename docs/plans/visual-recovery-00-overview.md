# Visual production recovery -- overview

**Status:** sessions 01 through 05 implemented on 2026-08-17. Session 06 remains
open for owner acceptance and visible-foreground performance evidence.

The target is the permanent style reference `web/assets/CONCEPT.png`: a composed
isometric dungeon with complete architectural mass, deep exploration falloff, warm
local fire, readable human combatants, painterly low-saturation surfaces, and compact
game HUD. The current `#/game` route is the measured baseline, not a near miss:

| area | current baseline | target read |
|---|---|---|
| architecture | bottom/left enclosure omitted; walls rebuild and pop | stable complete room volume with local cutaway only where it occludes play |
| hero | primitive/skinned parts read as an abstract dark stack | unmistakable armoured person with head, torso, limbs, stance, weapon and shield at gameplay size |
| ground cue | torus centre is below the authored floor top | deliberate thin ring fully above the walkable surface |
| instruments | FPS and tactical presentation disappeared in the GPU route | always-visible FPS/worst-frame readout and a real Tactical view |
| fixtures | box bracket plus orange emissive sphere | wall-mounted sconce with bracket, flame silhouette, glow and local pool |
| surfaces | two floor variants and one repeated wall treatment | varied but coherent stone, edge wear, rubble and value grouping without visible tiling |

Style equivalence does not mean copying the concept pixels or inventing game systems
shown only in the painting. It means a blind crop from either image belongs to the
same visual family: warm umber near-black, painterly rough stone and metal, sparse
saturation, readable wall mass and small human silhouettes. The concept is never a
runtime input.

## Session order

| session | lands green | depends on |
|---|---|---|
| [01](visual-recovery-01-instruments-and-tactical.md) | FPS/worst-frame meter and restored World/Tactical presentation control | nothing |
| [02](visual-recovery-02-stable-walls.md) | four-sided stable wall identity, remembered-state reconciliation, local occlusion | 01 supplies Tactical comparison |
| [03](visual-recovery-03-authored-fighter.md) | ring clearance and a reauthored readable Fighter/Brute silhouette | 02 fixes the architectural scale around it |
| [04](visual-recovery-04-authored-torches.md) | recognizable sconces, flame treatment and bounded local light | 02 |
| [05](visual-recovery-05-material-composition.md) | varied seamless floor/wall material set and final environment value hierarchy | 02 and 04 |
| [06](visual-recovery-06-integrated-acceptance.md) | foreground browser matrix, performance evidence and owner decision | 01 through 05 |

Each session is independently landable and keeps the game playable. A green loader,
asset validator, render-contract suite, or clean console is necessary but never
visual acceptance. A session that changes a test which previously defended the wrong
picture must first mutate the protected line and observe that test fail.

## Authority and pin firewall

Sessions 01 and 02 are presentation-only. Session 03 may move only the combatant GLB,
sidecar, validator, generated TypeScript and their documented SHA-256/count/budget
pins. Sessions 04 and 05 may move only the equivalent room asset pins and exact
residency/count evidence. No session may move `BOW_HASH`, `LAB_HASH`, `ROOM_HASH`,
`BATTLE_HASH`, `SWAP_HASH`, `GOLDEN_STATE_HASH`, the combat-spec digest, learned
inference digest, articulated command/stream pins, exact trajectory pin, lifted
solver pin, or articulated-duel fingerprint. Any such move is isolation failure.

No `crates/` edit is planned. If implementation discovers missing publication data,
stop and write a separate append-only ABI plan instead of smuggling authority through
presentation.

## Visual review protocol

For every visual session capture the same four foreground views at 1536 x 936:

1. reset and paused, default fixed camera;
2. hero beside the near wall and a corner;
3. hero crossing current to remembered disclosure;
4. a shut door, an open door, two torches and one enemy in frame.

Compare beside `CONCEPT.png`, not from memory. Record wall continuity, occlusion,
human silhouette, ring clearance, torch form, material repetition, value hierarchy,
HUD obstruction and console state in `docs/performance/v2-room-matrix.md`. Automated
tabs can inspect synchronous state and screenshots, but cannot discharge visible rAF
or GPU performance. Session 06 remains open until the owner reviews a foreground tab.

## Topic verification

Every session runs its focused tests plus:

```powershell
node --test client/test/render-contract.test.mjs
node --test client/test/studio-shell.test.mjs
npm run check
npm run build
node tools/check_docs.js
git diff --check
```

Asset sessions additionally run the pinned Blender double export, the matching asset
validator and `node tools/check_toolchain.js`. Never run `cargo fmt`.
