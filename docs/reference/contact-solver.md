# Contact solver contract

**Purpose:** Freeze contact layouts, ordering, equations, cap behavior, and corpus bytes for v2-14.
**Status:** proposed
**Canonical source:** `crates/sim/src/combat/contact.rs` and `resolution.rs` after v2-14 lands
**Update when:** A collider, contact field, coefficient, equation, ordering rule, cap rule, or digest byte changes.

This is the canonical deterministic contract for the purpose-built XYZ contact
solver. Legacy combat does not construct its state or call it.

## Contract

### Public rows and ownership

`Fx` is 16.16 fixed point. `TimeOfImpact` is an inclusive tick fraction with raw
values `0..=65_536`. World XYZ is +X east, +Y north, +Z up.

```rust
pub const MAX_CONTACT_GROUPS_PER_TICK: u8 = 8;
pub const MAX_ARTICULATED_ENTITIES: usize = 64;
pub const MAX_CONTACT_FACTS_PER_GROUP: usize = 512;
pub const MAX_CONTACT_RESOLUTIONS_PER_TICK: usize = 4_096;
pub const BODY_SLOT: u8 = 0xff;
pub const CONTACT_COMPONENT_SPEED_LIMIT: Fx = Fx::from_int(4);

#[repr(u8)]
pub enum ContactKind { WeaponWeapon = 0, WeaponShield = 1, WeaponBody = 2 }

pub struct ContactKey {
    pub a: EntityId,
    pub a_slot: u8,
    pub b: EntityId,
    pub b_slot: u8,
    pub kind: ContactKind,
}

pub struct ContactFact {
    pub key: ContactKey,
    pub toi: TimeOfImpact,
    pub region: u8,
    pub point: Vec3,
    pub normal: Vec3,
    pub velocity_a: Vec3,
    pub velocity_b: Vec3,
}

pub struct ContactImpulse { pub key: ContactKey, pub on_a: Vec3, pub on_b: Vec3 }
pub struct EnergyLedger { pub before_raw: u64, pub after_raw: u64,
                          pub dissipated_raw: u64 }
pub struct ContactSolverState { pub cap_hits: u32 }

pub struct ContactResolution {
    pub group_ordinal: u8,
    pub group_alpha_raw: u32,
    pub fact: ContactFact,
    pub impulse: ContactImpulse,
    pub energy: EnergyLedger,
    pub cut_raw: u64,
    pub thrust_raw: u64,
    pub pressure_raw: u64,
    pub deflected_raw: u64,
    pub severed: bool,
}
```

There is one resolution per fact, sorted by `(group_ordinal, ContactKey)`. The
group's accepted `alpha.raw` and ledger are copied onto every row in that group. V2-14 always writes
`deflected_raw=0` and `severed=false`; v2-15 activates those fields. `World` owns
`contact: Option<ContactRuntime>`, which is `None` in every Legacy world. The
articulated runtime contains `ContactSolverState`, retained unhashed scratch, and
`contact_resolutions: Vec<ContactResolution>`. It clears resolutions at articulated
tick entry and exposes the completed last tick through
`World::contact_resolutions(&self) -> &[ContactResolution]` and the counter through
`World::contact_cap_hits(&self) -> u32`. V2-15 consumes each completed group before
the following sweep; the retained rows are observation evidence, not a second
authority.

`ContactResolution::impulse` is diagnostic: it is that fact's proposed impulse
scaled as `on_a.raw=trunc(proposed_on_a.raw*alpha.raw/65_536)` componentwise and
`on_b=-on_a`, so opposition is exact. Deterministic
per-row truncation means its rows need not sum to the widened collider accumulator
that was scaled once and applied. Neither the ABI nor a test may reconstruct state
by summing diagnostic rows.

`EntityId` order is `(index,generation)`. `ContactKey` order is
`(a.index,a.generation,a_slot,b.index,b.generation,b_slot,kind)`. Weapon/weapon puts
the lower `(EntityId,LimbSlot)` first. Weapon/shield and weapon/body put the weapon
first. Left is slot 0, right is slot 1, and a body is `BODY_SLOT`. A `Both` segment
has exactly one collider, owned by its authoritative right arm and therefore slot 1.

