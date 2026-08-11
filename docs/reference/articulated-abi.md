# Articulated observation and stream ABI

**Purpose:** Freeze subject observations, feature widths, host word layouts, exports, capacities, and stream digests for v2-16.
**Status:** current
**Canonical source:** `crates/sim/src/obs.rs`, `crates/policy/src/lib.rs`, and `crates/web/src/lib.rs`
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

**Every position in these structs is world space**, including hands, target hands,
weapon endpoints, region endpoints, and shield centres. This is the rule
[pose rows](#pose-rows) set for published ground truth and it holds here for the same
reason: authoritative arm and shield poses are body-origin-relative, the conversion
belongs in exactly one place, and a reader has no body origin. The two arm velocities
are the same exception the pose row makes and are relative to the body origin; the
absolute hand velocity is the body velocity plus the arm's. The *feature block* is the
relative view, and its frame is stated below.

Capability bits are derived from **presence facts** and never from a threshold on a
continuous column, which is what "categorical and noise-free" means in practice.
Movement and turning are set unless the legs are severed -- one legs factor drives
both authorities today, and the two bits are reserved separately for the day they
diverge. The two grip bits are set when that grip holds equipment; the grip phase
clears a severed arm's grip, so an occupied grip entails a present arm. The two weapon
bits are set when a segment is drawn from that grip under the pose row's ownership
rule, so a two-handed item sets the right bit only. The shield bit is set when a
shield pose exists, in either hand. The rejected alternative for movement was
`move_authority > 0`, which is `integrity * (1 - shock)` and would flicker as shock
crossed one.

`ObservedOpponent` contains full identity, body position/velocity/yaw, head sphere,
torso capsule, both arm capsules, leg capsule, both weapon endpoints, shield geometry,
severed mask, and `contact_timing`. Geometry uses the same structs and coordinates as
the anatomy contract: the five regions are `RegionVolume` rows built by
`body_region_volumes`, and the head sphere is the degenerate one whose two endpoints
coincide rather than a second shape. `contact_timing` is **ticks until arrival,
saturating at one** -- the formula divides world units by world units per tick -- so it
is informative only inside the last stride and is not a countdown in seconds. It is
computed from the observation's own columns, so the opponent terms are the measured
ones and the subject's are exact; a policy recomputing it from the published numbers
gets the published answer back. A coincident pair has no direction to close along and
answers one.

For timing, let `delta_xy = opponent.body_position.xy -
subject.body_position.xy`, `distance = delta_xy.length()`, and
`closing_speed = dot(subject.body_velocity.xy - opponent.body_velocity.xy,
delta_xy.normalized_or_zero())`. If `closing_speed <= 0`, timing is exactly one;
otherwise it is `clamp(distance / max(closing_speed, 1/256), 0, 1)`. All operations
are the existing fixed-point `Vec2` operations in the written order.

Select opponents from the **opposing faction** on ground-truth sight and masonry
visibility -- the same `Stats::sight_range` and `Dungeon::sees` predicate the legacy
contact list uses -- sort by
`(delta_xy.length_sq(), EntityId.index, EntityId.generation)`, and retain six. The cap
is `MAX_ARTICULATED_OPPONENTS` and deliberately **not** the per-observer
`Stats::tracked_contacts` the legacy list narrows to: this block's width is a fixed row
stride before it is a percept, so a dim character's rows are blurred rather than fewer.
There is no ally block. No hidden identity or geometry enters an unused row: an empty
row is the blank value throughout, and its identity is `EntityId::NONE`, which is also
how presence is read. Obvious equipment/severance/capability fields are categorical and
noise-free.

Perception noise uses a separate stateless stream keyed by seed, tick, full subject
identity, and domain `0x4152544f425331` (`ARTOBS1`). For every retained row, draw
exactly seven signed fractions in body-position XYZ, body-velocity XYZ, timing order.
Convert a PCG32 draw with `signed_raw = (draw >> 15) as i32 - 65_536`, producing an
Fx fraction in `[-1,1)` -- which is exactly `Rng::signed_unit`, so no second copy of the
conversion exists. Fold the domain into the *seed* argument of
`Rng::from_stream(seed, tick, identity)`: both coordinates are already spoken for, and
the articulated stream keys on the same pair as the legacy one, so without the domain a
body would be handed one error twice. Draw all seven even for absent local geometry,
and draw Z along with X and Y even though a body has no vertical degree of freedom --
the stream is an ABI and does not depend on which axes the physics currently uses.
Measured position components add `signed * perception_noise`; velocity components
add `signed * perception_noise / 4`; timing adds
`signed * perception_noise / 8` and clamps `[0,1]`, in both branches of the timing
formula. `perception_noise` is the **subject's**, since it is the subject's eye. The
subject's proprioception and all categorical fields remain exact. Opponent-local
region/equipment geometry keeps its exact local shape and is translated by
measured-minus-true body position, so one noisy body does not shear into disconnected
parts.

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
severed bits. Opponent order is: present; relative body position XYZ, world-frame
velocity XYZ, yaw cosine/sine; head relative center XYZ/radius; torso relative
endpoints XYZ/XYZ/radius; left then right arm relative endpoints XYZ/XYZ/radius; leg
relative endpoints XYZ/XYZ/radius; left then right weapon relative endpoints
XYZ/XYZ; shield present/relative center XYZ/normal XYZ/two extents; five severed
bits; contact timing. Empty rows are all zero, and so is an absent region or an absent
weapon inside a filled row -- a severed arm's last capsule is geometry the observer
cannot see. Identity remains exact in the structured observation and is deliberately
not coerced into an `Fx` feature.

The same order as offsets. Self block, 64 wide, at index 450:

| offsets | width | contents |
|---:|---:|---|
| 0 | 1 | present |
| 1..8 | 8 | capability bits 0..7, in the bit order above |
| 9,10 | 2 | body yaw cosine, sine |
| 11..13 | 3 | body velocity XYZ |
| 14..25 | 12 | left arm: hand relative XYZ, target-hand relative XYZ, velocity XYZ, fatigue, integrity fraction, severed |
| 26..37 | 12 | right arm, the same twelve in the same order |
| 38..46 | 9 | shield present, relative centre XYZ, normal XYZ, half-width, half-height |
| 47,48 | 2 | blood fraction, shock |
| 49..53 | 5 | integrity fraction, `BodyPart` order |
| 54..58 | 5 | wound fraction, `BodyPart` order |
| 59..63 | 5 | severed bits, `BodyPart` order |

Each opponent row, 68 wide, six of them starting at block offset 64:

| offsets | width | contents |
|---:|---:|---|
| 0 | 1 | present |
| 1..3 | 3 | relative body position XYZ |
| 4..6 | 3 | body velocity XYZ, world frame like the self row's |
| 7,8 | 2 | body yaw cosine, sine |
| 9..12 | 4 | head relative centre XYZ, radius (the degenerate volume's single point) |
| 13..19 | 7 | torso: relative lower XYZ, relative upper XYZ, radius |
| 20..26 | 7 | left arm, the same seven |
| 27..33 | 7 | right arm, the same seven |
| 34..40 | 7 | legs, the same seven |
| 41..46 | 6 | left weapon: relative hilt XYZ, relative tip XYZ |
| 47..52 | 6 | right weapon, the same six |
| 53..61 | 9 | shield present, relative centre XYZ, normal XYZ, half-width, half-height |
| 62..66 | 5 | severed bits, `BodyPart` order |
| 67 | 1 | contact timing |

`64 + 6*68 = 472`, and `450 + 472 = 922`.

**One frame for the whole block, and it is the subject's body position.** Every
position in the block -- the subject's own hands and shield, every opponent's body, and
every capsule, hilt, tip and shield centre those opponents carry -- has that one point
subtracted off. A per-body frame that put an opponent's arm relative to its own torso
reads more natural and is useless: the question an articulated fighter asks is "is my
blade near their head", which is a subtraction of two features and is only meaningful
if the two share an origin.

**The shared origin is scoped to positions. Velocities stay in the world frame**, on
both the self row and every opponent row -- the columns are the observation's own
`body_velocity` over `SPEED_SCALE` and nothing is subtracted. This is the legacy
block's rule and the rule for the same reason `Contact::velocity` gives in place: the
subject's own velocity is right there at self offsets 11..13, so a closing rate is the
difference of two published columns, while recovering an absolute velocity from a
closing one is not possible at all. Publishing rates would cost the policy the
opponent's actual motion, which is what makes a moving enemy hittable. The two arm
velocity triples are the one column family that is *not* world-frame, and they are
body-relative rather than subject-relative -- the same exception the
[pose row](#pose-rows) makes, for the same reason. What pins the scope is
`every_articulated_feature_lands_on_its_documented_index`: nudging the subject's
velocity is required to move exactly the three self columns, and a subject-relative
opponent velocity would move twenty-one.

**Normalisation.** Every length in the block -- positions, capsule radii, shield
extents -- divides by `Stats::sight_range` (`6.0 + 0.6 * perception` world units), the
divisor the legacy block already uses for contact range and wall clearance. It is the
right bound by construction, because an opponent further away than sight range is not
in the observation, and sharing it across positions and radii is what makes "how wide
is that torso" and "how far is it from my hand" comparable. Every velocity divides by
the legacy `SPEED_SCALE` of `0.25` world units per tick, which matters more here than
in the legacy block: the absolute hand velocity is the body velocity plus the arm's,
and that sum is only a sum if both terms are on one scale. Fractions, one-hot bits and
`contact_timing` enter directly. So do the two **direction** columns, which are neither
scaled nor clamped because they are already unit: a shield normal's XYZ, and the yaw
cosine/sine pair -- which is a pair rather than an angle for the reason every bearing
in the legacy vector is, that a raw angle is discontinuous at the wrap. Every quotient
is clamped to `-1..=1`, which keeps the
block inside the vector's invariant even when perception noise pushes a measured body
past the sight range that admitted it. The cost of one shared length divisor is that
the subject's own geometry is small -- an arm reaches about half a unit and the dimmest
eye sees six -- which a linear layer absorbs and which still leaves eleven fractional
bits in `Fx`. Two divisors would make the same displacement two different numbers
depending on which slot it landed in.

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

**Correction, recorded because "the same fixture" turned out not to be reachable in
full.** The floor plan, the portal, the torches, every spawn point and the hero are
`init`'s exactly. The *monsters* are re-equipped, and no choice was available:
`CombatSpecTableV1::fixtures()` ships one sword, one shield and one club, an
articulated unit's loadout must name the equipment it is given slot for slot, and the
generated roster walks in holding `Knife` and `Punch` — neither of which has an
equipment row. So the host maps the roster onto the three items that exist: a Brute
keeps its club, every other body takes the sword, and the off hand is empty because a
fist is not an item. The hero needs no mapping at all, because a Fighter's sword and
shield *are* rows 1 and 2 of the table. Inventing spec rows for a knife and a fist
would have meant inventing collision geometry, mass and surface constants nobody
measured; when the fixtures table grows those rows, this mapping should shrink to
nothing. `the_articulated_room_is_inits_room_and_inits_hero` pins the half that is
identical.

`init_articulated` fails closed on a refused construction and on a refused contact
reservation alike: it installs no world at all rather than one whose next spawn could
grow linear memory under a live typed array, and never traps. Because the shipped
fixture is valid by construction, the closed path is exercised through a
deliberately broken scenario in `init_articulated_fails_closed_and_installs_nothing`.

`Sim::descend` builds the next floor through the same model-aware builder and
re-reserves the new world's contact vectors. It has to: the descending hero carries an
articulated row, and handing that row to a plain Legacy `Scenario::dungeon` is a
construction `World::new` refuses by panicking — one call inside a `pub extern "C"`
export, which poisons the instance for the life of the page.

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

Every position in a pose row is world space, including the hands, the target hands,
the weapon endpoints, and the shield center — the sim converts once, on the way out,
because the row's reader has no body origin. The two arm velocities are the
exception and are relative to the body origin; the absolute hand velocity is the
body velocity plus the arm's. `ObservedArm::velocity` in the
[subject-scoped observation](#subject-scoped-observation) is the same column under the
same convention -- it has to be, because the two are one value read twice and a
consumer that added the body velocity to one and not the other would draw two
different hands. A two-handed item fills the **right** weapon slot
only and clears the left slot and its equipment bit, matching the single
right-owned collider the contact phase builds for it. A slot with no accepted
command answers the neutral command the arm driver substitutes, so the target-hand
columns are always the pose the actuator is actually converging on.

`ShieldPose::thickness` is deliberately absent: it is a collision depth the contact
phase carries, a renderer draws the face, and the columns are append-only so adding it
later costs nothing. The row is otherwise the sim's own `ArticulatedPose` word for
word — nothing is re-derived on the host side, because a second derivation is a second
answer to a question the sim has already answered.

Exports are `pose_ptr`, `pose_len`, `pose_stride`, `pose_capacity`, `poses_dropped`,
and `pose_layout_version`. Overflow retains the first 64 canonical rows and increments
the per-publication saturating drop count for every omitted row. Pose rows are filled
at publication from end-of-call state, which is what makes them right after a spawn, a
swap or a submitted command and not only after a `step`: `publish` is the one function
that runs after every mutating export.

## Combat-event rows

`COMBAT_EVENT_LAYOUT_VERSION=1`, `MAX_COMBAT_EVENTS=2048`, and
`COMBAT_EVENT_STRIDE=32`. The capacity is measured rather than chosen; the corpus
that fixed it, and the provisional 256 it rejected, are at the end of this section.
Events accumulate across all ticks of one `step(ticks)` call in
`(tick, toi.raw, contact_group_ordinal, ContactKey)` order. Group ordinal starts at
zero each tick and distinguishes sequential groups that share a raw TOI.

`tick` is the tick that was **integrated**, which is `World::tick()` read *before*
`World::step` rather than after it: the time of impact beside it is a fraction of that
tick, so reading the counter afterwards would put the two words one tick apart. The
host reads it before the step for that reason.

The accumulation happens inside the per-tick loop and not at publication.
`World::contact_resolutions` retains the last solved tick only and the top of the next
tick wipes it, so a `step(8)` has seven ticks' worth of evidence that exists nowhere
else by the time the frame is rebuilt. The rows are packed on the way in and copied
out at publication. `contact_resolutions` already answers in `(group_ordinal,
ContactKey)` order within a tick, and ordinals are assigned in increasing time of
impact, so appending in world order satisfies the documented total order rather than
restating it — `the_documented_event_order_holds_over_a_tick_with_several_groups`
checks that over a fixture that produces several groups in one tick, and it holds.

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

`ContactResolution::group_alpha_raw` and `ContactImpulse` are deliberately absent: the
alpha is a solver search result and the impulse is already implied by the velocities
and the energy ledger. Both are appends if a consumer ever needs them. The `a_slot`,
`b_slot` and region bytes cross as the sim's own values, `BODY_SLOT = 0xff` included,
so the host owns no second vocabulary for them; the one exception is the absent-region
sentinel, which widens to `0xffff_ffff` rather than `0xff` so a reader that lost track
of the column width cannot mistake it for a region index.

Exports are `combat_event_ptr`, `combat_event_len`, `combat_event_stride`,
`combat_event_capacity`, `combat_events_dropped`, and
`combat_event_layout_version`. Overflow keeps the canonical prefix and counts the
dropped tail with saturating addition. No priority class or lethal event reorders it.
The cap is enforced twice, at accumulation and at publication, and the first of the
two is the one with teeth: a `Vec` pushed past its reserved capacity reallocates, and
a reallocation inside a tick grows linear memory and detaches every typed array the
page holds.

**A tick can contribute nothing and the drop count still reads zero, and that hole is
inside contract.** A contact solve that returns `ResolutionError` clears its own
published resolutions — the error costs the tick its contact and nothing else, which
is the structural answer
[`contact-solver.md`](contact-solver.md#injury-channels) gives instead of panicking one
call inside a `pub extern "C"` export — so that tick appends no rows here, and nothing
counts it. `contact_cap_hits` covers the *cap* path and only that path. One tick of a
`step(8)` can therefore go missing while `combat_events_dropped()` answers zero, and a
consumer cannot tell it from a quiet tick. No signal is required, deliberately: a drop
count means "rows the buffer could not hold", and widening it to also mean "rows the
solver refused to produce" would make an overflow and an arithmetic refusal the same
number, on a stream whose whole value is that a row is evidence. It is written down
because "the feed is the only evidence these ticks leave" is otherwise a claim with a
hole in it. If a consumer ever needs the signal, the honest shape is a second
authoritative counter beside `contact_cap_hits`, not a wider meaning for this one.

The accumulated feed is cleared per host *call* rather than per tick — one animation
frame is up to eight ticks of catch-up and all eight ticks' contacts happened — and in
two further places, both of which the legacy event feed already needed: `Sim::descend`
itself, and `Sim::advance`'s early return when the hero walks out of the level. The
second is not optional. A contact row names two full identities, and the level the
descent builds hands those slots to new bodies, so a row that survived the return
would be published against a world where it names somebody else.

**Per `step` call, not per publication**, which the legacy event feed has always meant
by the same words and which a consumer has to read carefully. Every mutating export
rebuilds the frame, so a click, a spawn or a slider between two `step`s republishes the
previous batch's rows unchanged. A consumer that accumulates from the feed — a damage
ledger, one impact sound per row — must key on the call that stepped rather than on the
publication, or it counts every contact once per intervening export. `step(0)` clears
the feed, which is the same rule seen from the other end.

The two new static arrays cost 16,896 and 262,144 bytes respectively, for 279,040
bytes excluding thread-local wrapper bookkeeping. The 55-byte command buffer belongs
to v2-11 and is not charged again to this session. Compile-time assertions use
`MAX_POSES*POSE_STRIDE*4 + MAX_COMBAT_EVENTS*COMBAT_EVENT_STRIDE*4`.

The event half of that was 32,768 bytes while the capacity was the provisional 256 and
131,072 while it was 1024. The two measurements below moved it, and the 98 KB and then
the further 128 KB are what those decisions cost — worth writing down beside the
capacity rather than leaving as arithmetic a reader has to redo.

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
single seed is part of the fixture, and eight separate `step(1)` publications measure
the busiest tick rather than what one host call accumulates — which is the thing being
sized, because the feed is cleared per call.

**Measured on 2026-08-10, and it rejected 256.** The corpus accumulated **446 rows**
in that one batch, so a 256-row buffer published the canonical 256 and counted 190
dropped: a truncated stream on the one corpus this document calls mandatory. The rule
for a rejected capacity is the next power of two at least twice the measured maximum,
so 446 doubles to 892 and rounds up to 1024, and the byte budget above moved with
it. The pose half of the same run is 64 rows with none dropped, which is
`MAX_POSES` exactly — the corpus sits on that cap by construction, so a drop there
would mean the cap or the identity ordering is wrong rather than that the fight is
busy. `crates/web`'s `the_high_water_corpus_fills_at_most_half_the_event_buffer` pins
the measurement and the at-most-half relationship;
`print_articulated_buffer_high_water_marks` is the `#[ignore]`d printer that produced
the number and deliberately builds its own copy of the fixture, so a drifted script
cannot re-pin itself.

**Re-measured the same day, and it rejected 1024 too — because the fight got busier,
which is the other half of what that test says it catches.** v2-17 checkpoint B
stopped `World`'s contact projector re-deriving an unmoved hand through the joint's
inexact inverse map, so the round-trip drift that had been inflating every trial's
kinetic energy stopped holding the alpha search below the alpha the physics allows.
The same 64 bodies, the same seed and the same `step(8)` then accumulated **556 rows**.
This is not recovered rejections: the corpus refuses no tick and refused none before,
and the printer reports that count beside the rows so the two cannot be confused. At
1024 nothing was dropped — but the acceptance rule is headroom rather than survival,
and 556 doubles to 1,112, so the capacity is **2048** and the byte budget above moved
with it again, to 279,040 bytes.

**Re-measured a third time at the end of the same checkpoint, and it went *down*, to
354 rows with nothing dropped.** The change was expected to raise the event rate and
did the opposite: sampling a held segment's one point velocity at the blade's centre
of mass instead of in the hand raises the impulse a swing proposes, and a pair pushed
apart harder stops re-resolving the same key every tick — so 64 bodies locked in a
permanent clinch publish about a third fewer rows. **The capacity stays 2048.** The
acceptance rule sizes against the busiest measurement taken, not the most recent one,
and 556 is still that measurement; re-cutting the buffer to fit 354 would only queue
up the next rejection.

## Ownership, visibility, and memory

The raw arrays are authoritative-host views owned by the wasm worker. They must not
cross to the renderer unfiltered. Before transfer, the worker retains the subject and
currently visible identities in canonical order, filters events whose geometry would
reveal an absent identity, and writes a complete snapshot buffer. Pose/event pointer
stability lasts for the module lifetime.

**The snapshot buffer does not reserve regions for that filtered copy yet, and the
omission is a decision.** `emit_abi` emits both layout versions, both strides, both
capacities and all 66 + 32 column offsets, because those are the ABI and the copy is
written against them — but `SNAPSHOT_BUFFER_BYTES` still ends at the furniture block at
27,452 bytes and four regions. Reserving the two articulated regions takes it to
306,492 — 279,040 bytes on each of the three pooled buffers, and an 11.2x wider
zero-fill on a buffer `client/src/state/snapshot.ts` clears whole once per *filtered
publication* — while nothing on the far side writes or reads a word of them: the
filtered copy is v2-17's. A per-publication memset does not get 11.2x wider ahead of
the consumer that justifies it and the measurement that sizes it. The formula and the three
numbers the regions will generate are held in
[`articulated-mechanical-gate.md`](articulated-mechanical-gate.md#worker-integration)
until then.

After warm-up, maximum pose, contact, event, spawn, reset, and route paths may not
increase `wasm.memory.buffer.byteLength` while a legacy frame view is held. The Node
test also proves the original frame, pose, and event typed arrays remain attached.
`published_views_survive_articulated_stress_without_memory_growth` in
`client/test/wasm-memory.test.mjs` is that test. It holds the legacy frame view and
`Uint32Array`s over the *whole* 16,896-byte pose array and 262,144-byte event array —
the reserved extent, not the live prefix, because that is the view a worker keeps for
the life of the module — and drives `init_articulated`, sixty-five refused spawns,
four descents, the clinch to its contact cap, sixteen batched `step(8)` calls, the
stream digest and a reset, across three seeds. It settles at **241 pages** from the
end of the first warm round and holds there through a measured sixth round and a
measured sixth guarded cycle — 237 while the event capacity was 1024. Most of that is
the articulated *room* rather than these two arrays, which are 5 pages between them.

**What the Node test cannot reach, recorded so nobody looks for it there.** Its pose
ceiling is 11 rows and its busiest single publication is 16 event rows, because no
export spawns an articulated body — `spawn_monster` refuses an articulated world by
design — so the roster is whatever the floor generator placed (7 rows at depth 0,
rising to 11 from depth 4) and a fight is two bodies. The 64-row pose maximum and the
event maxima above belong to the `abi-high-water` corpus, which is a hand-built
`crates/web` scenario.
That is not a gap in the proof: both arrays are fixed and reserved whole at
construction, so how full they are is not what the byte length depends on.

**Two calls belong in the warm-up rather than after it, and both were measured.**
`init_articulated` reserves 64 rows of contact vectors a Legacy heap has never held, so
the first one after a Legacy run grows linear memory once — exactly as
`init_articulated_test` does, and that growth is what buys every later spawn, step and
contact on that world. `articulated_stream_digest_lo`/`_hi` builds a whole `Sim` to
drive its script, which is heap traffic of the same kind; it is cached on first touch
so it can only ever do that once, on the pattern `contact_behavior_digest_lo` already
uses for its corpus. A no-growth proof that omits either from its warm set is
measuring the wrong thing, and one that calls either mid-frame will watch its own
views detach.

**A reset belongs in the warm set too, and one per floor the proof will later drive.**
`init` builds the replacement `Sim` before it drops the installed one, so every reset
holds two `combat_events` reservations at once — 512 KiB now that the capacity is
2048, where it was 256 KiB at 1024 and 64 KiB at the rejected 256. That second
reservation no longer fits
in the slack a single warm round leaves behind, so a proof warmed on one seed and then
driven across three watched its first `init` grow linear memory. Warming the same seed
twice does not fix it: the peak is per *floor*, because a generated room's nav fields
and fog are most of a `Sim` and every seed generates a different room.
`published_legacy_views_survive_every_warm_path_without_memory_growth` is the test
that says so. At 1024 it warmed every seed once and settled at 30 pages; at 2048 that
stopped being enough and the guarded phase grew on its second visit to a seed, so it
now warms every seed **twice, nested the way the guarded phase nests them**, and
settles at 38 pages. Two rounds over the seed list rather than per seed — the same six
calls in the other order — does not settle it, which says the peak follows the
floor-to-floor transition and not the number of rounds.

## Portable stream digest

Use FNV-1a-64 with the constants in the contact contract. Prefix ASCII
`ARPG-STREAM-V1`. For every tick, including an empty tick, feed little-endian:
`tick:u32`, pose length, poses dropped, every live pose row word, event length, events
dropped, every live event row word. Tests drive one tick per publication so drop
metadata has one meaning. Native and wasm use identical scripted inputs and bytes;
state hashes are not part of this digest.

The digest is exported as `articulated_stream_digest_lo()` and
`articulated_stream_digest_hi()`, on the `selftest_hash` precedent: a self-contained
scripted drive that builds its own world, digests each publication and throws it away
without touching `SIM`, `FRAME`, `POSES`, `COMBAT_EVENTS`, the tile buffer or the
furniture buffer. It goes through the **same** two buffer writers `publish` calls
rather than a parallel encoder — a digest built by a second writer proves that two
encoders agree and says nothing about what the page reads. Unlike `selftest_hash` it
allocates enough to move the heap, so it is cached on first touch and belongs in a
caller's warm-up; see the memory note above.

The script is `Scenario::articulated_duel()` at seed 1 with the fighter moved to
`(9,6)` and the brute to `(7,6)`, one articulated command submitted to each on tick
zero and none after: the fighter walks due west at full magnitude, the brute stands
still, and both ask for the bearing they already have. Twenty ticks, one publication
each. Every body spawns facing east and both body yaw and arm bearings are *driven*
rather than set — the shipped clinch fixture spends 78 ticks turning around before it
first touches — so the script asks for no rotation at all and gets its contact out of
the placement instead. Ticks 0, 1, 2 and 4 resolve nothing, ticks 3 and 5 resolve two
rows, and every tick from 6 resolves one, which is how the reference's "including an
empty tick" is actually covered. The pin is registered in
[`hashes.md`](hashes.md#golden-registry).

**The JavaScript half pins the number and does not rebuild the bytes, and that is
worth stating because the sibling corpus does the opposite.** `tools/wasm_check.js`
builds all 3,548 bytes of the behavioural contact corpus from
[`contact-solver.md`](contact-solver.md#behavioral-corpus-v2) rather than trusting the
export, on the argument that a corpus derived from the thing it checks agrees with a
drifting solver by construction. That argument does not transfer here. This stream is
not a table a document can state; it is twenty ticks of fixed-point simulation output,
and the only thing that can produce those bytes is the sim. Nor can the check read
them out of a live publication and re-digest them: the script moves the two spawns,
`init_articulated_test` builds the *unmoved* duel, and no export places a body, so the
script cannot be driven from across the wall. What the dual pin still buys is the
whole cross-target claim — the value was recorded natively, and the module recomputes
it through the same two writers `publish` calls. What one number cannot catch is an
encoder wrong the same way on both targets, so
`native_and_wasm_pose_event_stream_digests_match` checks the pose row grammar beside
it, against this document rather than against the module: ascending full identity, the
equipment mask against the geometry it describes, and the intent and animation-hint
enumerations.
