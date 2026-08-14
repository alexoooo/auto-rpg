# Smart AI 53 -- relative contact publication and rebase

**Status:** stopped at checkpoint C on 2026-08-13. The held-relative publication and
matching rebase repair landed; its focused segment/shield tests are green. The trace
advanced past the held-hand mismatch, then first diverged at
`tick=33 phase=PostStepPose pair=body.y 524826|524827`, with `cause=none|none`.
Per the stop, no pin measurement/update or 7,560-case corpus ran. Smart54 owns
diagnosis of body-origin quantization; Smart53 does not add a tolerance.

## A -- one shared relative authority

In [`crates/sim/src/combat/contact.rs`](../../crates/sim/src/combat/contact.rs), add a
fallible internal helper that evaluates two existing exact motor points through their
common owner at one time, subtracts the resulting `WidePoint`s, and calls
`wide_point_to_vec3` once:

```rust
wide_relative_point_quotient(held_point, held_row, body_origin, body_row, owner, time)
    -> Result<Vec3, ExactScanReject>
```

It is authoritative production arithmetic, not a diagnostic. It must reuse
`wide_evaluated_point`, preserve its envelope/refusal behavior, and compute
`Q(H-O)`--never `Q(H)-Q(O)` and never a compensated final word.

In [`stage_exact_contact`](../../crates/sim/src/world.rs), locate the owner's body
trajectory once. For a segment, publish its hand directly from relative hilt/body
evaluation. For a shield, evaluate every corner relative to the same body origin,
derive the hand from those relative corners with the existing midpoint/thickness
rule, and do not mix absolute and relative corners. Body publication remains `Q(O)`.

In [`wide_rebase_owner_tick`](../../crates/sim/src/combat/contact.rs), use the same
authority when subtracting the published held anchor from the exact endpoint. The
published absolute anchor is `Q(O)+Q(H-O)` for a segment hilt and
`Q(O)+Q(C0-O)` for shield corner zero. Keep the common body residual against `Q(O)`;
derive the held residual against this reconstructed absolute anchor. This pairing is
load-bearing: changing stage without rebase makes the next tick restore the removed
fractional word.

Do not change exact response, solver, interpolation, tolerances, bounds, actuator,
layout, hashes, or public API beyond the already-landed Smart51 repairs.

## B -- exact segment and shield proofs

Promote Smart52's frozen oracle into production-path tests:

```rust
#[test] fn tick_32_segment_stage_publishes_q_of_hilt_minus_origin() {}
#[test] fn reflected_segment_commit_maps_451340_to_minus_451340() {}
#[test] fn relative_segment_publication_and_rebase_advance_identically_next_tick() {}
#[test] fn shield_corners_and_rebase_anchor_share_relative_body_authority() {}
#[test] fn untouched_body_and_held_rows_remain_byte_identical() {}
```

Pin the rational witness in the test comments/assertions:

```text
O = 30064771072/65536 = 458752 remainder 0
H = 59643830273/65536 = 910092 remainder 1
Q(H)-Q(O) = 451340 / reflected -451341
Q(H-O)    = 451340 / reflected -451340
mirror absolute: Q(O)+Q(H-O)=138484; old Q(H)=138483
```

Mutation proof: restore separate quotients in stage and watch the reflected commit
test fail; restore old absolute `Q(H)` in rebase and watch the next-tick test fail;
leave one shield corner absolute and watch the shield test fail. Restore production.

## C -- focused trace before pin work

Run the permanent Smart51 actuator/interpolation repairs plus Smart53 publication:

```powershell
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536
```

Required output is `ticks=49 phase=none`, with no runtime diagnostic capable of
refusing contact. Any difference stops before pin measurement or corpus.

## D -- pin ownership and portable capture

Registry assessment: there is no registered exact-trajectory or exact-owner digest.
Their feature state is covered by tests, while the registered portable behavioral
witness is `ARTICULATED_STREAM_DIGEST`. Smart53 also inherits the still-unrecorded
Smart51 geometry/actuator behavior changes. Therefore the predeclared budget is:

```text
COMBAT_GEOMETRY_HASH: expected to move from Smart51 interpolation
ARTICULATED_STREAM_DIGEST: expected to move from actuator/contact publication
CONTACT_BEHAVIOR_DIGEST: conditional if its corpus reaches a changed path
all other registered pins/fingerprints/digests: zero moves
new pins: zero
```

Keep old constants for native actual capture, build wasm from the same source, and
capture independent wasm actuals. A conditional unchanged value is recorded as
unaffected. Any unpredicted move or native/wasm disagreement stops without re-record.
Only after agreement update each actually moved Rust/JavaScript owner and the matching
rows in [`docs/reference/hashes.md`](../reference/hashes.md#golden-registry), including
old/new values, unchanged layouts, and rationale. Record durable results in
[`v2-articulated-contact-research.md`](../performance/v2-articulated-contact-research.md).

## E -- full gates, then exactly one full corpus

After paired pins and all default/feature/wasm gates are green, rerun the focused
trace. Only then run:

```powershell
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --noise-free-mirror-corpus
```

This is Smart41's unchanged 7,560 orientations, four shards, eligibility, local
18-neighbour product, tolerances, maximin physical-dissipation selection,
duration/ordinal tie-break, and damage exclusion. Run all with no early stop or
post-measurement retune. Record counters, eligible sides, local/robust/selected result,
checksum, and elapsed time. Smart53 performs no policy or Arena change.

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p sim tick_32_segment_stage --features cartesian-recoil -- --nocapture
cargo test -p sim reflected_segment_commit --features cartesian-recoil -- --nocapture
cargo test -p sim relative_segment_publication --features cartesian-recoil -- --nocapture
cargo test -p sim shield_corners_and_rebase --features cartesian-recoil -- --nocapture
cargo test -p fx
cargo test -p sim
cargo test -p sim --features cartesian-recoil
cargo test -p lab
cargo test -p lab --features cartesian-recoil
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536

# Old-pin paired capture:
cargo test -p web -- --nocapture
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js

# After allowed paired updates:
cargo test
cargo test -p web
cargo test -p web --features cartesian-recoil
cargo run --release -p lab -- hash
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
node --test tools/wasm_check.js
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536

# Last, after every preceding gate is green:
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --noise-free-mirror-corpus

node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

`wasm_check.js` checks the artifact already present; each invocation follows its
matching build. No server or browser is needed.
