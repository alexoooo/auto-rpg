# 2026-08 representative room slice evidence

**Purpose:** Record the automated v2-09 authored-room artifacts, visible owner decisions, and pending foreground captures.
**Status:** current
**Canonical source:** the [room matrix](../v2-room-matrix.md#artifact-and-environment-record) and current [room asset contract](../../reference/room-asset-contract.md#manifest-semantics)
**Update when:** An artifact, raw capture, fixed-view screenshot, review result, or owner decision is recorded.

The generated room pipeline and automated runtime are current. The initial visible
art review ended in an owner `replace` decision. After the replacement work, the
owner accepted minimum legacy parity on 2026-08-09 and chose `pass/proceed`.
No foreground performance result exists, and the visual decision must not be cited
as a numerical pass or as completion of the ultimate painted-art direction.

## Method and provenance

The automated artifact identities are build inputs
`a8c98a41336f25e67bc635b7251dc4a68fe93e7b3bd72a5f275fba51aee04f74`, GLB
`cfd30f7fc7a105e3ad6f181266fb1a2c1f6034a0866208fa71d5fd565b7fdc10`, sidecar
`b15c44c454a908eaabbe8c19ecc1bd13bd58fd28935a5b4bef7c9583175a0635`, validator
`40a93c34e397e59da0c4372e7f68f645e8d66a2ced6e714071465d693eec90f0`, and room map
`1262c7dc5eb359a06db10a06c85e2782237b226e423a903f72441f1dfde18e6c`.
The pinned Blender binary is
`25bdb2e3f8ed0bac9d51b7a25fbea0f712a8d80346f2efc9dbe24d85e910c310`.

Generator version 3 uses deterministic style `readable-stone-v1`: checked 1,254 x
1,254 floor and wall source PNGs with SHA-256
`8ebbbb618cf748b62a63a950fdc60aaa1e6930eb8ea69d24b97793428f4a3d70` and
`f456977162d07e8c4ae7dedf17048a83c181854d992876c91fd0b577451ed4cc`,
deterministically resampled and periodic-edge blended into 512 x 512 embeds with
SHA-256 `fadbb6d0cd8566f50131bfcd4261f6b54f4596c58372aa22105e34cdf09d358b`
and `cbe20f9cabf7a15f7e6c406ea4fcec85971c291c22973cf62e3116014f7e9ff3`,
plus CORNER-domain `room_style` exported as normalized `UNSIGNED_SHORT` `VEC4`
`COLOR_0`. Offline residency components are 21,120 source-buffer, 222,208 instance,
2,097,152 decoded-texture, and 4,194,304 shadow-map bytes, totaling 6,534,784
bytes. The GLB is 943,584 bytes and sidecar 5,384 bytes, totaling 948,968 payload
bytes. The prior generator-v2 vertex-only artifact is a superseded intermediate.
Generator v3 is the current mechanical candidate accepted at the minimum legacy-parity threshold.
The first generator-v3 source pair is also superseded: compact review showed that its
many small stones collapsed into nearly flat one-metre tiles. The current pair uses
one-to-four floor slabs and three-to-four wall courses per game tile; the deterministic
resample, periodic-edge blend, sampler, and runtime ownership are unchanged.
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
Validator 2.0.0-dev.3.10 reports zero errors, warnings, and hints, plus four
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
painted-art acceptance. This was a failed initial art review, not a pipeline or
numerical performance failure.

The replacement added deterministic floor/wall textures, compact review framing,
authored lighting and torch treatment, corrected wall orientation, the same style on
the playable route — `/v2.html` when this was reviewed, `/#/game` since v2-ui-01 folded
it into the studio shell — and bounded zoom to `12`. After reviewing the current
playable result, the owner said it looked good enough to proceed on 2026-08-09. The
recorded visual-track decision is therefore `pass/proceed` at the minimum legacy
parity threshold. All foreground measurements remain pending.
