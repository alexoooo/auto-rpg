# Hierarchical AI 03 -- switch strategies, not equipment

**Status:** proposed; blocked until session 01 demonstrates option headroom.

**Goal:** add semi-Markov tactical selection among strategies compatible with one
already-equipped loadout.

Add `HierarchicalArticulatedPolicyV1` in `crates/learn-core/src/hierarchy.rs`. It owns
one low-level controller instance per compatible strategy, the selected option id,
entry tick, and accumulated option reward. The wrapper sees only
`ArticulatedObservation`; it cannot read or clone `World`.

A new choice is allowed only at a named `OptionBoundaryV1`:

```rust
pub enum OptionBoundaryV1 {
    OpponentAcquired,
    ThreatAppeared,
    MotorPlanComplete,
    MeasureLost,
    MaximumDwell,
}
```

The minimum dwell and maximum dwell are fixed before training. Chamber, commit, and
recover remain locked to the low-level controller's motor boundary. Switching resets
the incoming strategy's transient state by a documented rule; dormant controller
memory cannot age invisibly. Any selected option whose loadout differs from the
equipped loadout is a named refusal and produces no substituted choice.

Train the high-level choice as a semi-Markov problem in
`crates/learn/src/hierarchy.rs`: reward and duration accumulate from option entry to
termination, and discount is applied by elapsed ticks rather than decision count.
Compare it with the session-02 one-choice selector when available and always with the
best fixed strategy for the same loadout. Low-level controller code and weights are
frozen throughout this session so the experiment measures selection rather than
joint co-adaptation.

## Tests and gate

```rust
#[test]
fn a_strategy_runs_until_a_named_option_boundary() {}
#[test]
fn chamber_commit_and_recover_cannot_be_interrupted_by_the_meta_policy() {}
#[test]
fn elapsed_ticks_not_decision_count_discount_an_option_return() {}
#[test]
fn an_incompatible_loadout_option_is_refused_by_id() {}
#[test]
fn resetting_a_reentered_strategy_does_not_restore_stale_fight_memory() {}
#[test]
fn a_one_option_catalog_reproduces_that_fixed_strategy_command_for_command() {}
```

Break the boundary guard and change duration discount to one step per option to show
the first three tests fail. The held-out gate requires a positive paired 95% lower
bound over the best fixed strategy for that same loadout, zero compatibility
refusals, and no regression in the session-01 body-decision rate. Report switches per
fight and dwell-time distribution so tick-level thrashing cannot hide behind return.

## Verification

```powershell
cargo test -p learn-core hierarchy
cargo test -p learn hierarchy
cargo test -p lab hierarchy
cargo run --release -p lab -- hierarchy train --level temporal --loadout shield-sword
cargo run --release -p lab -- hierarchy evaluate --level temporal --loadout shield-sword --seeds 400 --mirrored
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```

No registered hash may move.

