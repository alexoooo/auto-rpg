# v2-17 — prove the scripted two-body mechanics

**Goal:** judge control, readability, determinism, and contact quality using debug
geometry before authored rigs, search, or training.

**Depends on:** `v2-10` through `v2-16` and the greybox renderer from `v2-08` (or its
recorded replacement). It does not depend on room art from `v2-09`.

**Golden expectation:** every legacy hash remains unchanged. Pin one new
`ARTICULATED_HASH` only after all checks below pass and native equals wasm.

## Scripted fixture and policy

Add `Scenario::articulated_duel` at `crates/sim/src/scenario.rs`, a deterministic
Fighter/Brute command script in `crates/policy/src/articulated_script.rs`, and
`lab articulated` in `crates/lab/src/main.rs`. The action vocabulary is approach,
withdraw/rest, body turn, guard low/mid/high, cut left/right low/mid/high, and thrust
low/mid/high. It emits only `CombatHeight::{LOW,MID,HIGH}`; a Dev control submits one
intermediate target through the same command path.

The renderer draws debug body/region capsules, actual and target hands, weapon
segments, shield plane, contact point/normal, time group, and energy ledger. Debug
draws obey authoritative fog by default.

This is the first mechanics/visual integration point. Regenerate
`client/src/protocol/abi.generated.ts` from the Rust submitted-command, pose, and
event constants; add the articulated command message to
`client/src/protocol/messages.ts`; and test worker rejection of wrong layout/model,
late tick, and old epoch before enabling the Dev controls.

## Recorded cases

Commit replay fixtures and short evidence records for:

```text
stationary edge / body running onto a braced point
matching and mismatched shield heights
intermediate-height actuation and contact
turn-in-place moving shield normal
two sequential contacts and one simultaneous group
weapon parry transferring momentum to both arms
armor incidence and exact energy non-creation
left/right arm injury and severance
leg and shock impairment
simultaneous fatal contacts
contact-iteration cap exhaustion
windmill versus composed cut/rest
```

Each recording names seed, command script digest, replay digest, hash domain/schema,
final digest, pose/event stream digests, and expected qualitative read.

## Pass/fail gate

Run 400 mirrored seeds. Tick-limit outcomes are <10%; side advantage is <=5
percentage points; all three heights, both equipped arms, cut, thrust, parry, shield,
three anatomy regions, impairment, and severance appear. Energy creation is exactly
zero and contact-cap hits are zero outside the explicit exhaustion fixture.

A visible foreground review must be able to identify guard height, committed attack,
parry/deflection, arm loss, and leg impairment without reading the debug labels; the
debug overlay must agree when enabled. Record `pass`, `revise`, or `stop` in this file.
“Deterministic but not controllable/readable” is a failure.

## Pin and verification

After the gate passes, pin the single fixture digest as `ARTICULATED_HASH` in
`crates/sim/tests/determinism.rs` and `tools/wasm_check.js`. The pin always travels
with `HashDomain::ArticulatedV1` and schema `1`.

```powershell
cargo test
cargo run --release -p lab -- articulated --seeds 400 --mirrored --record
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
npm ci
npm run generate:abi
npm run check
npm run build
git diff --check
```
