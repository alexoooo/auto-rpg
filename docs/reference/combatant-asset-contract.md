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

The fixture closes over 83 nodes, 41 meshes, seven materials, 2,767 vertices,
1,888 triangles, eight animations, and two skins. It embeds one deterministic
512 � 512 atlas derived from the pinned
`tools/art/textures/concept-material-atlas.png` source. The source texture's
SHA-256, dimensions, and provenance are manifest inputs.

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
| canonical build inputs | `6f0f5901e5f6264f1e8d71b8247d26099a5543ae3221d2581268377c37dd36cd` |
| semantic sidecar | `891ffaee0e2c0c9a688e468a428125b27756c6eb8310a839459b47958f4a54e3` |
| combatant GLB | `fc97d65b9a94e5b6e4d4fa71feee4a6e3cfedc4586d9f870e0d45484e460c494` |
| canonical validator report | `30efbc643157d3a10ae71d39d0a389e6ae2996e88f09b95f771b497fe23b0eda` |

The GLB is 740,956 bytes; GLB plus sidecar is 762,769 bytes. Conservative estimated
GPU residency is 1,689,312 bytes, within the manifest's 64 MiB limit.

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

`combatant-dress.ts` clones one skeleton closure per visible body. The GLB's
meshes are deliberately rigid joint-local pieces, so the game clone uses identity
inverse binds: applying the exported armature-space inverse bind to those already
local vertices subtracts the bind pose twice and scatters the body. Skinned meshes
also remain active independent of their loader-origin bounding boxes, because the
published bones move while those stale boxes do not.

The Fighter clone owns one PBR material per semantic mesh. That bounded clone keeps
the atlas wear while separating warm face and umber cloth from cool helmet,
breastplate, limbs, sword, and shield at the game camera's reviewed scale. It does
not recolour the shared checked asset or another body. Published loadout action
codes decide whether the carried blade and shield are present; action role decides
their active pose, not their between-action visibility. All cloned materials,
equipment meshes, faction cues, and the player-local readability light retire with
the actor under fog, reset, generation reuse, or disposal.
