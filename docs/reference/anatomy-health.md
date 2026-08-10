# Anatomy and health contract

**Purpose:** Freeze regional geometry, wound transfer, impairment, death, and health rules.
**Status:** current
**Canonical source:** [`crates/sim/src/anatomy.rs`](../../crates/sim/src/anatomy.rs) and [`combat/spec.rs`](../../crates/sim/src/combat/spec.rs)
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
ContactKeys. All five use the general swept segment/segment primitive rather than the
vertical-capsule one: two of them are arms, which point wherever the actuator left
them, and with equal endpoint displacement and a zero half-height the two primitives
run the identical conservative advance.

Group re-derivation at a frozen pose (`contact_at_pose`) swaps the tuple's first term
for the closest-pair distance at that pose, and does **not** re-sweep. Membership is
already settled by mapped time, so a re-sweep could answer `None` for a pair the
conservative advance left a raw unit short, and dropping a settled member is worse
than choosing its region by the same statement about the same geometry with time
stopped. The other two terms are unchanged.

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
maximum before narrowing. Pressure remains `u64` and changes no anatomy.
The exact ledger extension is
`incoming = deflected + absorbed + penetrating`; armor never adds energy.

**Integrity takes the whole loss; a wound is the cutting share of it.** Structure is
damaged by everything that gets through, but only an edge leaves an open surface to
bleed from, so the wound gain is the loss split in the incident cut/thrust ratio:

```text
wound_gain = floor(loss_raw * cut_raw / incoming)
```

with checked `u128` products and division. The thrust share is the remainder rather
than a second division, so the two are exactly the loss and no rounding escapes into
either column -- and it is thrust that carries the remainder because thrust is the
column nothing downstream reads. A pure thrust opens no wound and therefore starts no
bleed clock; a pure cut opens one worth the whole loss.

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

When integrity reaches zero, set `severed=true`. A severed region contributes no volume
to any sweep from the group that severed it onward, and that is a property of the
region rather than of the limbs: the death rule reads head, torso and blood only, so a
body fights on with its legs destroyed and those legs must not reappear when the next
tick rebuilds its colliders. A severed arm additionally has effort factor zero,
releases its grip at group end, and contributes no equipment collider on the
next re-sweep. It cannot take hold of anything again either: a stored
`GripRequest::EquipSlot` naming a severed arm is accepted by command validation --
which is about bindings, not injuries -- and refused by the grip phase. Otherwise write each `arm_authority` as
`integrity / regional_max * (1 - shock)`. Write both `move_authority` and
`turn_authority` as `legs.integrity / legs.maximum * (1 - shock)`. The actuator
reads those already-combined factors once; do not multiply shock a second time.
Impairment changes acceleration, not requested direction, target yaw, maximum
velocity, or mass.

`AnatomyState::last_attacker` records the source of the final ContactKey that wounded the target in
a group. Credit is always the decrease of the health query, never an integrity loss:
the torso is worth two sixths of the weighted fraction, so the same integrity taken
there moves health twice as far as it does on a limb, and crediting the loss directly
would pay two attackers differently for the same damage. A group's decrease is split
between its facts in `ContactKey` order in proportion to the integrity each of them
applied, with the last contributing fact taking the exact remainder so the shares sum
to the decrease. A fact that applied nothing is credited nothing. Later bleed summary
loss is credited to the target's current `last_attacker`; `EntityId::NONE` receives no
credit, and neither does a handle whose generation has moved on. Credit accumulates in
the existing metric column.

`ContactResolution::severed` is set on every fact that applied a positive integrity
loss to a region the group ended up severing, and on no other. A fact that penetrated
nothing severed nothing, however the region ended up. Two blows that between them
empty a region are both reported: they both took part, and picking one of them by
whether it would have sufficed alone would be an arbitrary rule with no consumer.

After `ContactSolverState::cap_hits` in the ArticulatedV1 suffix, hashing writes one
row per allocated entity slot without another slot count: all five part rows in
`BodyPart` order, then blood, shock, and `last_attacker` index/generation. Dead slots
retain their final anatomy row. The identity is authoritative because later bleed
credit reads it; mutating either identity word must move only the ArticulatedV1
digest. A part row is integrity raw `i32`, wound raw `i32`, and severed `u8`, so one
anatomy row is exactly `5*9 + 4 + 4 + 8 = 61` bytes -- `ANATOMY_HASH_ROW_BYTES`.

## Tick position

The articulated tick runs `contact`, then `anatomy`, then `doors`, then `reap`. The
anatomy phase is where bleeding, shock decay, and the impairment factors are written,
once, after every contact group has been applied; wounds themselves land inside the
solver, group by group, because a severance has to reach the geometry in the tick that
made it. The reaper is after doors for the same reason the legacy one is: death is
derived once, from everything the tick did.

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

## Measured limits this session found

Two facts about what the v2-14 solver actually delivers, recorded here because they
are constraints on `v2-17`'s fixtures rather than defects in these rules.

**Emergent wounds are near-nil at the shipped roster's scale.** An equipment collider
carries one generalized point velocity -- body plus *hand* -- so a swing's tip speed
is not represented, and a hand moves at most `ARM_LINEAR_MAX_SPEED_RAW`. The
dissipated energy that reaches `channels` is then routinely under the raw-144
`CONTACT_ENERGY_FLOOR` and lands entirely in pressure, which changes no anatomy. A
charging *body* onto a braced weapon clears the floor comfortably; an arm swing does
not. Every wound test in `crates/sim/src/world.rs` therefore scales the target's
regional maxima down, exactly as `articulated-mechanical-gate.md`'s severance case
already specifies.

**A mirrored pair of blows cannot both close at a tick-start overlap.** At `toi.raw==0`
there is no geometric side, so the contact normal is world `+X` unconditionally, and
closing is measured along it. For two mirrored weapon/body facts the closing terms are
exact negations, so exactly one resolves and the other separates. A genuinely
simultaneous two-blow mutual kill therefore needs positive-time contacts, which in
turn needs sweeps with real extent. Death itself is unaffected: it is derived once
after the whole tick, so two bodies still die together whatever finished each of them.
