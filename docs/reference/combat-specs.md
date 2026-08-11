# Articulated combat construction specs

**Purpose:** Define immutable anatomy, equipment, grip, and scenario construction data.
**Status:** current
**Canonical source:** `crates/sim/src/combat/spec.rs`, mirrored here.
**Update when:** A spec field, ID, fixture, validation rule, codec order, or fingerprint order changes.

## Ownership and implementation order

There is no global equipment registry. A `Scenario` owns the complete definitions
used by its articulated units, and a replay serializes those definitions. IDs are
scenario-local stable keys, never indexes into a mutable process table.

V2-11 lands structural validation against the current two-slot loadout. V2-12 lands
the immutable tables below and strengthens grip validation with binding rules; the
stable `MissingEquipment` rejection remains part of command V1. No temporary
accept-all or reject-all behavior is authorized.

Surface, regional maximum, blood, and armor fields land inertly here even though
v2-14 and v2-15 are their first consumers. Freezing all immutable schema-1 bytes in
one session prevents later mechanics from silently appending to a committed layout.
Anatomy coordinates are body-local (`+x` forward, `+y` left, `+z` up); body yaw
rotates them into the world axes owned by `combat-geometry.md`.

## Types and discriminants

All structs derive `Clone`, `PartialEq`, `Eq`, and `Debug`. Small leaf values also
derive `Copy`. Enum discriminants below are codec and fingerprint values.

```rust
pub const COMBAT_SPEC_SCHEMA_V1: u16 = 1;
pub type AnatomySpecId = u16;
pub type EquipmentSpecId = u16;

pub enum AnatomyRegion { Head = 0, Torso = 1, LeftArm = 2,
                         RightArm = 3, Legs = 4 }
pub enum Material { Flesh = 0, Steel = 1, Wood = 2 }
pub struct SurfaceSpec {
    pub restitution: Fx,
    pub friction: Fx,
    pub edge_factor: Fx,
    pub point_factor: Fx,
    pub material: Material,
}
pub struct ArmorSpec {
    pub coverage: Fx,
    pub hardness: Fx,
    pub absorption: Fx,
    pub material: Material,
}
pub struct AnatomyRegionSpec {
    pub region: AnatomyRegion,
    pub centre_z: Fx,
    pub half_height: Fx,
    pub radius: Fx,
}
pub struct BodyAnatomySpec {
    pub id: AnatomySpecId,
    pub schema: u16,
    pub standing_height: Fx,
    pub shoulder_height: Fx,
    pub shoulder_half_width: Fx,
    pub arm_length: Fx,
    pub hand_radius: Fx,
    pub regions: [AnatomyRegionSpec; 5],
    pub surface: SurfaceSpec,
    pub integrity_maxima: [Fx; 5],
    pub blood_max: Fx,
    pub armor: [ArmorSpec; 5],
}

pub enum EquipmentGeometry {
    Segment { length: Fx, radius: Fx },
    Shield { half_width: Fx, half_height: Fx, thickness: Fx },
}
pub enum GripBinding { Left = 0, Right = 1, Both = 2 }
pub struct EquipmentSpec {
    pub id: EquipmentSpecId,
    pub schema: u16,
    pub action: ActionKind,
    pub mass: Fx,
    pub balance: Fx,
    pub geometry: EquipmentGeometry,
    pub binding: GripBinding,
    pub surface: SurfaceSpec,
}
pub struct ArticulatedUnitSpecV1 {
    pub anatomy: AnatomySpecId,
    pub equipment: [Option<EquipmentSpecId>; 2],
}
pub struct CombatSpecTableV1 {
    pub anatomies: Vec<BodyAnatomySpec>,
    pub equipment: Vec<EquipmentSpec>,
}
```

`Scenario` gains `combat_specs: Option<CombatSpecTableV1>` and `UnitSpec` gains
`articulated: Option<ArticulatedUnitSpecV1>`. Every legacy constructor writes `None`
for both. `CombatModel::Legacy` requires both to be `None`.
`CombatModel::Articulated` requires a table, an articulated row for every unit, and
no legacy-only omission.

IDs in each table are strictly ascending and unique. Every referenced ID exists
exactly once. Definitions with identical fields but different IDs remain distinct.
Counts are bounded by 64 anatomies and 128 equipment definitions; an articulated
unit has exactly two carrying slots. Unknown schemas, duplicate IDs, missing
references, negative dimensions, dimensions over 8, non-positive mass, mass over 8,
a shoulder at or above standing height, an arm longer than 4, or an equipment
`ActionKind` that disagrees with the corresponding legacy loadout slot reject decode.
Surface and armor fractions lie in `[0,1]`; integrity maxima and blood maximum are
positive and at most 64.

