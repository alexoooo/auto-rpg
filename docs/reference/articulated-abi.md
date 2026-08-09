# Articulated observation and stream ABI

**Purpose:** Freeze subject observations, feature widths, host word layouts, exports, capacities, and stream digests for v2-16.
**Status:** proposed
**Canonical source:** `crates/sim/src/obs.rs`, `crates/policy/src/lib.rs`, and `crates/web/src/lib.rs` after v2-16 lands
**Update when:** An observation field, feature offset, word offset, export, capacity, ownership rule, or digest byte changes.

This document owns the subject-scoped observation, appended feature width, wasm word
layouts, capacities, exports, and portable stream digest. The legacy frame remains
the contract in [`frame-abi.md`](frame-abi.md).

## Subject-scoped observation

`MAX_ARTICULATED_OPPONENTS = MAX_CONTACTS = 6`. `World::observe_articulated(id)`
returns a blank observation for a stale identity. A nonblank observation contains:

```rust
pub struct ArticulatedObservation {
    pub tick: u32,
    pub subject: EntityId,
    pub capabilities: u32,
    pub body_position: Vec3,
    pub body_yaw: Angle,
    pub body_velocity: Vec3,
    pub arms: [ObservedArm; 2],
    pub shield: ObservedShield,
    pub blood_fraction: Fx,
    pub shock: Fx,
    pub integrity_fraction: [Fx; 5],
    pub wound_fraction: [Fx; 5],
    pub severed_mask: u8,
    pub opponent_count: u8,
    pub opponents: [ObservedOpponent; 6],
}
```

Capability bits are: movement `0`, turning `1`, left grip `2`, right grip `3`, left
weapon `4`, right weapon `5`, shield `6`, and two-handed binding `7`; higher bits are
zero in V1. `ObservedArm` is hand position, actuator target-hand position, hand velocity, fatigue, integrity
fraction, severed flag, and equipment code. `ObservedShield` is presence, center,
unit normal, and two half-extents.

`ObservedOpponent` contains full identity, body position/velocity/yaw, head sphere,
torso capsule, both arm capsules, leg capsule, both weapon endpoints, shield geometry,
severed mask, and `contact_timing`. Geometry uses the same structs and coordinates as
the anatomy contract. For timing, let `delta_xy = opponent.body_position.xy -
subject.body_position.xy`, `distance = delta_xy.length()`, and
`closing_speed = dot(subject.body_velocity.xy - opponent.body_velocity.xy,
delta_xy.normalized_or_zero())`. If `closing_speed <= 0`, timing is exactly one;
otherwise it is `clamp(distance / max(closing_speed, 1/256), 0, 1)`. All operations
are the existing fixed-point `Vec2` operations in the written order.

Select opponents on ground-truth sight and masonry visibility, sort by
`(delta_xy.length_sq(), EntityId.index, EntityId.generation)`, and retain six. No hidden
identity or geometry enters an unused row. Obvious equipment/severance/capability
fields are categorical and noise-free.

Perception noise uses a separate stateless stream keyed by seed, tick, full subject
identity, and domain `0x4152544f425331` (`ARTOBS1`). For every retained row, draw
exactly seven signed fractions in body-position XYZ, body-velocity XYZ, timing order.
Convert a PCG32 draw with `signed_raw = (draw >> 15) as i32 - 65_536`, producing an
Fx fraction in `[-1,1)`. Draw all seven even for absent local geometry.
Measured position components add `signed * perception_noise`; velocity components
add `signed * perception_noise / 4`; timing adds
`signed * perception_noise / 8` and clamps `[0,1]`. The subject's proprioception and
all categorical fields remain exact. Opponent-local region/equipment geometry keeps
its exact local shape and is translated by measured-minus-true body position, so one
noisy body does not shear into disconnected parts.

## Appended feature block

V2-16 sets `FEATURE_LAYOUT_VERSION = 12`,
`ARTICULATED_FEATURE_COUNT = 472`, and `FEATURE_COUNT = 922`. Existing indices
`0..450` remain byte-identical. Legacy observations append 472 zeroes.

