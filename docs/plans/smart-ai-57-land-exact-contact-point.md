# Smart AI 57 -- land exact contact-point publication

**Status:** stopped at checkpoint C on 2026-08-13. Exact recompute point and normal
publication landed in the shared key.a-owner frame and the prior point mismatch is
fixed. The focused trace then found the next first unequal authoritative word:
`tick=33 phase=Resolution pair=resolution.velocity_a.y 4639|4640`, with
`cause=none|none`. Per the stop, no pin was measured or updated and the 7,560-case
corpus did not run. Smart58 owns diagnostic-only contact-velocity provenance;
Smart57 does not retune geometry or add tolerance.

## A -- publish exact recompute geometry in one frame

In [`crates/sim/src/combat/contact.rs`](../../crates/sim/src/combat/contact.rs), add
private, feature/test-only helpers that find the body trajectory with the same
`owner_index` as the candidate's key.a trajectory; take its integral tick-start body
motor origin `M0` as a denominator-1 `WidePoint`; publish any exact point `X` as
`M0+Q(X-M0)`; and publish contact point directly as
`M0+Q(((A+B)/2)-M0)`.

```rust
wide_owner_motor_frame(
    trajectories: &[ExactContactTrajectory], owner_index: usize,
) -> Result<WidePoint, ExactScanReject>

wide_point_in_frame(point: WidePoint, frame: WidePoint)
    -> Result<Vec3, ExactScanReject>

make_wide_candidate(
    a: &ContactCollider, b: &ContactCollider, kind: ContactKind, toi: TimeOfImpact,
    point_a: WidePoint, point_b: WidePoint, frame: WidePoint,
    distance_sq: Fx, feature: u8, region: u8,
) -> Result<Candidate, ExactScanReject>
```

`make_wide_candidate` publishes A and B individually in the same frame before using
the existing delta/normal rule, but publishes `fact.point` from the exact wide
midpoint before either endpoint is quantized. It may reuse `make_candidate` for
identity, velocities, distance, feature and fallback-normal semantics, then replace
only point with the direct exact-midpoint word. If exact delta is zero, retain the
current TOI/relative-velocity fallback exactly.

Use it at all successful branches of
[`exact_contact_at_pose`](../../crates/sim/src/combat/contact.rs): weapon/body,
weapon/weapon and weapon/shield, including canonical swap recursion. The frame follows
the final key.a trajectory after a swap. Do not change `wide_segment_body_at_time`,
region/medial tie-breaks, closest-feature selection, `wide_cmp`, distance, accepted
TOI, scanner, or solver. This is publication after selection.

## B -- production and mutation proofs

Promote Smart56's exact words into production-path tests:

```rust
#[test] fn tick_32_exact_recompute_publishes_point_in_key_a_motor_frame() {}
#[test] fn tick_32_exact_recompute_publishes_normal_endpoints_in_the_same_frame() {}
#[test] fn exact_point_publication_does_not_change_toi_region_distance_or_key() {}
#[test] fn weapon_weapon_and_weapon_shield_use_the_final_key_a_owner_frame() {}
#[test] fn finalized_resolution_preserves_the_canonical_fact_geometry() {}
```

Assert the full A numerators, denominator and remainders,
`M0=458752|589824`, old `514088|514089`, corrected `514088|534488`, and endpoint
pairs `[503889,524288]|[544687,524288]`. A paired test in
[`crates/sim/src/combat/resolution.rs`](../../crates/sim/src/combat/resolution.rs)
must prove finalization copies canonical `ContactFact.point` and normal unchanged.

Mutation proof: restore absolute `wide_point_to_vec3(A/B)` plus integer midpoint and
require the point test to fail; retain direct midpoint but restore absolute endpoint
publication and require the normal test to fail. Restore production before gates.

## C -- focused trace stop

Run cumulative Smart51, Smart53, Smart55 and Smart57 repairs:

```powershell
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536
```

Required output is `ticks=49 phase=none`. Any unequal authoritative word, rejection,
or changed selection stops before pin capture and corpus. Record the exact first
boundary and author a new diagnostic plan; do not retune publication.

## D -- expanded behavior-pin ownership

Contact point is not presentation-only. [`World::after_group`](../../crates/sim/src/world.rs)
passes it to `outward_region_normal`, which can change squareness, armor transfer,
deflection, integrity loss, wounds, severance, credit and hashed state. The event ABI
also publishes point. The pre-measurement budget is therefore:

```text
COMBAT_GEOMETRY_HASH: expected to move from cumulative Smart51 geometry
ARTICULATED_STREAM_DIGEST: expected to move; pose/event values change
CONTACT_BEHAVIOR_DIGEST: explicitly at risk and owned if its fixed corpus reaches
                         changed exact publication or point-driven armor
authoritative fight/state hashes: inspect; a feature-reachable fixture may move only
                                  with point-to-armor/wound byte evidence
layout versions, strides, format digests, command hash, scenario fingerprints,
learned inference digest and every unrelated default-only pin: zero moves
new pins: zero
```

Keep old constants and capture native actuals first. Build wasm from identical source
and capture independent actuals for default and `cartesian-recoil` artifacts. For
`CONTACT_BEHAVIOR_DIGEST` and any state hash, record whether its fixed fixture reaches
changed point-driven armor/wound bytes; an unreachable fixture must remain unchanged.
Native/wasm disagreement or an unpredicted/unexplained move stops without re-record.
Only agreeing, explained moves may update Rust, JavaScript and
[`docs/reference/hashes.md`](../reference/hashes.md#golden-registry), recording
old/new values and the authoritative consumer path.

## E -- full gates, then one frozen corpus

After `phase=none`, paired pin agreement and all default/feature/wasm/dependency gates
are green, rerun the focused trace. Only then run Smart41's unchanged
7,560-orientation, four-shard noise-free mirror corpus once. Preserve eligibility,
the local 18-neighbour product, tolerances, maximin physical-dissipation selection,
duration/ordinal tie-break and damage exclusion. Run all without early stop or
post-measurement retune; record counters, eligible sides, local/robust/selected result,
checksum and elapsed time.

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p sim tick_32_exact_recompute_publishes_point --features cartesian-recoil -- --nocapture
cargo test -p sim tick_32_exact_recompute_publishes_normal --features cartesian-recoil -- --nocapture
cargo test -p sim exact_point_publication_does_not_change --features cartesian-recoil -- --nocapture
cargo test -p sim weapon_weapon_and_weapon_shield_use --features cartesian-recoil -- --nocapture
cargo test -p sim finalized_resolution_preserves --features cartesian-recoil -- --nocapture
cargo test -p sim --features cartesian-recoil
cargo test -p sim
cargo test -p fx
cargo test -p lab --features cartesian-recoil
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536

# Old-pin native/wasm captures, default and exact feature.
cargo test -p web -- --nocapture
cargo test -p web --features cartesian-recoil -- --nocapture
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
node --test tools/wasm_check.js

# After only explained, paired updates.
cargo test
cargo test -p web
cargo test -p web --features cartesian-recoil
cargo run --release -p lab -- hash
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
node --test tools/wasm_check.js
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536
node tools/check_deps.js
node --test tools/check_deps.test.js

# Last, only after every preceding gate is green.
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --noise-free-mirror-corpus

node tools/check_docs.js
git diff --check
```

`wasm_check.js` checks the artifact already present; each call follows its matching
build. No server or browser is needed.
