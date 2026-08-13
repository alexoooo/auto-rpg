# Smart AI 51 -- land exact reflection

**Status:** ready to implement; written before Smart51 code or measurement. Two
independently diagnosed rounding repairs together make the source-41 ordinal-1536
plain/mirror schedule exact for all 49 ticks. Smart51 lands them as one authoritative
behavior change, proves native/wasm agreement, owns only its predeclared pin moves,
and then reruns the unchanged 7,560-orientation Smart41 corpus.

## A -- land exactly the two proven repairs

In [`crates/sim/src/combat/actuator.rs`](../../crates/sim/src/combat/actuator.rs#L103),
replace only the shoulder Y and hand polar-displacement Y products with existing
`mul_div(value, scale, Fx::ONE)`, as proven by Smart43/44. Keep X, Z, state, rates,
recoil, and public fixed-point multiplication unchanged.

In [`crates/fx/src/geom3.rs`](../../crates/fx/src/geom3.rs#L376), add the private
reflection-safe interpolation helper proven by Smart49 and use it for all four
endpoint interpolations in `swept_segment_segment_audited`'s distance closure. No
other primitive or public lerp changes. Do not change tolerances, radii, iteration
bounds, minimum advance, closest-points, solver law, or corpus grammar.

Land the focused tests already proven red under their old expressions:

```rust
#[test] fn actuator_y_products_are_odd_under_reflection() {}
#[test] fn ordinal_1536_tick_one_post_step_pose_is_exactly_mapped() {}
#[test] fn reflected_lerp_is_exact_at_plus_minus_1180_times_37379() {}
#[test] fn tick_32_reflected_segment_pair_returns_one_exact_toi() {}
#[test] fn reflected_segment_sweep_iterations_match_word_for_word() {}
```

Mutation proof: restore either actuator Y product and require its focused test to
fail; restore `Vec3::lerp` at any one of the four geometry endpoints and require the
iteration/TOI test to fail. Restore the complete production repair before gates.

## B -- focused proof before pin work

Run the landed code, with no temporary mutations:

```powershell
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536
```

Required exact output is `ticks=49 phase=none`. The trace compares configuration,
commands, pre/post poses, resolution, rejection, crossing, compatibility sweep, group
boundaries, and staged post-contact provenance. Any difference stops Smart51 before
pin measurement or corpus execution.

## C -- old-pin capture and paired portable re-record

This joint authoritative change predeclares:

```text
COMBAT_GEOMETRY_HASH: expected to move
ARTICULATED_STREAM_DIGEST: expected to move
CONTACT_BEHAVIOR_DIGEST: conditional -- move only if its corpus reaches either repair
all other registered pins/fingerprints/digests: zero moves
new pins: zero
```

Keep old constants installed for the first pass. Collect native actual values from
the failing Rust tests, then build `web.wasm` from the same source and collect the
independent wasm actuals. Native and wasm must agree for every moved paired pin. A
conditional pin that remains old is recorded as unaffected. Any unpredicted movement
or target disagreement stops; do not re-record anything.

Only after target agreement update each actually moved constant in both owners:

- `COMBAT_GEOMETRY_HASH` in `crates/fx/src/geom3.rs` and `tools/wasm_check.js`;
- `ARTICULATED_STREAM_DIGEST` in `crates/web/src/lib.rs` and `tools/wasm_check.js`;
- `CONTACT_BEHAVIOR_DIGEST` in its Rust and JavaScript owners only if measured moved.

Update the corresponding rows in
[`docs/reference/hashes.md`](../reference/hashes.md#golden-registry) with old/new
values, exact rounding rationale, unchanged layouts/versions, and native/wasm
agreement. Record the same evidence in
[`v2-articulated-contact-research.md`](../performance/v2-articulated-contact-research.md).
Then rebuild and rerun against the new constants. `LAB_HASH`, `GOLDEN_STATE_HASH`,
`ROOM_HASH`, browser fight hashes, `ARTICULATED_COMMAND_HASH`, contact-format corpus,
combat fingerprints, legacy feature prefix, and `LEARNED_INFERENCE_DIGEST` must stay
byte-identical.

## D -- full gates, then the unchanged Smart41 audit

Run all default and feature tests first. Only when they, both portable targets, and
the focused 49-tick trace are green, run the complete source-41 command:

```powershell
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --noise-free-mirror-corpus
```

It must reuse Smart41's exact 7,560 central orientations, four deterministic shards,
eligibility, 18-neighbour local product, mapping tolerances, maximin physical-
dissipation selector, duration/ordinal tie-break, zero early stop, and damage
exclusion. Do not retune after reading it. Record all counters, eligible plain/mirror,
local/robust counts, selection or declared none, checksum, and elapsed time. A stopped
mechanical result authorizes diagnosis only; a robust selected row permits a later
plan to own policy/Arena promotion. Smart51 itself changes no policy or browser UI.

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p fx reflected_lerp -- --nocapture
cargo test -p fx tick_32_reflected_segment_pair -- --nocapture
cargo test -p sim actuator_y_products -- --nocapture
cargo test -p sim --features cartesian-recoil ordinal_1536 -- --nocapture
cargo test -p fx
cargo test -p sim
cargo test -p sim --features cartesian-recoil
cargo test -p lab
cargo test -p lab --features cartesian-recoil
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536

# Old-pin native and wasm capture, before editing constants:
cargo test -p web -- --nocapture
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js

# After paired updates:
cargo test
cargo test -p web
cargo test -p web --features cartesian-recoil
cargo run --release -p lab -- hash
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
node --test tools/wasm_check.js
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536

# Last, and only after every preceding gate is green:
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --noise-free-mirror-corpus

node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

`wasm_check.js` tests the artifact already present, so each invocation follows its
matching build. No server or browser is needed.