The articulated block is 64 self features followed by six 68-feature opponent rows.
Self order is: present; eight capability bits; yaw cosine/sine; body velocity XYZ;
for each left/right arm, hand position relative to body XYZ, target-hand position
relative to body XYZ, velocity XYZ, fatigue,
integrity fraction, severed; shield present, relative center XYZ, normal XYZ, two
extents; blood fraction, shock; five integrity fractions, five wound fractions, five
severed bits. Opponent order is: present; relative body position XYZ, relative
velocity XYZ, yaw cosine/sine; head relative center XYZ/radius; torso relative
endpoints XYZ/XYZ/radius; left then right arm relative endpoints XYZ/XYZ/radius; leg
relative endpoints XYZ/XYZ/radius; left then right weapon relative endpoints
XYZ/XYZ; shield present/relative center XYZ/normal XYZ/two extents; five severed
bits; contact timing. Empty rows are all zero. Identity remains exact in the
structured observation and is deliberately not coerced into an `Fx` feature.

## Word representation and submitted command

Every new pose/event wasm buffer is `[u32]`. The submitted-command scratch is the
exact `[u8; 55]` owned by v2-11, not a word buffer. Unsigned stream values are direct. `Fx` and signed values
are their two's-complement raw `i32` bits reinterpreted as `u32`; `Angle` and TOI raw
values are widened to `u32`. Booleans are zero or one. Entity identity is always two
words: index then generation. Lengths and capacities below count rows, strides count
32-bit words.

