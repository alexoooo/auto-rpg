# Fight 02 -- the blow that is aimed

**Status:** landed 2026-08-18. Independent of session 01. Blocks 03, 04 and 05.

**What it landed, against what it predicted.** All five acceptance criteria hold.
`EMBODIED_CORPUS_DIGEST` did not move (`0x00e08317d7a31c7c` before and after) and no other
pin did. The mutation was demonstrated rather than assumed, and so was the *other* wrong
version: with `- facing` changed to `+ facing`,
`the_same_plan_at_two_yaws_produces_two_torso_commands_that_point_one_way` fails on the
re-add (`left: 77deg, right: 37deg`) and the neutral test fails with it; with the
subtrahend changed to the **commanded** yaw, the neutral test passes and the two-yaws test
fails on its first assertion. Four of the seven tests stayed green under both mutations,
including both fight tests -- which is the module header's own claim about why a wrong
frame is invisible from a corpus, made concrete.

Two things the plan did not predict, both consequences of the vocabulary growing:
`tools/wasm_check.js` asserted `set_policy(0, 3) === 0` as "one past the registry" and
`embodied_policy_codes_are_append_only` asserted `from_code(3) == None`; both moved to `4`,
and the wasm one now selects `tactical` at `3` on the way past.

**The measurement is in
[the performance record](../performance/embodied-tactical-policy.md).** Tactical beats the
neutral control 768-1 on the plan's own command and 855-92 pooled across both sides, so
the one required claim holds. Pooled against the script it loses, 727 to 872 over 1,600
trials -- 45.4% -- which is the recorded starting point session 04 tunes against. The
`commands` line the plan asked for reads **`0 refused submissions` in every run**: the
clamped turn the plan predicted is real but silent, and what it costs shows up as
decisiveness instead (2 of 800 fights decided by a body against the script's 62, and 89
severances against 649).

The embodied registry holds three entries and none of them aims. This session adds the
fourth, `EmbodiedPolicyKind::Tactical`, by putting the existing strike planner behind the
embodied seam.

## What is being ported, and what is not

`crates/policy/src/articulated_tactics.rs` is two things stacked, and the distinction is
the whole design of this session.

**`StrikePlanner` is frame-free.** It reads `ObservedOpponent::regions` -- five swept
volumes in world space -- and `weapons` as world-space segment poses, translates the
observed weapon by a candidate hand displacement, and asks
`fx::swept_segment_segment` whether that capsule crosses a named `BodyPart`. Every
quantity in that computation is a world quantity measured off the observation, and
**the observation is the same type on both seams**: `EmbodiedPolicy::decide` and
`ArticulatedPolicy::decide` both take `&ArticulatedObservation`. Nothing in the planning
knows or cares which model published it.

**The command assembly is frame-bound.** `strike_command`, `measure_command`,
`feet_command`, `intent_command` and `neutral_articulated_command` write
`ArmTarget::bearing` and `move_dir` as *world* quantities, because that is what
`CommandFrame::World` means. An embodied body reads both **relative to its torso**.

So the port is: **share the planner, fork the assembly.** That looks like it contradicts
the decision `embodied_script.rs` records in its own header -- that the embodied script is
a sibling of the articulated one and deliberately not a mode of it -- and it does not,
for a reason worth writing into the new file. That argument was about *a file whose every
output is a bearing*, where a frame flag would make "which frame is this" a runtime
question in the one place the wrong answer is invisible. The planner outputs no bearing at
all. It outputs a `StrikePlan`: a hand, a target region, and a displacement, all in world
space. The frame enters exactly once, at the end, where it can be spelled out in four
lines and tested directly.

## The adapter

One new file, `crates/policy/src/embodied_tactics.rs`, holding the seam and nothing else.

