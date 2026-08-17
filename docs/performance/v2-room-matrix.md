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
| Manifest file, GLB, sidecar, and Blender binary hashes | GLB `91479310571aa0b0291532e63f9549fdf79914d19dfe6c1f8b8a09fd550a6420`; sidecar `01279c6fe13b62b7cc3e33207416384800590196abfcfdd40726e2f00202a52a`; validator `ab128ca3f29fa8cd230e2cb477d9f63e2b7520b200ffd7ac39dcc61ca45a33c8`; Blender binary `25bdb2e3f8ed0bac9d51b7a25fbea0f712a8d80346f2efc9dbe24d85e910c310` |
| `buildInputsSha256` over canonical manifest JSON with `outputs` omitted | `3773434dded396df2365990ac6599b08ae6714357ee5dd607fe6df47e6978839`; excludes the complete `outputs` object |
| Current texture style | generator version 4; `concept-umber-stone-v2`; floor and wall quadrants from checked 1,254 x 1,254 atlas `037c8588e18d585fd6c50ff4ba8e071459bf88c04aac4c22058a2743673149b6`; deterministic 512 x 512 periodic embeds `a5effbaebebcf0ca1737b4953f53516f6d7274a232f20ccfc8676d854426f9a8` and `d01683a26efff554e88162bf00379a2420a95c814d700c0ecc696065a51c130b`; CORNER `room_style` remains normalized `UNSIGNED_SHORT` `VEC4` `COLOR_0`; automated closure is current and a new visible review remains owed |
| Generated TypeScript trust pins | `ROOM_FIXTURE_ID = v2-room-slice-1`; all four artifact/build hashes above are compiled into `ROOM_BUILD_INPUTS_SHA256`, `ROOM_SIDECAR_SHA256`, `ROOM_GLB_SHA256`, and `ROOM_VALIDATOR_SHA256` |
| Validator report | committed third artifact; validator 2.0.0-dev.3.10; 13 nodes, 12 meshes, four materials, 2,904 vertices, 1,472 triangles |
| Payload and deterministic offline residency components | GLB 1,108,424 + sidecar 5,423 = 1,113,847 payload bytes; source 122,880 + instances 222,208 + decoded textures 2,097,152 + shadow map 4,194,304 = 6,636,544 estimated bytes |
| Validator error/warning counts and allowlist | zero errors, zero warnings, zero hints, four informational unused-UV messages; `allowedValidatorWarnings: []` |
| OS, CPU, GPU, driver, browser, power | pending foreground capture |
| Requested/selected backend and full diagnostics | pending foreground capture |
| Performance URL | `?stress=room&room=representative&renderer=auto\|webgl2` as appropriate |
| CSS/backing size and render scale | 1920 x 1080; scale 1 |
| Fixture | `v2-room-slice-1`; seed `1592594996`; 48 x 32; 64 bodies; eight torches plus one directional light; no training workers; all-visible performance disclosure |
| `ROOM_STRESS_MAP_SHA256` | `1262c7dc5eb359a06db10a06c85e2782237b226e423a903f72441f1dfde18e6c` for the exact 1,536 committed map bytes mirrored by fixture source, manifest, sidecar, matrix, and tests |
| Exact fixed piece counts and capacities | 1,536 floors (floor_a 768, floor_b 768); wall_straight 160; wall_inside 4; wall_outside 8; wall_end 4; door_frame 2; door_leaf 2; torch_bracket 8; decal_rubble 4; decal_root 4; prop_barrel 4. Each representative solid tile lays exactly one joined authored wall source, so 176 solids produce 176 wall instances and all four wall roles are live. The sidecar budgets those exact capacities at 222,208 instance bytes |

## Automated contract record

The exact validator, toolchain, build-delivery, loader, visibility, topology,
fixture, camera, fallback, reset, loss, and disposal tests named by v2-09 are green.
The render contract suite passes 94 of 94 tests, including real Babylon NullEngine
source/instance evaluation, exact live role counts, semantic picks, no-op revision
reconciliation, socket transforms, camera input cleanup, and partial-construction
rollback. Source-text assertions do not replace these semantic tests.

General wall topology reads disclosed cardinal neighbours with one fog concession:
when one disclosed solid defines an axis, an undisclosed cell directly opposite may
continue that run. Undisclosed perpendicular cells never add arms, and two or more
disclosed solids determine their exact role without fog; undisclosed cells never draw.
This tri-state rule replaces the browser-visible false T teeth produced when every
undisclosed direction counted as solid. Canonical centreline openings are E+W for straight, E+S for inside/L,
E+S+W for outside/T, and E for a capped end; quarter-turns map each opening set
exactly onto masks 1 through 14. A synthetic mask-15 cross alone uses two straights.
Mask zero occurs in neither shipped fixture and remains an explicit diagnostic
straight sentinel; shipping isolated solids requires an authored fully capped core.
The stress census is 160/4/8/4 over the same 176 solid tiles, the rectangular arena
ring is one joined source per tile, and the map hash is unchanged. Every current torch has a
non-pickable, non-shadow emissive socket sphere and capped warm point light; stress
diagnostics now record eight effects and 20 draws (12 source groups plus eight
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
| Join coherence | pass on the auto-selected live route | pending forced-WebGL2 re-review | The screenshot reopened this criterion after crossing straights left broken vertical runs, missing L/T junctions, floating end posts, and fog-created perpendicular teeth. On 2026-08-16 a fresh `#/game` reload reached Worker + representative-room ready with no console warning/error; long runs were continuous, L/T centres filled, directional ends full/capped, and the fog teeth absent. This is a topology/readability pass only, not an rAF, frame-time, or forced-backend claim. |
| Depth readability | fail | fail | The authored room collapses into broad dark/purple regions. |
| Silhouette contrast | fail | fail | Bright unit markers dominate while room silhouettes recede. |

Also record disclosure bands, both door states, torch emissive/light/shadow origin,
picks, backs/sides/tops, terminal loader diagnostics and the ordinary removal route,
and absence of software rendering.
The initial owner decision was `replace`. The observed 48 x 32 performance fixture is
useful for load but is not a useful visual-composition review scene. A performance
pass does not imply an art pass. After the compact review, textured playable route,
authored lighting, corrected wall orientation and torch treatment, and closer bounded
zoom were available, the owner accepted the current result on 2026-08-09 as good
enough to proceed. This is a minimum-parity `pass/proceed`, not completion of the
`CONCEPT.png` direction and not a performance waiver.

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
uses clear `[0.012, 0.016, 0.032, 1]`, exposure `1.34`, contrast `1.16`, a
non-shadow hemispheric fill with diffuse `[0.68, 0.60, 0.50]`, ground
`[0.08, 0.065, 0.055]`, intensity `0.58`, and initial/reset fixed zoom
`1.6`; stress zoom starts at `1` and the ordinary game route at
`GAME_INITIAL_FIXED_ZOOM = 8` (14.125 vertical tiles of the 68 x 45 dungeon), with
bounded fixed-camera wheel zoom through `12`. At 16:9, orthographic top/bottom are
`+/-8.125`, all four ground corners keep at least 20 CSS pixels of margin, and the
room spans at least 60% of both axes. The existing 48 x 32
`?stress=room` fixture, nine lights, map hash, and performance thresholds remain
unchanged. The sentence test
`the_compact_room_review_fixture_is_not_the_performance_stress_fixture` is green.
