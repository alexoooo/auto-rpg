# v2-ui-05 — the missing decision loop

**Goal:** make an articulated fight run inside wasm, with a different policy on each
side, started from a configuration the browser wrote.

**Depends on:** `v2-ui-04` (`Scenario::duel_from`).

**Golden expectation:** no pin moves — but `ROOM_HASH`, `BATTLE_HASH`, `SWAP_HASH` and
`BOW_HASH` are all produced by the function this session edits, so the prediction is a
claim about discipline rather than about distance.

## The defect

[`crates/sim/src/world.rs:1803`](../../../crates/sim/src/world.rs#L1803):

```rust
pub fn submit(&mut self, id: EntityId, command: Command) {
    if self.combat_model != crate::CombatModel::Legacy {
        return;
    }
```

`Sim::advance` ([`crates/web/src/lib.rs:2165`](../../../crates/web/src/lib.rs#L2165))
runs one loop — `world.observe(id)`, `self.policies[faction].decide(&obs)`,
`world.submit(id, command)` — over the **legacy** `Policy` and `Command` types. On an
articulated world every command it produces is dropped on the floor.

`PolicyKind::from_code` ([`crates/policy/src/lib.rs:296`](../../../crates/policy/src/lib.rs#L296))
offers exactly four codes — `0 Utility, 1 Duelist, 2 Idle, 3 Random` — and all four are
legacy. So **zero policies are reachable for an articulated fight**, and
`init_articulated` opens a room whose bodies chase their tick-zero command forever. The
pose exports are an output channel with nothing behind them.

## A second branch, not a refactor

Add an articulated branch to `Sim::advance`. Do **not** restructure the legacy path,
do not extract a shared helper out of it, do not "tidy" the borrow dance around `due`
and `events` while in there.

`ROOM_HASH`, `BATTLE_HASH`, `SWAP_HASH` and `BOW_HASH` are produced by this function,
and `AGENTS.md`'s standing trap is precisely that a change here looks inert:
`Objective` defaults to `None` and no lab scenario issues an `Order::Goto`, so a plan
concludes no golden reaches the code — while `ROOM_HASH`'s script *does* issue an order
and *does* reach `ordered_feet`. A branch that the legacy path cannot enter is the only
shape of change that is obviously safe here, and obviously safe is what this needs.

The loop to port is the two-sided one: `measure_articulated_matchup`
([`crates/lab/src/main.rs:823`](../../../crates/lab/src/main.rs#L823)). Note that
`policy::run_articulated` takes a single `impl ArticulatedPolicy` and installs it on
both sides, which is right for a control and useless for an arena.

## Policy codes

A new `ArticulatedPolicyKind`, separate from `PolicyKind` — the two have nothing to do
with each other and overloading `set_policy`'s four codes would produce a page where
"idle" means two different things:

| code | policy | source |
|---|---|---|
| 0 | neutral | `policy::NeutralArticulatedPolicy` |
| 1 | composed | `policy::ScriptedArticulatedPolicy` |
| 2 | windmill | `policy::WindmillArticulatedPolicy` |
| 3 | attack-moves | `policy::ClosingAttackControlPolicy` |
| 4 | **reserved — `learned`** | refused here; landed by [`v2-ui-08`](v2-ui-08-learned-in-the-browser.md) |

The first four live in `crates/policy`, which `web` already depends on, and none of them
needs floating point.

**Code 4 is reserved and refused rather than omitted**, so that `v2-ui-08` — which
splits an inference-only `learn-core` out of `crates/learn` and gives it a cross-target
golden — is purely additive and needs no rework here. Until it lands, the studio shows
the entry disabled with a sentence saying which session enables it; an option that
silently does nothing is the first thing a reader will ask about.

Related footgun to note while here: `policy_kind(faction)` will keep answering a legacy
kind on an arena world. Either it learns about the arena or it says it does not know.

## The configuration buffer

A loadout is roughly forty scalars with cross-field validity — bindings against each
other, ids against each other, actions against the loadout. A sequence of scalar setter
calls would have partially-written intermediate states and no single point at which the
whole thing can be judged and refused, so this takes a staging buffer.

**The pattern already exists**:
[`crates/web/src/lib.rs:938`](../../../crates/web/src/lib.rs#L938) holds
`static SUBMITTED_COMMAND: RefCell<[u8; 55]>`, exposed by `submitted_command_ptr/len/
layout_version` and consumed by one atomic `submit_articulated` that checks bytes `0..1`
as the layout field and bytes 2 and 3 as guards before slicing the payload. A fixed
array never moves and never grows linear memory.

This *does* contradict the route section's comment at `lib.rs:4284` — "three scalar
exports rather than a shared input buffer ... a second buffer would be a second
detachable view for no gain". The distinction to record: a route is two scalars with no
cross-field rule; a loadout is forty with seven.

```text
arena_config_ptr()            -> u32   // ARENA_CONFIG: RefCell<[u8; 120]>
arena_config_len()            -> u32   // const 120
arena_config_layout_version() -> u32   // const 1
arena_start(seed: u32)        -> u32   // packed, submit_result() style
arena_fingerprint_lo() / _hi() -> u32
arena_policy(faction_code)    -> u32   // read-back
```

Layout, little-endian, every dimension an `i32` raw 16.16 to match
`submitted_command`'s grammar: bytes `0..2` the `u16` layout version and the sole layout
field, byte 2 the fighter count (must be 2), byte 3 reserved (must be 0), `4..8` the
`u32` max_ticks, then two 56-byte fighter blocks. Per fighter: anatomy code, policy code,
spawn x and y, then two 22-byte hand blocks of item code, reserved, and five dimension
words. Hand index 0 is `LimbSlot::LeftArm` and 1 is `RightArm`, whose discriminants are
already pinned by `left_and_right_limb_slots_have_stable_discriminants`
(`spec.rs:762`); the builder sets `binding` from the index.

## Failing well

`arena_start` returns `submit_result(outcome, reason, detail, slot)`
(`lib.rs:4608`). It must distinguish, at minimum: unknown layout, wrong fighter count,
both hands empty, `CombatSpecError::{Dimension, Fraction, Maximum, IdOrder,
MissingReference, LoadoutMismatch, GripConflict, TooManyAnatomies, TooManyEquipment}`,
learned-policy-unavailable, and contact-reservation-refused. **Eleven distinct failures,
every one reachable from a slider.** One opaque zero means the studio says "invalid" for
all of them and a reader cannot tell a typo from an impossibility.

It must install **nothing** on any failure, the way `install_articulated`
(`lib.rs:4149`) already does. Two hard reasons: `Scenario::fingerprint` *panics* on
invalid construction (`scenario.rs:454`), so `try_fingerprint` is mandatory rather than
preferable; and a trap behind `pub extern "C"` poisons the wasm instance for the life of
the page, turning a bad slider value into a reload.

## Measure the recording cost before session 07 designs around it

`publish()` rebuilds the entire legacy frame plus both articulated buffers on every call
([`lib.rs:3880`](../../../crates/web/src/lib.rs#L3880)), and a recorder calls `step(1)`
3,600 times. The overview's estimate — ~650 ticks/s in wasm, a fight in about five
seconds — assumes that is not the dominant cost, and that assumption is untested.

Measure it here. If `publish()` dominates, this session owes an
`arena_record_step(ticks)` that steps and fills only the two articulated buffers,
skipping the frame. Write the measured ticks/second into this file either way; session
07 reads it.

## Verification

```powershell
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_deps.js
node tools/check_docs.js
cargo run --release -p lab -- hash
```

**Rebuild the wasm before `wasm_check.js`, not after.** A stale artefact makes the one
test that could catch this session's worst outcome pass vacuously.

Every new export needs a `typeof wasm[name] === "function"` line in `tools/wasm_check.js`
and an entry in `sim.worker.ts`'s `requiredFunctions`. The comment above that list says
why and it is not decoration: `undefined >>> 0` is `0` and `NaN` never grows, so an
unchecked export turns every assertion below it into a vacuous pass.

Tests that carry the session:

- `a_scripted_arena_fight_in_wasm_matches_the_same_fight_in_lab` — same config, same
  seed, same outcome and same state hash native and in wasm. This is the test that says
  the ported loop is the loop, and without it the whole live path is unverified.
- `each_side_may_run_a_different_policy` — the thing `run_articulated` cannot do.
- `arena_start_refuses_and_installs_nothing` — for every one of the eleven reasons, with
  the instance still usable afterwards.
- `the_learned_code_is_refused_by_name`.

## Decision

Record `pass`, `revise` or `stop`. State the four legacy hashes as unmoved with the
command that printed them, and record the measured wasm ticks/second.
