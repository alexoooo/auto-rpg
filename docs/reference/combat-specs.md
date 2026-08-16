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

**`material` became load-bearing on 2026-08-16, and no byte moved.** It had been
written into every digest and read by nothing. `Material::crush_factor` now gives the
blunt conversion the weapon/body channel bills on whatever the edge and the point
declined -- `Flesh` 0, `Steel` 7/8, `Wood` 3/4 -- which is why a club can wound at all.
Before that, `club`'s `edge=0` above meant a swing routed its entire share into
`pressure`, a column no anatomy has ever read: **a swung club could not injure anybody
at any speed, by construction.** The coefficient hangs off `Material` rather than
sitting beside `edge` and `point` because those two are shape (a steel sword and a
steel shield disagree about both) while crushing is stiffness, and because a fifth
`SurfaceSpec` field would have widened the 17-byte leaf and the 195/40/44-byte rows and
dragged in a schema bump for no distinction the roster can express. See
[contact solver](contact-solver.md) for the formula.

Editing any dimension here changes `Scenario::fingerprint`, because the immutable spec
table is part of the fingerprint stream. `articulated-duel-v1` went from
`0x2a6cc9678c08730d` to `0x068d05fcada1027b` for exactly this edit. A *material's*
coefficient is not such a dimension: it is a constant behind the enum rather than a
written field, so `crush_factor` changing moves no fingerprint and no spec digest.

## Runtime construction: `Scenario::duel_from`

`CombatSpecTableV1::fixtures()` is a function that builds a fresh `Vec` on every call.
It is not a registry, nothing registers into it, and `crates/sim/src/combat/arena.rs`
is therefore free to build a **second** table beside it without touching what the
combat spec-table digest and the `articulated-duel-v1` fingerprint measure. That
freedom is conditional, and the condition is written beside the code as an invariant:
`fighter_anatomy`, `brute_anatomy`, `sword`, `shield`, `club`, `fixtures`,
`articulated_duel`, `COMBAT_SPEC_SCHEMA_V1`, `write_anatomy`, `write_equipment`,
`write_unit`, `write_combat_specs`, `write_surface`, `write_armor`,
`ScenarioByteSink`, `scenario_v1_fields_into` and `action_definition_bytes` are not
edited by a session that only wants a new arrangement.

`Scenario::duel_from(&DuelConfigV1) -> Result<Scenario, CombatSpecError>` describes two
fighters: an anatomy chosen from the two shipped rows, up to two hand items each, and
a spawn. It is named `duel_from` and not `arena_duel` because `Scenario::arena()`
already means the playable extent.

**The id order is part of the fingerprint, so it is fixed here rather than left to the
loops.**

1. Anatomy: fighter A is id 1, fighter B is id 2, always two rows, never deduplicated.
   Two fighters wearing the same frame get two byte-identical rows under two ids, which
   the ownership rules above already permit.
2. Equipment: fighters in order A then B; within a fighter, carrying slot 0 then 1;
   each present item takes the next id, `1..N`, up to four rows. Two fighters holding
   swords of different lengths are two distinct rows — one row cannot carry two sets of
   dimensions.
3. Carrying slots hold a fighter's present hand items ordered so that a `Role::Guard`
   item yields slot zero to anything that is not a guard, and otherwise left hand
   first. Slot zero is `Loadout::primary`, which is what a fighter walks in holding.

Under that order the shipped arrangement — shield in the left hand, sword in the right,
against a club in the right — reproduces `fixtures()` row for row, id for id and
binding for binding, and `the_shipped_arrangement_is_expressible` compares the whole
`Scenario` rather than a summary of it, so "everything except the name" is measured.

`duel_from` names what it builds `configured-duel-v1` and never `articulated-duel-v1`,
which is what keeps a runtime fingerprint from colliding with the pin. **That is a
convention, not an invariant, and the difference matters to anyone recording evidence
against a scenario name.** `Scenario.name` is a `pub String`, and the name is the only
byte that differs, so writing `"articulated-duel-v1"` into a configured duel that
described the shipped arrangement reproduces `0x068d05fcada1027b` exactly —
`a_configured_duel_is_never_the_pinned_fixture` asserts both halves. The constructor
names a scenario; nothing afterwards defends the name. Making it defensible would mean
a private field and a constructor on a type every scenario in the repository builds as
a struct literal.

`binding` is set from the hand index (0 is `LimbSlot::LeftArm`, 1 is `RightArm`) and
the `Loadout` is derived from the carrying slots, so `item.action == loadout.slot(n)`
holds by construction and `LoadoutMismatch` is unreachable from a configuration knob.
A hand item carries `action`, `mass`, `balance` and `geometry` and no `SurfaceSpec`: a
surface is a measured material rather than a dimension, so it is copied from the
shipped row for the same `ActionKind`.

**`GripBinding::Both` is expressible through `DuelFighterV1::two_handed`** (since
combat-arms-01), a flag beside the hand array rather than a third value of the hand
index, because a two-handed grip is one item occupying two hands. It turns the right
hand's `Right` into `Both`; the rule for the second arm is the actuator's standing
one — the left arm is the mirror and is not independently commandable. Every refusal
it can need already existed and is reached rather than restated: `validate_equipment`
refuses a `Both` shield, `validate_bindings` refuses `Both` beside a second carried
item, and the one rule `duel_from` adds itself is that the flag over an empty right
hand is a `GripConflict`, because no validator ever sees a binding with no row to sit
on. `a_two_handed_club_is_expressible_from_a_duel_config` is the test that the whole
path — flag to `Both` row to right-limb ownership to the left arm carrying no
collider — holds from a configuration.

**`duel_from` is one of two gates, and the other one owns `spawn`.** It calls
`validate_construction`, which checks the table: schema, id order, every dimension
bound, the bindings, and each loadout against the rows its unit carries. It does not
check where a fighter stands. `World::try_new` runs `check_contact_envelope`, which
bounds the arena extent and the spawn against `CONTACT_COORDINATE_LIMIT` (256) because
`fx` fails an out-of-contract sweep *closed* — one out-of-envelope row would
manufacture a contact with every hostile collider in the arena. `DuelFighterV1::spawn`
is the one public field with no bound of its own, so a configuration `duel_from`
accepts and fingerprints can still be a world that refuses to open. **Open it with
`World::try_new` and never `World::new`**, whose failure is a panic reading
`invalid combat construction: Contact(GeometryEnvelope)`;
`an_out_of_envelope_spawn_is_refused_by_try_new_and_not_by_duel_from` is the test that
keeps the split honest.

Two `CombatSpecError` variants exist for this constructor and are produced by nothing
else:

- `NoEquipment` — a fighter described holding nothing in either hand. `validate_rows`
  would answer `LoadoutMismatch` for the same configuration, via `(None, Some(_))`
  against a `Loadout` whose `primary` is not an `Option`; that is true about the table
  and useless in front of a person. Making `Loadout::primary` optional is **not** the
  fix: it is written by `action_definition_bytes` through `scenario_v1_fields_into`,
  which is both the ScenarioV1 identity stream and the replay codec, so an option tag
  in front of it moves every scenario fingerprint in the repository and invalidates
  every recorded replay.
- `UnknownAction` — a hand item naming an `ActionKind` with no shipped equipment row,
  and therefore no measured surface. Three of the eight actions have rows; the rest are
  refused rather than approximated to whichever row looks nearest.

`Dimension` and `GripConflict` are the two pre-existing variants a configuration can
still reach, through `validate_equipment`'s bounds and through two shields
respectively.

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
