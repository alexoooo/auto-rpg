# Representative combatant asset contract

**Purpose:** Define the deterministic Fighter and Brute asset, semantic sidecar, validation, and sibling browser-loader boundary.
**Status:** current
**Canonical source:** this document, `tools/art/combatants-manifest.json`, and the pinned toolchain in `tools/toolchain.json`.
**Update when:** Combatant names, topology closure, materials, clips, skins, budgets, hashes, or loader failure behavior changes.

The asset, loader, and game-dress integration are current. Arena anatomy
detachment remains a separate consumer of the same semantic seam.

## Semantic and skin closure

`web/assets3d/combatants.glb` contains exactly two archetypes, Fighter and Brute.
They share the durable semantic seam:

```text
root pelvis torso head
arm_left hand_left arm_right hand_right
socket_weapon_left socket_weapon_right socket_shield
region_head region_torso region_left_arm region_right_arm region_legs
idle walk stagger fall
```

Each archetype has one actual glTF skin and one 16-bone armature. Every authored
mesh is bound to its archetype's exact skin; the validator refuses transform-only
stand-ins, missing joints, reordered bones, unbound meshes, extra nodes, or duplicate
names. `idle`, `walk`, `stagger`, and `fall` are cosmetic clips. There is no
attack clip: authoritative contacts and combat events remain the only sources of
hits, reactions, and detachment.

The fixture closes over 177 nodes, 135 meshes, 12 materials, 206,060 vertices,
76,220 triangles, eight animations, and two skins. It embeds three deterministic
painterly material sets: Fighter and Brute atlases decoded at 2048 x 2048, and a
shared equipment atlas decoded at 1024 x 1024. Their source SHA-256 values,
dimensions, metallic quadrants, and image-generation provenance are manifest
inputs.

## Reproducibility and validation

Pinned Blender 4.5.12 is the byte-reproduction authority. The combatant target
builds twice in independent clean scenes and refuses any byte difference:

```powershell
blender --background --factory-startup --python tools/art/build_slice.py -- --target combatants --verify
node tools/validate_combatants.js web/assets3d/combatants.glb
```

Meshes are authored as children of their armature, as Blender requires. After
export, `build_combatants.py` deterministically detaches only skinned mesh nodes
to glTF scene roots. Blender's own flatten-object option deliberately exempts
skinned meshes, while glTF validation recommends those nodes not remain beneath a
joint hierarchy. Binary buffers, skin joints, inverse-bind matrices, and mesh
transforms are unchanged by this JSON-graph normalization. Both Blender export and
the canonical glTF validator complete with zero warnings.

The committed identities are:

| Identity | SHA-256 |
|---|---|
| canonical build inputs | `5a330f273d69c88c180a5d3f4294284ace3cb507b6ddaf641ce559abc706c657` |
| semantic sidecar | `315fca274cad90f423c547c63a0758696be1cb697cd026ea24737a600d06dc92` |
| combatant GLB | `6b4e3225feb49799b0c73a057acf498342eed63461ca63509973d2cd016a84c5` |
| canonical validator report | `41c905bb1e90a798d8e8679203f1e2b23bf4e12f747d93d256951d2f22ea096a` |

GLB plus sidecar is 46,209,989 bytes. Conservative estimated GPU residency is
159,154,536 bytes (45,908,328 source plus 113,246,208 decoded textures), within
the 192 MiB residency budget and 64 MiB payload budget.

The authored shape contract is camera-scale evidence, not an aesthetic adjective.
The Fighter has a tapered cuirass, helmet/face/plume hierarchy, separate pauldrons,
upper arms, forearms, hands, legs and boots, a broad kite shield, and an extruded
guarded sword. The Brute is broader after equal-height scaling, carries its head
forward, separates the same limb chain, and ends its long club in a heavy tapered
striking head. Mid-value rough steel, worn burgundy/umber cloth and restrained warm
skin carry the body; faction cyan/red stays on the separate gameplay cue.

Validation bounds shoulder width, head height, projected sword/shield/club area and
the equal-height 40-pixel silhouette. The asset tests additionally reconstruct the
rest-pose bone translations and require the torso, head, pelvis and every limb chain
to remain connected. `tools/art/preview_combatants.py` renders four pinned Blender
turntable views and one isometric game-camera still without making those review PNGs
runtime assets.

## Loader boundary

`client/src/render/combatant-assets.ts` is a sibling of the room loader, not an
extension of it. It preserves bounded streaming fetches, MIME and GLB header checks,
raw-byte SHA-256 pins, exact sidecar decoding, per-Scene concurrent-load memoization,
late-abort cleanup, and explicit fallback. It additionally requires exactly the two
skins, all 32 bones, eight clips, exact node/mesh/material closure, mesh-to-skeleton
binding, and pinned local bounds before publishing the container.

Loaded source roots and meshes remain disabled, invisible, non-pickable, and
non-shadow-receiving until a scene integration clones or adopts them. Validation
failure disposes the unpublished container. Disposing the published asset is
idempotent and clears its memo entry. Vite serves and copies only
`combatants.glb` and `combatants.json`; the validator report remains offline
provenance and is refused by development serving and omitted from production.

## Game dress

`combatant-dress.ts` clones one authored node and clip closure per visible body.
The GLB meshes are deliberately rigid joint-local pieces, although glTF also
records the source skins for interchange validation. Runtime rendering consumes
the stronger joint-local guarantee directly: it clears each clone mesh's skin,
parents the mesh to its named semantic joint, and leaves local position, rotation,
and scale at identity. This avoids applying Babylon's hidden glTF root, mesh pose,
inverse bind, and linked-bone conversion to vertices already expressed in joint
space.

Uniform standing-height scale belongs on the semantic root hierarchy, not
Babylon's loader closure. The loader closure is normalised once; authoritative
scene-space joints are copied into the semantic hierarchy, and each rigid piece
inherits that hierarchy exactly once. The actor regression composes current world
matrices before refreshing bounds and requires every active LOD piece -- explicitly
including `head_face` and `head_plume`, the bright pieces that exposed the defect --
to remain inside the published actor envelope. Removing the semantic parent makes
that regression fail on `head_face`, so it detects the live displacement rather
than merely inspecting a reporter.

The Fighter clone owns one PBR material per semantic mesh. That bounded clone keeps
the atlas wear while separating warm face and umber cloth from cool helmet,
breastplate, limbs, sword, and shield at the game camera's reviewed scale. It does
not recolour the shared checked asset or another body. Published loadout action
codes decide whether the carried blade and shield are present; action role decides
their active pose, not their between-action visibility. All cloned materials,
equipment meshes, faction cues, and the player-local readability light retire with
the actor under fog, reset, generation reuse, or disposal.

The faction cue is a thin 48-segment annulus, not a tube. Its centre is the
tallest pinned walkable source (`0.080`) plus a `0.004` clearance epsilon; a
negative depth bias keeps it readable without sinking beneath the floor. This is
a constant-time presentation calculation, and the renderer does not sample room
meshes each frame.
