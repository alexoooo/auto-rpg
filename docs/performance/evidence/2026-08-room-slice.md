# 2026-08 representative room slice evidence

**Purpose:** Record the automated v2-09 authored-room artifacts, visible owner decisions, and pending foreground captures.
**Status:** current
**Canonical source:** the [room matrix](../v2-room-matrix.md#artifact-and-environment-record) and current [room asset contract](../../reference/room-asset-contract.md#manifest-semantics)
**Update when:** An artifact, raw capture, fixed-view screenshot, review result, or owner decision is recorded.

The generator-v4 room pipeline and automated artifact are current. Its concept-directed masonry and atlas revision has automated validation but still owes a visible owner review. The initial visible
art review ended in an owner `replace` decision. After the replacement work, the
owner accepted minimum legacy parity on 2026-08-09 and chose `pass/proceed`.
No foreground performance result exists. A 2026-08-16 live-route recheck passes the
repaired wall-join criterion only; it must not be cited as a numerical pass, a
forced-backend result, or completion of the ultimate painted-art direction.

## Method and provenance

The automated artifact identities are build inputs
`3773434dded396df2365990ac6599b08ae6714357ee5dd607fe6df47e6978839`, GLB
`91479310571aa0b0291532e63f9549fdf79914d19dfe6c1f8b8a09fd550a6420`, sidecar
`01279c6fe13b62b7cc3e33207416384800590196abfcfdd40726e2f00202a52a`, validator
`ab128ca3f29fa8cd230e2cb477d9f63e2b7520b200ffd7ac39dcc61ca45a33c8`, and room map
`1262c7dc5eb359a06db10a06c85e2782237b226e423a903f72441f1dfde18e6c`.
The pinned Blender binary remains
`25bdb2e3f8ed0bac9d51b7a25fbea0f712a8d80346f2efc9dbe24d85e910c310`.

Generator version 4 uses deterministic style `concept-umber-stone-v2`. Its floor
and wall quadrants come from the checked 1,254 x 1,254 concept-material atlas,
SHA-256 `037c8588e18d585fd6c50ff4ba8e071459bf88c04aac4c22058a2743673149b6`,
and produce deterministic 512 x 512 embeds
`a5effbaebebcf0ca1737b4953f53516f6d7274a232f20ccfc8676d854426f9a8` and
`d01683a26efff554e88162bf00379a2420a95c814d700c0ecc696065a51c130b`.
Four fitted, irregular courses replace each former box-wall source while retaining
the exact semantic names and pivots. Wall bounds now encode their centreline topology:
straight E+W, inside/L E+S, outside/T E+S+W, and capped end E. Their 12% modulation is coherent per block rather than per face; aged wood uses base `[0.14, 0.11, 0.085]`, roughness `0.90`, separate top/side modulation, and a cooler `woodEnd` response for barrel caps. CORNER-domain
`room_style` remains normalized `UNSIGNED_SHORT` `VEC4` `COLOR_0`.
The artifact is 2,904 vertices and 1,472 triangles. Offline residency components
are 122,880 source-buffer, 222,208 instance, 2,097,152 decoded-texture, and
4,194,304 shadow-map bytes, totaling 6,636,544 bytes. The GLB is 1,108,424 bytes
and sidecar 5,423 bytes, totaling 1,113,847 payload bytes.

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
20-pixel corner margin and 60% span. The repaired cardinal selector activates the exact 160/4/8/4 straight/L/T/end
census with one joined source per representative solid tile and leaves the map hash
unchanged. Masks 1 through 14 have exact transformed openings and exposed caps; the
synthetic cross uses two straights, while mask zero occurs in neither shipped fixture
and is explicitly not treated as a closed isolated-wall solution. Eight socket flame meshes add eight effects
and raise stress draws from 12 to 20 without changing the nine-light count.
Validator 2.0.0-dev.3.10 reports zero errors, warnings, and hints, plus four
informational messages for the 13-node, 12-mesh, four-material,
2,904-vertex, 1,472-triangle kit.

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
toolchain checks, TypeScript compilation, lazy delivery/build smokes, and the renderer contract suite pass. The runtime exercises the current pinned room through
the scene-bound lazy loader without weakening visibility or simulation authority.

## Foreground measurements

A fresh visible `#/game` reload on 2026-08-16 reached Worker + representative-room
ready with no console warning or error. The reviewer observed continuous long wall
runs, centre-filled L and T junctions, full capped directional ends, and no repeated
perpendicular teeth at the fog frontier. That directly closes the screenshot's join
defect after the selector changed from indiscriminate fog-as-solid to tri-state
neighbours: fog may continue only the opposite side of one known axis. This is
foreground topology/readability evidence, not an rAF sample, frame-time measurement,
or forced-WebGL2 result.

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
recorded visual-track decision is therefore `pass/proceed` at the minimum legacy
parity threshold. All foreground measurements remain pending.
