# Articulated observation and stream ABI

**Purpose:** Freeze subject observations, feature widths, host word layouts, exports, capacities, and stream digests for v2-16, plus the configured duel's input buffer and refusal codes and the checkpoint staging buffer behind its fifth policy code.
**Status:** current
**Canonical source:** `crates/sim/src/obs.rs`, `crates/policy/src/lib.rs`, `crates/learn-core/src/digest.rs`, and `crates/web/src/lib.rs`
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
    pub standing_height: Fx,
    pub arm_length: Fx,
    pub hand_radius: Fx,
    pub weapons: [Option<SegmentPose>; 2],
}
```

Capability bits are: movement `0`, turning `1`, left grip `2`, right grip `3`, left
weapon `4`, right weapon `5`, shield `6`, and two-handed binding `7`; higher bits are
zero in V1. `ObservedArm` is hand position, actuator target-hand position, hand velocity, fatigue, integrity
fraction, severed flag, and equipment code. `ObservedShield` is presence, center,
unit normal, and two half-extents.

The three self dimensions and two self weapon poses are structured-observation
views only. They expose the immutable anatomy row and the same current segment pose
the renderer receives, so a policy can predict whether its own committed sweep is
reachable. They are not serialized, hashed, or appended to `write_features`; the
feature layout below is version 13 and 954 columns, and none of it is theirs.
Subject weapon ownership is the pose rule: a two-handed segment occupies the right
slot once.

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
coincide rather than a second shape. **Five and not the seven swept volumes the
region section publishes**, deliberately: this is a targeting view, a forearm is
not separately targetable, and widening it would move `FEATURE_LAYOUT_VERSION` and
every trained checkpoint's input shape. The truncation is safe because volumes
`0..5` are the five regions in `AnatomyRegion::ALL` order. `contact_timing` is **ticks until arrival,
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

## Appended feature blocks

V2-16 set `FEATURE_LAYOUT_VERSION = 12`, `ARTICULATED_FEATURE_COUNT = 472` and
`FEATURE_COUNT = 922`; embodied session 09 appended a second block and took the
version to **13** and the width to **954**. Existing indices `0..450` remain
byte-identical under both, which is what the `legacy feature prefix` pin exists to
refuse a change to. A Legacy observation appends 472 zeroes and then 32 more; an
articulated one fills the first block and zeroes the second.

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

### The embodied block, indices 922..954

Written only by a body that has legs and an elbow; `CombatModel::Embodied` is the
only model that does, so a Legacy or Articulated observation leaves all 32 columns
zero.

| index | width | contents |
|---|---:|---|
| 0 | 1 | present |
| 1..2 | 2 | hip yaw relative to torso yaw, cosine and sine |
| 3 | 1 | twist as a signed fraction of the stance budget |
| 4 | 1 | pelvis as a fraction of standing pelvis height |
| 5 | 1 | step remaining as a fraction of a step's duration |
| 6..9 | 4 | left arm: elbow relative to its own shoulder XYZ over arm length, reach headroom |
| 10..13 | 4 | right arm, the same four |
| 14..16 | 3 | opponent 0: present, twist fraction, mid-step |
| ... | 3 each | opponents 1 through 5 |

`14 + 6*3 = 32`, and `922 + 32 = 954`.

**Each half carries its own `present`, which the articulated block above does not
need.** There, a blank row is zeros and nothing else, and no live body writes an
all-zero row. Here one can: a body squared, level and standing still has zero twist,
zero hip offset and no step running, so "nothing to report" and "nothing is
happening" would be the same bytes. The hips go in as cosine and sine for the same
shape of reason.

**Every embodied value is a fraction and none is a raw quantity.**
`STANCE_TWIST_LIMIT_RAW`, `STANCE_STEP_TICKS` and `PELVIS_HEIGHT_RAW` are `pub`
inside `crates/sim`'s actuator module and are deliberately not re-exported, so a
consumer cannot reach the divisor -- and the divisor is the half that carries the
meaning. Publishing the ratio is the only shape of these facts that crosses the
boundary at all. The elbow is relative to its own shoulder over arm length for the
same reason: no shoulder is published anywhere.

**Reach headroom is the column the block exists for.** After the elbow session an
arm can be commanded to a pose it cannot hold, and the clamp in front of the
integrator silently takes the difference. A fighter that reads only where its hand is
cannot tell a comfortable guard from a locked-out one.

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
exact `[u8; 57]` owned by v2-11, not a word buffer. Unsigned stream values are direct. `Fx` and signed values
are their two's-complement raw `i32` bits reinterpreted as `u32`; `Angle` and TOI raw
values are widened to `u32`. Booleans are zero or one. Entity identity is always two
words: index then generation. Lengths and capacities below count rows, strides count
32-bit words.

Submitted commands reuse the exact 57-byte buffer, byte offsets, canonical payload,
validation, and rejection behavior in
[`articulated-command-v1.md`](articulated-command-v1.md#fifty-seven-byte-wasm-action-buffer).
V2-16 does not introduce a second command encoding. The buffer was 55 bytes until the
release verb appended one byte per arm to the payload.

Exports are:

```text
init_articulated(seed:u32) -> void
init_embodied(seed:u32) -> void
submitted_command_ptr() -> u32
submitted_command_len() -> u32              // 57 bytes
submitted_command_layout_version() -> u32   // 2
submit_articulated(index:u32, generation:u32) -> u32
```

`init_articulated` uses the same room/hero fixture as `init` with
`CombatModel::Articulated`; it does not alter `init`. `init_embodied` opens that
same room under `CombatModel::Embodied` and is a third export rather than a
parameter for the reason `init` and `init_articulated` are two: the export's name
is the whole of what a page selects a model with, and a page passing an integer
could pass a wrong one. It publishes one stance row per body where the other two
publish none, which is what makes the zero-length stance section on an articulated
world a distinction rather than a section nothing ever fills.

**The model word was not reaching the scenario, and `init_embodied` is what
found it.** `dungeon_scenario` took a `CombatModel` from the start and used it
only to decide whether to return the plain Legacy scenario; the two lines after
that wrote `Articulated` whatever it had been given. One caller passing one value
made that invisible. Since `Scenario::fingerprint` writes the combat model's
identity word, the fixture would have carried the articulated identity under an
embodied name and nothing would have said so. Submit returns the exact packed
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

`init_articulated` and `init_embodied` fail closed on a refused construction and on
a refused contact reservation alike: it installs no world at all rather than one whose next spawn could
grow linear memory under a live typed array, and never traps. Because the shipped
fixture is valid by construction, the closed path is exercised through a
deliberately broken scenario in `init_articulated_fails_closed_and_installs_nothing`.

`Sim::descend` builds the next floor through the same model-aware builder and
re-reserves the new world's contact vectors. It has to: the descending hero carries an
articulated row, and handing that row to a plain Legacy `Scenario::dungeon` is a
construction `World::new` refuses by panicking — one call inside a `pub extern "C"`
export, which poisons the instance for the life of the page.

## The configured duel

V2-ui-05 adds the decision loop the exports above had no counterpart for. Until
it landed, `World::submit` returned without storing on any world that is not
Legacy, so every command `Sim::advance` produced under this model was dropped on
the floor and `init_articulated` opened a room whose bodies chased their
tick-zero command forever.

`Sim::advance` gains a **second branch**, taken on the first line, and the
condition is not the combat model: it is whether a configured duel is installed.
Narrower on purpose. Branching on the model would also divert
`init_articulated`'s room, whose behaviour under the legacy loop is what
`published_views_survive_articulated_stress_without_memory_growth` settles its
page count on and what
`the_high_water_corpus_fills_at_most_half_the_event_buffer` counts its rows
through. That room's commands are therefore still dropped; what the session buys
is that it is no longer the only such world. `ROOM_HASH`, `BATTLE_HASH`,
`SWAP_HASH` and `BOW_HASH` are all produced by `Sim::advance`, and a branch the
legacy path cannot enter is the only obviously-safe shape there.

The loop ported is `lab`'s `measure_articulated_matchup` and **not**
`policy::run_articulated`, which takes one `impl ArticulatedPolicy` and installs
it on both sides — right for a control condition and useless for an arena.
Routing is on the alive set captured at install, because
[`ArticulatedObservation`](#subject-scoped-observation) has no faction column.
The duel is built with the runner's `Order::Advance(±X)` and with both
objectives at `Objective::None`, so the same configuration and seed produce the
same state hash here as in `lab`; both are hashed, so a driver that skipped
either would fingerprint a different world. `a_scripted_arena_fight_in_wasm_matches_the_same_fight_in_lab`
is what says the two agree, against a second spelling of the loop rather than
against a pinned number.

Policies are named by a second registry, `policy::ArticulatedPolicyKind`,
separate from `PolicyKind` because the two seams share no code space:

| code | policy | source |
|---:|---|---|
| 0 | `neutral` | `NeutralArticulatedPolicy` |
| 1 | `composed` | `ScriptedArticulatedPolicy` |
| 2 | `windmill` | `WindmillArticulatedPolicy` |
| 3 | `attack-moves` | `ClosingAttackControlPolicy` |
| 4 | `learned` | `learn_core::LearnedArticulatedPolicy`, over the installed checkpoint |
| 5 | `tactical` | `TacticalArticulatedPolicy` |
| 6 | `openings` | `OpeningsArticulatedPolicy` |

Codes 5 and 6 were shipping and selectable in the browser for some time before
this table named them; it listed 0-4 and never mentioned `tactical` at all.

Code 4 was named and refused rather than omitted, so that the session splitting
an inference-only crate out of `crates/learn` would be purely additive. It was,
and v2-ui-08 landed it: `learn-core` is `crates/web`'s dependency, the fifth code
builds, and the reservation cost that session no rework here at all.

**`ArticulatedPolicyKind::build` still answers `None` for it, and that is the
contract rather than a leftover.** `crates/policy` is in `check_deps.js`'s
deterministic set and must not gain a float dependency; and more durably, a
trained fighter is a kind *plus fifteen kilobytes of weights*, which a registry
keyed by an integer has nowhere to put. The dispatch is `crates/web`'s
`build_articulated_policy`, beside the buffer that holds the weights. What a
fighter asking for code 4 with no checkpoint installed gets is
[`ARENA_NO_CHECKPOINT`](#refusing-by-name) and not `ARENA_POLICY_UNAVAILABLE` --
"fetch one" and "rebuild the module" are different instructions, and a studio
that could not tell them apart would show the wrong one.

### The checkpoint staging buffer

A trained network is **fetched and not compiled in**. A checkpoint *is* a
fighter, so the studio should be able to put a different one in the ring without
a Rust rebuild, and `checkpoints/v2-probe.ckpt` is 15,580 bytes beside an 8 MB
trace. `vite.config.ts` serves it at `/checkpoints/v2-probe.ckpt` in development
and copies that one file into `dist/checkpoints/` at build; the rest of
`checkpoints/` is evidence a reader quotes and is deliberately not addressable.

```text
checkpoint_ptr() -> u32
checkpoint_capacity() -> u32            // 32768
checkpoint_installed() -> u32           // 0 or 1
checkpoint_digest_ptr() -> u32          // 32 bytes, or thirty-two zeroes
checkpoint_digest_len() -> u32          // 32
load_checkpoint(len:u32) -> u32         // packed, see below
learned_inference_digest_lo() -> u32
learned_inference_digest_hi() -> u32
```

`SUBMITTED_COMMAND`'s and `ARENA_CONFIG`'s pattern: a fixed array that never
moves and never grows linear memory, and one consumer that judges the whole of
it. The one difference is that a checkpoint is not a fixed width -- only the
training seed list varies, since `ModelShape::CURRENT` fixes 3,858 weights -- so
the length is an **argument** and the export is a *capacity*, named after
`pose_capacity` rather than after `arena_config_len` for that reason. 32,768 is
the repository's own rejected-capacity rule applied to 15,580: the next power of
two at least twice the largest measured.

**The handshake, precisely, because the client is written against it and
v2-ui-07 is the session that wrote the client.**

1. Fetch the bytes. Refuse locally if `bytes.length > checkpoint_capacity()`;
   the module refuses it too, with `CHECKPOINT_TOO_LONG`, and reads nothing.
2. Take a **fresh** `Uint8Array` over `checkpoint_ptr()`, write the bytes, and
   drop the view. Pointers here are stable for the module's life, but a view
   held across an unrelated call that grew memory is a detached view.
3. Call `load_checkpoint(bytes.length)` and decode the packed word below. This
   is the **only allocating call in the set** -- `Checkpoint::from_bytes` builds
   the seed list and the weight vector, which for `ModelShape::CURRENT` is 32
   seeds and 3,858 `f32`, about 15 KB -- so it belongs in a caller's warm-up
   beside `init_articulated`, not mid-frame while a typed array over the pose
   buffer is being held.

   **The refusal path used to be the expensive one, and that is worth saying
   because it is the opposite of what a reader expects.** Both vectors were
   reserved from the *claimed* counts before the loop that fills them could
   discover the file was too short to back them, under caps of 4,096 seeds and
   2^20 weights that had nothing to do with what a legal file can carry. A
   68-byte file claiming four billion weights therefore reserved 4 MiB, grew
   linear memory by 65 pages -- 62,645 times the file it was refusing -- and
   detached every typed array the page held, all on its way to answering
   `Truncated` and installing nothing. The caps are now `bytes.len() / 8` and
   `ModelShape::CURRENT.weight_count()`, which are the largest counts a file of
   that length could legitimately carry, and
   `a_refused_checkpoint_does_not_grow_linear_memory` in `tools/wasm_check.js`
   measures `memory.buffer.byteLength` across four overclaiming headers. A
   checkpoint is the one input here a *person* picks, so "a refusal is cheap" is
   part of this handshake and not an implementation detail.
4. On success, `checkpoint_installed()` reads `1` and `checkpoint_digest_ptr()`
   addresses the file's SHA-256. That digest is the number `lab trace` writes
   into a recording's header and `learn-probe evaluate` prints, so a reader can
   say whether the live fight in front of it is running the fighter the trace
   was recorded from. **This is the only handshake step that is optional**, and
   it is the one that makes a live fight and a recorded one comparable on
   identical terms.
5. Only then may a fighter carry policy code `4`. `arena_start` refuses with
   `ARENA_NO_CHECKPOINT` otherwise, and installs nothing.

The installed network is **not** per-world state. It survives `init`, `descend`
and `arena_start` exactly as a fetched file survives a page navigating within a
session, which is why it is not on `Sim` and owes none of the companion lines
`Sim::anatomy` and `Sim::arena` do. What *is* per-world is the policy instance
built out of it, and that lives in the arena's own `policies` array where the
rule is already paid.

`load_checkpoint` packs its answer with a word of its own:

```text
bits  0..7   outcome: not installed 0, installed 1
bits  8..15  reason
bits 16..31  detail
```

**Sixteen bits of detail and not two bytes of it**, which is where this word
parts company with `submit_result`'s grammar. That one carries a fighter index
and a hand index, both small; this one carries a *weight* index, and there are
3,858 of them. Splitting an index across two fields that mean something else
everywhere they appear would be worse than saying so here. `0xffff` is "no
detail", because zero is a perfectly good weight index and a perfectly good
framing version.

Reasons are `0` none, `1` too long for the buffer, then one per
`learn_core::CheckpointError` in declaration order: `2` Truncated, `3` BadMagic,
`4` UnknownFormat, `5` FeatureLayout, `6` ActionLayout, `7` Shape, `8`
WeightCount, `9` Digest, `10` NotFinite, `11` NotFiniteRecord, `12`
TrailingBytes. The detail carries the framing version for `4`, the layout
version the file claimed for `5` and `6`, the weight count for `8`, the weight
index for `10` and the extra byte count for `12`, each saturating at `0xfffe`.

Only `1` is about this module; the other eleven are the file. The distinctions
are the ones `CheckpointError` already draws and they are worth carrying whole,
because a checkpoint is the one input here a *person* chose from a picker: "that
file is not this build's network" and "that file is corrupt" are the two
sentences a studio most needs to be able to tell apart, and a framing bump means
the reader cannot parse the file while a layout bump means it parsed perfectly
and the weights are void.

**It installs nothing on any failure, it never traps, and it does not grow
linear memory on the way to refusing.** The three are one property and the third
had to be added: "installs nothing" was the whole safety story here and it was
satisfied by a call that had already detached every view on the page. The
previously installed network stays installed and its digest stays published --
`arena_start`'s rule, for `arena_start`'s reason: a page that could not load a
second fighter is still able to run the first. A panic behind `pub extern "C"`
poisons the instance for the life of the page, so a mistyped URL that returned
an HTML error page has to be a message rather than a reload.
`a_corrupt_checkpoint_is_refused_and_installs_nothing` drives every variant
through the export and asserts the standing network is untouched by each, with
the instance running a fight afterwards;
`a_refused_checkpoint_does_not_grow_linear_memory` is the half that reads the
page count rather than the state, and it is the one that failed.

`learned_inference_digest_lo`/`_hi` is `LEARNED_INFERENCE_DIGEST` over whatever
is installed, and `0` when nothing is. It allocates nothing -- counted through
the repository's `#[global_allocator]` harness by
`the_cross_target_digest_allocates_nothing`, not read off the source -- and is
therefore not cached, unlike `articulated_stream_digest_lo`; and it must not be,
because the answer legitimately changes when a different checkpoint is loaded.
It is safe to call mid-fight for the same reason: no growth, no detached views. The corpus and
the byte order are on `crates/learn-core/src/digest.rs`; the pin, its ownership
and the `-C target-cpu=native` caveat that bounds it are in
[`hashes.md`](hashes.md#golden-registry).

`policy_kind(faction)` answers `0xffff_ffff` on a configured duel and
`set_policy` refuses it, because those four codes are the legacy seam's and
nothing in this loop consults `Sim::policies`. `init_articulated`'s room is
deliberately unaffected: its legacy policies are installed and consulted every
tick, so a legacy code is the true answer there.

**A configured duel refuses every export that would set an order**, which is
`set_goto`, `set_focus`, `clear_order` and `route_push` — the last through the
route queue's first leg. `arena_start` installs the runner's `Order::Advance` on
each side *because* an order reaches `World::state_hash`, and that is the same
sentence read the other way: an `ArticulatedObservation` has no order column, so
no fighter can perceive one, and a later order is therefore invisible to the
fight's logic and visible to its identity. `arena_fingerprint_*` would not
notice — it names the *configuration* and deliberately nothing else, since that
is what makes a recording reproducible — so before v2-ui-05's review one
`set_goto` ten ticks into a fight produced a different fight under an unmoved
fingerprint. `set_focus` and `route_push` report the refusal in the value they
already had for one; `set_goto` and `clear_order` answer nothing and cannot.
`route_clear` is not refused because it touches no world state, and an arena's
queue is empty in any case.

**`descend` converts an arena into an ordinary floor rather than refusing it.**
`Sim::descend` mutates in place, so it owes an explicit line for every per-world
field, and `Sim::arena` is one of them: a duel left standing across a descent
drove a freshly generated floor through the arena loop against a roster from a
world that no longer existed and stopped it dead on the previous configuration's
tick limit. After the descent `arena_policy` reads `0xffff_ffff`,
`arena_fingerprint_*` reads `0`, and `policy_kind`/`set_policy` are back to
naming and taking a `PolicyKind`. Refusing was considered and rejected: `descend`
answers a depth and has no value that means "no", and the conversion is the same
world any `init` would have produced.

### The 120-byte configuration buffer

A loadout is roughly forty scalars with cross-field validity, so it is staged
whole and judged once. `SUBMITTED_COMMAND`'s pattern exactly: a fixed array that
never moves and never grows linear memory, a `u16` layout version in bytes
`0..2`, guard bytes after it, and one consumer that copies all of it into a local
before reading any of it. This does contradict the route section's "three scalar
exports rather than a shared input buffer ... a second buffer would be a second
detachable view for no gain", and the distinction is the cross-field rule: a
route is two scalars with none, a loadout is forty with seven.

Little-endian throughout; every dimension is an `i32` raw 16.16, which is the
[submitted command](articulated-command-v1.md#fifty-seven-byte-wasm-action-buffer)'s
grammar and not a second one.

| Buffer offset | Width | Field |
|---:|---:|---|
| 0 | 2 | layout version `2` |
| 2 | 1 | fighter count, must be `2` |
| 3 | 1 | reserved, must be zero |
| 4 | 4 | `max_ticks` `u32` |
| 8 | 56 | fighter 0, `Faction::Heroes` |
| 64 | 56 | fighter 1, `Faction::Monsters` |

Each 56-byte fighter block:

| Block offset | Width | Field |
|---:|---:|---|
| 0 | 1 | anatomy: Fighter `0`, Brute `1` |
| 1 | 1 | policy code, from the table above |
| 2 | 2 | reserved, must be zero |
| 4 | 4 | spawn x raw |
| 8 | 4 | spawn y raw |
| 12 | 22 | hand 0, `LimbSlot::LeftArm` |
| 34 | 22 | hand 1, `LimbSlot::RightArm` |

Each 22-byte hand block:

| Block offset | Width | Field |
|---:|---:|---|
| 0 | 1 | `ActionKind::code`, or `255` for an empty hand |
| 1 | 1 | two-handed grip: `1` on a full right hand binds its item `Both`; zero everywhere else |
| 2 | 4 | mass raw |
| 6 | 4 | balance raw |
| 10 | 4 | segment length, or shield half-width |
| 14 | 4 | segment radius, or shield half-height |
| 18 | 4 | shield thickness; zero for a segment |

`1+1+2+4+4+2*22 = 56` and `8 + 2*56 = 120`, asserted with `const _` beside the
offsets. The hand index sets the item's `GripBinding`, which is the whole
mechanism that makes a blade in the left hand expressible; the discriminants are
pinned by `left_and_right_limb_slots_have_stable_discriminants`. The two-handed
byte turns the right hand's `Right` into `Both` -- the right arm owns the grip
and the left arm mirrors, which is why the marker is refused on the left block,
on an empty hand and above `1`. Layout `1` reserved that byte as zero, and
claiming it is what bumped the version: a version-1 writer's promise about the
byte no longer holds, so version-1 buffers are refused rather than reread. The
geometry *kind* is derived from the action rather than carried, so the block is
22 bytes and not 23. **Noncanonical ignored payloads are rejected**, which is
the submitted command's rule applied to the wider buffer: reserved bytes, a
segment's third dimension word, every word of an empty hand and every illegal
placement of the two-handed marker must be zero. A two-handed grip beside a
second carried item is canonical *bytes* and a refused *table*: it parses, and
`validate_bindings` answers `GripConflict` (`23`) by name.

Exports are:

```text
arena_config_ptr() -> u32
arena_config_len() -> u32               // 120
arena_config_layout_version() -> u32    // 2
arena_start(seed:u32) -> u32
arena_fingerprint_lo() -> u32
arena_fingerprint_hi() -> u32
arena_policy(faction_code:u32) -> u32   // ArticulatedPolicyKind::code, or 0xffff_ffff
```

`arena_fingerprint_*` is `Scenario::try_fingerprint` of the installed
configuration, `0` when none is installed. It is what a recorded fight is named
by, and it can never be the `articulated-duel-v1` pin: a runtime scenario is
named `configured-duel-v1` precisely so the two cannot be confused.

### Refusing by name

`arena_start` packs its answer with the same `submit_result` word the submitted
command uses:

```text
bits  0..7   outcome: not started 0, started 1
bits  8..15  reason
bits 16..23  the fighter the refusal is about, or 255
bits 24..31  the hand it is about; the **policy code** for reasons 7 and 26,
                 which are the two about a policy rather than about a slot;
                 otherwise 255
```

A client decoding bits 24..31 must branch on the reason and not on the byte. The
collision is real but it is not at `4`: `ARENA_HANDS` is 2, so a hand byte is
only ever `0`, `1` or `255`, and what a hand index collides with is policy code
`0` (`neutral`) or `1` (`composed`). The two refusals that put a *code* there are
`7` (policy unavailable, now unreachable) and `26` (no checkpoint installed,
which is the one code 4 gets today), so a reader that saw `0` in that byte and
guessed would say "the left hand" about a refusal that is about `neutral`.

Reasons are `0` none, `1` unknown layout, `2` wrong fighter count, `3`
noncanonical bytes, `4` unknown anatomy, `5` unknown item code, `6` unknown
policy code, `7` policy unavailable, `8` construction refused, `9` contact
reservation refused, `10` name too long, then one code per `CombatSpecError` in
declaration order: `11` MissingTable, `12` UnexpectedTable, `13` UnitPresence,
`14` TooManyAnatomies, `15` TooManyEquipment, `16` IdOrder, `17` UnknownSchema,
`18` Dimension, `19` Fraction, `20` Maximum, `21` MissingReference, `22`
LoadoutMismatch, `23` GripConflict, `24` NoEquipment, `25` UnknownAction, and
since v2-ui-08 `26` no checkpoint installed. Articulated Bow appends `27`
BowGrip -- sole right-hand item under a two-handed grip -- rather than inserting
it beside `NoEquipment` and changing an already-shipped meaning. One
opaque zero would make a studio say "invalid" for a typo, for an impossibility
and for a session that has not landed yet.

**Thirteen are reachable from a control and the rest are not**, and the split is
not the one the plan predicted; v2-ui-08 then swapped one of the twelve for
another rather than adding one. `7` was reachable while the fifth policy code
had no implementation on this side of the wall. It now has one, so `7` joins the
unreachable set and `26` takes its place in the twelve -- the fifth code is
buildable and the only thing it can be missing is its weights. Both keep their
numbers, on this section's own argument about the seven below. `Fraction`,
`Maximum`, `IdOrder`,
`MissingReference`, `LoadoutMismatch`, `TooManyAnatomies` and `TooManyEquipment`
were named as slider-reachable and are not: `Scenario::duel_from` derives
`binding` from the hand index and the `Loadout` from the carrying slots, numbers
ids `1..N` ascending, copies surfaces and anatomy maxima off shipped rows a
picker cannot touch, and builds at most two anatomies and four equipment rows
against caps of 64 and 128. They keep distinct codes anyway, because a host that
maps five refusals onto one number on the grounds that they cannot happen is a
host that says "invalid" on the day one does. The reservation refusal is the
other unreachable one and for `init_articulated`'s reason: the request is
`MAX_UNITS` and the entity limit is the same number.

It **installs nothing on any failure**, exactly as `init_articulated` does, and
it leaves the previous world standing and does not republish — the difference
being that `init_articulated` is a call that says "start over" and owes an empty
room when it cannot, while this one says "start this fight". Two hard reasons
beyond taste: `Scenario::fingerprint` panics on an invalid construction, so
`try_fingerprint` is mandatory; and a trap behind `pub extern "C"` poisons the
instance for the life of the page, turning a bad slider value into a reload.

### What recording costs

**Measured in wasm under Node on 2026-08-11, re-measured the same day after
review, and only one of the three original figures survived.** The fixture is a
3,600-tick configured duel — the shipped arrangement, `composed` against
`windmill`, seed 3, in contact from the first clinch to the tick limit — driven
three ways: as 3,600 `step(1)` calls, as 450 `step(8)` calls, and as one
`step(3600)`. The control is the same duel with `neutral` on both sides, which
never touches at all: it resolves zero contact rows against the contact pairing's
capped feed.

**Method, because the first version of this section did not survive its own.**
Rounds are interleaved — one round touches all six cells, two policy pairings
across three batch sizes, before the next begins — and each cell keeps its best
of nine. The six process runs below were then pinned to logical CPU 0 at high
priority, which the guidance of the day prescribed and the original measurement did
not do. **That prescription is now historical**: the host these runs were taken on
was a hybrid-core laptop, the current one is uniform, and
[performance evidence](../performance/README.md) records why pinning buys nothing
against a machine with no slow core. The numbers below were real on the machine that
produced them. It matters more than interleaving
did: an unpinned process reads up to 15% faster on a good run and about 1.8×
slower on a migrated one, and the migration moves **every cell in that process at
once**, so a figure quoted from a single unpinned run is not evidence about the
thing it names.

| pinned, best of nine, six process runs | ticks/s |
|---|---|
| `composed` vs `windmill`, contact throughout | 8,821 – 9,996 |
| `neutral` vs `neutral`, no contact at all | 45,101 – 57,782 |

**About 10,000 ticks per second, so a whole fight records in under half a
second.** That is the number to design a recorder around, and it is the one
figure of the three that re-measurement left where it was.

**Two further passes read about 20% faster, and the range is the answer.** While
`v2-ui-07` was built, three more independent measurements of a contact-bound
drive were taken, each pinned to logical CPU 0 at high priority with interleaved
cells and a closing control:

| pass | ms for 3,600 ticks | ticks/s |
|---|---|---|
| this section, six runs | — | 8,821 – 9,996 |
| `v2-ui-07` as built, three runs | 360.1 / 367.2 / 365.1 | 9,804 – 9,997 |
| `v2-ui-07` review, three processes | 293.1 / 296.7 / 308.1 | 11,686 – 12,281 |
| `v2-ui-07` repair, three runs | 300.6 – 306.5 | 11,747 – 11,974 |

They fall into two clusters about 20% apart, and the later two reproduce each
other rather than adding a fifth reading. **The likeliest explanation is that they
are not the same fight** — this section drove the older articulated duel, and
`v2-ui-07` drives the `duel_from` configuration the picker writes, so contact
density differs. That is a hypothesis and **not verified**; nobody has run both
harnesses against one configuration.

What survives either way, and is all a recorder needed: a 3,600-tick fight
records in **0.3 to 0.4 seconds**. Quote the range and name the pass, never a
single figure — the practice of quoting one is what produced four numbers for one
quantity on this machine. Why best-of-N understates here, and what to bracket
instead, is in [performance evidence](../performance/README.md).

**Every pass above measures one pairing, and the pairing moves the drive further
than anything the recorder does.** A separate six-run pass, taken beside the paired
copy-out measurement below, drove four cells and a control in one pinned process,
best of nine each — the picker's own arrangements rather than this section's single
fixture:

| pairing, seed 3, best of nine over six pinned runs | ms | ticks | ticks/s |
|---|---:|---:|---|
| `composed` vs `composed` | 673 – 943 | 3,600 | 3,816 – 5,349 |
| `composed` vs `windmill` — the shipped one | 454 – 523 | 3,600 | 6,879 – 7,935 |
| `windmill` vs `windmill` | 527 – 684 | 3,600 | 5,260 – 6,838 |
| `learned` vs `windmill` | 387 – 507 | 3,339 | 6,592 – 8,634 |

**Read the ratios inside this pass and not its absolutes**, which is why it is a
fifth reading rather than a fifth row in the table above: the machine warmed under
those six runs — the control drifted from 654 ms to 1,734 ms across the session, with
other agents compiling on the same laptop — so even the shipped cell here reads slower
than any of the four passes. The cells moved together under that drift, and what they
say is that **`composed` on both sides is 1.5–2× the shipped `composed` against
`windmill`**. That is a larger effect than the copy-out, `publish()` and the batch
size put together — all three of them measured below — and none of those three is
what a reader changes when they change the picker. `learned` against `windmill` is
the one cell that ends early, at the 3,339
ticks of the kill, so its ticks/s is the column to compare and its milliseconds are
over a shorter fight.

**The contact solver is most of a contact-bound tick, but the size of it is a
factor with a range and not a number.** The quiet pairing runs 4.5–6.5× faster.
The original note's "about 58,000 ticks/s at every batch size" is the top of the
pinned range rather than a typical reading of it; a review that re-measured the
same control at 18,000–26,000 was reading a migrated process, which is what the
unpinned runs here also produce — one of them read 25,672–27,634 across all three
control cells while the contact cells in the same process fell to 6,371–6,694.

**`publish()`'s cost is below the noise floor, and there is still no
`arena_record_step`.** The original note read 342/335/329 ms for the three batch
sizes as "about 4%, roughly 4 microseconds a call". It is not a measurement of
anything: across the six pinned runs the `step(1)`-versus-`step(3600)` difference
spans **−1.2% to +7.8%** on the contact pairing and **−12.9% to +10.7%** on the
quiet one. It straddles zero in both — 3,600 separate publications are repeatedly
*faster* than one — so 3,599 extra rebuilds of the legacy frame and both
articulated buffers are not separable from run-to-run variation. What is
defensible is a bound and not a value: under 8% of a drive that is already under
0.4 seconds. **The conclusion is unchanged and now rests on the bound rather than
on a figure: `publish()` does not dominate, and no `arena_record_step` is owed.**

**What this does not cover**, which matters because v2-ui-07 is the session that
read it and built the recorder against it:

- **Neither fixture ends early.** Both run to the 3,600-tick limit, so this is
  the cost of the longest fight a configuration allows. A duel that settles at
  tick 400 costs a ninth of it, and nothing here says how often one does.
- **The `learned` policy was unmeasured** when this section was written. Its
  *inference* is measured now and the rest of it is not, and the difference
  matters. v2-ui-08 measured `learned_inference_digest_lo()`, which is 64 feature
  extractions and 64 forward passes over a fixed corpus and nothing else, at
  **1,317–1,341 nanoseconds per forward pass** in wasm under Node — 84.3 to 85.8
  microseconds a call, best of nine across six process runs pinned to logical
  CPU 0 at high priority, each ending with the baseline repeated as a control,
  which is the method the rest of this section owes and the half the first
  version of this figure skipped.

  **Three passes over this one line disagree, and the spread is the finding.**
  It was first recorded at 75.4–78.5 microseconds with no trailing control; an
  adversarial re-measurement on the same machine read 91.4–102.0 and its
  controls came back *worse* than its bests in all six runs; the numbers above
  are a third pass whose controls came back within 4%. The variable is the
  warm-up — a long one drifts, and a long-warm-up run here read a trailing
  control of 115–125 microseconds against a best of 85.4, which is precisely the
  reading the control rule exists to void. Quote **roughly 1.3 microseconds a
  forward pass** with a couple of hundred nanoseconds either side, and do not
  read a 10% move in this number as a change in the code.

  The native comparison is the figure `lab learn-probe evaluate` prints beside
  its table, **3.01 to 4.58 microseconds per decision** over 116,021 and 116,413
  decisions — that log is gitignored, so the command rather than the file is the
  citation: `lab learn-probe evaluate --checkpoint checkpoints/v2-probe.ckpt`.
  The two are **not** comparable, because
  that one is wall-clock under twenty-way contention and this one is a single
  pinned thread.

  Against the ~100 microseconds a contact-bound tick costs above, and at one
  learned decision per tick since only one side carries a network, inference is
  **about 1%** of a tick. What is still unmeasured is a whole learned *fight*
  through this harness — `compose`, the submission and the arm driver are not in
  the number above — and that figure is still owed: the paired copy-out
  measurement below drove `composed` against `windmill` and says nothing about
  it.
- **It is `step()` under Node and nothing else.** No browser, no worker, no
  `postMessage`, and — the important one — **no per-frame copy-out of the pose,
  region and combat-event buffers**, which is exactly the work `v2-ui-07` added. A
  recorder that lifts 66 words per body per tick out of linear memory is paying
  for something this harness never touched.

  **The copy-out was measured afterwards, and it is a few percent.** The recorder
  lifts the pose, region and combat-event rows out of linear memory on every one of
  3,600 ticks. Measured 2026-08-11 on this section's own fixture, one process
  pinned to logical CPU 0 at high priority, nine rounds shaped
  `bare → recorded → bare` so the recorded cell is bracketed by two bare drives of
  the identical fight:

  | | run 1 | run 2 | run 3 |
  |---|---|---|---|
  | bare, best of nine | 300.6 ms | 302.0 ms | 306.5 ms |
  | recorded, best of nine | 312.6 ms | 311.1 ms | 317.9 ms |
  | paired per-round difference, median | +3.0% | +5.0% | +5.7% |
  | paired per-round range | −8.5 to +13.5% | −11.7 to +8.9% | −13.2 to +22.2% |

  Over all 27 rounds the median is **+3.6%** and the difference is positive in 21
  of them, so the copy-out costs a consistent **+3 to +4%** of the drive and the
  defensible bound is **≤8%** — the same bound this section reached about
  `publish()`, and quoted at 8 rather than at 6 because 6% does not survive a
  repeat: an earlier pass on the same fixture read +7.5%. **Read the paired
  per-round difference and not the difference of the two bests**, which reads
  +4.0 / +3.0 / +3.7% on this same data. The machine drifted inside every one of
  the three runs — the bare cell went from about 300 ms in rounds 1 and 2 to
  370–500 ms from round 3 onward, with the closing controls tracking it exactly —
  so a difference of two cells' bests takes one number from before the drift and
  one from after and calls the gap a cost. The copy is therefore *inside* the 0.3
  to 0.4 seconds above rather than beside it: a recorded 3,600-tick drive is still
  that, with the copy in it, and no `arena_record_step` was ever owed.

The estimate this section was written against — ~650 ticks/s and a fight in about
five seconds — was an extrapolation from `checkpoints/train.log` at an assumed 2x
wasm penalty. It is 15x pessimistic, and the reason is that 1,300 ticks/s was
throughput under 20-way contention across 384 fights per generation with MLP
inference on one side, not the latency of one fight on one thread.

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

## Region rows

`REGION_LAYOUT_VERSION=2`, `REGIONS_PER_BODY=7`, `REGION_STRIDE=8`, and
`MAX_REGIONS = MAX_POSES * REGIONS_PER_BODY = 448`. One row per **swept volume**
of every live articulated body, in `sim::BODY_VOLUME_COUNT` order inside a body
and in the [pose rows](#pose-rows)' order across bodies. The row is
`sim::RegionVolume` word for word.

**Seven volumes over five anatomy regions, and the gap between those two numbers
is the section's one subtlety.** Rows `0..5` are the five `AnatomyRegion`s in
their own discriminant order and keep those indices exactly; rows 5 and 6 are the
left and right **forearm**, which exist only on a body whose arms have an elbow
to split them at. A single-link body publishes them absent — `present` zero,
endpoints at the body origin, radius zero — so the section is one shape for every
combat model and a reader never branches on which kind of body it is holding.

The forearms are appended rather than interleaved beside each arm because the
five leading indices are read positionally by three consumers at once:
`client/src/arena/geometry.ts` names regions 2 and 3 as the arms, the pose row's
`POSE_SEVERED_MASK` numbers its bits the same way, and `crates/lab` swaps 2 and 3
to mirror a fight. Interleaving would have renumbered all three for nothing.

**A forearm is not a sixth and seventh anatomy region**, and the pose row's
per-region arrays stayed five for that reason. Anatomy is what can be wounded,
armored and severed; a forearm is none of those on its own — it is part of an arm,
covered by the arm's armor row, and losing it is losing the arm. `POSE_SEVERED_MASK`
is therefore still five bits, `POSE_INTEGRITY_FIRST` and `POSE_WOUND_FIRST` still
span five words each, and `COMBAT_EVENT_BODY_PART` still carries a `BodyPart`:
`sim::volume_region` maps a contact's swept volume to the region it belongs to
before the word is written, so a forearm blow is published as a blow on its arm.
`emit_abi.rs` asserts `REGIONS_PER_BODY == POSE_BODY_PART_COUNT + 2` rather than
the identity the two used to have.

| words | field |
|---:|---|
| 0..2 | lower point XYZ |
| 3..5 | upper point XYZ |
| 6 | radius |
| 7 | present |

**The capsules the contact phase sweeps, from the function that sweeps them.**
`publish` calls `sim::jointed_body_region_volumes` with the pose's own origin,
yaw, hands and elbows and with `present` read off the pose's severed mask;
nothing on the host side computes geometry. The mask goes in five bits wide and
the answer comes back seven rows wide, which is the region/volume distinction in
miniature: there is no state in which a forearm is severed and its arm is not, so
the mask has nothing to say about rows 5 and 6 and the constructor derives them
from the arm's bit and the elbow together. That is the section's whole reason to exist, and it
is the same rule the pose row states as "the row is otherwise the sim's own
`ArticulatedPose` word for word".

**The alternative is rejected on the record, so it is not rediscovered as an
idea.** Publishing the anatomy once and porting `body_region_volumes` to
TypeScript is the cheap approach and it is exactly the mirror
[`crates/lab/src/trace.rs`](../../crates/lab/src/trace.rs)'s module header
refuses: a viewer that rebuilt a shoulder from an anatomy row would be a second
answer to a question the simulation has already answered. The function is not
trivial either — the head is a *degenerate* capsule whose extent comes from
`radius` while `AnatomyRegionSpec::half_height` is dead for that region, and an
arm runs from a yaw-rotated shoulder to wherever the actuator has just put the
hand — so a TypeScript copy would be right on the day it was written and wrong
the first time the anatomy changed, with nothing in the repository able to
notice. The third option, drawing hands, weapons and shields only, is a fight
with no bodies in it.

**Presence is published and not inferred, and the head is why.** A severed limb
stops existing, and `body_region_volumes` takes `present` region by region. A
reader that inferred absence from a zero-length capsule would drop the head —
which is a sphere, whose two endpoints coincide, on every body, on every tick.
That is the ordinary case rather than a corner one, and
`the_head_capsule_is_published_degenerate_and_present` is the test that says a
reader cannot get it wrong.

It rides as an **eighth word per region**. The two rejected placements and why:

- *A per-body mask word.* 1,024 bytes cheaper and it breaks two rules at once —
  the row would no longer be `RegionVolume`'s four fields, and the column list
  would no longer be exactly `0..STRIDE`, which is the shape
  `generated_presentation_offsets_cover_every_packed_column` asserts for every
  packed row in the ABI. A mask is also a second encoding of a fact the sim
  hands over as a `bool`.
- *Nothing at all, with the reader deriving it from `POSE_SEVERED_MASK`.* That is
  where the sim's `present` argument comes from today, so it is free and correct
  right now. It is refused on this section's own argument: it is a
  re-derivation on the reader's side, and the day presence stops being exactly
  "not severed" the two answers part company silently, with a viewer drawing a
  capsule the contact phase does not sweep.

The published cost of the eighth word is **1,280 bytes**, taking the section from
8,960 to 10,240. The forearm collider then took it from 10,240 to **14,336**, two
more rows a body on all 64, charged whether or not the installed world has an
elbow anywhere in it — a fixed array is charged once, and one that grew when an
embodied world was installed would detach every typed array the page holds.

**The row carries no identity, and the section is read against `pose_len`.**
Region row `n` describes pose row `n / REGIONS_PER_BODY`; two identity words
repeated seven times a body would be a second answer to a question the pose row
beside it already answers. What a reader checks before it indexes is
`region_len == REGIONS_PER_BODY * pose_len`, which is one comparison and is the
only thing that can be wrong — the same shape as the boot handshake refusing a
frame layout it does not understand. The two capacities are one capacity for the
same reason: a region buffer that could fill before the pose buffer did would
publish half a body. A body whose anatomy the host does not hold is skipped and
increments `regions_dropped`; the rows after it **do** shift, because the writer
carries one cursor and the section stays dense — which is precisely why the count
is the contract and not a nicety. A reader that compares the two lengths refuses
the whole section; one that skips the comparison indexes a shifted one.

Exports are `region_ptr`, `region_len`, `region_stride`, `region_capacity`,
`regions_dropped`, and `region_layout_version`. `region_len` counts regions, not
bodies. The section is filled at publication from end-of-call state, beside the
pose rows and by the same walk of the same bodies.

The host holds the anatomy it needs in a fixed `MAX_POSES`-wide array on its own
`Sim`, resolved once per world install from the scenario's spec table, because
`World` resolves its own privately and there is no way to ask. `crates/lab`'s
trace keeps the same table for the same reason and on the same assumption:
`World::try_new` spawns `scenario.units` in order and no export walks an
articulated body into a world afterwards, so a slot indexes the unit that spawned
into it. It is a fixed array and not a `Vec` because it is written on a path that
holds two whole worlds at once; see the memory note below.

## Articulated-projectile rows

`ARTICULATED_PROJECTILE_LAYOUT_VERSION=1`,
`ARTICULATED_PROJECTILE_STRIDE=12`, and
`MAX_ARTICULATED_PROJECTILES=MAX_SHOTS=32`. This is a fourth publication, not an
extension of the legacy frame's four-word `shot` rows: legacy shots are 2D and
belong to the Legacy model, while these are the articulated runtime's 3D arrows.

| words | field |
|---:|---|
| 0..1 | projectile slot and generation |
| 2..3 | owner entity index and generation |
| 4..6 | position XYZ |
| 7..9 | velocity XYZ |
| 10 | radius |
| 11 | remaining range |

Only live rows are published, in stable slot order. Liveness is therefore the
row's presence in a publication; `(slot,generation)` distinguishes a later arrow
that reuses the same slot, and the owner is a full identity for the same reason.
All positions, velocities, radii and ranges cross as signed `Fx` raw words.

Exports are `articulated_projectile_ptr`, `articulated_projectile_len`,
`articulated_projectile_stride`, `articulated_projectile_capacity`,
`articulated_projectiles_dropped`, and
`articulated_projectile_layout_version`. The fixed buffer costs 1,536 bytes.

## Stance rows

`EMBODIED_STANCE_LAYOUT_VERSION=1`, `EMBODIED_STANCE_STRIDE=6`, and
`MAX_EMBODIED_STANCE = MAX_POSES = 64`. One row per live embodied body, in the
[pose rows](#pose-rows)' order across bodies. The row is `sim::StanceView` word for
word and the host derives none of it.

| words | field |
|---:|---|
| 0..1 | entity index, generation |
| 2 | hip yaw raw |
| 3 | pelvis height, as a fraction of standing height |
| 4 | twist raw, signed |
| 5 | forced-step ticks remaining |

**The hip yaw is the feet bearing and is not the body yaw at pose word 5.** That the two
can differ at all is what this publication exists to say: an articulated body turns as
one piece, an embodied one turns its torso against its hips and has to move its feet
when the twist runs out. It is an `Angle` and widens to `u32` on the word rules above.
`pelvis` is a **fraction of standing height** and deliberately not a world-space z —
what a renderer wants is how far the body has sunk relative to its own size, and the
size is already in the anatomy it holds. `step_left` is ticks remaining in a forced step
and reads zero when the body is settled.

**`twist_raw` is derived at the publication boundary and is stored nowhere.**
`StanceState` has no twist field: the twist is `body_yaw.delta(hip_yaw)`, and a stored
copy is a second thing that can disagree with the two angles it is a function of. That
it is nonetheless *published* is an application of the same rule rather than a
contradiction of it. A consumer holding this row's hip yaw and the pose row's body yaw
could do the subtraction itself, and that subtraction is exactly the second copy the sim
declines to keep: a wrapping signed delta over binary turns, taken across two sections,
against a bound that lives on the torso's target rather than on either angle
(`STANCE_TWIST_LIMIT_RAW`, a sixth of a turn). Deriving it once, on the side that owns
the rule, is cheaper than every reader deriving it and one reader deriving it
differently.

It is **reinterpreted and not widened**, which is this row's one departure from the
`Angle` rule above: a twist is a signed delta and not a bearing, so a sign extension
would make a quarter turn to the right and `0xffff_c000` two different words for one
twist.

The same word is deliberately **absent from the state hash**, which is the mirror of the
argument above and not a second opinion about it. Both angles it derives from are
already in that stream, so hashing the twist would hash one fact twice and would let a
later change to the derivation disagree with itself. A published stream and a hashed
state want opposite things from a derived column — the reader wants it computed once, by
the owner; the digest wants it not counted twice — and this column is in both, on both
rules.

**The section is published for every model, and a zero length is an answer rather than a
silence.** `publish` drives off `World::stances()` with no `has_stance` branch of its
own, so a Legacy or Articulated world writes its zero rows through the same code an
embodied one writes its roster through; a host that branched first would have two paths
where the sim has one, and the second path is the one nothing ever runs. Every world
this module can currently open takes that path, because no export installs an embodied
one — which makes the distinction load-bearing rather than decorative. "Nothing, and I
am telling you so" is a different answer from "this module has never heard of stances",
and the length word is the only thing carrying the difference: a reader that took a
zero-length section for a missing one could not tell an articulated fight from an
artifact built before the publication existed. That is the distinction the boot
handshake's layout version exists to make, and this length is what makes it per tick.

**A fifth publication and not six more pose columns**, on the region section's argument
exactly. A pose row is written for every articulated body and a stance exists only under
`CombatModel::Embodied`, so folding these words in would widen every row of every fight
to carry six most of them do not have — and it would move `POSE_LAYOUT_VERSION`, which
is a version about pose columns and has nothing to say about hips. The layout version
here is its own number for `REGION_LAYOUT_VERSION`'s reason: this section adds no pose
column, and a pose column moving says nothing about these six words.

**The row carries a full identity where a region row does not**, because the stance
section is not a fixed multiple of the pose section. Region row `n` belongs to pose row
`n / REGIONS_PER_BODY` and needs no identity of its own; no such arithmetic exists here,
since the ordinary case today is a full pose buffer beside an empty stance one.
`embodied_stance_len() == pose_len()` holds on an embodied world and is asserted there
rather than stated as a law of this ABI. Identity is the join, and it is both words of
one: an index alone would answer just as happily for the body that took the slot next.

`MAX_EMBODIED_STANCE` is written as `MAX_POSES` and never as a second literal 64. A body
with legs is a body that also publishes a pose, so a stance cap that could fill first
would drop the legs of a body whose torso crossed — the half-a-body failure
`MAX_REGIONS` is written this way to refuse. `embodied_stances_dropped` is therefore
zero in every reachable case, and is published anyway on `poses_dropped`'s terms: the
prefix rule means nothing if a reader cannot tell that it fired.

Exports are `embodied_stance_ptr`, `embodied_stance_len`, `embodied_stance_stride`,
`embodied_stance_capacity`, `embodied_stances_dropped`, and
`embodied_stance_layout_version`. `embodied_stance_len` counts rows, not words. The
section is filled at publication from end-of-call state, in the slot order the pose rows
are written in. The buffer is authoritative and unfiltered exactly as the pose buffer
is: a hip bearing is which way a body is *about* to be able to move and a forced step is
how long it cannot change its mind for, both for bodies the viewer may have no way of
seeing, so the worker filters this beside the pose rows it belongs to. It costs 1,536
fixed bytes — half a percent on top of the 290,816 the four publications before it cost
— and it is charged whether the installed world has legs or not, which is what a fixed
array buys and a lazily allocated one would give away: a buffer that appeared when an
embodied world was installed would grow linear memory on that call and detach every
typed array the page is holding.

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

**The pressure pair carries `crush + pressure`.** The sim splits the non-cut,
non-thrust remainder once more -- into a crushing channel that reaches anatomy and a
residual that reaches nothing -- and this layout has three channel words rather than
four, so the publisher folds the two together. The reason is the invariant rather than
laziness: `cut + thrust + pressure` is how every consumer recovers the allocated share,
and both the 2D contact ring and the arena's contact sphere are sized from it, so
publishing the smaller residual would draw a crushing blow smaller than it was while
reporting a cut and a thrust of zero. The cost is that a club's blow and an inert graze
are indistinguishable from these words alone. Splitting them means appending `crush` at
words 32/33 -- which keeps this prefix byte-identical, the shape v2-ui-06 used -- and
moves `ARTICULATED_STREAM_DIGEST` and its five mirrors, so it is its own session.

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

The four static arrays cost 16,896, 262,144, 14,336 and 1,536 bytes respectively,
for 294,912 bytes excluding thread-local wrapper bookkeeping. (The region term was
10,240 and the total 290,816 until the forearm collider took the section from five
rows a body to seven.) The 57-byte command buffer
belongs to v2-11 and is not charged again, and neither are the 120-byte
configuration buffer or v2-ui-08's 32,768-byte checkpoint staging buffer and its
32-byte digest — those are *input* and are charged where they are declared. The
checkpoint buffer is the one of the five large enough to notice: it is what took
the articulated stress fixture from 241 pages to 242. Compile-time assertions use
`MAX_POSES*POSE_STRIDE*4 + MAX_COMBAT_EVENTS*COMBAT_EVENT_STRIDE*4 +
MAX_REGIONS*REGION_STRIDE*4 +
MAX_ARTICULATED_PROJECTILES*ARTICULATED_PROJECTILE_STRIDE*4`. The projectile
array is the cheapest of the four.

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
reveal an absent identity, and writes a complete snapshot buffer. Pose, event, region
and projectile pointer stability lasts for the module lifetime.

**The snapshot buffer does not reserve the four articulated publications for that
filtered copy yet, and the omission is a decision.** `emit_abi` emits all four layout
versions, all four strides, all four capacities and all 66 + 32 + 8 + 12 column
offsets, because those are the ABI and
the copy is written against them — but `SNAPSHOT_BUFFER_BYTES` still ends at the
furniture block at 27,452 bytes and four snapshot regions. Reserving the four
articulated blocks takes it to 318,268 — 290,816 bytes on each of the three pooled
buffers, and an 11.6x wider zero-fill on a buffer `client/src/state/snapshot.ts` clears
whole once per *filtered publication* — while nothing on the far side writes or reads a
word of them: the filtered copy is v2-ui-07's — **superseded two sentences below: it is
not v2-ui-07's, and no session owns it.** A per-publication memset does not get
11.6x wider ahead of the consumer that justifies it and the measurement that sizes it.
The formula and the numbers the blocks will generate are held in
[`articulated-mechanical-gate.md`](articulated-mechanical-gate.md#worker-integration)
until then. **v2-ui-07 was named as this reservation's owner and is not.** It built
the recording as its own transferred channel precisely because the pool zero-fills,
coalesces and has the wrong lifetime — see
[`worker-protocol.md`](worker-protocol.md#the-recording-and-why-it-is-not-the-pooled-buffer)
— so it never wanted a snapshot region and never reserved one. The blocks are still
unreserved, the argument for leaving them unreserved is unchanged, and the consumer
that would justify them is the **game** path's filtered articulated copy, which no
session yet owns.
`snapshot_offsets_are_aligned_non_overlapping_and_cover_every_fixed_buffer` in
`crates/web/src/bin/emit_abi.rs` is what refuses a reservation that arrives before
one. ("Region" carries two meanings across these files: a *snapshot* region is
one of the four pooled blocks, an *anatomy* region is one of the five capsules above.)

After warm-up, maximum pose, contact, event, spawn, reset, and route paths may not
increase `wasm.memory.buffer.byteLength` while a legacy frame view is held. The Node
test also proves the original frame, pose, and event typed arrays remain attached.
`published_views_survive_articulated_stress_without_memory_growth` in
`client/test/wasm-memory.test.mjs` is that test. It holds the legacy frame view and
`Uint32Array`s over the *whole* 16,896-byte pose array and 262,144-byte event array
(the 10,240-byte region array joins them with the filtered copy that reads it) —
the reserved extent, not the live prefix, because that is the view a worker keeps for
the life of the module — and drives `init_articulated`, sixty-five refused spawns,
four descents, the clinch to its contact cap, sixteen batched `step(8)` calls, the
stream digest and a reset, across three seeds. It settles at **242 pages** from the
end of the first warm round and holds there through a measured sixth round and a
measured sixth guarded cycle — 237 while the event capacity was 1024, and **241
until v2-ui-08 added the 32 KiB checkpoint staging buffer**, which is half a page
of static data that happened to fall across a page boundary. Most of the total is
the articulated *room* rather than these arrays, which are 5 pages between them.
The test asserts no growth against a baseline it measures for itself, so the
number is a record and not an assertion; `client/test/wasm-memory.test.mjs` still
writes 241 down in a comment beside it and that comment is stale.

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

**The host's anatomy table is a fixed array for this reason and it was measured.**
The region section needs the anatomy each slot was built with, and the obvious
shape is a roster-sized `Vec` filled at install. That is one more heap allocation
on a path that holds two whole worlds at once — every `init_articulated_test`
builds the replacement before dropping the installed one — and it moved the peak:
`the_browser_contact_warmup_does_not_grow_wasm_memory` settles at 221 pages after
one warm round, and with the `Vec` it stayed at 221 through round ten and stepped
to 245 on round eleven, past the nine that fixture warms. A fixed
`MAX_POSES`-wide array reserved with the rest of the `Sim` settles it back at 221
and needed no round bumped. The 10,240-byte static region array itself moved
neither that number nor the articulated stress fixture's, which was 241 then and
is 242 since the checkpoint buffer.

**A reset belongs in the warm set too, and one per floor the proof will later drive.**
`init` builds the replacement `Sim` before it drops the installed one, so every reset
holds two `combat_events` reservations at once — 512 KiB now that the capacity is
2048, where it was 256 KiB at 1024 and 64 KiB at the rejected 256. That second
reservation no longer fits
in the slack a single warm round leaves behind, so a proof warmed on one seed and then
driven across three watched its first `init` grow linear memory. Warming the same seed
twice does not fix it: the peak is per *floor*, because a generated room's fog is most
of a `Sim` and every seed generates a different room. **It said "nav fields and fog"
until 2026-08-18**, when the navigation flow field was deleted for having no reader --
which moved the articulated fixture's plateau from 291 pages to 309 and its settling
round from 4 to 15, the fifth reading in a row saying the plateau tracks dlmalloc's
allocation order rather than what a `Sim` weighs.
`published_legacy_views_survive_every_warm_path_without_memory_growth` is the test
that says so. At 1024 it warmed every seed once and settled at 30 pages; at 2048 that
stopped being enough and the guarded phase grew on its second visit to a seed, so it
now warms every seed **twice, nested the way the guarded phase nests them**, and
settles at 38 pages. Two rounds over the seed list rather than per seed — the same six
calls in the other order — does not settle it, which says the peak follows the
floor-to-floor transition and not the number of rounds.

The arena path has its own warm set and its own number:
`arena_start_allocates_within_the_warm_set` drives `init_articulated`,
`load_checkpoint`, `arena_start` and 128 ticks over **three differently-shaped
arrangements** — because `arena_start` builds a `Scenario` whose spec table is a
function of the loadout, so a warm-up that only ever saw the shipped one leaves the
first differently-shaped fight to grow the heap under the guard — and settles at
**223 pages** through three guarded cycles with every published view retained but one.
**FURNITURE is deliberately not retained there**, on the same argument that puts a
legacy `init` first: a configured duel has no furniture at all, so a view over an arena
publication's furniture block is zero-length — and a detached view reads a `byteLength`
of zero too, so it could witness nothing either way. Its *pointer* is checked with the
rest, which is the half an empty view can carry.

## Portable stream digest

Use FNV-1a-64 with the constants in the contact contract. Prefix ASCII
`ARPG-STREAM-V1`. For every tick, including an empty tick, feed little-endian:
`tick:u32`, pose length, poses dropped, every live pose row word, event length, events
dropped, every live event row word, region length, regions dropped, every live region
row word, projectile length, projectiles dropped, every live projectile row word,
stance length, stances dropped, every live stance row word.
Tests drive one tick per publication so drop metadata has one meaning. Native
and wasm use identical scripted inputs and bytes; state hashes are not part of this
digest.

**Every section after the first two is appended behind the one before it rather than
woven in beside the pose words: regions after events, projectiles after regions,
stances after projectiles.** The byte order is append-only for the reason the columns
and the codes are. A stream that reordered
would move the digest by the same amount an extension
does, and the two would be indistinguishable afterwards. Written this way, the
pose-and-event prefix of every tick is byte-identical to what v2-16 pinned, so
v2-ui-06's move can be read as the extension it is — and so can every move since.

**A section reaches this digest whether or not the fixture has a row for it**, which is
what the [stance rows](#stance-rows) made visible. The script below is
`Scenario::articulated_duel` and only `CombatModel::Embodied` has legs, so the fifth
section contributes a zero length and a zero drop count on each of the twenty ticks and
nothing else — and **their presence is the whole of the move**, from
`0x3b0d5c93d5560dd9` to `0x686ecf8a2f5dd479` in the default build and from
`0x2fa1256f412b2e32` to `0xde453a669e770512` under `cartesian-recoil`, native and wasm
agreeing on both. A section that vanished when it had nothing to say would be
indistinguishable here from a section nobody added, which is the argument the empty
*tick* is already carried on. The claim that the move is an extension is **measured
rather than asserted**:
`the_stance_section_extends_the_digest_without_disturbing_its_prefix` in
`crates/web/src/lib.rs` recomputes the digest with the stance tail suppressed and gets
the old value byte for byte, so no pose, event, region or projectile word of any tick
moved.

The digest is exported as `articulated_stream_digest_lo()` and
`articulated_stream_digest_hi()`, on the `selftest_hash` precedent: a self-contained
scripted drive that builds its own world, digests each publication and throws it away
without touching `SIM`, `FRAME`, `POSES`, `REGIONS`, `ARTICULATED_PROJECTILES`,
`EMBODIED_STANCES`, `COMBAT_EVENTS`, the tile buffer or
the furniture buffer. It goes through the **same** five buffer writers `publish` calls
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
empty tick" is actually covered. Every tick carries two pose rows and fourteen
region rows — ten until the forearm collider widened the section — no projectile
rows and no stance rows. The two empty sections are still driven through
their own writers rather than short-circuited to an empty slice: a script that
hard-coded the emptiness would prove that the host *believes* the section is empty,
where running the writer proves the section is.
The pin is registered in [`hashes.md`](hashes.md#golden-registry).

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
it through the same four writers `publish` calls. What one number cannot catch is an
encoder wrong the same way on both targets, so
`native_and_wasm_pose_event_stream_digests_match` checks the pose row grammar beside
it, against this document rather than against the module: ascending full identity, the
equipment mask against the geometry it describes, and the intent and animation-hint
enumerations. Since v2-ui-06 it checks the region grammar on the same terms — five
rows a body in pose order, presence against the pose row's severed mask, and the head
published as a degenerate capsule that is nonetheless present, which is the one fact
in this section a reader could plausibly get backwards.

**The stance section has no row grammar beside it there and cannot have one yet**, and
that gap is recorded rather than left to be discovered: no export installs an embodied
world, so every world the JavaScript check can open publishes zero rows. What crosses
the wall is the section's layout version, stride, capacity, a distinct aligned pointer
inside linear memory, and the zero itself paired with a zero drop count — which is the
whole of what an empty publication has to say and exactly the pair that distinguishes it
from an absent one. The row grammar is checked natively instead, by
`an_embodied_bodys_stance_row_round_trips`, which reads every published row back against
`World::stance` column by column and then submits a quarter-turn order to prove the
columns move — two bodies standing still satisfy a round trip that a buffer written once
at spawn would also satisfy.
