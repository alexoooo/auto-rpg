# Fight 03 -- the guard that watches the blow

**Status:** **landed 2026-08-18**, with the guard-diagonal acceptance recorded `revise`.
Depends on session 02. Blocks 04. The numbers, the four departures and the `revise` are
in [the tactical policy record](../performance/embodied-tactical-policy.md#session-03-the-guard-that-watches);
what follows is the plan as written, annotated where the implementation departed from it.

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

**Four departures, all found by reading the simulator rather than by running the
corpus.** The mechanic below is what landed except where these say otherwise; each is
argued in full in `embodied_guard.rs`'s own header, which carries the same four and the
same count. **The count read "three" here and named a different three in the code until
2026-08-18**, and a review then found a fourth departure that no document advertised.
The reconciliation is recorded rather than applied silently.

1. **`GUARD_COMMIT_TICKS` is 13 and not 12.** `combat::actuator::chase` moves the arm's
   speed by at most `ARM_LINEAR_ACCEL_RAW` a tick toward `error` clamped to
   `ARM_LINEAR_MAX_SPEED_RAW`, then clamps the step to the remaining error, so one band
   of height -- 16,384 raw -- is six ticks of ramp and seven of cruise at the best
   authority any body in the fixture can bring. Twelve leaves the arm 823 raw short of
   where it was sent, which is the chatter the constant exists to stop. **This entry said
   `chase` "never decelerates", and that is false**: its first line is the deceleration,
   and the arrival tick survives the correction only because the step clamp lands the
   hand exactly on target on the tick it would otherwise overshoot.
2. **Rule 1 is a range gate, and two of its three cases are not implemented.** The rule
   below spells "something is coming" as *receding, stationary, or further away than a
   stride*; only the third landed. Nothing published can separate an approach from a
   retreat at this fixture's perception. `contact_timing` is blurred by
   `jitter[6] * noise / 8` on *both* branches of its formula, saturating branch included;
   and recomputing the sim's own `closing` term from `ObservedOpponent::body_velocity`
   does not rescue it, because that column carries `jitter[3..5] * noise / 4` and the
   noise is 2.3x to 3.0x the entire range of closing speed the fixture's two bodies can
   produce between them. Measured at **51.59% sign agreement** with ground truth over
   9,689 driven ticks, with no deadband that admits real approaches and refuses
   retreats; the record carries the sweep and
   `crates/policy/tests/closing_channel.rs` re-drives it on every `cargo test`. The gate
   is range, off the subject's own exact arm and blade lengths.
3. **The guard arm is `1 - weapon` and not `ArmRoles::guard`.** The two collapse onto one
   hand on a body carrying no plate -- the fixture's Brute -- and `lab embodied` reads
   `1 - weapon` as the guard column anyway.
4. **Rule 3 stands the guard aside for `TacticalPhase::Chamber` as well as
   `TacticalPhase::Commit`.** The rule below names the commit alone; the shipped
   `matches!` names both. It is an enlargement of the plan, and it shipped undocumented
   and untested -- dropping `Chamber` left all thirteen of the session's tests green. It
   is kept rather than reverted because the corpus was measured with it in place, and
   `a_chambered_cut_is_not_overwritten_by_a_guard` is now what fails when it is dropped.
   The chamber half was never separately measured, and the record says so.

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
const GUARD_COMMIT_TICKS: u32 = 13;   // 12 as planned; see departure 1 above

/// The height band the nearest live blade occupies, as a fraction of the subject's
/// own standing height.
///
/// Reads the **tip** and not the hilt. A cut arrives edge-first and the hilt is
/// behind the hand; a guard placed on the hilt is a guard placed on the attacker's
/// wrist, which is a block that has already been walked through.
fn incoming_height(obs: &ArticulatedObservation, foe: &ObservedOpponent) -> Option<CombatHeight>
```

**That rationale is false for the height read, and the shipped comment now says so.**
`crates/sim/src/combat/geometry.rs` builds `tip = hilt + Vec3::new(cos * length,
sin * length, Fx::ZERO)`, so every blade this simulation can pose is horizontal and its
two ends share a `z` exactly. "A guard placed on the hilt is a guard placed on the
attacker's wrist" is a real claim about the **bearing** and about the **range**, where
the two ends differ by the whole length of the blade, and an unfalsifiable one about the
height. The height read still takes the tip -- the day a weapon is posed off the
horizontal the tip is the end that arrives -- and
`the_guard_reads_the_tip_and_not_the_hilt` asserts all three, the height on a
hand-slanted segment no fixture in this repository can produce.

The guard arm then commands that height, and its bearing turns to face the incoming line
rather than sitting clamped at the body's centre. **The plate's normal comes off the
carrying arm's bearing**, which `embodied_script.rs` already records, so this is the
difference between a shield edge-on to the blow and a shield in front of it.

Three rules that keep it honest:

1. **A guard is only read while something is coming.** With `contact_timing` at its
   saturating one -- receding, stationary, or further away than a stride -- the guard
   returns to the body's own centre line at `GUARD_REACH`. A body that tracks a blade
   across the room is a body that has told its opponent where its plate is going.
   **Landed as departure 2 above: a range gate, and only the third of those three
   cases.** The shipped rule is "a guard is only read for a blade inside the body's own
   reach"; the code says that, and the test is
   `a_blade_out_of_reach_returns_the_guard_to_the_centre_line`.
2. **A severed guard arm is not a guard.** `obs.arms[guard].severed` and the
   `severed_mask` are exact and categorical; the fallback is the weapon arm covering its
   own line, not a stump held out.
3. **The guard never overrides a commit.** While `StrikePlanner` is in
   `TacticalPhase::Commit` the weapon arm owns the tick. A fighter that abandons a
   committed cut to answer a feint is worse than one that takes the trade, and this is
   the one place the two arms are *not* independent. **Landed enlarged, as departure 4:
   the chamber is refused beside the commit**, on the same argument one phase earlier --
   a chamber overwritten is a commit that never happens.

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

**One of those six names is not what landed, and it is the fourth.** There is no receding
opponent anywhere in this session -- departure 2 says why there cannot be one -- and the
fixture that shipped under that name held a *stationary* opponent placed out of range. It
is now `a_blade_out_of_reach_returns_the_guard_to_the_centre_line`, which is what it
tests. A green test whose name asserts something the code does not do is the failure this
repository keeps shipping, and renaming it is the repair rather than a tidy-up.

Nine more landed beside the six, and the reasons are worth keeping: a both-sided bound on
`GUARD_COMMIT_TICKS` in ticks, a separate test that the deadband fixture's two steps still
straddle the constant (split out so that a widened deadband fails the *claim* rather than
the precondition), `no_tick_selects_a_guard_height_that_no_blade_selected`, the
torso-frame check, the control's own behaviour, `reset`,
`the_guard_reads_the_tip_and_not_the_hilt`, and two that a review of the landed session
added: `a_chambered_cut_is_not_overwritten_by_a_guard` for departure 4, and
`an_empty_guard_hand_is_held_at_the_joints_own_floor` for the `REST_REACH` branch that
half of every corpus body takes and that nothing exercised.

A sixteenth landed in its own file, `crates/policy/tests/closing_channel.rs`, because it
is not a claim about the guard at all: `no_published_column_separates_an_approach_from_a_retreat`
drives twenty seeds of the corpus fixture and holds departure 2's measurement in place --
that the closing judgement rule 1 asks for is a coin flip at these bodies' perception, and
is not readable inverted either.

**Three constants shipped with no bounding test at all, against the overview's explicit
rule, and now carry one each.** `GUARD_EFFORT`, `GUARD_ARC` and `REST_REACH` were each
mutated in both directions on 2026-08-18 with nothing in the workspace failing.
`the_guard_effort_is_what_arriving_inside_the_window_costs` bounds the first by the
grammar above and the commit window below, and names the `[0.861, 1]` the pair admits;
`the_guard_arc_is_an_eighth_turn_and_is_pinned_from_both_sides` pins the second through
`clamp_arc` against literal angles rather than against the constant, so neither a
narrower nor a wider arc passes; `an_empty_guard_hand_is_held_at_the_joints_own_floor`
pins the third on the commanded row.

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

**Held.** `cargo run --release -p lab -- embodied --corpus-digest` reads
`0x00e08317d7a31c7c` and agrees; no other pin moved, and the full gate is green.

## Verification

```powershell
cargo test
cargo test -p policy
cargo run --release -p lab -- embodied --corpus-digest
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
node --test "client/test/*.test.mjs"
```

## Acceptance

1. The guard height is a function of an observed blade and of nothing else -- no tick, no
   phase counter, no clock. **Met in the narrow form, which is the true one, and the
   broad form as written here is false.** `decide` reads `obs.tick` to know whether its
   thirteen ticks have run and `StrikePlanner::phase` to know whether the strike owns the
   arm; what neither can do is *select* a height. The claim that holds is that **no tick
   can produce a height no blade produced**, and it is asserted by
   `no_tick_selects_a_guard_height_that_no_blade_selected`, which samples every
   consecutive tick across four commit windows. Its predecessor sampled at
   `step * (GUARD_COMMIT_TICKS + 47)` and said so in its own comment -- stepping over
   exactly the ticks on which the tick matters -- and a mutation that makes the held
   branch answer MID for twelve ticks in every thirteen passes the old test and fails the
   new one at tick 1.
2. The deadband test fails when the deadband is widened past the step it is bounded
   against, demonstrated rather than assumed. **Met.** At 6,000 the test fails on `a blade
   that moved 5000 raw -- more than the deadband -- did not move the guard`; at zero it
   fails on the other half. Three further mutations were run: the commit rule, the guard
   bearing and the range gate are each caught, and the *height* read taking the hilt is
   caught by nothing, for the reason the record states.
3. `EMBODIED_CORPUS_DIGEST` unmoved; no other pin moved. **Met.**
4. The read-guard-versus-fixed-guard comparison is in the performance record with both
   assignments pooled, whatever it says. **Met**, and what it says is `revise`: 69.68%
   symmetric and 57.59% pooled against a preregistered 70%, with the read guard finishing
   42 wins behind its own control over 1,600 pooled trials.
