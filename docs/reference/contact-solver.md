# Contact solver contract

**Purpose:** Freeze contact layouts, ordering, equations, cap behavior, projectile/body participation, and corpus bytes.
**Status:** current
**Canonical source:** [`contact.rs`](../../crates/sim/src/combat/contact.rs), [`resolution.rs`](../../crates/sim/src/combat/resolution.rs), and the contact phase in [`world.rs`](../../crates/sim/src/world.rs)
**Update when:** A collider, contact field, coefficient, equation, ordering rule, cap rule, or digest byte changes.

This is the canonical deterministic contract for the purpose-built XYZ contact
solver. Legacy combat does not construct its state or call it.

The standard build uses the rounded resolver documented below. Under the opt-in
`cartesian-recoil` feature, the retained exact trajectory and lifted-response path is
the authority for the same supported hostile WeaponWeapon, WeaponShield and
WeaponBody domain. That is a current feature contract, not a test-only experiment;
it remains absent from the default artifact and is not authorization to promote the
feature. The measurements and rejected predecessors are preserved in the
[articulated contact research record](../performance/v2-articulated-contact-research.md).

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
pub const CONTACT_COMPONENT_SPEED_LIMIT: Fx = Fx::from_raw(151_348);

#[repr(u8)]
pub enum ContactKind {
    WeaponWeapon = 0, WeaponShield = 1, WeaponBody = 2, ProjectileBody = 3,
}

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
    pub crush_raw: u64,
    pub pressure_raw: u64,
    pub deflected_raw: u64,
    pub severed: bool,
}
```

There is one resolution per fact, sorted by `(group_ordinal, ContactKey)`. The
group's accepted `alpha.raw` and ledger are copied onto every row in that group.
`deflected_raw` and `severed` are filled in by the anatomy layer through
`ContactTrialProjector::after_group`, which the driver calls once per settled group
with the group's rows and the collider slice, before the next candidate scan. That
timing is the contract: a severance has to reach the geometry inside the tick that
made it, or the arm that was just taken off goes on swinging. The default
implementation does nothing, so a fixture with no anatomy behind its colliders drives
the same pure solver it always did. `World` owns
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
first; projectile/body puts the projectile first. Left is slot 0, right is slot 1, a
projectile is slot `0x80`, and a body is `BODY_SLOT`. A `Both` segment has exactly
one collider, owned by its authoritative right arm and therefore slot 1.

Projectile solver identities occupy the 32 `EntityId` indices immediately below
`EntityId::NONE`. Body allocation is bounded to 64 indices, so the namespaces cannot
alias. The projectile slot generation is part of the identity and increments on reuse;
the stored owner is separate and is consulted only for event and damage credit.

The normal points from A toward B. A zero closest-point delta at tick-start initial
overlap (`toi.raw==0`) uses world +X unconditionally because no geometric side
exists. At positive TOI it uses `normalized_or_zero(velocity_a-velocity_b)`, falling
back to +X only when relative velocity is also zero. Thus a positive-time exact
crossing closes, while an initially separating overlap receives no attracting impulse. The
point is the componentwise midpoint made by adding signed raw coordinates in `i64`,
dividing by two with truncation toward zero, then narrowing; never saturate before
the divide. A weapon/body or projectile/body fact carries the `BodyPart` its regional
projection chose; weapon/weapon and weapon/shield carry `NO_REGION`, `0xff`, which
is outside every discriminant rather than aliasing one. Velocities are generalized
point velocities over one tick, not per-second values.

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

**Corrected for a held segment by v2-17 checkpoint B (2026-08-10), and the
paragraph above is left standing because it is still the whole of the model for
a body and for a shield.** A held `Segment`'s one generalized velocity is
sampled at the blade's **centre of mass** rather than in the hand:

```text
hand     = (World::vel.x,World::vel.y,0) + ArmState::linear_velocity
swing    = (requested.tip - previous.tip) - (requested.hilt - previous.hilt)
velocity = clamp(hand + swing * EquipmentSpec::balance)
velocity_offset = velocity - hand
```

It is still one velocity for every point on the collider and still carries no
angular state; what moved is *where on the blade* that one velocity is measured.
Three things about the form are load-bearing. `balance` is the spec's own
fraction — `rules::grip_limit` already levers the legacy swing on it and calls
it the weapon's centre of mass — so this costs no new scenario bytes and no new
validation. The bracketed **differential** cancels the body term by
construction; the tip's absolute swept displacement would substitute the
wall-clipped locomotion the sweep is built from for the unclipped `World::vel`
the row carries, which is a second change wearing this one's clothes. And the
row records `velocity_offset` beside the velocity, because `velocity - offset`
is the hand — the only thing an arm joint can be asked about — and the trial
round trip below has to take it off on the way in and put it back on the way
out.

A shield takes no offset and that is geometry rather than an omission:
`ShieldPose.centre` is the hand, so the face's centre of mass and its hand
coincide up to a rigid body-frame offset this model carries no state for.
`EquipmentSpec::balance` is 7/20 for the shipped shield and is **not** geometric
— `EquipmentGeometry::Shield` has no `length` for it to be a fraction of, and
`combat::actuator::held_inertia` is the only reader.

**Why this is where the energy scale lives**, since the obvious alternative was
measured and rejected: `closure_energy` sums over collider *rows* and never sees
a contact point, so giving each fact its own point velocity makes the fact more
honest and moves the budget by nothing — it enlarges the proposed impulse, the
bounded alpha search clamps harder, and dissipation *falls*. The prototype and
its numbers are in the
[articulated gate evidence](../performance/v2-articulated-gate.md#findings-that-constrain-a-successor).

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

A body is its five regional volumes plus the planar body endpoint they were built
from, in `AnatomyRegion` order, as one collider row with `BODY_SLOT`. Head is a sphere,
torso and legs are vertical capsules from the immutable `centre_z ± half_height`, and
each arm is the capsule from its yaw-rotated shoulder to the current hand with the
immutable arm radius; a region absent for the tick -- a severed arm -- is skipped by
the sweep rather than reduced to a point. Geometry and region choice are
[`anatomy-health.md`](anatomy-health.md#region-volumes-and-assignment)'s; this document
owns only that the five arrive as one row and leave as one fact. Its surface,
generalized mass, and velocity remain the anatomy surface, cached body mass, and body
velocity, and the origin is carried explicitly because the commit needs the body's own
settled point.

Each live articulated projectile contributes one explicit projectile collider. Its
shape is a stored-radius point collider swept from stored position to requested
position; at either evaluated pose its medial segment is that zero-length point; its mass and velocity are frozen flight
state, its surface is zero-restitution steel with point factor one, and it has no held
limb or fabricated body row. Masonry and shield-plane clipping shorten the requested
end before collection. The stored `shielded_body` suppresses the matching
projectile/body pair, so a shield clip cannot also wound the body behind it.

A projectile/body scan considers each live hostile body once. The compatibility scan
sweeps the projectile point-plus-radius against all five present regional capsules and
chooses the least `(toi.raw, medial_distance_squared.raw, BodyPart as u8)`. The exact
path instead certifies the first body envelope and its global time, then refines the
damage region at that frozen group pose by the least
`(closest_distance_squared.raw, medial_distance_squared.raw, BodyPart as u8)`.
That refinement does not re-sweep and does not require the broad envelope's provisional
region to match: region is damage metadata, not projectile/body contact identity.

`ContactCollider::present` is false for a row whose owning limb was severed earlier in
the same tick. The row stays in the slice -- removing it would re-index every candidate
the driver holds -- and takes no further part in any sweep.

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

Only distinct live hostile combatants participate in entity-pair rows. Each live
projectile is independently filtered against hostile bodies.

| A | B | generated |
|---|---|---|
| segment equipment | segment equipment | once, canonical A/B |
| segment equipment | shield front | once, weapon first |
| segment equipment | opponent temporary body capsule | once, weapon first |
| projectile point | opponent temporary body capsule | once, projectile first; own faction and shield-clipped body excluded |
| body | body | never; planar `World::separate` owns it |
| shield | body or shield | never |
| allies or the same entity | anything | never |

Scan ascending full entity identities, then left and right owner slots, then
`ContactKind` order. Sort and deduplicate facts by `ContactKey`; if several primitive
features make the same key, retain the least
`(toi.raw, distance_raw_squared, feature_rank)` returned by the public geometry
function. That tie-break lives in the candidate scan and only there: each supported
collider pair yields at most one candidate per kind, so it is currently unreachable,
and the group's
own recomputation at the frozen pose does not repeat it — the scan has already reduced
each key to one row by the time a group forms. No row position or bare index is
identity.

Articulated worlds have the authoritative entity ceiling
`MAX_ARTICULATED_ENTITIES=64`; Legacy world and codec limits do not change. Capacity
uses allocated-slot high water `n`, not live count. For `n<2`, pairs is
zero; otherwise compute with checked `usize` arithmetic:

```text
pairs = n*(n-1)/2
candidate_bound = pairs*16 + n*MAX_SHOTS
collider_bound = n*3 + MAX_SHOTS
```

Sixteen deliberately over-reserves the entity-pair construction maximum: four
weapon/weapon, up to eight directed weapon/shield slots, and four directed
weapon/body. Projectile/body is not an entity/entity pair and adds one separately
reserved candidate for every body/projectile slot combination, including hostile
filtering headroom. At the ceilings of 64 body slots and 32 projectile slots, the
bounds are 2,016 entity pairs, 34,304 candidates, and 224 colliders. Candidate storage
and suppression reserve that bound. Facts, one-group indices, and accumulators reserve
`MAX_CONTACT_FACTS_PER_GROUP=512`; closure, collider, and cap-closure
rows reserve `collider_bound`; completed resolutions reserve
`MAX_CONTACT_RESOLUTIONS_PER_TICK=4_096`. No start-snapshot row is reserved, because
counting before the advance removes the only thing that would have needed one, and no
group-metadata row is reserved, because a group ordinal is a scalar. Reserve before
changing any world column and clear/reuse
afterward. Reserve against `len()`, never `capacity()`: `Vec::reserve*` takes capacity
*beyond the length*, so subtracting the capacity instead is a silent no-op on exactly
the cleared vectors this solver reserves. Capacity may grow only when allocated high
water grows. Reusing a dead slot does not reserve.

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
before returning a pointer or permitting a typed-array view; if that reservation fails
it installs no world rather than leaving the previous one alive behind a call that says
it started over, and it zeroes the frame header to say so. Two things about the refusal
are worth stating exactly, because "refuses row 65" overstates it in one direction and
understates it in the other. The host has no articulated spawn path at all today, so an
Articulated world refuses the *whole* legacy spawn path with `UnitPresence` -- and that
is an improvement, because before v2-14C the same call reached `World::spawn`'s
`unreachable`, trapped, and left the `SIM` `RefCell` borrowed so every later export
trapped too. The 65th row will answer `EntityLimit` through the identical line the day
an articulated spawn exists.

`contact_high_water() -> u32` reports what the host reserved, and it is the host's own
record rather than a reading of the vectors. That is a real limit and the division of
labour follows from it: wasm can observe nothing about a `Vec`'s capacity, so flat
linear memory is equally consistent with "reserved once up front" and "nothing has grown
it yet". Exact capacities are therefore proven natively by
`contact_scratch_grows_only_with_allocated_high_water`, and the browser proves the thing
native cannot -- that no path grows linear memory or detaches a retained view. Its
memory test warms several rounds rather than one, because articulated construction
double-buffers; the settled page count moves whenever that fixture's work does, so the
measurement is recorded beside the loop that takes it and deliberately not copied here.

`contact_cap_hits() -> u32` reports the running world's global `cap_hits`, and is `0`
before the first `init` and on any Legacy world. Unlike the reservation beside it this
is authoritative state -- the same `u32` the ArticulatedV1 digest writes after the
actuator rows -- and the export exists so the browser fixture can say it *reached* the
cap path rather than hoping its drive still does. The cap tick is where every ordinal is
spent, the entity closure is walked to a fixed point and every frozen row is restored to
its last-safe pose, so it is the tick a per-tick allocation would hide in; a drive that
quietly stopped clinching would otherwise keep passing while covering none of it.
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

The energy preflight bounds the accumulator by `collider_bound * 8.raw * 3 * 4.raw^2`
in signed `i128`. It keeps the literal `4` rather than the clamp below, deliberately:
the product is a headroom argument and not a reachable state, and proving the
accumulator survives three times the reachable limit is worth more than proving it
survives exactly the limit. `group_energy_accumulation_never_saturates` pins that
product and its quotient, and both stay correct through the change below because the
helper it exercises takes generalized rows directly and never routes through the clamp.

At solver entry after separation, let `L` be `CONTACT_COMPONENT_SPEED_LIMIT` and perform
this componentwise order exactly:

```text
Db = clamp(Vb,-L,L) - Vb
body_requested += Db
every held absolute requested endpoint += Db once
Ve_prime = clamp(Vb,-L,L) + old_arm_relative_velocity
De = clamp(Ve_prime,-L,L) - Ve_prime
owning_equipment_requested += De
arm_relative_velocity = clamp(Ve_prime,-L,L) - clamp(Vb,-L,L)
```

**`L` is `Fx::from_raw(151_348)`, not four, and that correction is checkpoint C's.**
The clamp is componentwise while `combat-geometry`'s envelope is on the *magnitude*,
so a componentwise 4 admits `4*sqrt(3)` ≈ 6.93 against a bound of 4 — and `fx` fails
an out-of-envelope sweep *closed*, by answering `TimeOfImpact::ZERO`. That is not a
lost contact but an invented one, against every hostile collider in the arena at any
distance: two zero-radius points 11.3 units apart, one holding velocity `(3,3,0)`,
resolved a real impulse of -1.0. The boundary was exact — `(2,3,0)` and `(4,0,0)`
produced nothing, `(3,3,0)` and `(4,1,0)` manufactured a fact. `151_348` is the
largest `L` with `3*L^2 <= (4*ONE_RAW)^2`, which is precisely the condition that three
clamped components stay inside the envelope;
`the_component_speed_limit_keeps_a_diagonal_inside_the_sweep_envelope` recomputes it
and then proves it through the real sweep rather than through a restatement of it.

Clamping the magnitude to 4 instead would have preserved full speed along the
direction of travel, and it is unsound. `Fx::length` floors, so the scale
`v * 4 / length(v)` is the *identity map* for every vector whose raw squared length
falls in `(262144^2, 262145^2)`; a brute-force sweep measured up to 0.999903 raw units
of overshoot surviving it, which the inclusive envelope test rejects exactly as hard
as 6.93 would. Targeting `4 - Fx::EPSILON` repairs that, but a componentwise clamp
needs no length, no divide, and no repair argument, in a path the alpha search runs up
to eighteen times per group.

Nothing measurable is given up. The fastest equipment point the shipped roster can
produce is 0.185 units per tick, and the fastest that any anatomy the validator accepts
can produce is 0.949, against a clamp of 2.309. No impulse can exceed those, because the
alpha search forbids the closure's energy from rising. The clamp is a tripwire against a
solver pathology, not a speed governor, and no pinned fixture reaches it: the largest
velocity in the behavioral corpus is 1.0 and the largest in any solver test is 2.0, so
no digest moves.

One gap stays open here, bounded rather than closed, and it is the honest residue of
the fix. The clamp bounds a collider's generalized *velocity*, but the envelope
validates each *endpoint's* displacement, and after a group the arm inverse-map rebuilds
a segment whose tip also carries the bearing rotation. Those two coincide for a rigidly
translating collider and diverge for a rotating one. Measured, the worst in-spec tip
displacement from rotation alone is 1.686 per tick against a bound of 4, and it composes
with a translation that energy conservation holds near 1.6, so the sum stays inside —
but that argument rests on the actuator's joint speed limits and the anatomy validator's
ceilings, not on a clamp. Raising `arm_length`'s validator bound or
`ARM_BEARING_MAX_SPEED_RAW` reopens this defect from the other end and must revisit this
paragraph.

**`body_requested += Db` moves nothing in this implementation, and that is not a
skipped step.** The rule is written for a model whose body sweep is an integration of
`World::vel`; this one's is not. Both body sweep endpoints are *positions* the tick
already produced — `post_separate - locomotion` and `post_separate` — where locomotion
is bounded by the movement rules at roughly 0.05 per tick against a clamp of 2.309, and
the separation shove is positional by construction. So clamping the body's generalized
velocity has no endpoint to shift, and the equipment endpoint moves by `De` alone rather
than by `Db + De`. The clamped velocity is still authoritative: it is what the body
collider and every collider that body holds carry into the sweep and the ledger.

Then inverse-map any shifted endpoint and apply the `Both` mirror. Body translation
is not added a second time during equipment clamp. This entry clamp is
articulated-only and precedes energy and sweeps; it remains authoritative even when
no fact occurs. Application clamps again. A clamped arm is also owed the full commit
below, and the two forms genuinely differ: the entry clamp stores
`linear_velocity = clamped - clamped_body` while the commit writes
`final_relative_hand - previous_hand`, and they agree only while the joint clamp does
not bite. `mixed_body_and_equipment_entry_clamps_translate_each_endpoint_once` asserts
both halves — the arithmetic form the collider is built from, and the committed form
that supersedes it once the phase finishes. Focused tests cover repeated
crowded separation, movement, Both mirroring, and both clamps. No unchecked product,
`HashMap`, float, RNG, or allocation order may affect output, and no ordering may
depend on anything but a strict total order.

That last clause is the operative form of the older "no unstable sort" rule, which
turned out to conflict with the no-allocation promise. Rust's stable sort heap
allocates a half-length buffer above about twenty elements: at the entity ceiling the
candidate list is 32,256 rows, so sorting it stably costs roughly 2.7 MB of transient
allocation per scan and up to nine scans a tick, inside the driver that is supposed to
allocate nothing once reserved — and a capacity-watching test cannot see a buffer that
is allocated and freed inside the call. One scan emits at most one candidate per
`(pair, kind)`, so `ContactKey` alone strictly totally orders both the candidate list
and a group's facts; an in-place sort has no equal elements to reorder and is
therefore exactly as deterministic. Sort in place, and keep the total order genuine.

## Time groups and coupled state

The collector begins with the previous and requested collider poses above and global
raw time zero. Global raw time is the only pose parameter. Local zero maps to the
current global `g`; a positive local sweep result `u` maps to

```text
t = g + min(65_536-g, max(1, (65_536-g)*u/65_536))
```

with truncating division in widened unsigned arithmetic.

**The truncation is a correction.** An earlier revision of this contract rounded
*up* here, reasoning that rounding down could place state one raw unit before a
conservative contact. It cannot, and the pairing with geometry is why: the
conservative advance answers with the first raw local step at which the *truncated*
poses touch, which is never earlier than the analytic crossing. Rounding up a second
time here landed the group pose one raw unit *past* it — the recomputed normal flips,
closing reads zero, the pair tunnels, and a momentum chain chatters at
32,769/32,771/32,773 instead of transferring. Restoring the round-up with nothing
else changed shrinks the behavioral corpus below from 3,548 bytes to 2,948, because
the cradle tunnels after five links. `max(1)` is what stops a positive local result
from stalling the tick; `min` stops a fully consumed tick from stepping past its own
end. A private closed-form time of impact in `sim` is not an alternative fix —
that is the same prohibition as the one above, and the behavioral digest below is
reachable through the public sweep.

Two things this rule does **not** claim, both of which an earlier draft of this
paragraph got wrong. The sweep's answer is not `ceil` of the exact crossing in
general: it is the first step at which the quantized poses touch, and at a few raw
units of closing speed per tick that can be far later — speed 3 raw against a gap of
1 raw answers 43,690 against an exact crossing of 21,845.33. And the composition is
not exact in both directions. The sweep certifies a pose built with `Fx::mul`, an
arithmetic shift that floors; the advance below uses `trunc_toward_zero`. Those agree
on non-negative displacement and differ by one raw unit on negative displacement with
a non-exact quotient, so a westward engagement can settle one raw unit short of its
eastward mirror — reflecting behavioral case 5 through the origin moves seven of its
ten finals. The asymmetry is deterministic and sub-millimetre; removing it means
changing the advance's rounding, which is frozen here and pinned by the digest, so it
is recorded rather than fixed.

Collect the minimum `t`. In tentative scratch, advance every
collider on its current piecewise trajectory from its pose `p` at `g`
toward current requested end `e` as
`p + trunc_toward_zero((e-p)*(t-g)/(65_536-g))` in checked widened arithmetic.
Never interpolate again from tick start after group one. Group membership is
mapped-time equality: every unsuppressed candidate whose `t` equals the minimum is
in, so equal mapped `t` is simultaneous even when local fractions differed. Recompute
those members' geometry at that one global pose and sort/deduplicate by `ContactKey`
for the immutable group. The recomputation evaluates the closest pair directly rather
than re-sweeping a trajectory with no remaining extent, so a member the advance left
a raw unit short is re-derived rather than dropped; there is no membership fallback.
Initial overlap is exactly local zero. The vector
`g=65_535,u=1` maps to 65,536 and is the mandatory near-end collapse test.

If that earliest equal-time set contains more than 512 facts, resolve none: at the
last-safe `g`, seed the ordinary whole-entity cap
closure from all overflowing facts, freeze that closure, let outsiders finish, increment `cap_hits` once, and end
contact for the tick. This is deterministic capacity exhaustion, not truncation; no
prefix of a simultaneous group is privileged. Eight admitted groups of at most 512
rows fit the 4,096-resolution ceiling exactly, which is an invariant to assert rather
than a live limit.

Detect this without overflowing the 512-row fact vector: count the earliest-mapping
candidates with checked `usize` **before** advancing anything. The pose is then still
on the last-safe `g`, so an overflow has nothing to restore and needs no start
snapshot, and the pass that counted can seed the closure worklist directly from each
overflowing candidate's two owning entities. No overflowing `ContactFact` is ever
pushed or silently omitted.

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

**Inside a trial the applied hand is derived from the velocity, not from the
trajectory**, and this is forced rather than chosen: `ContactTrialProjector::project`
is handed rows, accumulators and an alpha, and no time — the driver's global `g` is
private and passing it would put a pose parameter into a signature whose whole subject
is velocity. It costs nothing, because `hand = tick-entry hand + relative velocity` is
this contract's own identity in both directions: an arm's generalized velocity *is* its
hand's displacement over the tick, which is exactly what the commit writes back. So a
trial reads `entry_hand + ((trial_equipment_velocity - velocity_offset) -
trial_body_velocity)`, maps it through `inverse_hand`/`hand_position`, and reports
`trial_body_velocity + (reachable_hand - entry_hand) + velocity_offset`. With a zero
accumulator that round-trips to the pose the actuator left, which is why an unchanged
row must be recognised as unchanged rather than re-derived — see the commit rule below.

**The offset is what keeps that identity true of a centre-of-mass sample.** It is the
row's own `velocity - hand` from the collider construction above, fixed for the whole
tick: `translate_requested` moves hilt and tip by the same delta, which cancels in the
differential it was built from, and a per-tick velocity is not rescaled by the advance.
Subtracting it recovers the hand the joint is entitled to be asked about; leaving it in
would derive a hand the arm never had, clamp it against the wrong limit, and answer
with a velocity that is neither — the same class of defect as the drift that refused
188,654 ticks, arriving through the same three lines.

**That rule binds the trial and not only the commit, and reading it as the commit's
alone cost 6.5% of the fight.** A trial whose equipment velocity is exactly its
pre-group velocity plus its body's applied delta has moved its hand nowhere: the body
translation carries hand and origin together, so the *relative* hand is untouched. Such
a row keeps that translated velocity and is not mapped at all. Otherwise the round trip
is applied to every row at every alpha including zero — and the map is not exact, so
the drift lands on the velocity the energy check reads and the trial can come back with
more kinetic energy than the group proposed. **Alpha zero must be the identity**, since
no impulse is applied there; the search has no valid floor to fall back to otherwise
and `resolve_group_into` rejects the whole tick. Measured before the rule was applied
here: 188,654 of the articulated corpus's 2,880,000 ticks refused, every one of them
that way, 156 of the first 166 with no joint limit involved at any row.

**The pre-group scalar pose is the pose the contact phase found**, before its own
entry clamp or its solve wrote one, and the remaining fraction comes from the last
group that entity was in. One write per arm at commit rather than one per group is
what makes a single reference correct: the actuator's own motion this tick is already
billed on its own speeds, and re-billing it would report a swing's rate as the block's.
An arm whose only change is the entry clamp has no group, and answers a whole tick.

At final commit, every contacted arm—not only `Both`—keeps
`previous_hand=tick_entry.hand` and writes `linear_velocity=final_relative_hand-
previous_hand`. Its scalar speeds use the remaining-fraction rule above; when
`t==65_536` they are zero.

Choose final scratch rows first. With no fact and no entry clamp, they are the saved
requested World rows byte-for-byte. A body entry clamp selects its adjusted scratch
endpoint. An equipment entry clamp selects its adjusted endpoint and requires the
same inverse-map/`Both` mirror/previous-hand/scalar-speed commit as a contacted arm.

**"Byte-for-byte" is enforced by writing only the rows that moved**, and it has to be:
`inverse_hand` is not the exact inverse of `hand_position` — the forward map goes
through a sine table and the inverse through `Vec2::angle`, measured at up to 53 raw
units of hand movement per round trip — so re-deriving an untouched arm would drift the
pose of every fighter that touched nothing, every tick. A row is changed when its solved
relative hand differs from the requested one, or when the entry clamp flagged it, or
when the cap froze its entity; nothing else is rewritten.

Then commit every changed final body endpoint through the existing wall-settlement path exactly once;
do not run body/body separation a second time. **That path is `World::move_body`, not
`World::settle` alone.** The two are not interchangeable and the choice is forced by the
clamp: a contact delta is bounded by `CONTACT_COMPONENT_SPEED_LIMIT` and nothing
narrower, so one commit can be longer than the one-tile walls a carved plan cuts, and
`settle` on its own clamps the destination without noticing the masonry the body passed
through. `move_body` sweeps in sub-steps no longer than half a tile and calls `settle`
once per sub-step, which is the existing path applied once to one commit — and it
degenerates to exactly one `settle` on an uncarved plan, so nothing that has no walls
to hit pays for the sweep. A wall-clipped component is zeroed by
that existing path. Zero the same absolute velocity component on every held collider
of that body, then rebuild its arm-relative velocity and `Both` mirror. Any new body
overlap is owned by the next tick's single planar separation pass. Wall settlement is
after the solver, separately dissipative, and absent from group ledgers/injury. A
test compares closure energy immediately before/after settlement and requires it not
to increase.

Under `cartesian-recoil`, that settlement also has an exact external-energy row for
each physical mass whose absolute velocity the wall changes. Lane 0 is the body mass;
lanes 1 and 2 are the left- and right-owned equipment masses when present. The body
row is not replaced by a held row: a naked body crosses the same boundary, while a
carried item contributes a distinct physical energy term. Smart127's ordinary
56-command north-wall replay reaches the body row at tick 45, then the independent
right-hand release row at tick 54, with two live runs and replay equal through the
horizon. These lifecycle rows are covered by Smart122's feature-only trajectory
digest; Smart123's solver corpus stops at first contact and does not claim them. They
are not group loss, injury, or a claim that the feature is default authority.

The arm poses are fixed against the *solver's* body origin, before settlement moves it.
A wall push is rigid: it must carry body and arms together, and measuring the relative
hand against the settled origin instead would drag the hand out of its socket by exactly
the distance the wall pushed. Because the arm's authoritative state is relative, that
falls out for free — the absolute hand follows the body with nothing else written.

A key already in the suppression set whose local re-sweep TOI is zero (and whose
mapped time therefore equals current global time) first tests current velocities
against that stored normal. Suppress when
`dot(current_velocity_b-current_velocity_a,stored_normal) >= 0`. Reusing the
stored normal is essential at exact coincident points: recomputing the
velocity-derived degenerate normal after a bounce would flip it and falsely call the
separating pair closing. If the test is negative, recompute the new fact and its
normal normally. A positive local TOI removes the key from the set. Every resolved
group upserts its own members' keys and normals. The
set is sorted, tick-local, and unhashed.

The set persists for the whole tick, not for one group, and the difference is
load-bearing. A pair that has come to rest against itself stays coincident with zero
relative approach, so it re-sweeps at local zero every group thereafter. If an
unrelated group elsewhere in the arena could clear the memory, that dead pair would
resolve again, consume an ordinal, and drive the tick into a spurious `cap_hits`
increment — which is hashed state.

The velocity-sign test alone is not enough, and this is the second correction this
contract has taken. A repeat is **also** suppressed when it is still closing but
**both** its relative velocity and the current global time are unchanged since the
group that recorded it. That pair of conditions is the literal statement of "identical
state", and an identical state must produce an identical result, so re-resolving is
provably a no-op. The case is common rather than exotic: an impulse is
`closing/inv_sum` in truncating fixed point, so any residual closing speed small enough
to truncate to zero leaves the pair closing and unresolvable — at equal unit masses
every odd raw closing speed does it, and a randomised sweep of ordinary valid rows hit
it in roughly one soup in six. Left unsuppressed such a pair re-resolves once per
remaining ordinal, every one a no-op, and the tick ends in a `cap_hits` increment
invented out of a rounding floor.

The time half is not decoration, and leaving it out is a worse bug than the one the
clause fixes. Testing the velocity alone suppressed contacts that had every right to
resolve: a group elsewhere in the arena advances global time, which slides both
colliders along their trajectories, so the recomputed normal can rotate under an
unchanged relative velocity. The same randomised sweep measured 3,376 wrongly
suppressed *closing* contacts that way, one of them closing at 3.95 units per tick,
and one weapon/body impulse dropped entirely. Comparing the stored normal instead is
not the fix — at a coincident point the normal is derived from that same relative
velocity, so it agrees precisely when the velocity does, and requiring equality
reinstates the livelock. Only an unmoved pose makes "identical state" true, and global
time is what moves it. The price is one ordinal: an unresolvable pair is re-examined
once per distinct group time thereafter, bounded by eight, which is the right trade
against dropping a real contact. With the time condition in place a randomised sweep
measures zero wrongly suppressed contacts outside the capped regime, against a cap rate
that rises by 0.3 percentage points and only in crowded scenes.

One inconsistency survives here on purpose, and it is safe for a reason worth writing
down rather than rediscovering. The candidate scan hands `make_candidate` the *local*
time, so a coincident pair re-swept mid-tick takes the unconditional +X branch, while
the group's own recomputation takes the velocity-derived branch at the global time —
the two disagree by construction for any pair recorded past tick start. It cannot
matter: a candidate's normal never reaches a resolution, only the suppression test and
the earliest-time scan, and clause 2 fires only at unchanged global time, where
`contact_at_pose` reads the same `previous_*` poses that only the advance moves and so
reproduces the recorded fact exactly. Anything that changes when the record is written,
or makes the pose recomputation depend on post-group velocities, breaks that argument
and must revisit this paragraph.

`persistent_zero_time_contacts_do_not_livelock` measures all three routes: the
separating repeat, a suppressed pair surviving an unrelated intervening group staged
off-axis, and the truncating-impulse family at closing 1, 3, 7, 9, and 65,535 raw.

## Feature-gated exact trajectory and response authority

With `cartesian-recoil`, every supported hostile segment/segment,
segment/shield, segment/body and projectile/body pair is scanned from the retained
exact owner and collider trajectories. Swept AABBs are exact conservative exclusions; the wide
segment primitives then own contact membership, time, key, region and ordering. The
rounded compatibility scan still runs so an accepted row may carry its old primitive
inputs as optional provenance. It is diagnostic only: an exact contact need not have
a compatibility witness, and the rounded set neither admits nor vetoes an exact row.
The same exact evaluator reconstructs the fact at the chosen group boundary and
feeds commit, so scan, recomputation and mutation cannot silently exchange authority.

The compatibility route is bounded rather than catch-all. A standard World caller
with no response column enters `ZeroResponseCompatibility` directly. An exact helper
outside the feature may route to that rounded scan only after preflight proves every
response word is zero. Missing, duplicate or ambiguous owner/collider identity, or
any malformed exact grammar, refuses instead of falling back. Under
`cartesian-recoil`, preflight still validates the grammar but every supported hostile
WW/WS/WB pair stays on exact authority; the compatibility scan beside it contributes
only the optional provenance above.

The response is a bounded integer search in lifted owner state. A candidate must
satisfy the unilateral normal direction, restitution inequality and one circular
Coulomb cone per fact. Candidates compare lexicographically by total tangential slip,
normal restitution overshoot, squared impulse magnitude, then the ordered signed XYZ
impulse words. The fixed envelopes are 16 facts, 42 physical rows, eight sweeps and
96 lifts per visit. Every trial starts from the pre-group owners; after the visits,
the selected words are applied together and all facts are validated simultaneously.
There is no damage or wound input to eligibility or score.

The simultaneous trial computes the complete physical energy delta in the exact
owner coordinates. A positive delta refuses the group as
`NoDissipativeCandidate`. An accepted non-positive delta is converted to public loss
once, by flooring the complete physical result rather than separately flooring owner
or fact shares; only then may the ordinary allocator produce cut, thrust, pressure,
deflection and anatomy changes. The named mutation proof removes the normal response
and selected-score checks independently and fails before the damage reader, which is
what makes this ordering measured rather than descriptive.

Momentum and position-integration remainders remain authoritative feature state.
Release, replacement, severance, contact-cap, floor and wall changes write separate
exact external-energy rows rather than being folded into contact-group loss. The
World retains entry copies of anatomy, exact owners and trajectories. Any exact scan,
solve, lifecycle or staged-commit refusal restores those entries, clears resolutions,
credit, deltas, floor reactions and external rows, and publishes only the counted
refusal and its first-cause diagnostic; no partial pose, wound or energy result
escapes. Contact-cap handling likewise freezes at the last safe group under the
existing cap contract rather than committing an unvalidated ninth group.

The exact owners, wide geometry work and lifted solver scratch are retained across
ticks and allocated before the phase. The native/wasm stack audit records a 422,384
byte active feature call chain, and both feature digests are cached at the browser
boundary without second-call memory growth. They have separate jobs:

- `EXACT_TRAJECTORY_STATE_DIGEST = 0x83051e8c6b4ef20f` pins Smart122's 56-tick
  ordinary north-wall trajectory, replay, remainder, wall and later-release
  lifecycle.
- `LIFTED_COULOMB_SOLVER_DIGEST = 0x83cd7bb2b73aeb9e` pins Smart123's eighteen
  source-41 cases, each stopped at its first qualifying contact, including the solver
  row, post-contact state, anatomy and refusal grammar.

Their split exports are absent from the default wasm. Native/wasm agreement makes
them portability and grammar pins; neither is the unregistered feature stream
receipt, `ARTICULATED_HASH`, a default-response promotion, or evidence that ordinary
Tactical passes its generalized competence gate. Their owner and re-record rules are
in the [golden registry](hashes.md#golden-registry).

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

**That assertion rests on alpha zero being valid, and alpha zero is valid only because
a trial that applies no impulse returns the rows it was handed.** Every bit may be
refused, so zero is the floor the construction falls back to and there is nothing below
it; a projector that changes a row at alpha zero has removed the floor and the whole
tick is refused instead. The unchanged-row rule above is what makes it hold, and it
holds by construction rather than by measurement: at alpha zero every accumulator
scales to exactly zero, the body's componentwise clamp is inert on a body the entry
clamp has already clamped, so every equipment row's trial velocity equals its
pre-group velocity and no row is mapped. That last step needs every equipment row to
be *inside* the clamp before the group as well, or the trial's own clamp would move a
row the group did not: the entry clamp guarantees it for the hand, and the collider
construction above clamps the centre-of-mass sample once for the same reason, so every
row enters as a clamp output and the clamp is idempotent.

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
crush = floor((available-thrust-cut)*crush_factor.raw/65_536)
pressure = share-thrust-cut-crush
```