The normal points from A toward B. A zero closest-point delta at tick-start initial
overlap (`toi.raw==0`) uses world +X unconditionally because no geometric side
exists. At positive TOI it uses `normalized_or_zero(velocity_a-velocity_b)`, falling
back to +X only when relative velocity is also zero. Thus a positive-time exact
crossing closes, while an initially separating overlap receives no attracting impulse. The
point is the componentwise midpoint made by adding signed raw coordinates in `i64`,
dividing by two with truncation toward zero, then narrowing; never saturate before
the divide. V2-14 weapon/body facts always use region `0xff`. The Torso byte in the
serialization-only forward-format fixture below does not describe a v2-14 solver
output. Velocities are generalized point velocities over one tick, not per-second
values.

## Tick-entry poses and collider construction

Before articulated movement mutates a row, retain its tick-entry `pos`, body yaw,
both complete `ArmState` rows, grips, and shield pose in contact scratch. Movement
then records three planar points in written order: `tick_start`,
`post_movement_pre_separate`, and `post_separate`. Let

```text
locomotion = post_movement_pre_separate - tick_start
contact_body_start = post_separate - locomotion
contact_body_end = post_separate
```

with saturated `Vec2` subtraction exactly as parenthesized. Thus wall-clipped intended
locomotion is swept, while `World::separate` shifts both sweep endpoints equally and
cannot manufacture contact velocity. `World::vel` after separation is nevertheless
the authoritative body generalized velocity: separation impulse belongs to it even
though positional overlap correction does not.

An absolute hand point is the selected body endpoint plus the corresponding
body-origin-relative hand. An equipment point velocity is
`(World::vel.x,World::vel.y,0) + ArmState::linear_velocity`; every point on that
equipment collider uses this one generalized velocity. A body uses
`(World::vel.x,World::vel.y,0)`. This deliberate point-mass model has no angular
velocity or hidden rigid-body state.

A held `EquipmentGeometry::Segment` becomes a horizontal capsule segment. Its hilt
is the absolute owning hand and its tip is
`hilt + (cos(arm.bearing),sin(arm.bearing),0)*length`; its radius is the immutable
segment radius. Previous geometry uses the retained tick-entry arm/body row;
requested geometry uses the post-actuator row. Empty, released, or later-severed
grips produce no collider. A `Both` item uses only the right hilt/bearing and is not
emitted again for the mirrored left arm.

A shield front face uses the owning hand as `ShieldPose.centre`. `thickness` is full
thickness, so front centre is `centre + normal*(thickness/2)`. Body-left is
`(-normal.y,normal.x,0)` and up is +Z. Corners are lower-left, lower-right,
upper-right, upper-left. Previous and requested corners are constructed independently
from the retained and requested poses. The sweep linearly interpolates those corners;
it does not interpolate and renormalize a separate normal. The finite face is
two-sided. "Front" fixes its offset and reported orientation, not a back-face cull.

The temporary v2-14 body is one vertical capsule at the body endpoint. Let `r` be
the largest immutable anatomy-region radius, `middle=standing_height/2`, and
`half_axis=max(0,middle-r)`. Its axis is
`middle-half_axis .. middle+half_axis` and its radius remains `r`; an unusually wide
body therefore degenerates to a sphere without an invalid reversed axis. Its
surface, generalized mass, and velocity are the anatomy surface, cached body mass,
and body velocity. V2-15 replaces only this target builder with five region volumes.

## Public continuous geometry

