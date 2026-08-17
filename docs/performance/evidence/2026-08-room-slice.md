# 2026-08 representative room slice evidence

**Purpose:** Record the automated v2-09 authored-room artifacts, visible owner decisions, and pending foreground captures.
**Status:** current
**Canonical source:** the [room matrix](../v2-room-matrix.md#artifact-and-environment-record) and current [room asset contract](../../reference/room-asset-contract.md#manifest-semantics)
**Update when:** An artifact, raw capture, fixed-view screenshot, review result, or owner decision is recorded.

The generator-v6 room pipeline and automated artifact are current. Its modular
masonry, stable topology, layered fixtures, painterly embeds, and runtime VFX
textures have automated validation. The initial visible
art review ended in an owner `replace` decision. After the replacement work, the
owner accepted minimum legacy parity on 2026-08-09 and chose `pass/proceed`; the
2026-08-17 owner screenshots supersede that decision with `replace` for the current
visual track. No foreground performance result exists. Earlier live-route rechecks
must not be cited as a numerical pass, a forced-backend result, or completion of the
ultimate painted-art direction.

## Method and provenance

The automated artifact identities are build inputs
`52296f2178324c57387e47a6a4a717f138051288768e9805e778781ba5975b9f`, GLB
`7d1a2c4b9ea3483f4c4461b72430144c6dca21f5e6bd024bafa1fdcb4bccc139`, sidecar
`021363e6f4857fcdca39718a4779ee432dbc309bb156ef311f2004192052e62d`, validator
`0157a21f928f21159d612179684f8b1ffe5813e684b2f6df294816e0e5516189`, and room map
`a20ba5f64ef55bd7716c2a7cf17f3065619876d1ded2e81b05199b5282222907`.
The pinned Blender binary remains
`25bdb2e3f8ed0bac9d51b7a25fbea0f712a8d80346f2efc9dbe24d85e910c310`.

Generator version 6 uses deterministic style `painted-cathedral-v4`. Its four
surface quadrants come from the checked 1,254 x 1,254 concept-material atlas,
SHA-256 `e03c9acaee58bb007a4ecadd9a0e9e74405f13bbb136f028587aaf38db223c4c`,
and produce twelve deterministic 896 x 896 albedo/normal/ORM embeds.
Four fitted, irregular courses replace each former box-wall source while retaining
the exact semantic names and pivots. The game-facing straight source is a flush,
uncapped, one-tile facade whose courses repeat without stretching; the inside/L,
outside/T, and capped-end footprints remain for the arena's synthetic ring. Their
12% modulation is coherent per block rather than per face; aged wood uses base
`[0.14, 0.11, 0.085]`, roughness `0.90`, separate top/side modulation, and a
cooler `woodEnd` response for barrel caps. CORNER-domain
`room_style` remains normalized `UNSIGNED_SHORT` `VEC4` `COLOR_0`.
The artifact is 8,307 vertices and 4,128 triangles. Offline residency components
are 489,600 source-buffer, 246,912 instance, 38,535,168 decoded-texture, and
4,194,304 shadow-map bytes, totaling 43,465,984 bytes. The GLB is 15,821,160 bytes
and sidecar 7,395 bytes, totaling 15,828,555 payload bytes.

This supersedes the generator-v3 `readable-stone-v1` artifact accepted at minimum
legacy parity on 2026-08-09. That measurement remains instructive: its tile textures
improved surface response, but single-box authored wall silhouettes still failed the
painted concept's masonry and depth target. Generator v5 addresses that concrete
shortfall; it does not inherit v3's visible approval, and the new foreground review
is recorded below.

The compact review route is also mechanically current and covered by the renderer
contract suite: it uses a fixed 16 x 10 snapshot, no Worker or performance capture,
review-only dark-navy clear and non-shadow hemispheric fill, and leaves the 48 x 32
stress fixture and its nine lights unchanged. No visible result has yet been recorded
for that compact route.
The compact fixed camera injects zoom `1.6` while ordinary/stress remains `1`; its
16:9 orthographic top/bottom are `+/-8.125` and automated bounds retain the declared
20-pixel corner margin and 60% span. The game selector now retains all 188 disclosed
solid-to-open faces with stable cell-plus-side identity; singleton and positive-axis
faces are runtime architecture rather than a separate validation graph. Local
screen-space hero occlusion lowers a near overlap without deleting that face.
Remembered masonry remains silhouette-opaque, and imported glTF quaternions are
cleared before semantic quarter turns. Contiguous door records group into one
architectural aperture instead of repeating a full frame per tile. Eight sockets
each own tapered outer and core flame layers, adding sixteen effects; the stress
route records 27 draws without changing the nine-light count.
Validator 2.0.0-dev.3.10 reports zero errors, warnings, and hints, plus fourteen
informational messages for the 19-node, 18-mesh, five-material,
8,307-vertex, 4,128-triangle kit.

Foreground evidence must additionally record machine/browser/driver/power; exact
room URL, backend and camera; 1920 x 1080 CSS and backing size; fixed fixture;
30-second warm-up; 120-second sample; and raw evidence-file SHA-256 values.

Distinguish these artifact classes explicitly:

- checked-in Python recipe and authoritative generator manifest;
- generated GLB and semantic sidecar runtime deliverables, the non-deployed canonical
  validator report, and compiled trust-pin module;
- `CONCEPT.png`, which is a human review target only;
- fixed-view screenshots used for visual review; and
- untouched raw schema-two room performance JSON used for numerical interpretation,
  named `YYYY-MM-DD-v2-room-<slot>.json`.

## Automated result

Complete. Offline generation/verification, semantic validation, dependency and
toolchain checks, TypeScript compilation, lazy delivery/build smokes, and all 125
renderer contract tests pass. The runtime exercises the current pinned room through
the scene-bound lazy loader without weakening visibility or simulation authority.

## Foreground measurements

Successive visible `#/game` reloads on 2026-08-16 refuted four intermediate
closures: solid-centre graphs, all-four-face boundaries, translucent remembered
masonry combined with ignored imported quaternions, one complete frame per tile
of a wide doorway, and a positive-axis cutaway that left the far enclosure as
cap-only ribbons. The candidate at that time instead used merged -X/-Z runs, opaque
remembered wall silhouettes, explicit quaternion clearing in game and arena, and
grouped doorway spans with one lintel and endpoint jambs. An implementation-tab
reload reached Worker + representative-room ready and no longer showed the reported
pickets or arcades. The owner then independently reloaded the default Worker route and
initially reported a clean console. Later movement and wider screenshots on
2026-08-17 refuted the visual closure: the deliberate -X/-Z-only rule removed the
bottom/left enclosure and visibility-split run reconstruction made walls pop. The
replacement now assigns all 188 disclosed solid/open interfaces stable cell-plus-side
identity, retains existing meshes and casters through disclosure, and lowers only a
projected near face overlapping the hero. Its mutation-backed automated contract is
green; the four-corner foreground walk is still owed, so join coherence remains
visibly pending rather than accepted. None of these observations is an rAF sample or
frame-time measurement.

Pending the five ordered captures in the [room matrix](../v2-room-matrix.md#foreground-performance-record),
including both Canvas drift calculations and the final procedural WebGPU comparison.

## Visible review and owner decision

The integrated generator-v5 candidate is preserved as
[World](2026-08-17-visual-recovery-world.png), SHA-256
`7ae64678cba5a80496931480f8c7ba66c4c1fcafe55954159821ead990ebe413`,
and [Tactical](2026-08-17-visual-recovery-tactical.png), SHA-256
`eac6da6d37ecfbf63bf8528a83453518b16c9af7b8da77f8e21c5ecd4163d06f`.
They were captured from the in-app browser after reset/pause and compared directly
beside `CONCEPT.png`. They demonstrate the restored complete enclosure, explicit
Tactical camera, cleared faction cue, authored Fighter, layered flames, and current
material hierarchy. They do not constitute the owner's acceptance or the visible
foreground rAF/performance record.

The owner selected `replace`. In the fixed 48 x 32 view, the authored floor and wall
kit read as a dense, very dark purple/black mass; floor/wall joins and depth were
hard to parse, torch accents did not organize the room, and the bright unit markers
overwhelmed the environment. The minimum parity threshold is the clear playfield boundary,
restrained dark palette, subtle structural grid, and strong marker hierarchy in
the preserved [legacy renderer reference](2026-08-08-legacy-renderer-reference.png),
SHA-256 `ef249c666d7c4eabb775dc32fbe943076454e2d26db88967b690df0a3ab05260`.
The ultimate art direction remains `CONCEPT.png`; old-version parity does not complete
painted-art acceptance. This was a failed initial art review, not a pipeline or
numerical performance failure.

The replacement added deterministic floor/wall textures, compact review framing,
authored lighting and torch treatment, corrected wall orientation, the same style on
the playable route — `/v2.html` when this was reviewed, `/#/game` since v2-ui-01 folded
it into the studio shell — and bounded zoom to `12`. After reviewing the current
playable result, the owner said it looked good enough to proceed on 2026-08-09. The
earlier minimum-parity `pass/proceed` is superseded by the 2026-08-17 owner
screenshots. The current visual-track decision is `replace`: walls, character
silhouette, ground-cue clearance, torch form, and material variation all require
another authored pass. All foreground measurements remain pending.