```rust
//! The strike planner, driving a body whose arms are read from its own torso.

use crate::{EmbodiedPolicy, StrikePlanner};
use fx::{Angle, Vec2};
use sim::{ArticulatedCommandV1, ArticulatedObservation, EmbodiedCommandV1};

/// The registry code. Append-only after `scripted-level`.
pub const TACTICAL_EMBODIED_POLICY_CODE: u32 = 3;

/// Rotates a world vector into the frame of a body holding `yaw`.
///
/// **The exact inverse of `World::world_move_dir`'s torso branch**, written as the
/// inverse rather than derived again, so that the two cannot drift apart by one
/// sign. A command that survives a round trip through both is the property
/// `a_world_vector_survives_the_round_trip` asserts.
fn into_torso(v: Vec2, yaw: Angle) -> Vec2 {
    let (cos, sin) = (yaw.cos(), yaw.sin());
    Vec2::new(v.x * cos + v.y * sin, -v.x * sin + v.y * cos)
}

/// Reads a world-frame articulated command as the embodied command that asks for
/// the same thing.
///
/// **Measured from `obs.body_yaw`, and not from the yaw the command requests.**
/// This is the sign the adapter exists to get right, and the tempting answer is the
/// wrong one. `World::world_arm_target` adds `self.body_yaw[i].angle` -- the yaw the
/// body *is holding at submission* -- and `World::world_move_dir` mixes with the same
/// field. `ArticulatedObservation::body_yaw` is built from that field, so subtracting
/// it is the exact inverse of what the world will re-add, and the round trip is an
/// identity. Subtracting the *commanded* yaw is not: `body_yaw` is a request the
/// actuator chases at a bounded rate, so on any tick that asks for a turn the body
/// does not arrive there, and every arm bearing lands short by the whole turn angle --
/// including the guard arm the planner never touched.
fn into_torso_frame(obs: &ArticulatedObservation, world: ArticulatedCommandV1) -> EmbodiedCommandV1 {
    let facing = obs.body_yaw;
    let mut out = world;
    out.move_dir = into_torso(world.move_dir, facing);
    for arm in 0..2 {
        out.arms[arm].bearing = world.arms[arm].bearing - facing;
    }
    EmbodiedCommandV1::new(out)
}

#[derive(Clone, Copy, Debug, Default)]
pub struct TacticalEmbodiedPolicy {
    planner: StrikePlanner,
}

impl TacticalEmbodiedPolicy {
    pub fn planner(&self) -> &StrikePlanner { &self.planner }
}

impl EmbodiedPolicy for TacticalEmbodiedPolicy {
    fn decide(&mut self, obs: &ArticulatedObservation) -> EmbodiedCommandV1 {
        into_torso_frame(obs, self.planner.decide(obs))
    }

    fn reset(&mut self) { self.planner.reset(); }
}
```

The swing plane is left neutral on both arms, deliberately and not by omission: the
neutral plane puts the elbow below the shoulder-to-hand line and the forearm under the
blade rather than leading it into the target, which is the reading `embodied_script.rs`
already argued for the weapon arm. Session 03 owns the guard arm's plane, because that is
where the guard becomes a decision.

## The registry entry

`crates/policy/src/lib.rs`, in `EmbodiedPolicyKind`. The vocabulary is append-only,
because a code is what a saved configuration and a URL carry:

```rust
    /// The strike planner behind the embodied seam: it names a region, prices the
    /// sweep that would cross it, and spends a commit on the best one.
    Tactical,
```

with `code()` answering `3`, `from_code(3)` answering `Some(Tactical)`, `name()`
answering `"tactical"`, `ALL` growing to four entries, and `build()` returning
`Box::new(TacticalEmbodiedPolicy::default())`.

`crates/lab/src/main.rs` needs one line -- `embodied_name` gains
`EmbodiedPolicyKind::Tactical => "the tactical embodied policy"` -- and **nothing else**,
because `--policy`, `--hero-policy` and `--monster-policy` all parse through
`EmbodiedPolicyKind::from_name`. The help text's three-way `neutral|scripted|scripted-level`
is written out in prose in two places and both must gain `|tactical`; that is the
"grep for every place that writes the number down in prose" rule with a word instead of a
number.

`crates/web/src/lib.rs`'s `set_policy` needs no change at all for the same reason: it
already parses `EmbodiedPolicyKind::from_code`. Session 07 decides what the room *opens*
on; this session only makes the choice reachable.

## The tests, and the one that must be made to fail on purpose

In `crates/policy/tests/embodied_tactics.rs`:

```rust
fn a_world_vector_survives_the_round_trip()
fn the_neutral_articulated_command_converts_to_the_neutral_embodied_command_exactly()
fn the_same_plan_at_two_yaws_produces_two_torso_commands_that_point_one_way()
fn the_tactical_policy_never_submits_a_command_the_world_refuses()
fn a_tactical_embodied_fight_replays_exactly()
fn two_tactical_bodies_reach_each_other_and_make_contact()
fn a_policy_reused_across_runs_drives_the_same_fight_twice()
```

