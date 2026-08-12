# Smart AI 03 -- plan a strike through a body region

**Goal:** a deterministic policy component chooses a reachable opponent region and
executes one coherent chamber/commit/recover motion instead of choosing arm controls
independently.

Create `crates/policy/src/articulated_tactics.rs`. It may use the fixed-point swept
geometry exported by `fx` and the observation fields from session 02; it may not read
`World`, damage internals, floats, or wall time.

## Contract

```rust
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum TacticalPhase { Seek, Measure, Chamber, Commit, Recover }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct StrikePlan {
    pub opponent: EntityId,
    pub region: BodyPart,
    pub hand: LimbSlot,
    pub chamber_bearing: Angle,
    pub commit_bearing: Angle,
    pub height: CombatHeight,
}

pub struct StrikePlanner {
    phase: TacticalPhase,
    plan: Option<StrikePlan>,
    phase_started: u32,
}
```

Enumerate the five observed regions in `BodyPart` order, both equipped hands, and a
fixed bearing table. Derive `CombatHeight` from the candidate region center divided by
`standing_height`; do not quantize to low/mid/high. Reject a candidate whose predicted
weapon capsule cannot cross the region. Score, then break exact ties by
`(BodyPart, LimbSlot, bearing.raw())`; never rely on iteration accident.

The planner locks `StrikePlan` from chamber through recovery. Footwork seeks the
nearest measure from which the predicted commit sweep intersects, stops during commit,
and withdraws only to make room for recovery. It does not chase a new target every
tick.

## Tests and acceptance

Add these exact tests beside the module:

```rust
#[test]
fn a_stationary_target_is_crossed_by_the_region_the_plan_named() {}
#[test]
fn a_committed_attack_is_not_replanned_mid_swing() {}
#[test]
fn mirrored_observations_produce_mirrored_strikes() {}
#[test]
fn an_unreachable_head_is_rejected_before_a_command_is_submitted() {}
#[test]
fn reset_forgets_the_previous_fight() {}
#[test]
fn the_striker_submits_no_refused_commands() {}
```

Show the first test fail once with candidate intersection disabled and the second fail
once with the plan lock removed. Add a Lab-only `StrikerArticulatedPolicy`; do not add
it to `ArticulatedPolicyKind` or the browser picker yet.

Run the session-02 corpus. A mechanics calibration is authorized only if at least 90%
of commands cross their named reachable region but contact energy/wounds remain too
small. If geometric crossing is below 90%, revise this planner instead.

Policy-only behavior cannot move any registered hash.

## Verification

```powershell
cargo test -p policy
cargo test -p lab strike_corpus
cargo run --release -p lab -- strike-corpus --policy striker --seeds 100 --mirrored
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```
