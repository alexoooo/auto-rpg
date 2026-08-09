# Anatomy and health contract

**Purpose:** Freeze regional geometry, wound transfer, impairment, death, and health rules for v2-15.
**Status:** proposed
**Canonical source:** `crates/sim/src/anatomy.rs` and `combat/spec.rs` after v2-15 lands
**Update when:** A region, immutable field, transfer equation, decay constant, impairment, or health rule changes.

This document owns regional coordinates, armor transfer, wound evolution,
impairment, death, and the sole articulated health query. Legacy HP is unchanged.

## State and immutable specification

XYZ uses body-local X forward, Y left, Z up before body yaw rotates it into world
space. V2-15 re-exports the V1 `AnatomyRegion` as `BodyPart` rather than creating a
second region authority. Its `#[repr(u8)]` values are Head `0`, Torso `1`, LeftArm
`2`, RightArm `3`, Legs `4`; `COUNT = 5`. Mutable field order is:

```rust
pub struct PartWoundState { pub integrity: Fx, pub wound: Fx, pub severed: bool }
pub struct AnatomyState {
    pub parts: [PartWoundState; 5],
    pub blood: Fx,
    pub shock: Fx,
    pub last_attacker: EntityId,
}
```

Integrity and wound are health units. Blood is health units. Shock is a fraction
`[0,1]`. Construction sets each integrity to its immutable regional maximum, every
wound and severed flag to zero/false, blood to `blood_max`, shock to zero, and
`last_attacker` to `EntityId::NONE`.