As of v2-14 an Articulated world also has at most 64 allocated entity slots, owned
by the [contact capacity contract](contact-solver.md#candidate-matrix-identity-and-scratch).
This does not alter Legacy's 4,096 replay-scenario ceiling or native dynamic behavior.

Bindings are physical: `Left` may occupy only the left arm, `Right` only the right
arm, and `Both` occupies both arms from one equipment slot. Two different `Both`
items, a `Both` item beside any second item, one single-hand item on both arms, two
shields, and a shield-geometry item bound to `Both` are invalid. Shield classification
uses `EquipmentGeometry::Shield`, not `ActionKind::Shield`; custom scenario-local
equipment cannot evade the construction rule by naming another action. Empty slots
are explicit and never fall back to a body default.

## Fixture definitions

The first slice uses these exact `Fx::from_ratio` values:

```text
FIGHTER_ANATOMY id=1 schema=1 height=9/5 shoulder_z=7/5
  shoulder_half_width=1/4 arm_length=3/4 hand_radius=1/10
  Head       centre_z=17/10 half_height=1/10 radius=1/5
  Torso      centre_z=11/10 half_height=2/5  radius=7/20
  LeftArm    centre_z=6/5   half_height=3/10 radius=3/20
  RightArm   centre_z=6/5   half_height=3/10 radius=3/20
  Legs       centre_z=2/5   half_height=2/5  radius=3/10
  surface restitution=0 friction=1/2 edge=0 point=0 material=Flesh
  integrity_maxima=[2,2,2,2,2] blood_max=12
  armor all regions: coverage=0 hardness=0 absorption=0 material=Flesh

BRUTE_ANATOMY id=2 schema=1 height=2 shoulder_z=3/2
  shoulder_half_width=3/10 arm_length=17/20 hand_radius=3/25
  Head       centre_z=19/10 half_height=1/10 radius=1/4
  Torso      centre_z=6/5   half_height=9/20 radius=2/5
  LeftArm    centre_z=13/10 half_height=7/20 radius=1/5
  RightArm   centre_z=13/10 half_height=7/20 radius=1/5
  Legs       centre_z=9/20  half_height=9/20 radius=7/20
  surface restitution=0 friction=1/2 edge=0 point=0 material=Flesh
  integrity_maxima=[3,3,3,3,3] blood_max=18
  armor all regions: coverage=0 hardness=0 absorption=0 material=Flesh

SWORD id=1 schema=1 action=Sword mass=31/25 balance=11/20
  Segment length=19/20 radius=1/25 binding=Right
  surface restitution=1/8 friction=1/4 edge=1 point=1 material=Steel
SHIELD id=2 schema=1 action=Shield mass=9/10 balance=7/20
  Shield half_width=1/4 half_height=1/4 thickness=1/20 binding=Left
  surface restitution=1/8 friction=3/4 edge=0 point=0 material=Steel
CLUB id=3 schema=1 action=Club mass=223/100 balance=61/100
  Segment length=29/20 radius=3/50 binding=Right
  surface restitution=1/4 friction=1/2 edge=0 point=1/2 material=Wood
```

The Fighter fixture carries `[Sword, Shield]`; initial bindings hold shield left and
sword right. The Brute carries `[Club, None]`; its right arm binds slot zero and its
left arm is empty. A focused two-handed test may clone Club under a distinct local
ID and change only its binding to `Both`. These are the only shipped articulated
fixture rows before v2-18.

**The shield's face moved once, and its mass did not.** v2-20 took `half_width` from
`7/20` to `1/4` and `half_height` from `1/2` to `1/4` — 36% of the face area — leaving
mass, balance, thickness, binding and surface at their v1 values. The plate at `1/2`
covered the whole of a Fighter's legs at a `LOW` guard and the whole of its head and
both arms at `HIGH`, so no attacker height beat a `MID` guard except at the head; at a
quarter no guard height covers any region outright. The mass staying at `9/10` for 36%
of the area is a known inconsistency and is recorded rather than fixed:
`equipment_inertia` feeds arm acceleration, so moving it in the same commit would have
confounded that session's attrition measurements with a change in how fast the guard arm
travels. The old dimensions are reserved as a *tall shield* archetype and are not a
calibration to restore. `sim::combat::spec::the_plate_leaves_a_different_hole_at_every_guard_height`
derives the coverage tables from these rows.

Editing any dimension here changes `Scenario::fingerprint`, because the immutable spec
table is part of the fingerprint stream. `articulated-duel-v1` went from
`0x2a6cc9678c08730d` to `0x068d05fcada1027b` for exactly this edit.

## Fingerprint and codec order

`EquipmentGeometry::Segment` is `0` and `Shield` is `1`; source order is append-only.
`fingerprint_into` is the single writer used by `Scenario::fingerprint` and replay
codec. It writes declaration order: enums as `u8`, IDs/schemas as `u16`, raw `Fx` as
`i32`, option tag `u8` before value, and vectors as `u16` count then ascending-ID
rows. Geometry writes its tag then exactly its variant fields.

Fixed leaf widths are `AnatomyRegionSpec = 13`, `SurfaceSpec = 17`, and
`ArmorSpec = 13` bytes. A `BodyAnatomySpec` is 195 bytes. An `EquipmentSpec` is 40
bytes for Segment geometry and 44 for Shield geometry. `ArticulatedUnitSpecV1` is 4
to 8 bytes: anatomy ID, then two option tags and optional IDs.

Codec V1 has no reserved tail and is never appended. Codec V2 writes the exact
presence byte, 195-byte anatomy rows, 40/44-byte equipment rows, and unit bindings
owned by [Replay codec V2](replay-codec-v2-combat-specs.md#compatibility-rule).
Legacy state hashing never reads these fields. In the ArticulatedV1 suffix position
owned by `hash-domains-v1.md`, hashing writes the exact codec-V2 bytes from combat
spec presence `1` through the original unit-binding rows. It then writes one
construction/binding row for every allocated entity slot in slot order: anatomy ID
`u16`; carrying slot zero and one option tags `u8` and present IDs `u16`; then
resolved left and right equipment option tags `u8` and present IDs `u16`. Dead
allocated slots retain all three immutable values. Carrying rows are not redundant:
same-action definitions can exchange carrying slots without changing resolved arms,
while changing what `EquipSlot(0)` means. The stored-command slot count already
delimits these rows, so this block writes no second slot count.
