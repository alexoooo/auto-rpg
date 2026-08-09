# 2026-08 representative room slice evidence

**Purpose:** Record the automated v2-09 authored-room artifacts while reserving the browser captures, screenshots, and owner decision.
**Status:** current
**Canonical source:** the [room matrix](../v2-room-matrix.md#artifact-and-environment-record) and current [room asset contract](../../reference/room-asset-contract.md#manifest-semantics)
**Update when:** An artifact, raw capture, fixed-view screenshot, review result, or owner decision is recorded.

The generated room pipeline and automated runtime are current. The initial visible
art review ended in an owner `replace` decision; no art pass or foreground
performance result exists, and this record must not be cited as either kind of pass.

## Method and provenance

The automated artifact identities are build inputs
`b63c1075e84368ec98c3ea0bb5d8767ce77494d360ae38df38456b27892dc969`, GLB
`a680684f40ddce4164d8627b8fcee927af24f4f6c49198e95eadf12bbaf93449`, sidecar
`f2c4ffd8db9ffcd31b88a8824fac5b7e7dca76d15e6768d1f809d6802ea114b5`, validator
`b32b32e6792f613b3a6d8349b43df62b5c67a511d996fb7152046d190ac6a939`, and room map
`1262c7dc5eb359a06db10a06c85e2782237b226e423a903f72441f1dfde18e6c`.
The pinned Blender binary is
`25bdb2e3f8ed0bac9d51b7a25fbea0f712a8d80346f2efc9dbe24d85e910c310`.

Generator version 3 uses deterministic style `readable-stone-v1`: checked 1,254 x
1,254 floor and wall source PNGs with SHA-256
`948fad4172800b7b78b2500a8da91e2b7b1c6ad1af18f00ccff854af92a6340b` and
`11eb80b1161c47e975499583e5a4052731181b9411dc346dd795379851d13845`,
deterministically resampled and periodic-edge blended into 512 x 512 embeds with
SHA-256 `77215f5d4f92ce4384bc1136e6c4bbdc66353eeba6b0a0590dca337ac0bdc743`
and `bce279eb8aee948b59821365912b683e0013b29f84ede455505f55c2c748dd54`,
plus CORNER-domain `room_style` exported as normalized `UNSIGNED_SHORT` `VEC4`
`COLOR_0`. Offline residency components are 21,120 source-buffer, 222,208 instance,
2,097,152 decoded-texture, and 4,194,304 shadow-map bytes, totaling 6,534,784
bytes. The GLB is 948,640 bytes and sidecar 5,384 bytes, totaling 954,024 payload
bytes. The prior generator-v2 vertex-only artifact is a superseded intermediate.
Generator v3 is the current mechanical candidate, but visible review remains pending.
The compact review route is also mechanically current and covered by the 53-test
renderer suite: it uses a fixed 16 x 10 snapshot, no Worker or performance capture,
review-only dark-navy clear and non-shadow hemispheric fill, and leaves the 48 x 32
stress fixture and its nine lights unchanged. No visible result has yet been recorded
for that compact route.
The compact fixed camera injects zoom `1.6` while ordinary/stress remains `1`; its
16:9 orthographic top/bottom are `+/-8.125` and automated bounds retain the declared
20-pixel corner margin and 60% span. Corrected straight-wall orientation leaves the
160/4/8/4 roles and map hash unchanged. Eight socket flame meshes add eight effects
and raise stress draws from 12 to 20 without changing the nine-light count.
Validator 2.0.0-dev.3.10 reports zero errors, warnings, and hints, plus 12
informational messages for the 13-node, 12-mesh, four-material,
504-vertex, 272-triangle kit.

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
toolchain checks, TypeScript compilation, lazy delivery/build smokes, and the 50-test
renderer contract suite pass. The runtime exercises the current pinned room through
the scene-bound lazy loader without weakening visibility or simulation authority.

## Foreground measurements

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
painted-art acceptance. This is a failed initial art review, not a pipeline or numerical
performance failure. Replacement review and all foreground measurements remain
pending.
