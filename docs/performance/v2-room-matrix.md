# v2 representative room matrix

**Purpose:** Record the authored-room artifact and automated gates while preserving the pending visual-review and foreground-performance evidence required by v2-09.
**Status:** current
**Canonical source:** this document, the current [room asset contract](../reference/room-asset-contract.md#manifest-semantics), the [renderer contract](../reference/renderer-contract.md#visibility-and-subsystem-presence), and [ADR 0003](../decisions/0003-renderer-outside-sim.md#decision)
**Update when:** The representative kit, asset hashes, reference machine, evidence method, thresholds, review result, or room-pipeline decision changes.

The room pipeline and its automated asset gates are current. The first visible art
review recorded `replace`; generator v3 then earned minimum legacy parity on
2026-08-09. Generator v4 supersedes that artifact with coursed masonry and
concept-atlas materials. It does not inherit v3's visible approval: a new visible
review and foreground performance capture remain pending.

## Artifact and environment record

| Field | Required record |
|---|---|
| Manifest file, GLB, sidecar, and Blender binary hashes | GLB `39dbe61be1dc69f085126002824ce3a92987c1dd166f09b91cd4715722250f42`; sidecar `80fa427558c7e5e0ee13eb127c95d2198dc998ce721af1ed131878a65529b36a`; validator `199b1895559ca697d01c1239c3292b84bfa432aa3d8cd01b6d4e81066cf689e0`; Blender binary `25bdb2e3f8ed0bac9d51b7a25fbea0f712a8d80346f2efc9dbe24d85e910c310` |
| `buildInputsSha256` over canonical manifest JSON with `outputs` omitted | `31cbfe0e8244257084e5d043d0863959b3207c6f28252c8b8faeb36da4d34b9c`; excludes the complete `outputs` object |
| Current texture style | generator version 4; `concept-umber-stone-v2`; floor and wall quadrants from checked 1,254 x 1,254 atlas `037c8588e18d585fd6c50ff4ba8e071459bf88c04aac4c22058a2743673149b6`; deterministic 512 x 512 periodic embeds `a5effbaebebcf0ca1737b4953f53516f6d7274a232f20ccfc8676d854426f9a8` and `d01683a26efff554e88162bf00379a2420a95c814d700c0ecc696065a51c130b`; CORNER `room_style` remains normalized `UNSIGNED_SHORT` `VEC4` `COLOR_0`; automated closure is current and a new visible review remains owed |
| Generated TypeScript trust pins | `ROOM_FIXTURE_ID = v2-room-slice-1`; all four artifact/build hashes above are compiled into `ROOM_BUILD_INPUTS_SHA256`, `ROOM_SIDECAR_SHA256`, `ROOM_GLB_SHA256`, and `ROOM_VALIDATOR_SHA256` |
| Validator report | committed third artifact; validator 2.0.0-dev.3.10; 13 nodes, 12 meshes, four materials, 2,760 vertices, 1,400 triangles |
| Payload and deterministic offline residency components | GLB 1,104,092 + sidecar 5,423 = 1,109,515 payload bytes; source 118,416 + instances 234,880 + decoded textures 2,097,152 + shadow map 4,194,304 = 6,644,752 estimated bytes |
| Validator error/warning counts and allowlist | zero errors, zero warnings, zero hints, four informational unused-UV messages; `allowedValidatorWarnings: []` |
| OS, CPU, GPU, driver, browser, power | pending foreground capture |
| Requested/selected backend and full diagnostics | pending foreground capture |
| Performance URL | `?stress=room&room=representative&renderer=auto\|webgl2` as appropriate |
| CSS/backing size and render scale | 1920 x 1080; scale 1 |
| Fixture | `v2-room-slice-1`; seed `1592594996`; 48 x 32; 64 bodies; eight torches plus one directional light; no training workers; all-visible performance disclosure |
| `ROOM_STRESS_MAP_SHA256` | `a20ba5f64ef55bd7716c2a7cf17f3065619876d1ded2e81b05199b5282222907` for the exact 1,536 committed map bytes mirrored by fixture source, manifest, sidecar, matrix, and tests |
| Exact fixed piece counts and capacities | 1,536 floors (floor_a 768, floor_b 768); wall_straight 269 (94 facades + 175 coping); wall_inside 0; wall_outside 0; wall_end 0; door_frame 2; door_leaf 6; torch_bracket 10 (eight torches + two shut-door straps); decal_rubble 4; decal_root 4; prop_barrel 4. The complete structural boundary remains 188 faces, while eight merged -X/-Z cutaway runs repeat 94 tile-frequency facades. The sidecar budgets the exact 1,835-instance closure at 234,880 bytes |

## Automated contract record

The exact validator, toolchain, build-delivery, loader, visibility, topology,
fixture, camera, fallback, reset, loss, and disposal tests named by v2-09 are green.
The render contract suite passes 101 of 101 tests, including real Babylon NullEngine
source/instance evaluation, exact live role counts, semantic picks, no-op revision
reconciliation, socket transforms, camera input cleanup, and partial-construction
rollback. Source-text assertions do not replace these semantic tests.

The game room now treats MAP_SOLID as masonry volume. It merges the camera-facing
-X/-Z disclosed solid-to-open interfaces into maximal runs and repeats a seamless
one-tile facade without stretching brick scale; hidden -X/-Y faces and one-edge
stair steps never become pickets. Remembered masonry stays opaque while remembered
floors recede. Published door cells suppress ordinary faces and contiguous collinear
records become one span: singleton doors keep one frame, while wider doors have a
continuous lintel, endpoint jambs, and shut leaves or an open gap. Imported glTF
quaternions are cleared before game and arena quarter turns. Named mutation-proven
tests cover horizontal/vertical grouping and both quaternion seams. The revised
48 x 32 fixture is a closed 7 x 5 enclosure at x15..21/y11..15 with true door
records at (18,11) and (18,15). Its exact census is 175 solid cells, 188 complete
boundary faces, eight camera-facing runs, 94 facade instances, and two frame
instances. The arena retains its own one-source-per-tile synthetic centreline ring
because a fight rectangle does not publish MAP_SOLID/MAP_OPEN architecture. Every current torch has a
non-pickable, non-shadow emissive socket sphere and capped warm point light; stress
diagnostics record eight effects and 19 draws (eleven live source groups plus eight
flames), with the same nine lights. Reset/disposal removes the flame meshes and
shared material.

The unit markers on the playable route are procedural figures rather than cylinders
(2026-08-16): each body is a fixed per-kind set of primitive meshes hanging off the
v2-18 joint names shared with the arena proxy through `render/rig-names.ts`, driven
by the published frame row (limb bearing/reach, swing phase, stride clock, velocity)
with client-side legs documented as derived presentation. The contract test
`the_procedural_figure_carries_the_v2_18_joint_names_and_published_fields_drive_it`
pins the joint list, the exact blade segment, the walk gating, and radius scaling.

The build record must also prove that the glTF loader is a lazy dynamic chunk absent
from modulepreloads and the initial static import closure, and that ordinary and
Canvas dev startup issue no request for it. NullEngine evidence must show hidden but
enabled classic-instance sources allow their instances to evaluate and draw while the
sources themselves remain absent from every spatial registry.

## Foreground performance record

Warm for 30 visible-foreground seconds and sample 120 seconds. Record p50/p95/p99,
frames over 16.67 and 33.33 ms, long tasks, completed-frame draws and triangles,
lights, shadow casters, and the offline asset-residency estimate. Run in this order:

Authored-room slots use schema 2 and must include exact `buildInputsSha256`,
`glbSha256`, `sidecarSha256`, `validatorSha256`, and `roomStressMapSha256`
identities. Schema-one greybox and Canvas controls
remain unchanged. A substituted self-consistent asset pair or mismatched map hash is
rejected before capture.

| Slot | Run | Threshold | Result | Raw evidence |
|---:|---|---|---|---|
| 1 | Procedural Canvas2D drift control | initial drift baseline | pending | pending |
| 2 | Authored room, auto-selected WebGPU | p95 <= 16.67 ms | pending | pending |
| 3 | Authored room, forced WebGL2 | p95 <= 33.33 ms | pending | pending |
| 4 | Procedural Canvas2D control repeated | p95 drift from slot 1 <= 0.50 ms and absolute `framesOver33_33Ms / sampleCount` drift <= 0.005 | pending | pending |
| 5 | Procedural greybox, auto-selected WebGPU comparison | contextual authored-room cost comparison | pending | pending |

The v2-08 owner exception is context only and does not waive this matrix. A missing
ordered control or threshold miss remains a failure unless the owner records a new,
explicit room-phase exception.

## Visible review record

The minimum replacement threshold is the restrained readability and hierarchy of the
preserved [legacy renderer reference](evidence/2026-08-08-legacy-renderer-reference.png),
SHA-256 `ef249c666d7c4eabb775dc32fbe943076454e2d26db88967b690df0a3ab05260`: a clearly bounded dark
playfield, readable floor structure, immediately legible unit markers, and secondary
environment accents. The ultimate target remains
[`CONCEPT.png`](../../web/assets/CONCEPT.png). Passing old-version parity is necessary
for this replacement review but does not complete the ultimate painted-art direction;
neither image is a generator or runtime input.

The current API is
`createRoomReviewCamera(scene, canvas, bounds, options)`, returning `resetFixed()`,
`setFree(bool)`, and idempotent `dispose()`. Fixed mode owns the committed isometric
pose. Free mode uses a bounded Babylon ArcRotateCamera attached only to the active
canvas; it is excluded from performance and normal gameplay and removes every input
and observer on reset or disposal. The playable game route additionally passes
`followHero: true`, which exposes a `follow(x, z)` the render loop feeds with the
faction-0 unit each frame: a dead-zone camera window (`FOLLOW_DEAD_ZONE_FRACTION`)
that pans only the excess, is suspended by a user drag until the hero itself walks
away, and is absent -- not merely inert -- on the stress and compact-review
fixtures so their captures cannot drift.

The exact review query is `roomCamera=fixed|free`, valid only with
`room=representative`; absent means fixed. The review control toggles the same API,
but every performance capture requires fixed mode and rejects free mode.

| Criterion | WebGPU | forced WebGL2 | Decision note |
|---|---|---|---|
| Stone modeling | fail | fail | Repetition at 48 x 32 reads as a dense mass rather than a composed room. |
| Material response | fail | fail | Stone and wood are too dark to separate reliably from the playfield. |
| Fixture-origin light | fail | fail | Torch accents do not establish readable local hierarchy. |
| Join coherence | **fail -- owner screenshot 2026-08-17** | fail/pending rework | The -X/-Z-only cutaway deliberately omits the bottom/left enclosure, singleton faces are dropped, and rebuilding visibility-split runs makes walls pop while walking. Earlier acceptance is superseded. The replacement must retain stable four-sided architectural identity and apply local occlusion instead of deleting whole sides. |
| Depth readability | fail | fail | The authored room collapses into broad dark/purple regions. |
| Silhouette contrast | **fail -- owner screenshot 2026-08-17** | fail | The authored Fighter is not recognizable as a person at gameplay scale and its torus intersects the raised floor. |
| Fixture form | **fail -- owner screenshot 2026-08-17** | fail | Torch brackets and emissive spheres read as posts with orange dots rather than wall-mounted flame fixtures. |
| Material composition | **fail -- owner screenshot 2026-08-17** | fail | Two floor variants and one wall treatment tile conspicuously and do not reproduce the concept's painterly value hierarchy. |

Also record disclosure bands, both door states, torch emissive/light/shadow origin,
picks, backs/sides/tops, terminal loader diagnostics and the ordinary removal route,
and absence of software rendering.
The initial owner decision was `replace`. The observed 48 x 32 performance fixture is
useful for load but is not a useful visual-composition review scene. A performance
pass does not imply an art pass. After the compact review, textured playable route,
authored lighting, corrected wall orientation and torch treatment, and closer bounded
zoom were available, the owner accepted that result on 2026-08-09 as good enough to
proceed. The 2026-08-17 screenshots supersede that minimum-parity decision: current
status is `replace`, and no performance or art waiver exists.

The generator-v2 vertex-color artifact is a superseded intermediate produced before
the preserved textured legacy reference was available. Generator v3 is the texture-inclusive minimum-parity predecessor. Generator v4 is
the current deterministic candidate and does not inherit that visible approval.

The current compact review query family is
`/#/game?review=room&room=representative&backend=auto|webgl2&roomCamera=fixed|free`.
The reviews recorded above were run before v2-ui-01, when the same family lived at
`/v2.html?review=room&...`; the route moved, the query did not.
It creates no Worker and exposes no performance capture. It is exactly 16 x 10 tiles:
a perimeter-only 48 solid tiles around a 14 x 8 open interior, two doors showing open
and shut states, four torches, four each of barrels, rubble, and roots, and eight unit
markers. Its camera uses the explicit 16 x 10 snapshot bounds. Playable authored-room and compact-review rendering
uses clear `[0.012, 0.016, 0.032, 1]`, exposure `1.64`, contrast `1.06`, a
non-shadow hemispheric fill with diffuse `[0.50, 0.52, 0.56]`, ground
`[0.035, 0.04, 0.05]`, intensity `0.48`, and initial/reset fixed zoom
`1.6`; stress zoom starts at `1` and the ordinary game route at
`GAME_INITIAL_FIXED_ZOOM = 10` (11.3 vertical tiles of the 68 x 45 dungeon), with
bounded fixed-camera wheel zoom through `12`. At 16:9, orthographic top/bottom are
`+/-8.125`, all four ground corners keep at least 20 CSS pixels of margin, and the
room spans at least 60% of both axes. The 48 x 32 `?stress=room` fixture retains its dimensions, population, nine lights,
and performance thresholds; its map hash and architectural composition are revised. The sentence test
`the_compact_room_review_fixture_is_not_the_performance_stress_fixture` is green.
