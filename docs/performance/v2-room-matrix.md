# v2 representative room matrix

**Purpose:** Record the authored-room artifact and automated gates while preserving the pending visual-review and foreground-performance evidence required by v2-09.
**Status:** current
**Canonical source:** this document, the current [room asset contract](../reference/room-asset-contract.md#manifest-semantics), the [renderer contract](../reference/renderer-contract.md#visibility-and-subsystem-presence), and [ADR 0003](../decisions/0003-renderer-outside-sim.md#decision)
**Update when:** The representative kit, asset hashes, reference machine, evidence method, thresholds, review result, or room-pipeline decision changes.

The room pipeline and its automated asset gates are current. The first visible art
review recorded `replace`; generator v3 then earned minimum legacy parity on
2026-08-09. Generator v6 supersedes that artifact with tile-frequency modular
masonry, four floor sources, twelve painterly texture embeds, and pinned runtime
VFX textures. Current-source correctness evidence is complete; foreground rAF
performance remains pending.

## Artifact and environment record

| Field | Required record |
|---|---|
| Manifest file, GLB, sidecar, and Blender binary hashes | GLB `7d1a2c4b9ea3483f4c4461b72430144c6dca21f5e6bd024bafa1fdcb4bccc139`; sidecar `021363e6f4857fcdca39718a4779ee432dbc309bb156ef311f2004192052e62d`; validator `0157a21f928f21159d612179684f8b1ffe5813e684b2f6df294816e0e5516189`; Blender binary `25bdb2e3f8ed0bac9d51b7a25fbea0f712a8d80346f2efc9dbe24d85e910c310` |
| `buildInputsSha256` over canonical manifest JSON with `outputs` omitted | `52296f2178324c57387e47a6a4a717f138051288768e9805e778781ba5975b9f`; excludes the complete `outputs` object |
| Current texture style | generator version 6; `painted-cathedral-v4`; four quadrants from checked 1,254 x 1,254 atlas `e03c9acaee58bb007a4ecadd9a0e9e74405f13bbb136f028587aaf38db223c4c`; twelve deterministic 896 x 896 albedo/normal/ORM embeds; runtime VFX atlas `5b4678491211029b9ac5117fc2cda645d4790ac1df4c6922013a5cd37e665e46` and flame crop `6820c6c8111cd3d4640d68122f553d86c08ae53fe6f29ee7c109bf76a8019d4d`; CORNER `room_style` remains normalized `UNSIGNED_SHORT` `VEC4` `COLOR_0` |
| Generated TypeScript trust pins | `ROOM_FIXTURE_ID = v2-room-slice-1`; all four artifact/build hashes above are compiled into `ROOM_BUILD_INPUTS_SHA256`, `ROOM_SIDECAR_SHA256`, `ROOM_GLB_SHA256`, and `ROOM_VALIDATOR_SHA256` |
| Validator report | committed third artifact; validator 2.0.0-dev.3.10; 19 nodes, 18 meshes, five materials, 8,307 vertices, 4,128 triangles |
| Payload and deterministic offline residency components | GLB 15,821,160 + sidecar 7,395 = 15,828,555 payload bytes; source 489,600 + instances 246,912 + decoded textures 38,535,168 + shadow map 4,194,304 = 43,465,984 estimated bytes. Complete shipped room/combatant/VFX bytes are 64,520,583, leaving 2,588,281 below 67,108,864. |
| Validator error/warning counts and allowlist | zero errors, zero warnings, zero hints, fourteen informational messages; `allowedValidatorWarnings: []` |
| OS, CPU, GPU, driver, browser, power | pending foreground capture |
| Requested/selected backend and full diagnostics | pending foreground capture |
| Performance URL | `?stress=room&room=representative&renderer=auto\|webgl2` as appropriate |
| CSS/backing size and render scale | 1920 x 1080; scale 1 |
| Fixture | `v2-room-slice-1`; seed `1592594996`; 48 x 32; 64 bodies; eight torches plus one directional light; no training workers; all-visible performance disclosure |
| `ROOM_STRESS_MAP_SHA256` | `a20ba5f64ef55bd7716c2a7cf17f3065619876d1ded2e81b05199b5282222907` for the exact 1,536 committed map bytes mirrored by fixture source, manifest, sidecar, matrix, and tests |
| Exact fixed piece counts and capacities | Stress floors are floor_a 388, floor_b 368, floor_c 416, floor_d 364. Residency reserves 1,536 floor-source slots; wall_straight 363 (188 stable faces + 175 coping); wall_inside/outside/end 0; door_frame 2; door_leaf 6; torch_bracket 10; decal_rubble/root/prop_barrel 4 each. The exact 1,929-instance capacity closure is 246,912 double-buffered bytes. Root and barrel rows remain fixture census only and are excluded from live presentation. |

## Automated contract record

The exact validator, toolchain, build-delivery, loader, visibility, topology,
fixture, camera, fallback, reset, loss, and disposal tests named by v2-09 are green.
The render contract suite passes 125 of 125 tests, including real Babylon NullEngine
source/instance evaluation, exact live role counts, semantic picks, no-op revision
reconciliation, socket transforms, camera input cleanup, and partial-construction
rollback. Source-text assertions do not replace these semantic tests.

The playable route again exposes the observational comparison instruments used for
visual recovery: a 500 ms FPS/worst-rAF chip outside the Systems drawer and one
six renderer-owned view modes selected by the mode control or `G`/Shift+G. Automated
contracts prove that Geometry retains VIS 1 and VIS 2 topology, swaps authored bodies
for readable procedural geometry, hides room furniture/flames, and restores the same
mesh and shadow identities in World. Top Down, First Person, Free, and Dev reuse that
same Scene, Worker, snapshot, and identity registry. These are correctness gates only; automated hidden-tab
timing remains inadmissible for the foreground performance slots below.

The game room now treats MAP_SOLID as masonry volume. Every disclosed solid-to-open
interface has one stable cell-plus-side face, including singleton and positive-axis
sides. Visibility changes reconcile those instances in place; each facade has runtime
masonry depth and meets dark overburden. Opaque non-disclosing roof blocks cover VIS 0
cells, while a bounded ground and cliff skirt fills the outside frame. Local hero
occlusion eases only overlapping near faces to 22% alpha and restores the same object
without changing topology. Remembered masonry stays opaque while remembered floors
recede. Published door cells suppress ordinary faces and contiguous collinear
records become one span: singleton doors keep one frame, while wider doors have a
continuous lintel, endpoint jambs, and shut leaves or an open gap. Imported glTF
quaternions are cleared before game and arena quarter turns. Named mutation-proven
tests cover horizontal/vertical grouping and both quaternion seams. The revised
48 x 32 fixture is a closed 7 x 5 enclosure at x15..21/y11..15 with true door
records at (18,11) and (18,15). Its exact census is 175 solid cells, 188 stable
boundary faces, and two frame instances. The arena retains its own one-source-per-tile synthetic centreline ring
because a fight rectangle does not publish MAP_SOLID/MAP_OPEN architecture. Every current torch has a
non-pickable, non-shadow layered tapered flame and capped warm point light; stress
diagnostics record sixteen effects and 27 draws (eleven live source groups plus
sixteen flame layers), with the same nine lights. Reset/disposal removes both flame
layers and their materials.

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

The final current-source correctness capture is
[concept-production World](evidence/2026-08-concept-production-world.png), 1534 x
889, SHA-256
`12e905bfd83e16d94b7b11d2f1055a95ae4f6d1651558a7656c1b4b73ff1197f`.
It records an assembled Fighter, visible authored flame sprites, a closed Systems
drawer, and removal of the pale proxy quadrilateral/orange dome. This supersedes
the earlier correctness candidates below, but is not visible-rAF evidence. Honest
remaining gaps against `CONCEPT.png` are oversized/overbright flames, darker and
flatter wall/floor response, and sparse dressing.

The 2026-08-17 integrated recovery candidate is preserved as
[World](evidence/2026-08-17-visual-recovery-world.png), SHA-256
`7ae64678cba5a80496931480f8c7ba66c4c1fcafe55954159821ead990ebe413`,
and [Tactical](evidence/2026-08-17-visual-recovery-tactical.png), SHA-256
`eac6da6d37ecfbf63bf8528a83453518b16c9af7b8da77f8e21c5ecd4163d06f`.
The in-app browser comparison placed the World frame directly beside
`CONCEPT.png`: complete masonry mass, warm local fire, rough umber stone, a
readable equipped human silhouette, and compact peripheral HUD now share its broad
visual family. The concept remains substantially denser in micro-detail and scene
population, so these captures are a review candidate rather than an owner decision
or visible-rAF performance result.

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
| Join coherence | automated repair complete; foreground corner walk pending | pending foreground | The -X/-Z run defect is superseded by 188 stable cell-plus-side faces. Singleton and positive-axis sides exist, visibility/disclosure retains mesh and caster identity, and only a projected near face overlapping the hero lowers locally. The 2026-08-17 screenshot remains the visible fail until the required four-corner walk replaces it. |
| Depth readability | fail | fail | The authored room collapses into broad dark/purple regions. |
| Silhouette contrast | automated recovery complete; foreground review pending | pending foreground | The reauthored Fighter/Brute asset now bounds shoulder/head proportions, equipment area, connected limb chains and the 40-pixel class silhouette. The cue centre uses `0.080 + 0.11 * radius / 2 + 0.004`, and removing the epsilon makes the named clearance test red. Pinned Blender turntables pass static review; default-game walk/fog and Arena Brute remain the foreground acceptance authority. |
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
the preserved textured legacy reference was available. Generator v3 is the
texture-inclusive minimum-parity predecessor. Generator v6 is the current
deterministic artifact and owns the correctness evidence above.

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
`GAME_INITIAL_FIXED_ZOOM = 11.5` (about 9.8 vertical tiles of the 68 x 45 dungeon), with
bounded fixed-camera wheel zoom through `12`. At 16:9, orthographic top/bottom are
`+/-8.125`, all four ground corners keep at least 20 CSS pixels of margin, and the
room spans at least 60% of both axes. The 48 x 32 `?stress=room` fixture retains its dimensions, population, nine lights,
and performance thresholds; its map hash and architectural composition are revised. The sentence test
`the_compact_room_review_fixture_is_not_the_performance_stress_fixture` is green.
