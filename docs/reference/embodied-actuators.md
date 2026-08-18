# Embodied actuator contract

**Purpose:** Freeze the embodied body's persistent state, its constants and their provenance, its phase order, and which of it is hashed.
**Status:** current
**Canonical source:** This contract plus [`crates/sim/src/combat/actuator.rs`](../../crates/sim/src/combat/actuator.rs), [`crates/sim/src/combat/limb.rs`](../../crates/sim/src/combat/limb.rs), and [`crates/sim/src/world/articulated.rs`](../../crates/sim/src/world/articulated.rs)
**Update when:** An embodied actuator constant, formula, phase order, column, or hashed field changes.

<!-- DOC_CONTRACT: embodied-actuators -->
## What an embodied body has that an articulated one does not

Three columns and one derived joint. Everything else — arms, grips, shields,
contact, anatomy — is the articulated actuator unchanged, and
[that contract](articulated-actuators.md) still owns it.

| Column | Type | Allocated for |
|---|---|---|
| `ground_z` | `Fx` per body | every model; non-zero only on a sculpted floor |
| `stance` | `StanceState` per body | `CombatModel::has_stance` |
| `elbow_plane` | `[ElbowPlaneState; 2]` per body | `CombatModel::has_swing_plane` |

The elbow itself is **not** a column. It is solved once per body per tick by
`World::arm_elbows` from the shoulder, the hand and the held plane, and retained
in the tick entry so the contact phase can sweep the arm from where it was to
where it is. A stored elbow would be a second thing that could disagree with the
three values it is a function of.

## Stance

```rust
pub struct StanceState {
    pub hip_yaw: Angle,
    pub hip_yaw_speed_turns: Fx,
    pub hip_authority_residue: Fx,
    pub pelvis: Fx,
    pub step_left: u8,
}
```

**`twist` is not a field.** It is `body_yaw.delta(hip_yaw)`, derived wherever it
is wanted, because a stored copy is a second thing that can disagree with the two
angles it sits between. It is absent from the hash for the same reason: both
angles are already in that stream, so hashing the difference would hash one fact
twice and let a future change to the derivation disagree with itself.

**`pelvis` is derived and never commanded.** It is `PELVIS_HEIGHT_RAW` less a
speed term less a twist term, each clamped, evaluated left to right. The grouping
is written down in the field's own doc because `Fx` truncates and a reordering is
a different number.

There is no leg command and there will not be one. Legs and torso are under
automatic control, as they are in the source material; what this session added is
the *constraint* the legs impose, not a second thing to drive.

## The two-link arm

`Elbow` is two link lengths and the stop between them. `Elbow::reach_bounds`
answers the annulus `[inner, outer]` a hand may sit in: the outer bound is the arm
laid straight, and the inner one is the law of cosines at the joint's own stop.

**The inner bound comes from the stop and not from the link lengths.** The two
links are equal, which makes the naive inner bound `|upper - fore|` zero — a hand
that could touch its own shoulder. Choosing an asymmetry to manufacture a bound
the joint already provides would have been a number invented to make an
expression work.

**It is a fold, not a hinge.** An elbow at forty degrees still holds the hand a
third of an arm's length from the shoulder, which is what the inner bound is
measuring.

`elbow_point` is the exact two-link solution rather than an iterative one: the
elbow lies on the circle of radius `upper` about the shoulder and radius `fore`
about the hand, and the intersection of two circles is one square root in `Fx`.

### The commanded plane

`elbow_point` takes a plane angle that rotates the off-axis direction about the
shoulder-to-hand axis. `Angle::ZERO` is the pose the elbow hung in before the
field existed — below the line from shoulder to hand, or forward when that line
is itself vertical and "below" names nothing — and it reproduces the old answer
bit for bit, which is asserted rather than claimed.

The rotation is the two-term form and deliberately not a full Rodrigues: the
off-axis direction is perpendicular to the axis by construction, so the
`(1 - cos)` term of the general formula multiplies a dot product that is zero.
Writing the general form would spend two more products on a term that cannot
contribute and would not reproduce the zero-plane answer exactly.

`held` chases `commanded` at a bounded rate rather than snapping, and **that bound
is required rather than polish**: the forearm is a swept collider, so a plane that
jumped half a turn in one tick would sweep the forearm bodily across the body
inside that tick and hand the contact solver a closing energy no arm can produce.

### The reach clamp, and the two wrong answers before it

`reachable_extent` clamps a commanded `(height, reach)` onto the annulus, and it
is applied **before integration**, inside `World::reachable_arm_target`. Clamping
the arm's *result* would leave the actuator converging forever on a pose it cannot
reach and sitting at the limit with a permanent error; clamping the target makes
it chase something it can hold and stop.

Two spellings were measured and rejected, and both are recorded on the function
because neither failure is visible from the code:

1. Compute the hand, pull it onto the annulus, invert back to a target. That does
   not work, because `hand_position` and `inverse_hand` are inverses only on the
   poses `hand_position` can *reach* — `reach` is floored and `height` is a
   bounded fraction, so an inverted point outside those ranges comes back as a
   different, longer arm. Measured: a clamp to `0.7500` produced a hand at
   `0.7666`.
2. Clamp in target space but compute the vertical budget from the height that was
   *asked* for. `height` is quantised on the way through, and for a hand below the
   shoulder that quantisation makes `dz` larger — so the arm came back a raw unit
   long again.

`reach_headroom` answers how much of the annulus is left before that clamp bites,
and it takes the realised height from `reachable_extent` rather than deriving it
again, for reason 2 above. **`reachable_extent` is not idempotent on the height**:
its realised height truncates a raw unit below the vertical budget it was clamped
into, so a second pass re-clamps upward.

## Constants, and where each number comes from

Every one of these carries its provenance in the source; this table is the index,
not the argument.

| Constant | Value | Provenance |
|---|---:|---|
| `STANCE_TWIST_LIMIT_RAW` | `10_922` | a sixth of a turn: the hip-to-torso budget before a step is forced |
| `STANCE_HIP_MOVING_SPEED_RAW` | `BODY_YAW_MAX_SPEED_RAW` | hips turn at the torso's rate while the body is moving |
| `STANCE_HIP_STANDING_SPEED_RAW` | half of it | and at half of it while standing, which is what makes the twist accumulate |
| `STANCE_HIP_ACCEL_RAW` | `BODY_YAW_ACCEL_RAW` | derived, not a third number |
| `STANCE_STEP_TICKS` | `24` | a forced step's duration |
| `STANCE_STEP_MOVE_AUTHORITY_RAW` | `32_768` | a half: a body mid-step moves at half authority |
| `PELVIS_HEIGHT_RAW` | `32_768` | standing pelvis height as a fraction of standing height |
| `PELVIS_SPEED_DROP_RAW` | `3_277` | how far speed lowers it |
| `PELVIS_TWIST_DROP_RAW` | `3_277` | and how far twist does |
| `ELBOW_PLANE_MAX_SPEED_RAW` | `ARM_BEARING_MAX_SPEED_RAW` | an elbow may swing about the arm's own axis no faster than the shoulder swings the whole arm |
| `UPPER_ARM_FRACTION_RAW` | `32_768` | a half; see the inner-bound argument above |
| `ELBOW_MIN_INCLUDED_ANGLE_RAW` | `7_282` | forty degrees, about where a human elbow meets its own bicep |

`ELBOW_PLANE_MAX_SPEED_RAW` is **a rate bound and deliberately not a bill**. The
work an arm does about its own axis is not modelled — `bill_fatigue` charges the
hand's travel and the bearing's sweep, both of which move the hand — so charging
the plane to the fatigue budget would be inventing a cost with nothing behind it.
A plane change is free and slow, which is the pair of properties the swept forearm
needs.

## Phase order

`EMBODIED_PHASES` is the articulated schedule with one substitution, and the
substitution is the point:

```text
retain contact entry, apply articulated movement, record contact locomotion,
separate, stance, grips, arms, geometry, loose projectiles, contact,
resolve projectiles, anatomy, doors, reap
```

**There is no separate body-yaw phase.** The articulated schedule drives the torso
in `body yaw`; the embodied one drives the torso *and* the hips in `stance`,
because a torso that turned before its hips were consulted could exceed the twist
budget for one phase and be pulled back inside it in the next, which is a body
that flickers past its own limit every tick.

The elbow plane is chased at the head of the `arms` phase, because the plane is
part of where the arm *is* and everything downstream of that phase reads the pose.

## What is hashed

The embodied state digest is the articulated one plus a tail, and the tail sits
**behind the model guard at the end** — after every byte the articulated grammar
writes. That is what keeps an articulated digest answering exactly what it
answered before any of these columns existed, without a second copy of the
hundred-line grammar above it.

The tail is `ground_z`, then the stance rows, then the elbow planes — **both
halves of each plane**, because neither is derived from the other: `commanded` is
what the last accepted command asked for and survives until the next decision,
`held` is where the chase has got to, and a replay reproducing only one of them
would either forget the request between ticks or resume the chase from the wrong
place. They are equal only once the arm has arrived.

`an_embodied_only_column_cannot_move_an_articulated_digest` perturbs each column
separately and watches only `HashDomain::EmbodiedV1` move.

## What is published

One `EMBODIED_STANCE_V1` row per live embodied body, carrying
`entity_index generation hip_yaw_raw pelvis_raw twist_raw step_left`, with
`twist_raw` derived at the boundary so a consumer cannot be handed one that
disagrees with the two angles it sits between. The section and its handshake are
specified in [`articulated-abi.md`](articulated-abi.md).

The elbow reaches the browser through the **region** section rather than a column
of its own: a jointed arm is two swept capsules, so the forearm volume's lower
endpoint *is* the published elbow, to the raw unit.