Submitted commands reuse the exact 55-byte buffer, byte offsets, canonical payload,
validation, and rejection behavior in
[`articulated-command-v1.md`](articulated-command-v1.md#fifty-five-byte-wasm-action-buffer).
V2-16 does not introduce a second command encoding.

Exports are:

```text
init_articulated(seed:u32) -> void
submitted_command_ptr() -> u32
submitted_command_len() -> u32              // 55 bytes
submitted_command_layout_version() -> u32   // 1
submit_articulated(index:u32, generation:u32) -> u32
```

`init_articulated` uses the same room/hero fixture as `init` with
`CombatModel::Articulated`; it does not alter `init`. Submit returns the exact packed
outcome/reason/detail word already specified by v2-11; v2-16 neither remaps it nor
calls a second decoder. Rejection and fallback semantics therefore remain identical
across the direct wasm and worker paths.

## Pose rows

`POSE_LAYOUT_VERSION=1`, `MAX_POSES=64`, `POSE_STRIDE=66`. `MAX_POSES` equals the
authoritative v2-14 `MAX_ARTICULATED_ENTITIES`; exact Legacy world limits remain
unchanged. Rows are ascending full identity, one per live articulated body at the end
of the most recent host call. Prefix/drop handling remains defensive for malformed
or future-version producers rather than permission to exceed the sim cap.

| words | field |
|---:|---|
| 0..1 | entity index, generation |
| 2..4 | body XYZ |
| 5 | body yaw raw |
| 6..8 | body velocity XYZ |
| 9..15 | left hand XYZ, velocity XYZ, fatigue |
| 16..18 | left actuator target-hand XYZ |
| 19..25 | right hand XYZ, velocity XYZ, fatigue |
| 26..28 | right actuator target-hand XYZ |
| 29..34 | left weapon hilt XYZ, tip XYZ |
| 35..40 | right weapon hilt XYZ, tip XYZ |
| 41..48 | shield center XYZ, normal XYZ, half-width, half-height |
| 49..53 | integrity fractions in BodyPart order |
| 54..58 | wound fractions in BodyPart order |
| 59..60 | blood fraction, shock |
| 61 | severed mask, BodyPart bits |
| 62 | equipment-present mask: left weapon, right weapon, shield bits 0..2 |
| 63 | intent discriminant |
| 64..65 | left and right animation hints |

An absent weapon/shield writes zero geometry. Animation hint codes are Idle `0`,
Chasing `1`, Braced `2`, Contact `3`, Recoiling `4`, Severed `5`; codes are append-only.

Exports are `pose_ptr`, `pose_len`, `pose_stride`, `pose_capacity`, `poses_dropped`,
and `pose_layout_version`. Overflow retains the first 64 canonical rows and increments
the per-publication saturating drop count for every omitted row.

## Combat-event rows

`COMBAT_EVENT_LAYOUT_VERSION=1`, `MAX_COMBAT_EVENTS=256`, and
`COMBAT_EVENT_STRIDE=32` until the mandatory high-water measurement says otherwise.
Events accumulate across all ticks of one `step(ticks)` call in
`(tick, toi.raw, contact_group_ordinal, ContactKey)` order. Group ordinal starts at
zero each tick and distinguishes sequential groups that share a raw TOI.

| words | field |
|---:|---|
| 0..2 | tick, TOI raw, contact group ordinal |
| 3..6 | A index/generation, B index/generation |
| 7..9 | A slot, B slot, ContactKind |
| 10..15 | contact point XYZ, normal XYZ |
| 16..21 | group energy before, after, dissipated as low/high `u32` pairs |
| 22..29 | cut, thrust, pressure, deflected energy as low/high `u32` pairs |
| 30 | BodyPart, or `0xffff_ffff` when absent |
| 31 | severance flag |

Exports are `combat_event_ptr`, `combat_event_len`, `combat_event_stride`,
`combat_event_capacity`, `combat_events_dropped`, and
`combat_event_layout_version`. Overflow keeps the canonical prefix and counts the
dropped tail with saturating addition. No priority class or lethal event reorders it.

The two new static arrays cost 16,896 and 32,768 bytes respectively, for 49,664
bytes excluding thread-local wrapper bookkeeping. The 55-byte command buffer belongs
to v2-11 and is not charged again to this session. Compile-time assertions use
`MAX_POSES*POSE_STRIDE*4 + MAX_COMBAT_EVENTS*COMBAT_EVENT_STRIDE*4`.

The mandatory event high-water corpus is one hand-built articulated scenario named
`abi-high-water`, world seed `0x4152504741424931`, open `24x16` room, and 64 units.
For `i=0..31`, Fighter `2*i` is Heroes at `(4+i/4, 2+(i%4)*3)` and Brute
`2*i+1` is Monsters exactly `3/2` units east. Stats and immutable equipment are the
v2-12 fixtures. At target tick zero every Fighter submits yaw/bearing zero, height
cycling LOW/MID/HIGH by `i%3`, reach/effort one, Keep grips, Attack its paired Brute;
every Brute submits half-turn yaw/bearing, the same height cycle, reach/effort one,
Keep grips, Attack its paired Fighter. No later commands are submitted. One host
call executes `step(8)` and the high-water mark is the number of combat-event rows
accumulated across that exact eight-tick batch. Repeat seeds are not samples: the
single seed is part of the fixture. Acceptance remains at most 128 rows before the
256-row capacity is frozen.

## Ownership, visibility, and memory

The raw arrays are authoritative-host views owned by the wasm worker. They must not
cross to the renderer unfiltered. Before transfer, the worker retains the subject and
currently visible identities in canonical order, filters events whose geometry would
reveal an absent identity, and writes a complete snapshot buffer. Pose/event pointer
stability lasts for the module lifetime.

After warm-up, maximum pose, contact, event, spawn, reset, and route paths may not
increase `wasm.memory.buffer.byteLength` while a legacy frame view is held. The Node
test also proves the original frame, pose, and event typed arrays remain attached.

## Portable stream digest

Use FNV-1a-64 with the constants in the contact contract. Prefix ASCII
`ARPG-STREAM-V1`. For every tick, including an empty tick, feed little-endian:
`tick:u32`, pose length, poses dropped, every live pose row word, event length, events
dropped, every live event row word. Tests drive one tick per publication so drop
metadata has one meaning. Native and wasm use identical scripted inputs and bytes;
state hashes are not part of this digest.
