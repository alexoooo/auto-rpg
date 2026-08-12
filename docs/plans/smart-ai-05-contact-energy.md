# Smart AI 05 -- charge contact energy at the right boundary

**Status:** revise -- offline rebilling did not explain the missing wounds.

**Goal:** change contact billing only if clean, fast region crossings still fail to
produce proportionate wounds after actuator calibration.

The current [`CONTACT_ENERGY_FLOOR = 144`](../../crates/sim/src/combat/resolution.rs#L18)
is subtracted by [`channels`](../../crates/sim/src/combat/resolution.rs#L346) from each
allocated contact fact on each tick. Session 04 evidence decides whether that is an
actual bottleneck. If clean strikes wound and decide fights, close this session as
“not required” with no code change.

The session-04 calibration rejected every faster actuator pair, so there is no
selected mechanically changed production corpus. This session evaluates the
production-rate clean crossings; it does not combine a rejected actuator with a
contact-rule edit.

## Re-derive before replacing

Extend the strike corpus with the complete allocation ledger for one committed sweep:

```rust
struct ContactAllocationRow {
    episode: u32,
    tick: u32,
    fact_count: u32,
    closure_energy: u64,
    allocated_energy: u64,
    floor_charges: u32,
    wound_energy: u64,
}
```

Compare three offline interpretations over identical facts: current per-fact/tick,
once per contact group, and once per continuous contact episode. Choose the narrowest
rule that makes clean strikes monotonic in closure energy without turning a held,
low-energy overlap into a damage source. Publish the paired table in
`docs/performance/smart-ai-contact-energy.md` before editing authority.

If and only if the episode rule wins, add a bounded, sorted contact-key set to
authoritative articulated state. A key is active while the same ordered collider pair
appears on consecutive ticks; a one-tick absence ends it. Hash the count and sorted
keys, reconstruct them naturally during replay, and refuse overflow instead of
evicting by iteration order.

## Outcome

The complete offline table is in
[`smart-ai-contact-energy.md`](../performance/smart-ai-contact-energy.md). Across
3,600 first committed sweeps, rebilling once per continuous contact episode raises
channel energy from 1,228 to 1,258 raw: 30 raw total, or 2.44%. Per-group billing is
effectively identical to production because almost every retained attacker fact is
already alone in its group. Episode billing does not turn these clean crossings into
proportionate wounds and therefore does not win the decision. Production contact
authority and every pin remain unchanged.

## Tests and pins

```rust
#[test]
fn one_continuous_contact_pays_one_floor() {}
#[test]
fn a_separated_contact_begins_a_new_episode() {}
#[test]
fn splitting_one_group_into_facts_does_not_multiply_the_floor() {}
#[test]
fn a_held_low_energy_overlap_cannot_farm_wounds() {}
#[test]
fn contact_episode_keys_hash_in_collider_order() {}
#[test]
fn replay_reconstructs_the_same_contact_episodes() {}
```

Show the first and third fail under the current rule, and the fourth fail with the
floor removed entirely.

Before implementation, use `cargo run --release -p lab -- hash`, the command probe,
contact corpus, and stream digest to record the controls. The authorized episode path
expects exactly three moves: `ARTICULATED_COMMAND_HASH`, because its unstepped
articulated state writes the empty episode count; `CONTACT_BEHAVIOR_DIGEST`, by adding
the repeated-tick cases that distinguish the rule; and `ARTICULATED_STREAM_DIGEST`,
because its clinch reaches contact resolution. The six legacy hashes, combat-spec
pins, and `LEARNED_INFERENCE_DIGEST` must not move. If measurement instead selects the
stateless per-group rule, amend this plan with that narrower prediction before code;
do not implement a different authority shape under the episode budget.

## Verification

```powershell
cargo test -p sim
cargo run --release -p lab -- verify --seeds 200
cargo run --release -p lab -- strike-corpus --policy striker --seeds 100 --mirrored
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```