`the_neutral_articulated_command_converts_to_the_neutral_embodied_command_exactly` is
the cheapest check on the sign and is worth writing first: `neutral_articulated_command`
writes `bearing: obs.body_yaw` and `neutral_embodied_command` writes `Angle::ZERO`, so
subtracting `obs.body_yaw` maps one onto the other to the bit, and no other subtrahend
does. **It is also the test the wrong version passes**, because a neutral command's
requested yaw and observed yaw are equal -- which is exactly why it is not sufficient on
its own and why the next one has to exist.

`the_same_plan_at_two_yaws_produces_two_torso_commands_that_point_one_way` is the one
that carries the session. `the_same_situation_at_two_yaws_produces_one_command`
already exists for the script and asserts the *opposite* shape of the same fact: a
torso-relative policy answering one command at two yaws. Here the input is a world plan
and the output must be two *different* torso commands that name the same world bearing,
which is what says the subtraction happened in the right place and with the right sign.

**Before believing any of them, break the line each is about and watch it fail.** For
this session the specific mutation is: change `- facing` to `+ facing` in
`into_torso_frame`. If `the_same_plan_at_two_yaws...` stays green, it is asserting
something the code does not do, and that is the worst defect this repository produces.

## What is expected, and what is not promised

The planner was written against articulated bodies with no stance, and an embodied body
has hips that constrain the torso and a twist budget that forces a step. **The planner
does not know that.** It will ask for turns the stance phase clamps, and a clamped turn is
a plan arriving late.

That is expected and is not this session's problem to fix. What this session owes is a
*measured statement* of it rather than a guess, so run the corpus and record the
`commands` line:

```powershell
cargo run --release -p lab -- embodied --seeds 400 --mirrored --policy tactical
cargo run --release -p lab -- embodied --seeds 400 --mirrored --hero-policy tactical --monster-policy scripted
cargo run --release -p lab -- embodied --seeds 400 --mirrored --hero-policy scripted --monster-policy tactical
```

Pool the two asymmetric arms. **No acceptance threshold is declared for this session**,
and that is deliberate: a planner that has never seen hips is not expected to clear the
bar in the overview at its first outing, and declaring a threshold it would fail would
either stop a sound session or invite weakening the threshold afterwards. What this
session must produce is the three reports, kept in
`docs/performance/embodied-tactical-policy.md`, so session 04 tunes against a recorded
starting point rather than against a memory.

The one thing that *is* required: **the tactical policy must beat the neutral control.**
A policy that cannot beat a body standing still is not playing, and the retired legacy
seam asserted exactly that under the name `doing_something_beats_doing_nothing`. Its
fixture and both its policies are gone and the claim went unowned; this session takes it
back:

```powershell
cargo run --release -p lab -- embodied --seeds 400 --mirrored --hero-policy tactical --monster-policy neutral
```

## Hash expectations

**Nothing moves.** `EmbodiedPolicyKind::Scripted` is not edited, `EMBODIED_CORPUS_DIGEST`
runs under `Scripted`, and every other pin is a different stream entirely. This session is
purely additive: a new file, a new enum variant, and one match arm in `lab`.

If `EMBODIED_CORPUS_DIGEST` moves, something edited the control. Revert rather than
re-record -- the registry row forbids re-recording it for a session that did not change
the embodied fight, and adding a policy nobody is running is not changing the fight.

## Verification

```powershell
cargo test
cargo test -p policy
cargo test -p sim --features cartesian-recoil
cargo run --release -p lab -- embodied --corpus-digest
cargo run --release -p lab -- verify --embodied --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
node --test "client/test/*.test.mjs"
```

## Acceptance

1. `EmbodiedPolicyKind::Tactical` is reachable from `lab`, from `web`, and from a name.
2. `EMBODIED_CORPUS_DIGEST` is unmoved, and no other pin moved.
3. The frame test fails when `- facing` becomes `+ facing`, demonstrated rather than
   assumed.
4. Tactical beats neutral by a margin recorded in the performance record.
5. Three pooled corpus reports are written to
   `docs/performance/embodied-tactical-policy.md` with the host, the date and the exact
   commands, whatever they say.
