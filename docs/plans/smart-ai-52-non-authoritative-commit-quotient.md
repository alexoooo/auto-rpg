# Smart AI 52 -- non-authoritative commit quotient diagnosis

**Status:** complete on 2026-08-13. The frozen, non-authoritative oracle proves the
separate-quotient diagnosis exactly. Plain body origin is
`O=30064771072/65536=458752 r0`; held hilt is
`H=59643830273/65536=910092 r1`. Current `Q(H)-Q(O)` gives mapped
`451340|-451341`; one relative quotient `Q(H-O)` gives
`451340|-451340`. On the mirror, the consistent absolute anchor is
`Q(O)+Q(H-O)=138484`, while old `Q(H)=138483`. The next-tick segment rebase invariant
and the equivalent relative shield-corner rule both passed. No runtime diagnostic,
behavior change, pin measurement, or corpus ran.

Smart51's
two permanent reflection repairs leave one exact red result:
`tick=33 phase=PostStepPose pair=right.hand.y 451340|451341`,
`cause=none|none`. Smart50's phase-none result is invalid because its extra fallible
wide evaluation could refuse staging and suppress contact. Inspection gives the
exact hypothesis: stage publishes `Q(H)-Q(O)`; reflection turns the paired signed
fractional choices from floors into ceils and yields `451340|451341`. The correct
authority is one quotient, `Q(H-O)`. Smart52 proves this and its next-tick rebase
obligation without adding computation to the live authoritative path.

## Non-interference rule

Do not add a call to `wide_evaluated_point`, `wide_evaluated_shape_quotient`, inverse
hand, exact-owner evaluation, or any other fallible function in `World::step`,
`resolve_contact`, `stage_exact_contact`, or `commit_exact_contact`. Do not turn a
diagnostic failure into `ResolutionError`, change an existing `?`, or add a branch
that can skip contact. Production may expose only values it already computed
successfully, copied infallibly after the authoritative operation.

Preferred implementation is a `#[cfg(test)]` direct fixture beside
[`stage_exact_contact`](../../crates/sim/src/world.rs): use the existing private
test pattern that scans, solves, advances, and stages a copied `World`/`ContactRuntime`
without instrumenting a live Lab run. If one observation from production is still
needed, copy only already-computed `origin`, `absolute_hand`, `hand`, staged velocity,
and commit flags into a fixed diagnostic row after their successful computation. No
new conversion, allocation, hash, replay field, or browser export.

## A -- freeze the tick-32 successful stage inputs

Build the direct test fixture from exact literal authoritative rows: motor points;
body and held common scales/masses; every common/held `at_group` raw and remainder;
momentum raw and remainder; group time; selected contact key/TOI/impulse; and the
already-computed body-origin and hilt quotient words. The fixture must reproduce the
committed `right.hand.y 451340|451341` difference under the Smart51 reflection map.

Before diagnosing arithmetic, prove the test is about a successful contact:

```rust
#[test] fn tick_32_commit_fixture_has_the_same_mapped_resolution_and_no_rejection() {}
#[test] fn tick_32_commit_fixture_reproduces_451340_451341_without_live_diagnostics() {}
```

## B -- direct rational oracle

In a test-only pure helper, evaluate the exact body-origin Y and hilt Y rationals from
the frozen rows. Record numerator, denominator, quotient, and remainder for each.
Compare these two expressions:

```text
current authority: Q(H) - Q(O)
reflection-safe authority: Q(H - O)
```

Reflection about `y=16` is affine. Separate absolute truncations choose the opposite
floor/ceil pair after reflection, making current stage publish `451340|451341`;
subtracting exact rationals first and truncating once must be mapped-equal. This test
must be red against current committed hand Y and print the exact plain/mirror rational
tuples; do not add a tolerance.

```rust
#[test] fn separate_absolute_quotients_expose_the_tick_32_one_raw_hand_difference() {}
#[test] fn exact_relative_then_one_quotient_is_reflection_equivariant() {}
```

If the exact-relative oracle also differs, stop and report its first numerator,
denominator, or response-state difference; do not edit commit arithmetic.

## C -- rule out earlier and later boundaries

Using only the copied fixture values, compare mapped exact-owner states after the
last group and after finish, rebased owner rows, `exact_held_velocity`, staged
`replace_recoil`, body-moved/clipped flags, solved/settled body velocity, and final
arm fields. The first mismatch must be either before quotient, at separate quotient,
or after commit. No live staged trace is necessary.

The direct oracle must also prove the next-tick rebase invariant. Current
[`wide_rebase_owner_tick`](../../crates/sim/src/combat/contact.rs) rebases a held row
against absolute `Q(H)`. If a future stage publishes `Q(H-O)`, its consistent
published absolute anchor is `Q(O)+Q(H-O)`, not old `Q(H)`; otherwise the next tick
reintroduces the discarded fractional word in the held residual. Advance the frozen
oracle one tick and require evaluation to reproduce exactly the published body plus
relative held anchor.

Cover shields under the same authority. A committed shield hand is derived from its
corner set while rebase anchors held response at corner zero. Prove either that every
corner is published as `Q(O)+Q(C_i-O)` and corner-zero rebase uses that same word, or
prove with exact arithmetic why only the anchor needs relative publication and the
other corners remain derived offsets. Do not leave segment and shield commits under
different undocumented rounding rules.

```rust
#[test] fn relative_segment_publication_and_rebase_advance_identically_next_tick() {}
#[test] fn relative_shield_corner_publication_and_rebase_share_one_authority() {}
```

Mutation proof: replace one frozen held remainder with zero and require the fixture-
identity test to fail; change the oracle to subtract the two quotients and require the
oracle-equivalence test to fail. Restore the exact fixture before gates.

Smart52 stops after recording the first unequal rational/word. It makes no behavior
fix, pin measurement/update, full corpus run, damage measurement, policy change, or
Arena change. Existing and new pin movement budgets are zero.

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p sim tick_32_commit_fixture --features cartesian-recoil -- --nocapture
cargo test -p sim separate_absolute_quotients --features cartesian-recoil -- --nocapture
cargo test -p sim exact_relative_then_one_quotient --features cartesian-recoil -- --nocapture
cargo test -p sim --features cartesian-recoil
cargo test -p sim
cargo test -p lab --features cartesian-recoil
cargo test
cargo test -p web
cargo test -p web --features cartesian-recoil
cargo run --release -p lab -- hash
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
node --test tools/wasm_check.js
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

No server or browser is needed. The default and feature behavior must remain
byte-identical because Smart52 is evidence-only.
