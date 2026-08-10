# Browser frame ABI

**Purpose:** Define the exact packed frame consumed by both current browser entries.
**Status:** current
**Canonical source:** [`crates/web/src/lib.rs`](../../crates/web/src/lib.rs#L38), [`web/main.js`](../../web/main.js#L45), and [`tools/wasm_check.js`](../../tools/wasm_check.js#L78)
**Update when:** A frame column, section, code meaning, capacity, or layout version changes.

<!-- DOC_CONTRACT: frame-abi-layout -->
## Current layout

The current `FRAME_LAYOUT_VERSION` is **7**. The frame is one fixed-capacity `f32`
array with a **15-float header**, followed by `unit_count` rows of **33 floats**,
`shot_count` rows of **4 floats**, and `event_count` rows of **8 floats**.

| Section | Exact fields, in order |
|---|---|
| header | `arena_x`, `arena_y`, `order_kind`, `order_x`, `order_y`, `last_decision_tick`, `unit_count`, `shot_count`, `event_count`, `monsters_left`, `portal_x`, `portal_y`, `portal_state`, `depth`, `events_dropped` |
| unit | `x`, `y`, `facing_raw`, `radius`, `hp`, `max_hp`, `faction`, `kind`, `intent`, `entity_index`, `entity_generation`, `limb_angle_raw`, `limb_reach`, `limb_spin`, `action_length`, `action_arc_raw`, `hit_flash`, `block_flash`, `parry_flash`, `limb_swing`, `limb_swing_left`, `limb_line_raw`, `action_kind`, `action_role`, `slot`, `slot0_action`, `slot1_action`, `sight_range`, `visible`, `vx`, `vy`, `stride`, `swing_span` |
| shot | `x`, `y`, `heading_raw`, `faction` |
| event | `kind`, `x`, `y`, `amount`, `actor_index`, `other_index`, `aux0`, `aux1` |

The authoritative definitions are [`HEADER_LEN`](../../crates/web/src/lib.rs#L139),
[`UNIT_STRIDE`](../../crates/web/src/lib.rs#L220),
[`SHOT_STRIDE`](../../crates/web/src/lib.rs#L268),
[`EVENT_STRIDE`](../../crates/web/src/lib.rs#L314), and
[`FRAME_LAYOUT_VERSION`](../../crates/web/src/lib.rs#L426).

**This document owns the frame and nothing else.** Two further `u32` publications sit
beside `FRAME` in the same linear memory — the pose rows and the combat-event rows,
with their own pointers, strides, capacities, drop counters and layout versions — and
they are specified in [`articulated-abi.md`](articulated-abi.md#pose-rows). They are
not sections of the frame, they do not move `FRAME_LAYOUT_VERSION`, and the four-file
handshake below applies to each ABI separately.

## Identity and numeric representation

A unit row's position is not identity: dead rows disappear and later rows shift. A
body is identified by the exact pair `entity_index` and `entity_generation`. An index
alone can be reused by a later spawn. Event actor indices are grouping hints within
the arriving frame, not persistent handles.

Angles cross as raw binary turns and are converted to radians only for drawing.
Integer values that lose precision in `f32`, including the tick and 64-bit state hash,
use separate integer exports.

<!-- DOC_CONTRACT: frame-abi-compatibility -->
## Compatibility rules

Columns and codes are append-only inside a layout version. A reordering can repaint
the game while producing valid numbers, so it is never a harmless cleanup. Any shape
or meaning change bumps the layout version and updates all copies together:

1. Rust constants, writer, and module layout comment;
2. `web/main.js` constants and parser;
3. `tools/wasm_check.js` constants and assertions;
4. the generated worker ABI and snapshot parser; and
5. this reference.

At boot the page compares version, header length, and each stride against wasm and
refuses to draw a layout it does not understand. `frame_ptr` and `frame_len` are pure
reads; JavaScript creates a short-lived direct view, makes no wasm call while parsing
it, and copies parsed values into its own retained pools.

The v2 diagnostic keeps the packed row meanings unchanged but copies the live frame
into its [atomic leased snapshot](worker-protocol.md#snapshot-layout-and-buffer-ownership).
Its generated constants repeat the layout handshake, and its visibility filter may
remove spatial rows and recompute the three live counts before transfer. That
presentation-only filtering does not define another frame layout version.

This document is the canonical destination for the exact layout formerly copied by
`AGENTS.md#the-frame-abi-is-a-handshake-across-four-files` and the frame-layout prose
in `DESIGN.md#performance-notes`.
