# 2026-08 representative room slice evidence

**Purpose:** Record the automated v2-09 authored-room artifacts, visible owner decisions, and pending foreground captures.
**Status:** current
**Canonical source:** the [room matrix](../v2-room-matrix.md#artifact-and-environment-record) and current [room asset contract](../../reference/room-asset-contract.md#manifest-semantics)
**Update when:** An artifact, raw capture, fixed-view screenshot, review result, or owner decision is recorded.

The generator-v4 room pipeline and automated artifact are current. Its concept-directed masonry and atlas revision has automated validation but still owes a visible owner review. The initial visible
art review ended in an owner `replace` decision. After the replacement work, the
owner accepted minimum legacy parity on 2026-08-09 and chose `pass/proceed`; the
2026-08-17 owner screenshots supersede that decision with `replace` for the current
visual track. No foreground performance result exists. Earlier live-route rechecks
must not be cited as a numerical pass, a forced-backend result, or completion of the
ultimate painted-art direction.

## Method and provenance

The automated artifact identities are build inputs
`31cbfe0e8244257084e5d043d0863959b3207c6f28252c8b8faeb36da4d34b9c`, GLB
`39dbe61be1dc69f085126002824ce3a92987c1dd166f09b91cd4715722250f42`, sidecar
`80fa427558c7e5e0ee13eb127c95d2198dc998ce721af1ed131878a65529b36a`, validator
`199b1895559ca697d01c1239c3292b84bfa432aa3d8cd01b6d4e81066cf689e0`, and room map
`a20ba5f64ef55bd7716c2a7cf17f3065619876d1ded2e81b05199b5282222907`.
The pinned Blender binary remains
`25bdb2e3f8ed0bac9d51b7a25fbea0f712a8d80346f2efc9dbe24d85e910c310`.

Generator version 4 uses deterministic style `concept-umber-stone-v2`. Its floor
and wall quadrants come from the checked 1,254 x 1,254 concept-material atlas,
SHA-256 `037c8588e18d585fd6c50ff4ba8e071459bf88c04aac4c22058a2743673149b6`,
and produce deterministic 512 x 512 embeds
`a5effbaebebcf0ca1737b4953f53516f6d7274a232f20ccfc8676d854426f9a8` and
`d01683a26efff554e88162bf00379a2420a95c814d700c0ecc696065a51c130b`.
Four fitted, irregular courses replace each former box-wall source while retaining
the exact semantic names and pivots. The game-facing straight source is a flush,
uncapped, one-tile facade whose courses repeat without stretching; the inside/L,
outside/T, and capped-end footprints remain for the arena's synthetic ring. Their
12% modulation is coherent per block rather than per face; aged wood uses base
`[0.14, 0.11, 0.085]`, roughness `0.90`, separate top/side modulation, and a
cooler `woodEnd` response for barrel caps. CORNER-domain
`room_style` remains normalized `UNSIGNED_SHORT` `VEC4` `COLOR_0`.
The artifact is 2,760 vertices and 1,400 triangles. Offline residency components
are 118,416 source-buffer, 234,880 instance, 2,097,152 decoded-texture, and
4,194,304 shadow-map bytes, totaling 6,644,752 bytes. The GLB is 1,104,092 bytes
and sidecar 5,423 bytes, totaling 1,109,515 payload bytes.

This supersedes the generator-v3 `readable-stone-v1` artifact accepted at minimum
legacy parity on 2026-08-09. That measurement remains instructive: its tile textures
improved surface response, but single-box authored wall silhouettes still failed the
painted concept's masonry and depth target. Generator v4 addresses that concrete
shortfall; it does not inherit v3's visible approval, and a new foreground review
remains owed.

The compact review route is also mechanically current and covered by the renderer
contract suite: it uses a fixed 16 x 10 snapshot, no Worker or performance capture,
review-only dark-navy clear and non-shadow hemispheric fill, and leaves the 48 x 32
stress fixture and its nine lights unchanged. No visible result has yet been recorded
for that compact route.
The compact fixed camera injects zoom `1.6` while ordinary/stress remains `1`; its
16:9 orthographic top/bottom are `+/-8.125` and automated bounds retain the declared
20-pixel corner margin and 60% span. The game selector now merges only disclosed
solid-to-open -X/-Z faces into maximal camera-facing runs. The fixed stress census is
eight runs and 94 tile-frequency facades; a separate full 188-face boundary graph
proves the enclosure and true door breaks. One-edge stair steps are floor cutaway,
remembered masonry remains silhouette-opaque, and imported glTF quaternions are
cleared before semantic quarter turns. Contiguous door records group into one
architectural aperture instead of repeating a full frame per tile. Eight socket
flame meshes add eight effects and the stress route records 19 draws without changing
the nine-light count.
Validator 2.0.0-dev.3.10 reports zero errors, warnings, and hints, plus four
informational messages for the 13-node, 12-mesh, four-material,
2,760-vertex, 1,400-triangle kit.

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
toolchain checks, TypeScript compilation, lazy delivery/build smokes, and all 97
renderer contract tests pass. The runtime exercises the current pinned room through
the scene-bound lazy loader without weakening visibility or simulation authority.

## Foreground measurements

Successive visible `#/game` reloads on 2026-08-16 refuted four intermediate
closures: solid-centre graphs, all-four-face boundaries, translucent remembered
masonry combined with ignored imported quaternions, one complete frame per tile
of a wide doorway, and a positive-axis cutaway that left the far enclosure as
cap-only ribbons. The current candidate instead uses merged -X/-Z runs, opaque
remembered wall silhouettes, explicit quaternion clearing in game and arena, and
grouped doorway spans with one lintel and endpoint jambs. An implementation-tab
reload reached Worker + representative-room ready and no longer showed the reported
pickets or arcades. The owner then independently reloaded the default Worker route and
initially reported a clean console. Later movement and wider screenshots on
2026-08-17 refuted the visual closure: the deliberate -X/-Z-only rule removed the
bottom/left enclosure and visibility-split run reconstruction made walls pop. Join
coherence is therefore reopened as failed. None of these observations is an rAF
sample or frame-time measurement.

Pending the five ordered captures in the [room matrix](../v2-room-matrix.md#foreground-performance-record),
including both Canvas drift calculations and the final procedural WebGPU comparison.

## Visible review and owner decision

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
