# Concept production -- overview

**Status:** live, and paused by the owner on 2026-08-17 pending the next visual session.
Sessions 01 through 09 have landed and were consolidated into this file on 2026-08-18;
what they built is recorded in [presentation](../design/presentation.md) and the
[room matrix](../performance/v2-room-matrix.md), and what they left owed is below.

The permanent target is `web/assets/CONCEPT.png`: a filled, painterly isometric dungeon
with continuous architectural mass, readable human combatants, warm local fire, compact
controls, stable cameras, and no blank or cookie-cutter presentation. The authoritative
maze remains tile topology. Presentation may compose continuous and sub-tile geometry
inside that envelope; authoritative dungeon objects use fixed-point world positions.

## What the 2026-08-17 pass landed

Nine sessions, of which one -- dungeon object authority -- was the only authoritative
one. In brief, because [presentation](../design/presentation.md) owns the durable version:
live controls and a production HUD; six selectable views; filled overburden with thick
walls and stable local transparency; production Fighter and Brute with LODs and baked
materials; deterministic physical props on an append-only publication; physical hinged
doors and correctly mounted fire; irregular modular masonry; and a foreground comparison
baseline.

The comparison capture is the acceptance baseline and **not** a claim of style parity:
1534 x 889, SHA-256 `12e905bfd83e16d94b7b11d2f1055a95ae4f6d1651558a7656c1b4b73ff1197f`,
against a shipped room/combatant/VFX payload of 64,520,583 bytes with 2,588,281 bytes of
headroom beneath the 64 MiB cap.

## The six comparison failures carried forward

The current renderer has the target's broad composition vocabulary, and its individual
systems still read as separate 3D assets rather than one painted scene.

1. **Fire scale and response.** Flames are much too large, bright and uniform. They float
   in front of masonry and dominate the frame; the target uses smaller shaped flames whose
   light pool, bracket shadow and wall bounce do more work than the sprite.
2. **Stone value and relief.** Wall faces are dark planar bands with thin highlighted
   courses. The target has individually readable blocks, chipped silhouettes, corner mass,
   irregular coping and richer warm/cool response.
3. **Floor breakup.** Continuous and no longer cookie-cutter at the contract level, but the
   gameplay view is a broad low-contrast grey field. Cracks, stains, puddles, roots, rubble
   and value zones are too sparse to break the repetition.
4. **Combatant finish.** The Fighter is recognizable and equipped and at World scale is too
   dark, soft and low-detail beside the target's clear helmet, limbs, weapon, shield and
   material highlights. The Brute needs the same live-route review; a turntable is not
   enough.
5. **Composition and hierarchy.** The camera shows one quiet rectangular chamber with a
   great deal of empty floor. Future evidence should use a representative encounter, not an
   empty reset room.
6. **HUD art direction.** Placement and function are repaired; the HUD is still a
   restrained diagnostic shell rather than compact carved frames with a strong
   health/resource hierarchy.

## Owed sessions

| session | subject |
|---|---|
| 10 -- value hierarchy and fire calibration | reduce flame world height and emissive clipping, strengthen warm wall/floor bounce, lift actor-local contrast, tune camera zoom so Fighter and Brute read at 100--160 pixels; add image-based bounds for flame occupancy, luminance hierarchy and actor projected height |
| 11 -- authored masonry and dressing composition | artist-authored corner, buttress, arch, collapsed-edge and stair modules; reintroduce web, roots, pottery, water, blood, rubble and barrels only with real mesh/decal silhouettes; compose dressing in clusters and negative space rather than uniform per-tile scattering |
| 12 -- production combatant review | Fighter and Brute together in the live World route under shipped lighting; prefer a sculpt/bake/retopology pass over another round of primitive aggregation; preserve semantic joints, sockets, LOD closure and authoritative pose ownership |
| 13 -- foreground acceptance matrix | six views at desktop and compact sizes, plus reset, movement, occlusion, remembered fog, door opening, props and a Fighter-versus-Brute encounter; WebGPU and forced-WebGL2; a person runs the visible foreground rAF capture |

Every one is presentation-only. No authoritative code, no simulation change, no golden
hash. Asset bytes, sidecars, validator reports and generated TypeScript pins may move only
with deterministic double export, strict validation and the global payload/residency
gates.

**Session 13's blind-crop comparison, accepted explicitly by the owner, is what closes this
topic.** Green loaders and validators are not acceptance.

## Golden and ownership boundary, restated

The boundary this plan carried until 2026-08-18 named `ROOM_HASH`, `BATTLE_HASH`,
`SWAP_HASH`, `BOW_HASH` and `GOLDEN_STATE_HASH` as pins that must not move. **All five
have since been deleted** with `CombatModel::Legacy`, and they are in the retired table in
[the golden registry](../reference/hashes.md#golden-registry). That is worth knowing
before a visual session goes looking for its safety net: the four browser goldens that
would have caught an accidental authoritative change from a presentation session **no
longer exist**, and the cover is now the client suites, `wasm_check`, and
`EMBODIED_CORPUS_DIGEST`.

The pins a visual session must still not move are `COMBAT_GEOMETRY_HASH`,
`ARTICULATED_COMMAND_HASH`, `CONTACT_BEHAVIOR_DIGEST`, `ARTICULATED_STREAM_DIGEST`,
`LEARNED_INFERENCE_DIGEST`, `EMBODIED_CORPUS_DIGEST`, `EMBODIED_GOLDEN_DIGEST`, the two
exact-law digests, and the embodied scenario fingerprints.

## Verification

```powershell
node --test "client/test/*.test.mjs"
node tools/validate_assets.js web/assets3d/room_slice.glb
node tools/check_docs.js
npm run dev        # foreground, stopped before the session ends
```

A session that changes visible output compares a foreground screenshot beside
`CONCEPT.png` and proves each new regression red by mutating the protected line.
