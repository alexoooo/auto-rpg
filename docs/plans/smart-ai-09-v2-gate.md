# Smart AI 09 -- re-open the v2 mechanical gate

**Status:** revise -- the competence prerequisite failed, so the final gate was not
implemented or run.

**Goal:** replace the failed clock-script gate with a frozen competence corpus and
decide whether representative rigs in `v2-18` may begin.

## Outcome

Session 06 did not clear this session's minimum entry criterion. Its tactical policy
produced intentional named-region crossings with zero command and solver refusals,
but all 20 measured moving fights reached tick 3,600 and were decided on points;
zero were decided by a body. That is not the required 95 of 100 decisions before
tick 1,800. Sessions 04 and 05 also closed `revise`, and session 08 consequently did
not train or promote a learned policy.

The proposed harness, frozen fixtures, replay pin proof and visible review below were
therefore not implemented or run. Creating a passing threshold around this result
would measure activity rather than competence. `ARTICULATED_HASH` remains absent,
no existing pin moves, and `v2-18` remains blocked on a future mechanical successor
that first demonstrates timely body decisions.

Do not reuse the old thresholds. The current ledger records 99% tick limits, a
roughly 35x scale mismatch, an unreachable `contact_cap_hits == 0` condition, and an
underpowered side-advantage test. Sessions 02--06 supply the observations needed to
write criteria that measure intentional combat rather than clock activity.

## Freeze before the final run

Amend [`docs/reference/articulated-mechanical-gate.md`](../reference/articulated-mechanical-gate.md)
with exact corpus seeds, mirrored layouts, policy code, anatomy/loadout matrix, maximum
ticks, and these required metrics:

```text
decisions and decision tick
commits and intended-region crossings
weapon/body contacts and wound energy per crossing
successful guards/evasions and attacks during recovery
command refusals, solver rejections, and energy excess
direct-run hash == rerun hash == replay hash
native replay hash == wasm replay hash
```

Freeze thresholds from sessions 02--06 before running the held-out set. At minimum,
retain the overview’s neutral competence floor: 95/100 decisions by tick 1,800 and
90% named-region crossings. Require zero refusals and solver rejections; report energy
excess beside both rather than using the old unreachable cap-hit predicate.

## Run and decision

Add `lab articulated-gate --policy tactical --write <dir>` and make it refuse an
unfrozen or overlapping training seed list. Store commands plus scenario identity so
replay never needs the policy. Run tactical first; add a learned row only if session
08 promoted.

```powershell
cargo run --release -p lab -- articulated-gate --policy tactical --seeds 400 --mirrored --write artifacts/smart-ai-gate
cargo run --release -p lab -- articulated-gate --policy learned --checkpoint checkpoints/v2-probe.ckpt --seeds 400 --mirrored --write artifacts/smart-ai-learned
```

For a pass, create `ARTICULATED_HASH` only after direct native, rerun, native replay,
wasm replay, and visible foreground review agree. Register its owner and permitted
re-record path in `docs/reference/hashes.md`, mirror it in Rust and JavaScript, and
update [`v2-00-overview.md`](v2-00-overview.md) plus
[`v2-18-combatant-integration.md`](v2-18-combatant-integration.md) to name this passed
gate. On revise/stop, leave the hash absent and record the measured blocker.

No existing pin moves in this evidence session. A disagreement is a bug, not a new
number.

Add these exact tests beside the articulated harness at
[`crates/lab/src/main.rs#L612`](../../crates/lab/src/main.rs#L612), plus the wasm
mirror in `tools/wasm_check.js`:

```rust
#[test]
fn the_articulated_gate_refuses_an_unfrozen_seed_list_by_name() {}
#[test]
fn direct_rerun_and_replay_share_the_registered_articulated_hash() {}
```

```js
test("wasm_replay_reaches_the_registered_articulated_hash", () => {});
```

Show the first Rust test fail by removing the seed-list check and the JavaScript test
fail by perturbing one recorded command byte before accepting the pin.

## Verification

```powershell
cargo test -p lab
cargo test -p web
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```

After a pass, delete the completed `smart-ai-*` plan set in the same commit that folds
its durable contracts into architecture/reference/performance docs. `v2-18` is then
the only implementation plan this topic hands forward.