**Crush is billed on what the edge and the point declined, not on the share**, and the
two properties that follow are load-bearing. The energy floor still bites, because
`available` has already had it withheld — billing crush on `share-thrust-cut` would
hand the 144 straight back and retire the floor. And a weapon that already converts is
untouched: where `edge` and `point` are both one the two floor divisions sum to
`available` or one less, so at most one raw unit is ever declined and any factor below
one floors it to zero.

`crush_factor` is **not** a `SurfaceSpec` field. It comes from the surface's
`Material`, because unlike its two neighbours it is a stiffness term rather than a
shape term — a steel sword and a steel shield disagree about edge and point while being
the same steel. See `Material::crush_factor` for the coefficients and for why this
moves no serialized byte.

A zero denominator puts the whole share in pressure. `pressure` is a subtraction, and
it stays nonnegative only while every factor is at most one: `thrust_base+cut_base`
is bounded by `available`, but scaling each by a factor above 65,536 can push their
sum past `share`. `validate_surface` bounds the four spec-built coefficients to `[0,1]`
and `Material::crush_factor` is a constant below one, so no spec-built surface can do
it — but the channel allocator is public and takes a raw `SurfaceSpec`, so it clamps
each factor to `[0,65_536]` rather than assuming the invariant. Unclamped,
`point_factor=2` panics on any share above 288 in release too, since the workspace
keeps overflow checks on. Channels remain `u64`; no proof here
permits narrowing them to `Fx` or one ABI word, and
[`anatomy-health.md`](anatomy-health.md#armor-and-wound-transfer) consumes them at
that width. The solver itself still mutates no health: it publishes the channels and
calls `after_group`, and the anatomy layer owns everything past that.

A mid-tick `Err` from the driver leaves the collider rows partly advanced: earlier
groups have already been applied and committed to the caller's slice.

**Checkpoint C answered this structurally, and neither of the two options it was left
was needed.** `World` does not hand this function its columns. The phase builds
colliders into retained scratch, solves there, and commits afterwards in one pass, so
the partial advance is a property of scratch the world never sees: on `Err` the phase
clears its published resolutions and returns, and no body, arm, shield pose or counter
has moved. That is "advance a copy and swap on success" with no copy — the rows were
never the world's to begin with — and it avoids the alternative outright, because
treating a `ResolutionError` as fatal means a panic, and the far end of this call is a
browser holding typed-array views into linear memory where a trap blanks the page for
its lifetime. The commit pass is also what makes the "only rows that moved" rule above
expressible at all: it is the one place that can compare a solved row against the
requested one it started from.

Collider rows handed to the solver must have distinct `(EntityId, LimbSlot)` identity,
and the driver returns `DuplicateIdentity` rather than trusting it. A duplicate
resolves a candidate onto whichever row is found first, landing the impulse on the
wrong collider while the intended pair stays in contact — and because the candidate
scan sorts in place, "found first" then depends on how equal keys fall out, which turns
a silently wrong answer into a silently *nondeterministic* one: 13 of 24 row
permutations of a three-row duplicate fixture disagreed. The in-place sort's soundness
argument is precisely this precondition, so it is checked in release too, not merely
asserted in debug. The typed spawn APIs cannot build such a row, and the check is
quadratic in a count bounded by 192, ahead of a pair scan that is already quadratic
with geometry in its inner loop.

## Iteration cap

After group eight, perform the ordinary scan including zero-time suppression. If a
fact remains, seed from the participants of the **earliest remaining group only** — a
contact scheduled for later in the tick has not happened yet and has no reason to be
frozen by this one — then take transitive closure by solver identity: a combatant participant adds its
entity body and all held colliders, a projectile participant adds only its projectile
row, and facts touching any added collider add their other entity until stable. Seeding from every surviving fact would
freeze bystanders and make the transitive step vacuous, since every fact would already
have contributed both of its entities. Every collider in the closure keeps its last-safe
current pose, makes requested end equal current, and zeros body velocity or owning-arm
linear/scalar velocity. A projectile's stored credit owner does not join the closure
merely for having loosed it. `Both` mirrors the zeroed right owner. Outsiders advance
to their current requested ends. Set previous/current geometry consistently to the
committed pose and increment `cap_hits` once with `saturating_add(1)`. The tick still
finishes. Only `cap_hits` persists.
The post-eight scan uses the same streaming candidate-to-closure pass when more than
512 facts remain; cap behavior never depends on fact-vector truncation.

In ArticulatedV1 hashing write exactly one global `cap_hits:u32`, after the complete
loop of allocated-slot actuator rows and before v2-15 anatomy rows. It is not per
slot. Legacy hashing writes no tag or placeholder. Adding zero therefore intentionally
moved the paired articulated command probe from `0x584d711e492950e7` to
`0x010411d521a376d7`, which is what it measured — the prediction was written down
before the change and the measurement landed on it, so the four appended zero bytes
are the whole explanation and no other v14 behavior reached that unstepped fixture.
Rust and wasm are updated together. All six legacy pins remain fixed.

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
4. tick 3: the same row as WeaponBody with B `BODY_SLOT` and region Torso 1.

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
is right slot and kind 0; case 6 B is `BODY_SLOT` and kind 2. Region is `0xff` except
case 6, whose five regional volumes are the same coincident zero-radius point the
v2-14 row was -- so the choice falls all the way through the tuple to `BodyPart` order
and answers Head, `0`.
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

Finally write each final `x_raw,vx_raw` as `i32` bits in label order. `severed` is
omitted: no fixture in this corpus has an anatomy behind its colliders, so the
default `after_group` leaves it false throughout, and `deflected_raw` stays zero for
the same reason. **`crush_raw` is omitted on a different argument, and it is a
deliberate choice rather than an oversight.** Every surface in the case table is
`edge_factor` one and `point_factor` one, which is precisely the configuration that
declines at most one raw unit and therefore crushes exactly zero -- so the column
would be a run of zeros, and adding it would move a digest that `tools/wasm_check.js`
rebuilds byte by byte in JavaScript for no information at all. **Add it the moment a
case varies either factor**, because from that moment the corpus stops covering a
live channel. That the digest is genuinely sensitive to this is not assumed: billing
crush on the share rather than on the remainder was tried during the 2026-08-16 blunt-damage work and
case 6's `pressure` moved from 144 to 18, failing this pin. The literal is exactly 3,548 bytes with digest
`0x587b0259e877105a`. This corpus, unlike the independent 591-byte format-only pin,
covers every production resolution field active in the solver and a nonzero widened
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
  runs two overlapping articulated bodies and asserts the pre-solver separation result,
  no body-to-body key, and zero Z state. This fixture used to say "with no equipment",
  which is not constructible: `Loadout`'s slot 0 is not an `Option`, and `validate_rows`
  requires carried equipment and loadout to agree slot for slot, so every articulated
  row holds something. The equipment costs the proof nothing, because what it asserts is
  the absence of a body/body *key* rather than the absence of all contact.
- `crowded_separation_shifts_both_contact_endpoints_equally` fixes
  `tick_start=(8,8)`, pre-separate `(8+1/8,8)`, post-separate `(8+3/16,8)` and asserts
  contact start `(8+1/16,8)`, end `(8+3/16,8)`, displacement `1/8`.
- `mixed_body_and_equipment_entry_clamps_translate_each_endpoint_once` uses body X
  velocity 5 and right-arm relative X velocity 1. It asserts `Db=L-5`, `Ve_prime=L+1`,
  `De=-1`, body requested X shifts by `L-5`, equipment absolute requested X shifts by
  exactly `L-6`, and stored body/equipment absolute velocities are both `L` with stored
  arm-relative X zero. Stated against `L` rather than the literals this fixture used to
  carry, which were written when `L` was 4: `De` and the zero arm-relative survive that
  change unaltered, and everything else is a function of the clamp.
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
- `an_oversized_simultaneous_group_caps_instead_of_truncating` sets 23 hostile points
  against 23 more, all coincident, for 529 simultaneous facts against the 512 ceiling,
  and requires zero resolutions, `cap_hits` 1, and every row held at its last-safe
  pose. `a_bystander_outside_the_group_closure_stays_out_of_its_ledger` adds one
  far-away hostile row to case 2 and requires the serialized ledger, the accepted
  alpha, and the participants' finals to be unchanged by it.
- `the_contact_corpus_has_a_documented_byte_order`,
  `the_behavioral_contact_corpus_has_literal_outcomes`, and
  `contact_corpus_matches_on_eight_native_threads` prove the two corpora above.
- `contact_modified_pose_survives_replay_at_every_tick` uses seed 1000, Fighter
  `(10,8)`, Brute `(23/2,8)`, and 60 ticks. Before each tick submit Fighter Hold,
  move/yaw zero, left tucked `(0,MID,1/4,0)`, right `(0,MID,1,1)`; submit Brute
  Hold, move zero/yaw HALF, left tucked `(HALF,MID,1/4,1)`, right
  `(HALF,MID,1/4,1)`, all grips Keep.
  **The effort column read `0` on three of those four arms and that was wrong.** A
  zero-effort arm has zero acceleration and never leaves its spawn pose, so the fixture
  held the fighter at tucked quarter reach for all sixty ticks and its blade stopped
  0.0003 units outside the brute's capsule — measured, and the closest that version
  ever came to a fact. Nothing else in the rows moved, and a reaching arm is what the
  proof was always about: a swing that lands, is stopped, and has to replay bit for bit
  from the recorded command rather than from the pose the solver happened to leave.
  Require at least one WeaponBody row, then
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
  `contact_cap_hashes_once_after_all_actuator_rows`, and
  `legacy_worlds_have_no_contact_state_or_schedule_phase` prove storage,
  hashing, reuse, and legacy isolation. The web no-growth and byte-for-byte wasm
  checks prove the host side.
- The three fixtures below carried one-line mentions and were designed by
  checkpoint C. All three share the *clinch*: `Scenario::articulated_duel()` with the
  spawns moved to Fighter `(10,8)` and Brute `(23/2,8)` at seed 1000, which is a unit
  and a half apart and therefore inside both weapons. The duel's own spawns cannot be
  used and cannot be moved in place — ten units apart resolves nothing, and
  `articulated_duel_v1_has_the_frozen_identity_and_placement` pins them.
  - `repeated_crowded_separation_clamps_before_energy_and_sweep` has two halves. The
    ordering half drives the contact phase directly with the pair fifty units apart and
    a body velocity of five per axis — 8.66 long against an envelope of four — and
    requires the velocity to come back clamped and *no* fact to exist; running it
    through `World::step` instead would let movement teleport the bodies before contact
    saw the number. The repeated half steps the clinch forty times and requires, every
    tick, that no collider velocity leaves the clamp, that each body's swept extent
    still equals its recorded locomotion however often separation fired, and that no
    ledger gained energy.
  - `wall_settlement_never_increases_entity_closure_energy` pins a fighter against the
    east wall and walks the brute's club into him from 1.8625 west, which puts the tip
    a fifth of a unit short of the fighter's axis: inside the 0.41 radius sum, and far
    enough that the tip is the closest feature and the normal is exactly east. Poses go
    straight onto the columns rather than being coaxed out of the actuator, so the test
    does not stop testing settlement the day a yaw rate moves. It compares closure
    energy over the solver's rows against the same closure over the committed world,
    requires it not to increase, and separately requires at least one tick where the
    body was clipped and every held collider lost the same component.
  - `both_has_one_right_owned_collider_and_mirrors_after_contact` rebinds the club to
    both hands in the scenario's own spec table — nothing shipped is two-handed yet,
    and `validate_equipment` refuses a two-handed shield, so a segment is the only
    thing it can be written against. It requires exactly one collider for the pair,
    right-owned, no resolution keyed to slot 0, and the left arm equal to the mirror of
    the committed right. A second world with the fighter moved fifty units away is the
    control that makes the last of those non-vacuous: without it, "the left arm mirrors
    the right" is equally true of a tick that resolved nothing, because the actuator
    mirrors it too.
- **The browser cap fixture has landed, and the blocker recorded here twice was
  wrong the second time.** The reasoning was that nothing on the boundary could make
  the duel's two rows touch, because no articulated steering export existed before
  v2-16. It does: v2-11's `submit_articulated` stores a full `ArticulatedCommandV1` —
  `move_dir` included — against a live row, `World::submit` returns early on an
  Articulated world so no policy overwrites it, and the stored command persists across
  ticks. The fixture drives both rows into each other from tick-zero constants with
  their arms sweeping an eighth-turn either side of the body bearing, four ticks a
  phase: first contact on tick 78, every group ordinal spent on tick 89, on all three
  seeds it warms. Nothing was swapped and no scenario moved, so
  `ARTICULATED_COMMAND_HASH` is untouched. The drive is a byte table on both sides —
  `crates/web/src/lib.rs`'s `CLINCH_*` constants and
  `the_boundary_clinch_reaches_the_contact_group_cap` against the same offsets the
  JavaScript builds by hand — because the trajectory is chaotic: a raw unit of
  difference in the walk vector moves the cap tick or loses it, so steering off
  published positions would have pinned the last ulp of the engine running the test.
  Both targets pin tick 89, so a solver change that merely moves the cap fails with a
  number to re-measure instead of silently covering less.