V2-14 extends [`combat-geometry.md`](combat-geometry.md#continuous-equipment-sweeps)
with public `fx::swept_segment_segment`, `fx::closest_points_segment_rectangle`, and
`fx::swept_segment_rectangle`. The sim
must call those functions; a private approximation in `sim` is not a second allowed
implementation. Both use the same raw interpolation, conservative advance,
96-advance escape, invalid-input containment, and exact feature tie rules frozen
there. At the returned TOI the sim recomputes the winning closest pair, midpoint,
normal, and generalized velocities; geometry feature rank never enters a key.

## Candidate matrix, identity, and scratch

Only distinct live hostile entities in an Articulated world participate.

| A | B | generated |
|---|---|---|
| segment equipment | segment equipment | once, canonical A/B |
| segment equipment | shield front | once, weapon first |
| segment equipment | opponent temporary body capsule | once, weapon first |
| body | body | never; planar `World::separate` owns it |
| shield | body or shield | never |
| allies or the same entity | anything | never |

Scan ascending full entity identities, then left and right owner slots, then
`ContactKind` order. Sort and deduplicate facts by `ContactKey`; if several primitive
features make the same key, retain the least
`(toi.raw, distance_raw_squared, feature_rank)` returned by the public geometry
function. No row position or bare index is identity.

Articulated worlds have the authoritative entity ceiling
`MAX_ARTICULATED_ENTITIES=64`; Legacy world and codec limits do not change. Capacity
uses allocated-slot high water `n`, not live count. For `n<2`, pairs is
zero; otherwise compute with checked `usize` arithmetic:

```text
pairs = n*(n-1)/2
candidate_bound = pairs*16
collider_bound = n*3
```

Sixteen deliberately over-reserves the valid-construction maximum: four
weapon/weapon, up to eight directed weapon/shield slots, and four directed
weapon/body. At the ceiling, `candidate_bound=32_256`. Candidate storage and
suppression reserve that bound. Facts, one-group indices, and accumulators reserve
`MAX_CONTACT_FACTS_PER_GROUP=512`; group metadata reserves 8; closure and collider
rows reserve `collider_bound`; completed resolutions reserve
`MAX_CONTACT_RESOLUTIONS_PER_TICK=4_096`; start snapshots reserve `n`. Reserve before
changing any world column and clear/reuse
afterward. Capacity may grow only when allocated high water grows. Reusing a dead
slot does not reserve.

Add exact compatibility APIs:

```rust
pub enum ContactCapacityError { EntityLimit, PairCount, CandidateCount, ResolutionCount,
                                ColliderCount, EnergyNumerator, GeometryEnvelope,
                                Allocation }
pub enum WorldBuildError { CombatSpec(CombatSpecError), Contact(ContactCapacityError) }
pub enum SpawnError { CombatSpec(CombatSpecError), Contact(ContactCapacityError) }

pub fn World::try_new(scenario: &Scenario, seed: u64) -> Result<World,WorldBuildError>;
pub fn World::try_spawn(&mut self, spec: &UnitSpec) -> Result<EntityId,SpawnError>;
pub fn World::try_reserve_contact_slots(&mut self, high_water: usize)
    -> Result<(),ContactCapacityError>;
```

`World::new` and `World::spawn` remain source-compatible wrappers that call the typed
form and panic before mutation on error. `try_new` validates combat construction and
all contact counts before allocating. `try_spawn` validates the row, computes the
prospective high water, checks/reserves every contact vector, and only then mutates
world columns. Both typed APIs return `EntityLimit` for articulated row 65. Codec V2
rejects an Articulated ScenarioV2 above 64 during structural validation, while exact
legacy V1 codec/world behavior retains its existing 4,096 scenario ceiling and
otherwise native dynamic behavior. The web host also refuses row 65 and calls
`try_reserve_contact_slots(MAX_UNITS=64)` immediately after articulated construction,
before returning a pointer or permitting a typed-array view. Its memory test then
fills the world, runs the cap fixture, and asserts all contact capacities and wasm
memory remain unchanged during one further tick.
Calling `try_reserve_contact_slots` on a Legacy world is an exact no-op `Ok(())`.
On Articulated, `high_water>64` returns `EntityLimit` before reserve; a request at or
below the already reserved/allocated high water is a no-op and never shrinks. On
allocation failure no authoritative world column, solver counter, or resolution row
mutates. Sequential `Vec::try_reserve` calls may already have grown some unhashed
scratch capacities before a later reserve fails; the API does not promise capacity
atomicity and tests must not inspect it as authoritative state.

Geometry-envelope preflight uses arena/dungeon extrema, not only initial spawns. For
each anatomy/equipment combination compute checked maximum absolute XY extent as
`arena_extent + max(max_region_radius, shoulder_half_width + arm_length +
max(segment_length,shield_half_width + thickness/2))` and maximum absolute Z as
`max(standing_height + max(segment_radius,shield_half_height),
standing_height/2 + max_region_radius)`. Every component must be
at most 256. Independently, `try_new` checks every initial `UnitSpec.spawn` X/Y raw
component and that spawn plus its exact anatomy/equipment reach against ±256;
`try_spawn` repeats the same check for the dynamic row before reserve or mutation.
This direct-API rule rejects `Fx::MIN/MAX` even when later arena settling would have
clamped it. Reject with `GeometryEnvelope` before allocation or spawn mutation.

The energy preflight checks `collider_bound * 8.raw * 3 * 4.raw^2` in signed `i128`.
At solver entry after separation, perform this componentwise order exactly:

```text
Db = clamp(Vb,-4,4) - Vb
body_requested += Db
every held absolute requested endpoint += Db once
Ve_prime = clamp(Vb,-4,4) + old_arm_relative_velocity
De = clamp(Ve_prime,-4,4) - Ve_prime
owning_equipment_requested += De
arm_relative_velocity = clamp(Ve_prime,-4,4) - clamp(Vb,-4,4)
```

Then inverse-map any shifted endpoint and apply the `Both` mirror. Body translation
is not added a second time during equipment clamp. This entry clamp is
articulated-only and precedes energy and sweeps; it remains authoritative even when
no fact occurs. Application clamps again. Focused tests cover repeated
crowded separation, movement, Both mirroring, and both clamps. No unchecked product,
`HashMap`, unstable sort, float, RNG, or allocation order may affect output.

## Time groups and coupled state

The collector begins with the previous and requested collider poses above and global
raw time zero. Global raw time is the only pose parameter. Local zero maps to the
current global `g`; a positive local sweep result `u` maps to

```text
t = g + ceil((65_536-g)*u/65_536)
  = g + ((65_536-g)*u + 65_535)/65_536
```

in widened unsigned arithmetic. This never places state one raw unit before a
conservative contact. Collect the minimum `t`. In tentative scratch, advance every
collider on its current piecewise trajectory from its pose `p` at `g`
toward current requested end `e` as
`p + trunc_toward_zero((e-p)*(t-g)/(65_536-g))` in checked widened arithmetic.
Never interpolate again from tick start after group one. Recompute and
sort/deduplicate facts at that one global pose for the immutable group. Equal mapped `t` is simultaneous even
when local fractions differed. Initial overlap is exactly local zero. The vector
`g=65_535,u=1` maps to 65,536 and is the mandatory near-end collapse test.

If that earliest equal-time set contains more than 512 facts, resolve none. At the
current last-safe `g`, restore the tentative pose, seed the ordinary whole-entity cap
closure from all overflowing facts, freeze that closure, let outsiders finish, increment `cap_hits` once, and end
contact for the tick. This is deterministic capacity exhaustion, not truncation; no
prefix of a simultaneous group is privileged. Eight admitted groups of at most 512
rows fit the 4,096-resolution ceiling exactly.

Detect this without overflowing the 512-row fact vector: the first candidate pass
counts every recomputed earliest fact with checked `usize`; when the count exceeds
512, a second pass over retained candidates at the same tentative global pose adds
each matching fact's two owning entities directly to the 192-row closure worklist.
No overflowing `ContactFact` is pushed or silently omitted.

Before resolution, snapshot one immutable generalized state. A fact participant
expands the group state to its owning entity body plus every currently held collider.
This entity closure is also the cap-closure node set. It prevents a body impulse from
translating held equipment without that equipment's kinetic energy being counted.
Accumulate every sorted fact into signed widened raw impulse sums, then apply each
collider accumulator once. A body delta changes XY `World::vel`, discards Z as floor
reaction, and translates every owned equipment trajectory by the same delta. An
equipment delta changes only its owning arm velocity/trajectory.

For an accumulator component, the exact applied raw delta is

```text
delta_velocity_raw = trunc_toward_zero(sum_impulse_raw * alpha_raw / mass_raw)
```

using checked signed `i128`. There is no extra factor of 65,536: the alpha and mass
fixed-point scales cancel. Clamp the resulting component before geometry is rebuilt.

Each collider has a mutable requested end initialized to the controller end. At a
group, add `delta_velocity * (65_536-t)/65_536`, in that parenthesized saturated-Fx
order, to that current requested end. Deltas accumulate across groups; the original
controller end is never reasserted during this tick. Rebuild every remaining sweep
from the applied current pose to the new requested end. Do not reuse a fact.

For a changed arm, subtract the applied body origin from its applied absolute hand,
then inverse-map: height is `hand.z/standing_height`, reach is horizontal shoulder
distance divided by arm length, and bearing is the absolute fixed-point angle of that
horizontal vector. Clamp through the v13 joint helpers. If that clamp moves the hand,
the clamped hand is the state used by the energy validity check. Scalar speeds are
the shortest-turn/raw scalar differences from the pre-group scalar pose, divided by
the nonzero remaining fraction with truncation toward zero; when the remaining
fraction is zero they are zero, otherwise the quotient persists. Re-derive geometry
after each group. For `Both`, inverse-map only the right
owner, then call the v13 two-handed mirror. Left `previous_hand` remains its tick-entry
value and final left `linear_velocity` is final left hand minus that previous hand.

At final commit, every contacted arm—not only `Both`—keeps
`previous_hand=tick_entry.hand` and writes `linear_velocity=final_relative_hand-
previous_hand`. Its scalar speeds use the remaining-fraction rule above; when
`t==65_536` they are zero.

Choose final scratch rows first. With no fact and no entry clamp, they are the saved
requested World rows byte-for-byte. A body entry clamp selects its adjusted scratch
endpoint. An equipment entry clamp selects its adjusted endpoint and requires the
same inverse-map/`Both` mirror/previous-hand/scalar-speed commit as a contacted arm.
Then commit every changed final body endpoint through the existing wall-settlement path exactly once;
do not run body/body separation a second time. A wall-clipped component is zeroed by
that existing path. Zero the same absolute velocity component on every held collider
of that body, then rebuild its arm-relative velocity and `Both` mirror. Any new body
overlap is owned by the next tick's single planar separation pass. Wall settlement is
after the solver, separately dissipative, and absent from group ledgers/injury. A
test compares closure energy immediately before/after settlement and requires it not
to increase.

A key in the immediately previous group whose local re-sweep TOI is zero (and whose
mapped time therefore equals current global time) first tests current velocities
against that predecessor fact's stored normal. Suppress when
`dot(current_velocity_b-current_velocity_a,predecessor_normal) >= 0`. Reusing the
predecessor normal is essential at exact coincident points: recomputing the
velocity-derived degenerate normal after a bounce would flip it and falsely call the
separating pair closing. If the test is negative, recompute the new fact and its
normal normally. A positive local TOI removes the key from this predecessor set. The
set is sorted, tick-local, and unhashed.

## Impulses and exact energy rule

Generalized mass is immutable equipment mass for weapon/shield and body mass for a
body. Coefficients are the minimum of the two immutable surfaces. In this exact
saturated-Fx order:

```text
rv = velocity_b - velocity_a
closing = max(0,-dot(rv,normal))
inv_sum = 1/mass_a + 1/mass_b
j_normal = (1+restitution)*closing/inv_sum
tangent = rv - normal*dot(rv,normal)
j_friction = min(friction*j_normal,length(tangent)/inv_sum)
on_a = -normal*j_normal + normalized_or_zero(tangent)*j_friction
on_b = -on_a
```

Zero closing makes both impulses zero. Per-fact Fx impulses are accumulated as signed
`i128` raw components, never by saturated vector addition.

For every unique generalized collider in the expanded entity closure, sum
`mass.raw*(vx.raw^2+vy.raw^2+vz.raw^2)` into checked signed `i128`, then divide once
by `2*65_536*65_536`. The nonnegative quotient is a `u64` 16.16 energy raw. Apply
the accumulator at alpha 65,536 and include component and inverse-map/joint clamps
before recomputing. Wall settlement is later and unledgered. If full alpha is valid,
keep it. Otherwise restore the pre-group snapshot, set `alpha=0`, and visit bits
15 down through 0 exactly once. For each bit, trial `alpha | (1<<bit)` from the same
pre-group snapshot, including inverse/joint clamps, and keep that bit only when trial
energy is at most `before`. This 16-bit greedy-valid construction does not assume
energy monotonicity and does not claim a globally greatest alpha; it guarantees its
final chosen alpha was itself tested valid. Apply it once. The ledger is `before`, recomputed `after`, and
`before-after`; `after<=before` is asserted. One ledger belongs to the whole group.

## Injury channels

`CONTACT_ENERGY_FLOOR` is raw 144. Allocate group dissipated `u64` energy among
facts whose applied normal-impulse raw and closing raw are both positive. Each weight
is their checked `u128` product. With total `W`, every non-final positive row receives
`floor(dissipated*weight/W)` using checked `u128`; the final positive row receives the
exact remainder. If `W=0`, every share is zero.

Only weapon/body decomposes its share. `weapon_axis` is normalized `(tip-hilt)` and
`weapon_rv` is equipment generalized velocity minus body generalized velocity. A
zero segment puts the entire share in pressure. Otherwise use checked nonnegative
`u128` raw products and divisions in this parenthesized order:

```text
axial = max(0,dot(weapon_rv,weapon_axis))
axial_sq = axial.raw*axial.raw
transverse_sq = max(0, sum(weapon_rv_component.raw^2)-axial_sq)
available = share.saturating_sub(144)
thrust = floor(floor(available*axial_sq/(axial_sq+transverse_sq))*point_factor.raw/65_536)
cut = floor(floor(available*transverse_sq/(axial_sq+transverse_sq))*edge_factor.raw/65_536)
pressure = share-thrust-cut
```

A zero denominator puts the whole share in pressure. Channels remain `u64`; no v14
proof permits narrowing them to `Fx` or one ABI word. V2-14 mutates no health.

## Iteration cap

After group eight, perform the ordinary scan including zero-time suppression. If a
fact remains, take transitive closure by whole owning entity: each seed participant
adds its entity body and all held colliders, and facts touching any added collider add
their other entity until stable. Every collider in the closure keeps its last-safe
current pose, makes requested end equal current, and zeros body velocity or owning-arm
linear/scalar velocity. `Both` mirrors the zeroed right owner. Outsiders advance to
their current requested ends. Set previous/current geometry consistently to the
committed pose and increment `cap_hits` once with `saturating_add(1)`. The tick still
finishes. Only `cap_hits` persists.
The post-eight scan uses the same streaming candidate-to-closure pass when more than
512 facts remain; cap behavior never depends on fact-vector truncation.

In ArticulatedV1 hashing write exactly one global `cap_hits:u32`, after the complete
loop of allocated-slot actuator rows and before v2-15 anatomy rows. It is not per
slot. Legacy hashing writes no tag or placeholder. Adding zero therefore intentionally
moves the paired articulated command probe from `0x584d711e492950e7` to the predicted
`0x010411d521a376d7` if no other v14 behavior touches that unstepped fixture; Rust and
wasm must measure and update together. All six legacy pins remain fixed.

## Portable serialization corpus

Use FNV-1a-64 with offset `0xcbf29ce484222325` and prime `0x100000001b3`. Feed ASCII
`ARPG-CONTACT-V1`, then little-endian words. Every tick writes `tick:u32`, counts for
facts, groups, impulses, and ledgers, then fact, impulse, and ledger rows, then
`cap_hits:u32`. A group has no serialized row in V1: its count is evidence only.
Entity IDs are index/generation `u32`; enum/slots/region are widened `u32`; Fx and TOI
write raw bits as `u32`; vectors are XYZ; a `u64` is low word then high word.

The literal corpus is:

1. tick 0: all counts and cap zero;
2. tick 1: stationary tangent WeaponWeapon, A `(0,0)` right, B `(1,0)` right,
   TOI 0, region `0xff`, point `(0,0,1)`, normal +X;
3. tick 2: the same row as WeaponShield with B left;
4. tick 3: the same row as WeaponBody with B `BODY_SLOT` and forward-format region
   Torso 1.

Each contact tick has counts `(1,1,1,1)`, zero velocities, zero impulse, and zero
ledger. Its byte count is
`20 header + 84 fact + 52 impulse + 24 ledger + 4 cap = 184`; therefore prefix 15,
empty tick 24, and three contact ticks make exactly 591 bytes. The required digest is
`0x1adfa9e01e36edf9`. The test constructs all expected bytes independently and
compares fields before hashing.

## Behavioral corpus V2

The behavioral proof calls the production collector/resolver with test-only
zero-length, zero-radius right-slot segment colliders. All have mass 1, friction 0,
generation 0, Y/Z zero, and requested end `previous+velocity`. Label is entity index;
equal faction letters are allies. Restitution is 1 unless shown. These rows exercise
identity filtering, TOI grouping, re-sweep, accumulation, energy, suppression, and
cap without actuator fixture noise.

| case | rows `(label:faction,x_raw,vx_raw)` | restitution | exact result |
|---:|---|---:|---|
| 0 | none | 1 | no group; cap 0 |
| 1 | `0:A,0,65536`; `1:B,16384,0`; `2:B,16384,0` | 0 | group 16384 facts `(0,1),(0,2)`, ledger `(32768,16384,16384)`, final `(x,vx)` `[(16384,0),(40960,32768),(40960,32768)]` |
| 2 | same | 1 | same group/facts; alpha 43691, ledger `(32768,32768,0)`, final `[(-1,-21846),(49152,43691),(49152,43691)]` |
| 3 | `0:A,0,65536`; `1:B,16384,0`; `2:A,32768,0` | 1 | groups 16384 `(0,1)` then 32768 `(1,2)`, ledgers `(32768,32768,0)`, final `[(16384,0),(32768,0),(65536,65536)]` |
| 4 | `0:A,0,16384`; `1:B,0,-16384` | 1 | one zero-time `(0,1)`, separating repeat suppressed after velocity exchange, ledger `(4096,4096,0)`, final `[(-16384,-16384),(16384,16384)]` |
| 5 | labels 0..9, alternating factions, `x_raw=label*4096`; label 0 velocity 65536, others zero | 1 | eight groups at 4096..32768 with `(k,k+1)` and ledger `(32768,32768,0)`; remaining `(8,9)` caps; cap 1; final `[(4096,0),(8192,0),(12288,0),(16384,0),(20480,0),(24576,0),(28672,0),(32768,0),(32768,0),(36864,0)]` |
| 6 | exception to zero-length rows: weapon A hilt 0/tip 32768, both translate +65536; temporary radius-zero body point B stays at 65536; both mass 1, restitution 0, edge/point 1 | 0 | WeaponBody at 32768 and point 65536, alpha 65536, ledger `(32768,16384,16384)`, channels `(cut=0,thrust=16240,pressure=144,deflected=0)`, final `[(81920,32768),(81920,32768)]`, where A's serialized coordinate is final tip |

Every listed fact has generation zero, A right slot, and normal +X. Weapon/weapon B
is right slot and kind 0; case 6 B is `BODY_SLOT` and kind 2. Region is `0xff`.
Point X equals the listed global TOI except case 6, whose point X is 65,536. Y/Z are
zero. Fact velocities are the pre-group moving label's `(65536,0,0)` and stationary
zero, except case 4's `(16384,0,0)` / `(-16384,0,0)`. Proposed/applied diagnostic
A X impulse is -32768 in cases 1, 4, and 6; -43691 after alpha in case 2; and -65536
in cases 3 and 5. B is its exact negation. All other impulse components and all
channels outside case 6 are zero. Alpha is 65,536 except case 2's 43,691. Group
ordinal is zero-based within each case; both case-1/2 facts have ordinal zero.

Feed ASCII `ARPG-CONTACT-BEHAVIOR-V2`. Per case write `case_id`, collider count,
resolution count, group count, and cap hits as `u32`. For every resolution write:

1. group ordinal and `group_alpha_raw`, widened to `u32`;
2. the complete 84-byte `ContactFact` using the 591-byte grammar;
3. the complete 52-byte diagnostic `ContactImpulse`;
4. the three ledger `u64` values, low word first;
5. cut, thrust, pressure, and deflected `u64`, low word first.

Finally write each final `x_raw,vx_raw` as `i32` bits in label order. `severed=false`
is invariant in v2-14 and omitted. The literal is exactly 3,548 bytes with digest
`0xfe6ce41ec023c1e5`. This corpus, unlike the independent 591-byte format-only pin,
covers every production resolution field active in v2-14 and a nonzero widened
weapon/body channel row.
The count proof is prefix 24 + case 0's 20 + cases 1/2/3 at 444 each + case 4 at
236 + case 5 at 1,700 + case 6 at 236 = 3,548.

Rust compares the production output to a hand-built literal, length, and digest, then
runs the production corpus on eight scoped threads. Release wasm exports
`contact_behavior_corpus_len() -> u32`,
`contact_behavior_corpus_byte(index:u32) -> u32` (256 out of range),
`contact_behavior_digest_lo() -> u32`, and `contact_behavior_digest_hi() -> u32`.
Whitelist all four. `wasm_check.js` independently builds all 3,548 expected bytes,
compares every byte, hashes them itself, and checks both exported halves. No expected
value is copied from a solver run.

## Required executable proofs

Every named proof uses either a literal behavioral row above or an exact world
fixture stated here:

- `one_sweep_recomputes_after_two_sequential_contacts`,
  `a_true_simultaneous_group_uses_one_pre_group_state`,
  `persistent_zero_time_contacts_do_not_livelock`,
  `cap_exhaustion_stops_at_the_last_safe_pose`, and
  `shared_limb_group_energy_is_clamped_as_one_system` assert cases 3, 1, 4, 5, and
  2 respectively, including every raw result.
- `contact_results_survive_entity_and_limb_index_permutations` runs case 1 after
  swapping labels 0/2 and right/left slots, maps full identities/slots back, and
  compares facts, ledgers, and final rows. `contact_keys_include_generation_and_have_one_total_order`
  enumerates generations 0/1 and both slots and compares the literal tuple sort.
- `allies_and_self_geometry_do_not_enter_contact_groups` changes case 1 to all A and
  separately aliases B to A; both yield zero facts. `body_body_contact_remains_planar_and_single_sourced`
  runs two overlapping articulated bodies with no equipment and asserts the pre-solver
  separation result, zero contact rows, and zero Z state.
- `crowded_separation_shifts_both_contact_endpoints_equally` fixes
  `tick_start=(8,8)`, pre-separate `(8+1/8,8)`, post-separate `(8+3/16,8)` and asserts
  contact start `(8+1/16,8)`, end `(8+3/16,8)`, displacement `1/8`.
- `mixed_body_and_equipment_entry_clamps_translate_each_endpoint_once` uses body X
  velocity 5 and right-arm relative X velocity 1. It asserts `Db=-1`, `Ve_prime=5`,
  `De=-1`, body requested X shifts by -1, equipment absolute requested X shifts by
  exactly -2, and stored body/equipment absolute velocities are both 4 with stored
  arm-relative X zero.
- `an_initially_separating_overlap_receives_no_attracting_impulse` uses coincident
  zero-radius A/B points with velocities `(-1/4,0,0)` and `(1/4,0,0)`, asserts
  initial normal +X, zero impulse, one suppressed repeat, and separating final rows.
  `a_positive_time_exact_crossing_uses_relative_velocity_for_its_normal` uses the
  centred shield crossing below and asserts TOI is positive, normal impulse is
  positive, and the weapon stops or reflects.
- `group_energy_accumulation_never_saturates` constructs the maximum 192 generalized
  colliders at mass 8 and velocity `(4,4,4)` in the pure energy helper and compares
  numerator `20_752_587_082_923_245_568` and `u64` quotient `2_415_919_104`.
  `contact_resolution_channels_do_not_narrow`
  supplies dissipated `u64::from(u32::MAX)+1` to the pure allocator and asserts the
  exact u64 pressure row.
- `a_stationary_edge_does_not_cut`, `running_onto_a_braced_point_records_positive_thrust`,
  and `transverse_motion_records_cut_and_axial_motion_records_thrust` use one
  zero-radius body capsule at origin and a length-1 sword: stationary is zero velocity;
  braced has sword velocity zero and body velocity `(-1/4,0,0)` along a +X sword;
  transverse/axial use sword velocity `(0,1/4,0)` / `(1/4,0,0)`. Restitution/friction
  are zero, sword edge/point are one, and tests assert respectively zero cut, positive
  thrust, and the strict channel inequalities `cut>thrust` / `thrust>cut`.
- `a_body_facing_shield_blocks_only_its_surface` uses a shield at origin facing +X,
  half-width/height 1/2 and thickness 1/8; identical point weapons sweep from
  `(1,0,0)` to `(-1,0,0)` and from `(1,3/4,0)` to `(-1,3/4,0)`. Only the first hits.
  Its resolution has positive normal impulse and final weapon X velocity `>=0`
  (stopped or reflected); the outside row has neither fact nor impulse.
  `a_low_shield_does_not_cover_a_high_contact` repeats at Z 0 and 3/4; only Z 0
  produces that positive blocking impulse and stopped/reflected result.
- `the_contact_corpus_has_a_documented_byte_order`,
  `the_behavioral_contact_corpus_has_literal_outcomes`, and
  `contact_corpus_matches_on_eight_native_threads` prove the two corpora above.
- `contact_modified_pose_survives_replay_at_every_tick` uses seed 1000, Fighter
  `(10,8)`, Brute `(23/2,8)`, and 60 ticks. Before each tick submit Fighter Hold,
  move/yaw zero, left tucked `(0,MID,1/4,0)`, right `(0,MID,1,0)`; submit Brute
  Hold, move zero/yaw HALF, left tucked `(HALF,MID,1/4,0)`, right
  `(HALF,MID,1/4,0)`, all grips Keep. Require at least one WeaponBody row, then
  compare every tick's resolutions, body/arm rows, cap counter, and StateDigest to
  playback of the recorded accepted commands.
- `dead_and_reused_slots_keep_contact_identity_and_hash_coverage` uses the same two
  rows in a private world test, marks slot 1 dead and puts it on `free`, then respawns
  the identical Brute spec. It requires new identity `(1,1)`, no emitted key with
  `(1,0)`, complete scratch/resolution clearing before reuse, and distinct articulated
  digest from the pre-reuse allocated columns. This test-only mutation is not a new
  public despawn API before v2-15.
- `contact_scratch_grows_only_with_allocated_high_water`,
  `invalid_dynamic_contact_capacity_fails_before_spawn_mutates`,
  `both_has_one_right_owned_collider_and_mirrors_after_contact`,
  `contact_cap_hashes_once_after_all_actuator_rows`, and
  `legacy_worlds_have_no_contact_state_or_schedule_phase` prove storage, Both,
  hashing, reuse, and legacy isolation. The web no-growth and byte-for-byte wasm
  checks prove the host side.