V2-15 consumes the integrity maxima, `blood_max`, and five `ArmorSpec`s already
frozen inertly in the V1 `BodyAnatomySpec` declaration in
[`combat-specs.md`](combat-specs.md#types-and-discriminants). It does not append or
reinterpret immutable bytes. `ArmorSpec` field order remains coverage, hardness,
absorption, material code; the first three values are `[0,1]`. Definitions remain
scenario-owned and IDs never consult a mutable registry.

The fixture coordinates remain byte-for-byte those in
[`combat-specs.md`](combat-specs.md#fixture-definitions). Interpret them as follows:
Head is a sphere at `(0,0,centre_z)`. Torso and legs use a vertical medial segment
from `centre_z-half_height` through `centre_z+half_height`. Arm region centre/height
fields remain fingerprinted V1 construction data, but dynamic arm capsules use the
shoulder/hand rule below and the corresponding region radius. This session does not
rewrite an immutable V1 dimension.

Each region maximum is `max_health / 6`; Fighter uses `max_health=12`, Brute `18`.
`blood_max=max_health`. V2 fixtures have no worn plate by default: every armor
coverage is zero. Focused tests construct plate specs explicitly. Equipment/grip
fixtures remain sword-right, shield-left, and club-right.

## Region volumes and assignment

Head is a sphere. Torso and combined legs are vertical capsules. Each arm is the
capsule from its yaw-rotated shoulder to the current hand, with the immutable arm
radius. A severed arm has no shoulder-to-hand volume or grip collider after the group
that severs it. The severance event still carries its contact point.

For one weapon/body candidate, sweep all five volumes, then choose the least tuple
`(toi.raw, medial_distance_squared.raw, BodyPart as u8)`. The medial distance is from
the chosen contact point to the sphere center or capsule medial segment. Do not
compare surface distance and do not use float normalization. Publish only that one
fact and its chosen region; equal or overlapping regions never create duplicate
ContactKeys.

## Armor and wound transfer

V2-14 supplies `cut_raw`, `thrust_raw`, and `pressure_raw` as `u64` 16.16 energy
raws; v2-15 never narrows them to `Fx`. Let `incoming = cut_raw + thrust_raw` with
checked `u64` addition (the resolution-share invariant proves it fits). Define
`fraction(value,f) = floor((value as u128)*(f.raw as u128)/65_536)`, returning a
checked `u64`. The outward region normal is from the chosen medial
point to contact; degenerate uses body-forward. Let
`square = abs(dot(-normalized_or_zero(weapon_rv), outward_normal))`. In this name,
one is a square hit and zero a grazing hit. Use this exact widened order:

```text
deflected = fraction(fraction(fraction(incoming,coverage),hardness),1-square)
remainder = incoming - deflected
absorbed = fraction(fraction(remainder,coverage),absorption)
penetrating = remainder - absorbed
unclamped_loss_raw = checked_u128(penetrating) * 96
```

The multiplier 96 is the same physical `Fx::from_int(96)` whose raw representation
is `6_291_456`; fixed-point scales cancel, so no extra 65,536 enters the raw product.
Only after the widened product, clamp integrity loss to the pre-group integrity raw
and narrow that final value to `Fx`; clamp the new wound raw to its immutable regional
maximum before narrowing. Preserve cut/thrust ratio with checked `u128` products and
division; thrust receives the final rounding remainder. Pressure remains `u64` and
changes no anatomy.
The exact ledger extension is
`incoming = deflected + absorbed + penetrating`; armor never adds energy.

Every fact in one time group reads one immutable pre-group anatomy snapshot.
Accumulate integrity loss, wound gain, blood/shock effects, and severance flags by
entity and part in ContactKey order, then apply once. Death/outcome runs only after
the whole group.

## Bleeding, shock, impairment, and severance

Once per articulated tick after all contact groups:

```text
bleed = min(blood, sum(non-severed wound) * BLEED_PER_WOUND
                   + sum(severed regional maximum) * BLEED_PER_SEVERED)
blood = blood - bleed
shock = max(0, shock - SHOCK_DECAY_PER_TICK)
```

Constants are raw Fx: `BLEED_PER_WOUND = 18` (`1/3600` rounded down),
`BLEED_PER_SEVERED = 36` (`1/1800` rounded down), and
`SHOCK_DECAY_PER_TICK = 109` (`1/600` rounded down). Each contact group first adds
`min(1-shock, integrity_loss / max_health / 2)` to shock. Shock decay never runs
between simultaneous facts.

When integrity reaches zero, set `severed=true`. A severed arm has effort factor zero,
releases its grip at group end, and contributes no equipment or arm collider on the
next re-sweep. Otherwise write each `arm_authority` as
`integrity / regional_max * (1 - shock)`. Write both `move_authority` and
`turn_authority` as `legs.integrity / legs.maximum * (1 - shock)`. The actuator
reads those already-combined factors once; do not multiply shock a second time.
Impairment changes acceleration, not requested direction, target yaw, maximum
velocity, or mass.

`AnatomyState::last_attacker` records the source of the final ContactKey that wounded the target in
a group. Immediate summary loss is credited to each source in key order from that
fact's applied loss. Later bleed summary loss is credited to the target's current
`last_attacker`; `EntityId::NONE` receives no credit. Credit is clamped to the actual
decrease of the health query and accumulates in the existing metric column.

After `ContactSolverState::cap_hits` in the ArticulatedV1 suffix, hashing writes one
row per allocated entity slot without another slot count: all five part rows in
`BodyPart` order, then blood, shock, and `last_attacker` index/generation. Dead slots
retain their final anatomy row. The identity is authoritative because later bleed
credit reads it; mutating either identity word must move only the ArticulatedV1
digest. A part row is integrity raw `i32`, wound raw `i32`, and severed `u8`, so one
anatomy row is exactly `5*9 + 4 + 4 + 8 = 61` bytes.

## Sole health and death query

Let `part_fraction = integrity / immutable_maximum`. The weighted regional fraction
is:

```text
(head + 2*torso + left_arm + right_arm + legs) / 6
```

The immutable maximum health is the corresponding weighted sum of regional maxima;
the fixture's equal maxima therefore reproduce 12 and 18. Blood fraction is
`blood/blood_max`. A body is dead when head integrity, torso integrity, or blood is
zero. Query health is zero when dead; otherwise:

```text
health = max_health * min(blood_fraction, weighted_regional_fraction)
```

Observation, pose/frame health, timeout fitness, outcome, and damage credit call this
query. There is no mutable articulated HP or regeneration cache. Legacy worlds keep
their existing HP, regeneration, death, observation, frame, fitness, and hash path.
