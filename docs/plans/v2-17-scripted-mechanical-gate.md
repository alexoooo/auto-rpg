# v2-17 — prove the scripted two-body mechanics

**Goal:** judge the deterministic two-body model against the exact fixture, script,
metrics, worker join, and visible-review evidence in
[`articulated-mechanical-gate.md`](../reference/articulated-mechanical-gate.md).

**Depends on:** green `v2-10` through `v2-16` and the v2-08 greybox renderer (or its
recorded replacement). Room art is not a dependency.

**Golden expectation:** all six legacy pins remain byte-identical. Record one
`ARTICULATED_HASH` only after every automated and visible threshold passes.

## Implementation

Add `Scenario::articulated_duel` in `crates/sim/src/scenario.rs`,
`crates/policy/src/articulated_script.rs`, and the `lab articulated` command. Use the
fixture and twelve 30-tick script phases in the reference verbatim. The command
script consumes only `ArticulatedObservation`; it never reads `World`. Its vocabulary
is approach, withdraw/rest, body turn, low/mid/high guard, left/right cut, and thrust.
The only ordinary heights emitted are `LOW`, `MID`, and `HIGH`. The Dev intermediate
control emits raw height `24_576` (3/8) through the same 55-byte command path.

Add the twelve named replay fixtures and evidence rows in the reference. Each fixture
records the exact scenario bytes, seed, canonical command-stream digest, replay
digest, hash domain/schema, final state digest, pose digest, event digest, cap hits,
maximum energy excess, and asserted qualitative predicate. These fixtures are tests,
not hand-edited recordings.

## Worker and renderer join

Regenerate `client/src/protocol/abi.generated.ts`. Update
`client/src/protocol/messages.ts`, `client/src/runtime/sim-worker-host.ts`,
`client/src/runtime/sim.worker.ts`, `client/src/runtime/sim-client.ts`,
`client/src/state/snapshot.ts`, and the three worker/snapshot tests to implement the
exact model selector, transferable 55-byte command, acknowledgement, pose/event
snapshot sections, visibility filtering, offsets, and pool sizing in the reference.
Legacy init/commands/snapshots remain accepted and unchanged in meaning.
Update the now-expanded canonical message and snapshot shapes in
`docs/reference/worker-protocol.md` in the same implementation commit.

Draw debug region volumes, actual and target hands, weapon segments, shield rectangle,
contact point/normal, contact-group ordinal, and energy ledger from the final v2-16
row layout. Debug nodes use the same
filtered identity set as actors, start off, and never bypass fog. The non-debug read
must expose guard height, commitment, parry/deflection, arm loss, and leg impairment.

## Automated gate

Run seeds `0..399`, each in the canonical and exact spatial mirror: 800 trials. The
reference fixes denominators, integer forms of `<10%` and `<=5 percentage points`,
minimum event/pose coverage, exact-zero energy/cap requirements, and the separate
100-seed windmill comparison. `lab articulated --record` writes
`docs/performance/evidence/v2-articulated-gate.json` using the schema in the reference.
No threshold may silently change to fit a result; amend this plan with rationale and
rerun if a threshold was inappropriate.

## Visible foreground gate

Capture the fifteen label-free two-second clips and matching overlay stills named in
the reference from a genuinely visible foreground browser. A reviewer blind to the
fixture labels classifies each clip. Pass requires at least 12/15 overall and at least
2/3 for each of the five phenomena, plus exact overlay agreement on identity, region,
height, normal, and severance. Commit the review Markdown and SHA-256 manifest. Record
exactly `pass`, `revise`, or `stop` here after review; deterministic but unreadable or
uncontrollable is `revise` or `stop`.

**Gate result:** pending.

## Pin and registry updates

Only after both gates pass, pin the canonical seed-zero original-orientation final
digest as `ARTICULATED_HASH` with `HashDomain::ArticulatedV1` and schema `1` in:

- `crates/sim/tests/determinism.rs`;
- `tools/wasm_check.js`;
- the golden registry in `docs/reference/hashes.md`.

The registry row names `Scenario::articulated_duel`, seed zero, the scripted-policy
digest, stop-at-outcome rule, both pin sites, and the only permitted re-record path:
repeat this whole gate. Never re-pin a legacy hash.

Both pin sites decode the same committed codec-V2 replay bytes with `include_bytes!`;
neither runs the policy. Native, replay, and wasm must return the identical
ArticulatedV1 `(domain, schema, value)` tuple before the value is recorded.

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
node tools/check_docs.js
git diff --check
```
