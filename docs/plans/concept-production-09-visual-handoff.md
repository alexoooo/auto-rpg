# Concept production 09 -- visual comparison handoff

**Status:** deferred to the next visual session on 2026-08-17. This file records
the frozen baseline and recommended work; it authorizes no simulation, ABI, or
golden-hash change.

## Compared evidence

- target: [`web/assets/CONCEPT.png`](../../web/assets/CONCEPT.png)
- current World: [2026-08-concept-production-world.png](../performance/evidence/2026-08-concept-production-world.png)
- current screenshot: 1534 x 889, SHA-256
  `12e905bfd83e16d94b7b11d2f1055a95ae4f6d1651558a7656c1b4b73ff1197f`
- shipped room/combatant/VFX payload: 64,520,583 bytes, leaving 2,588,281
  bytes beneath the 64 MiB cap

The current capture is the acceptance baseline, not a claim of style parity.
The target reads as one painted scene: chunky irregular stone, dense but
subordinate dungeon dressing, controlled cool-dark ambient values, small warm fire
pools, and strongly readable armored figures. The current renderer now has the
same broad composition vocabulary, but its individual systems still read as
separate 3D assets.

## What is now sound

- All four wall orientations exist with stable topology identity. Disclosure and
  remembered-state changes no longer delete and recreate the same facade.
- Walls have physical depth, coping and authored 1/2/3/5/8-cell modules. The map
  is filled by floor or overburden rather than blank background pretending to be
  world geometry.
- The Fighter is assembled at its authoritative pose. The former pale quad and
  orange head fragment came from broken GPU skin/root composition; direct
  joint-local mesh parenting now has a mutation-proven regression.
- Doors are physical hinged publications, mouse movement is the default, direct
  tank movement is opt-in, Q/E turns, equipment can switch, respawn preserves the
  world, configured enemy spawning uses authoritative enum codes, and six views
  are directly selectable.
- Torch fixtures and authoritative torch objects use the pinned authored flame
  path. The old cone and the duplicate room-proxy artifacts are gone.
- The FPS readout, health, equipment, control cluster and collapsed Systems drawer
  remain reachable without covering the play field.

## Comparison failures to carry forward

1. **Fire scale and response.** Current flames are much too large, bright and
   uniform. They float in front of masonry and dominate the frame; the target uses
   smaller shaped flames whose light pool, bracket shadow and wall bounce do more
   visual work than the sprite.
2. **Stone value and relief.** Current wall faces are still dark planar bands with
   thin highlighted courses. The target has individually readable blocks, chipped
   silhouettes, corner mass, irregular coping and richer warm/cool response.
3. **Floor breakup.** The floor is continuous and no longer cookie-cutter at the
   contract level, but the gameplay view remains a broad low-contrast grey field.
   Cross-tile cracks, stains, puddles, roots, rubble and value zones are too sparse
   to break the repetition.
4. **Combatant finish.** The Fighter is recognizable and equipped, but at World
   scale it remains too dark, soft and low-detail compared with the target's clear
   helmet, limbs, weapon, shield and material highlights. The Brute needs the same
   live-route review; an isolated turntable is not enough.
5. **Composition and hierarchy.** The current camera shows one quiet rectangular
   chamber with a great deal of empty floor. The target composes walls, doors,
   props, enemies and light into overlapping depth layers. Future evidence should
   use a representative encounter, not an empty reset room.
6. **HUD art direction.** Placement and functionality are repaired, but the HUD is
   still a restrained diagnostic shell. The target uses compact carved frames,
   stronger health/resource hierarchy, readable actor labels and richer weapon
   slot art without obscuring the world.

## Recommended next sessions

### 10 -- value hierarchy and fire calibration

Calibrate one representative encounter before adding content: reduce flame world
height and emissive clipping, strengthen warm wall/floor bounce, lift actor-local
contrast, and tune camera zoom so Fighter and Brute read at 100--160 pixels. Add
image-based bounds for flame occupancy, luminance hierarchy and actor projected
height. No authoritative code or hash may move.

### 11 -- authored masonry and dressing composition

Replace procedural-looking bands with artist-authored corner, buttress, arch,
collapsed-edge and stair modules. Reintroduce web, roots, pottery, water, blood,
rubble and barrels only after each has a real mesh/decal silhouette and no proxy
geometry. Compose deterministic dressing in clusters and negative space rather
than uniform per-tile scattering. Preserve the solid/open envelope and global
asset budgets.

### 12 -- production combatant review

Review Fighter and Brute together in the live World route under shipped lighting.
Prefer a sculpt/bake/retopology pass or professionally authored source meshes over
another round of primitive aggregation. Preserve semantic joints, sockets, LOD
closure and authoritative pose ownership. Add live projected-silhouette evidence
for face, hands, carried weapon and shield.

### 13 -- foreground acceptance matrix

Capture World/Geometry/Top Down/First Person/Free/Dev at desktop and compact sizes,
plus reset, movement, occlusion, remembered fog, door opening, props and a
Fighter-versus-Brute encounter. Record WebGPU and forced-WebGL2, repeat the World
baseline after the matrix, and have a person run the visible foreground rAF capture.
Only explicit owner acceptance of the blind-crop comparison retires sessions 00--09.

## Golden and ownership boundary

The next visual sessions are presentation-only. `ROOM_HASH`, `BATTLE_HASH`,
`SWAP_HASH`, `BOW_HASH`, `LAB_HASH`, `GOLDEN_STATE_HASH`, learned inference,
combat-spec, articulated command/stream, exact trajectory, lifted solver and the
articulated-duel fingerprint must not move. Asset bytes, sidecars, validator
reports and generated TypeScript pins may move only with deterministic double
export, strict validation and the global payload/residency gates.
