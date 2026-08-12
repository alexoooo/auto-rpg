# Hierarchical AI 04 -- make planning earn its place

**Status:** proposed; blocked until session 03 beats the best fixed strategy.

**Goal:** compare reactive option selection with shallow planning over learned option
outcomes, then decide whether any hierarchy is worth promoting.

Do not plan by cloning or stepping `World`: that would give the policy an authority
and information path no other policy has. Instead, fit a versioned option-level model
in `crates/learn` from training rollouts. Given the current public meta-state, option
id, and elapsed duration bucket, it predicts the next meta-state distribution,
termination distribution, and return. Freeze that model before held-out evaluation.

Add a depth-zero control and deterministic depth-one and depth-two enumeration to
`crates/learn-core/src/hierarchy.rs`. Enumerate compatible option ids in stored order,
use explicit argmax tie-breaking, and cap both node count and option dwell. Planning
features may contain only values already available to the reactive selector. The
evaluation report includes return, body decisions, option switches, inference time,
and model calibration by predicted-versus-observed termination bucket.

## Tests and promotion gate

```rust
#[test]
fn lookahead_never_steps_or_reads_world() {}
#[test]
fn planning_enumerates_only_loadout_compatible_options_in_catalog_order() {}
#[test]
fn equal_lookahead_values_choose_the_lowest_stored_option_id() {}
#[test]
fn depth_zero_reproduces_the_reactive_selector_command_for_command() {}
#[test]
fn held_out_rollouts_do_not_update_the_option_model() {}
```

Depth two is retained only if its paired 95% lower bound is positive against both
depth zero and the best fixed strategy, its body-decision rate does not regress, and
its native decision-time median and worst case are reported against a predeclared
budget. Otherwise retain the simplest passing selector or close `revise`.

Browser promotion is a separate final decision, not an automatic consequence of a
native win. If authorized, update the learning architecture and performance evidence,
install one versioned checkpoint, rebuild native and wasm inference evidence, and
move `LEARNED_INFERENCE_DIGEST` only when the registry's permitted causes explain it.
No simulation or replay pin moves. `v2-18` remains blocked until the articulated
mechanical gate itself passes; a smarter selector does not waive that contract.

## Verification

```powershell
cargo test -p learn-core hierarchy
cargo test -p learn hierarchy
cargo test -p lab hierarchy
cargo run --release -p lab -- hierarchy evaluate --level planning --depth 0 --seeds 400 --mirrored
cargo run --release -p lab -- hierarchy evaluate --level planning --depth 1 --seeds 400 --mirrored
cargo run --release -p lab -- hierarchy evaluate --level planning --depth 2 --seeds 400 --mirrored
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_deps.js
node --test tools/check_deps.test.js
node tools/check_docs.js
git diff --check
```

