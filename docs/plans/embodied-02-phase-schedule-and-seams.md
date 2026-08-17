# Embodied 02 -- the phase schedule becomes data, and three seams get an owner

**Status:** proposed. Depends on [01](embodied-01-world-module-split.md).

Second and last refactor. Still no behaviour change and still no moved pin. Where
session 01 decided *where code lives*, this one decides *what a session 03 has to
edit to add a third body model* -- and the honest current answer is "twenty-eight
`combat_model` sites in `world.rs`, and you find out which ones you missed from a
golden hash."

## 1. The schedule

`step_with_arm_rates` at [`world.rs#L3033`](../../crates/sim/src/world.rs#L3033) is
a two-armed `match` whose arms are straight-line call sequences, interleaved with
about thirty `#[cfg(test)] if self.phase_trace_enabled { ... }` blocks that name each
call in a string literal beside it. Two facts follow from that shape and both are
costs:

- the name and the call are written twice and nothing checks they agree, so a phase
  can be renamed, reordered, or added with a stale trace and the trace still passes;
- a third model is a third arm, which is a third place to forget `press_doors`.

Replace both arms with one table per model and one loop:

```rust
pub(crate) struct ArmRates { pub bearing_max_speed_raw: i32, pub bearing_accel_raw: i32 }

/// A phase is its name and its body. The name is what the `#[cfg(test)]` trace
/// records, and it is read off this table rather than written a second time
/// beside the call, because the pair that can disagree is the pair that will.
pub(crate) type Phase = (&'static str, fn(&mut World, ArmRates));

const LEGACY_PHASES: &[Phase] = &[
    ("regenerate",    |w, _| w.regenerate()),
    ("apply movement", |w, _| w.apply_movement()),
    // ... in the order world.rs holds today, unchanged
];

const ARTICULATED_PHASES: &[Phase] = &[
    ("retain contact entry", |w, _| w.retain_contact_entry()),
    // ...
    ("arms", |w, r| w.drive_articulated_arms(r.bearing_max_speed_raw, r.bearing_accel_raw)),
    // ...
];
```

and

```rust
for (name, body) in self.phases() {
    #[cfg(test)]
    if self.phase_trace_enabled { self.phase_trace.push(name); }
    body(self, rates);
}
```

`ArmRates` is threaded as a parameter rather than stashed on `World` for the duration
of a step, because a scratch column is authoritative state that has to be hashed or
argued out of the hash, and the parameter is neither.

**This is determinism-safe and it is worth saying why rather than assuming it.** The
tables are `const` slices iterated front to back. No pointer is hashed, no map is
iterated, and the resulting call order is fixed at compile time. The rule the
determinism contract is protecting -- no unstable iteration into authoritative state
-- is not in contact with a `&'static [T]`.

**And the trace stops being a promise.** Today it is thirty literals a session can
forget to update; after this it is the same string the loop dispatches on, so a phase
that runs without a trace entry cannot be written.

## 2. The model seam

`CombatModel` is matched in 28 places in `world.rs` and appears 79 times across
`sim`, `web`, `policy` and `lab`. Most are `== CombatModel::Articulated` guards on
columns that a Legacy world leaves empty. Session 03 must add a variant without
auditing all 79 by hand.

Introduce one predicate group on `CombatModel` and route the guards through it:

```rust
impl CombatModel {
    /// Whether this model owns the articulated pose columns -- yaw, arms, grips,
    /// shield, authority, anatomy, contact runtime.
    pub(crate) const fn has_articulated_columns(self) -> bool { ... }
    /// Whether this model resolves contact through the XYZ solver.
    pub(crate) const fn uses_contact_solver(self) -> bool { ... }
    /// Which submitted-command grammar this model accepts.
    pub(crate) const fn command_grammar(self) -> CommandGrammar { ... }
}
```

Then a new variant answers three questions in one place instead of being pattern
matched into 28 of them. Convert only the guards that are genuinely asking one of
these three questions; a `match` that is asking something else stays a `match` and
gains its arm in session 03. **Do not convert a site you cannot name the question
for** -- an over-eager predicate that flattens two different questions into one is
how a Legacy world starts indexing an articulated column.

## 3. The limb-geometry seam

Where a hand is, is currently answered in
[`actuator.rs#L137`](../../crates/sim/src/combat/actuator.rs#L137) by
`hand_position`, inverted at
[`actuator.rs#L169`](../../crates/sim/src/combat/actuator.rs#L169) by `inverse_hand`,
and the arm's *collision volume* is built independently in
[`geometry.rs#L227`](../../crates/sim/src/combat/geometry.rs#L227) as a single capsule
from `actuator::shoulder` to the hand. Session 07 turns the arm into two links, and
it should be a change to one module rather than a hunt through three.

Create `crates/sim/src/combat/limb.rs` and move `shoulder`, `hand_position` and
`inverse_hand` into it verbatim, re-exported from `actuator` so no caller changes.
Add one function that has no callers yet and exists so that session 07 has somewhere
to put the second link:

```rust
/// The arm as a polyline, shoulder first, hand last. One segment today.
pub(crate) fn arm_polyline(
    anatomy: &BodyAnatomySpec, yaw: Angle, limb: usize, hand: Vec3,
) -> ArmPolyline;
```

`region_volumes` calls it and takes the first and last points, which is what it
computes today by hand. The two `actuator::shoulder` call sites inside `world.rs`
tests follow the re-export and do not change.

**Record the defect this seam exposes without fixing it here.** `hand_position`
places the hand at `physical_reach` in the horizontal plane and then *overwrites*
`hand.z` with `standing_height * height`, so the actual shoulder-to-hand distance is
`sqrt(reach^2 + dz^2)` and is not bounded by `arm_length` at all. The reachable set
is a cylinder shell rather than a sphere, and a high or low arm at full reach is
longer than the arm. That is a mechanics hole, not a drawing problem, and closing it
is [session 07](embodied-07-elbow-and-forearm.md)'s first job. Write it down in
`limb.rs`'s module header now, while it is understood, and leave the arithmetic
alone -- fixing it here would move `ARTICULATED_STREAM_DIGEST` and every articulated
corpus in a session whose contract is that nothing moves.

## Tests

- `the_phase_table_and_the_phase_trace_cannot_disagree` -- drive both models with the
  trace on and assert the recorded sequence equals `phases()` mapped to its names.
  Break it by adding a table row whose body is a no-op and watch the two literals in
  session 01's tests fail instead.
- `a_legacy_world_answers_no_to_every_articulated_column_predicate`
- `an_articulated_world_answers_yes_to_every_articulated_column_predicate`
- `an_arm_polyline_starts_at_the_shoulder_and_ends_at_the_hand`
- `an_arm_polyline_reproduces_the_region_volume_it_replaced` -- over the fixture
  anatomies at several yaw and bearing values, assert `region_volumes`' arm rows are
  bit-identical to the pre-split expression.

The last one is the load-bearing one and it must be shown failing: perturb one raw
unit of `shoulder_half_width` inside `arm_polyline` only, watch it go red, revert.

## Verification

```powershell
cargo test
cargo run --release -p lab -- hash
cargo run --release -p lab -- verify --seeds 200
cargo run --release -p lab -- duel   --seeds 400
cargo run --release -p lab -- articulated --seeds 400 --mirrored
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
```

## Hash expectation

**Nothing moves**, on the same terms as session 01, and the articulated gate corpus
answers what it answered before. This session reorganises dispatch and ownership; if
a pin moves, an expression changed, and the fix is to find it rather than to record
the new number.
