# Smart AI 06 -- turn the striker into a fighter

**Goal:** add an arena policy that seeks measure, commits deliberate strikes, responds
to incoming weapons, and exploits recovery windows.

Extend `StrikePlanner` from session 03 with deterministic threat history. The policy
owns its previous observation; nothing enters `sim` and replay still records only
submitted `ArticulatedCommandV1` values.

## State machine and decisions

Use the five phases already introduced:

```text
Seek -> Measure -> Chamber -> Commit -> Recover
          |                       ^
          +-> Guard / Evade ------+
```

`Guard` and `Evade` are decisions within Measure, not extra motor phases. Derive the
opponent weapon sweep from consecutive observed `SegmentPose` values. Guard when the
shield/weapon can cover the predicted crossing before it arrives; otherwise evade on
the side that increases fixed-point miss distance. Commit during an opponent recovery
or when no incoming sweep exists. Exact score ties prefer guard, then left evade, then
the strike-plan ordering from session 03.

Append `Tactical = 5` at
[`crates/policy/src/lib.rs#L376`](../../crates/policy/src/lib.rs#L376), extend `ALL`,
`code`, `from_code`, `name`, and `build`, and mirror it in
[`client/src/runtime/arena-config.ts#L83`](../../client/src/runtime/arena-config.ts#L83),
[`client/src/arena/picker.ts`](../../client/src/arena/picker.ts), and
[`crates/web/src/lib.rs#L5917`](../../crates/web/src/lib.rs#L5917). The arena config
remains 120 bytes and no layout version moves.

## Tests and behavioral gate

```rust
#[test]
fn an_incoming_sweep_is_guarded_when_coverage_arrives_first() {}
#[test]
fn an_uncoverable_sweep_is_evaded_to_the_farther_side() {}
#[test]
fn recovery_is_attacked_instead_of_waiting_for_a_clock_phase() {}
#[test]
fn mirrored_threats_produce_mirrored_defences() {}
#[test]
fn tactical_is_append_only_policy_code_five() {}
```

Add browser/config tests:

```js
test("tactical_is_policy_code_five_in_rust_config_and_the_picker", () => {});
test("a_live_tactical_fight_needs_no_checkpoint_fetch", async () => {});
```

The session passes when 100 mirrored held-out neutral fights produce at least 95
decisions before tick 1,800, zero policy refusals, and named-region crossings in at
least 90% of commits. Against composed, windmill, and attack-moves, report wins,
tick-limits, intended crossings, successful guards/evasions, and attacks during
opponent recovery; do not turn those exploratory rows into post-hoc thresholds.

This is policy/host wiring only and must move no registered hash.

## Verification

```powershell
cargo test -p policy
cargo test -p lab
cargo run --release -p lab -- articulated --seeds 400 --mirrored --policy tactical
cargo test -p web
npm run check
npm run build
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```

