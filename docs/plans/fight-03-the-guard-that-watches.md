# Fight 03 -- the guard that watches the blow

**Status:** ready. Depends on session 02. Blocks 04.

Today no fighter in this repository defends. `embodied_script.rs` picks its guard height
from a clock:

```rust
HEIGHTS[(((obs.tick + GUARD_LEAD_TICKS) / EMBODIED_HEIGHT_TICKS) % 3) as usize]
```

and `articulated_tactics.rs`'s planner spends every arm on the strike, holding the off
hand at a fixed `GUARD_REACH` with no reference to what is coming. The corpus reports
`guard diagonal 52.06%` and that number has been read as competence. It is not: it is the
arithmetic of two clocks half a step apart, on a table `lab embodied` fills from *commanded*
heights, where three of the nine cells are structurally unreachable and the file that
introduced `GUARD_LEAD_TICKS` says so.

This session makes the guard a read.

## What the observation already carries

Nothing new is published. Everything needed is in `ObservedOpponent` today:

- **`weapons: [Option<SegmentPose>; 2]`** -- the held segment in each grip, in world space,
  as `{ hilt: Vec3, tip: Vec3, radius: Fx }`. That is where the blade *is*, exactly, this
  tick.
- **`body_position: Vec3`**, whose `z` is the floor under that body, so a blade height is a
  difference and not an absolute.
- **`contact_timing: Fx`** -- ticks until arrival, saturating at one, informative only
  inside the last stride. That is the *when*.
- **`regions`** and **`stance`**, which session 04 uses for footwork and which this session
  reads only through `present`.

The subject's own `standing_height` and `arm_length` are on the observation as well, which
is what turns an absolute blade height into a band this body can actually cover.

## The mechanic

```rust
// crates/policy/src/embodied_guard.rs

/// How far an observed blade must move before the guard follows it.
///
/// **A deadband and not hysteresis**, on `embodied_script.rs`'s argument exactly: a
/// deadband needs no memory, makes "neither" a real state, and cannot chatter. The
/// value is a fraction of standing height rather than a world length, because a
/// Brute's HIGH and a Fighter's HIGH are not the same height off the floor.
const GUARD_READ_DEADBAND_RAW: i32 = 3_277;   // 0.05 of standing height

/// How long a read guard holds before it may be re-read.
///
/// The plate does not teleport. `GUARD_LINEAR_SPEED` in `articulated_tactics.rs` is
/// the actuator's published base linear maximum, and a guard that re-decided every
/// tick would spend the whole fight travelling between two answers and arrive at
/// neither. This is the smallest window that lets the arm finish.
const GUARD_COMMIT_TICKS: u32 = 12;

/// The height band the nearest live blade occupies, as a fraction of the subject's
/// own standing height.
///
/// Reads the **tip** and not the hilt. A cut arrives edge-first and the hilt is
/// behind the hand; a guard placed on the hilt is a guard placed on the attacker's
/// wrist, which is a block that has already been walked through.
fn incoming_height(obs: &ArticulatedObservation, foe: &ObservedOpponent) -> Option<CombatHeight>
```

The guard arm then commands that height, and its bearing turns to face the incoming line
rather than sitting clamped at the body's centre. **The plate's normal comes off the
carrying arm's bearing**, which `embodied_script.rs` already records, so this is the
difference between a shield edge-on to the blow and a shield in front of it.

Three rules that keep it honest:

1. **A guard is only read while something is coming.** With `contact_timing` at its
   saturating one -- receding, stationary, or further away than a stride -- the guard
   returns to the body's own centre line at `GUARD_REACH`. A body that tracks a blade
   across the room is a body that has told its opponent where its plate is going.
2. **A severed guard arm is not a guard.** `obs.arms[guard].severed` and the
   `severed_mask` are exact and categorical; the fallback is the weapon arm covering its
   own line, not a stump held out.
3. **The guard never overrides a commit.** While `StrikePlanner` is in
   `TacticalPhase::Commit` the weapon arm owns the tick. A fighter that abandons a
   committed cut to answer a feint is worse than one that takes the trade, and this is
   the one place the two arms are *not* independent.

## Where it lands

In `TacticalEmbodiedPolicy`, from session 02 -- **not in `ScriptedEmbodiedPolicy`.** The
script is the frozen control now and the overview says why: if it never changes, the fact
that `EMBODIED_CORPUS_DIGEST` does not move is what says this session is additive.

`ScriptedEmbodiedPolicy` keeps its clock and keeps its comment, and the comment gains one
sentence saying that the clock is a control rather than a recommendation, with a pointer
here. A reader who finds the clock first should not have to discover the tactical file to
learn that the clock was superseded.

## Tests

In `crates/policy/tests/embodied_guard.rs`:

```rust
fn a_high_cut_is_met_with_a_high_guard()
fn a_low_cut_is_met_with_a_low_guard()
fn a_blade_that_has_not_moved_does_not_move_the_guard()
fn a_receding_opponent_returns_the_guard_to_the_centre_line()
fn a_severed_guard_arm_does_not_hold_a_guard()
fn a_committed_cut_is_not_abandoned_for_an_incoming_one()
```

The first two are built from a hand-placed `ObservedOpponent` with a `SegmentPose` at a
chosen height, so the claim is about the read and not about a fight that happened to go a
certain way. The third is the deadband and **must be bounded from both sides**: assert
that a blade moved by less than `GUARD_READ_DEADBAND_RAW` does not move the guard *and*
that one moved by more than it does. A test that only checks the first is satisfied by a
guard that never moves at all, which is precisely the bug being fixed, and this repository
has shipped that shape of test twice.

## The measurement

Session 02 wrote the tactical baseline to
`docs/performance/embodied-tactical-policy.md`. This session appends to it, on the same
corpus and with the same pooling, and the comparison is **the same policy with the guard
read switched off** -- a `TacticalConfig { read_guard: bool }` in the shape of
`EmbodiedScriptConfig`, so that the control is reachable from a command line and can be
named per side:

```powershell
cargo run --release -p lab -- embodied --seeds 400 --mirrored --hero-policy tactical --monster-policy tactical-fixed-guard
cargo run --release -p lab -- embodied --seeds 400 --mirrored --hero-policy tactical-fixed-guard --monster-policy tactical
```

Both assignments, pooled. Report the `guard`, `blocked` and `health` lines. The overview's
preregistered guard threshold is **at least 70% diagonal**, and this is the session that
either meets it or records `revise` and says by how much it missed.

**A flat result is a result.** If reading the blade does not raise the block fraction, that
is worth as much as if it did, and it goes in the record either way -- the high-ground term
is the standing example of a measurement in this repository that came back against the
intuition and was written down rather than tuned until it agreed.

## Hash expectations

**Nothing moves.** `Scripted` is untouched, so `EMBODIED_CORPUS_DIGEST` is untouched. The
new registry entry for the fixed-guard control is append-only at code `4`.

## Verification

```powershell
cargo test
cargo test -p policy
cargo run --release -p lab -- embodied --corpus-digest
cargo run --release -p lab -- verify --embodied --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
node --test "client/test/*.test.mjs"
```

## Acceptance

1. The guard height is a function of an observed blade and of nothing else -- no tick, no
   phase counter, no clock.
2. The deadband test fails when the deadband is widened past the step it is bounded
   against, demonstrated rather than assumed.
3. `EMBODIED_CORPUS_DIGEST` unmoved; no other pin moved.
4. The read-guard-versus-fixed-guard comparison is in the performance record with both
   assignments pooled, whatever it says.
