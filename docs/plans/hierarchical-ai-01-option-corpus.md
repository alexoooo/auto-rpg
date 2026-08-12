# Hierarchical AI 01 -- prove that there is something worth selecting

**Status:** proposed.

**Goal:** build an append-only catalog of `(loadout, strategy)` options and measure
whether option choice has context-dependent value before training a selector.

Add `crates/policy/src/hierarchy.rs` with `ArticulatedLoadoutKindV1`,
`StrategyKindV1`, `CombatOptionV1`, and a dispatcher for deterministic low-level
strategies. Begin with at least three strategies for `ShieldSword` -- `Charge`,
`HoldMeasure`, and `Withdraw` -- plus honest compatible rows for `Club`. A strategy
may wrap an existing controller, but each name must change an observable decision;
aliases with different ids are refused by a catalog test.

Add `crates/lab/src/hierarchy.rs` and
`lab hierarchy corpus --seeds 400 --mirrored`. Run every eligible option against the
same opponent-script, anatomy, seed, and mirror blocks. Record option id, both
component ids, decision tick, termination reason, body outcome, score, damage,
contacts, crossings, refusals, and ticks. The attribution is Lab-only evidence; none
of it enters `World`, replay, or a submitted command.

The first corpus includes the current stationary neutral case for geometry, and
moving neutral, composed, windmill, and attack-moves opponents for selection value.
Do not treat a stationary crossing as a combat win. If current mechanics still yield
no body decisions, close this session `revise`: a selector cannot manufacture reward
authority that its options cannot reach.

For each context block, report every fixed option, the training-selected best fixed
option, and the offline per-fight oracle. Compute a paired seed-block bootstrap with
a fixed published resampling seed and 10,000 resamples. Session 02 is authorized only
if at least two distinct options lead disjoint preregistered context blocks and the
oracle-minus-best-fixed 95% lower bound is positive on held-out seeds.

## Tests

```rust
#[test]
fn option_ids_name_pairs_and_are_append_only() {}
#[test]
fn one_loadout_has_multiple_behaviorally_distinct_strategies() {}
#[test]
fn a_tactical_switch_cannot_change_the_equipped_loadout() {}
#[test]
fn every_option_sees_the_same_seed_opponent_and_mirror_blocks() {}
#[test]
fn the_oracle_is_computed_per_fight_not_from_test_set_means() {}
#[test]
fn hierarchy_evidence_does_not_enter_world_or_replay() {}
```

Break one option id, make `Withdraw` issue the `Charge` command, and perturb one
option's seed schedule to demonstrate that the first, second, and fourth tests fail.

## Verification

```powershell
cargo test -p policy
cargo test -p lab hierarchy
cargo run --release -p lab -- hierarchy corpus --seeds 400 --mirrored
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```

No registered hash may move.

