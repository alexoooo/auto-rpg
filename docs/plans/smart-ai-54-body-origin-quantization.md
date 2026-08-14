# Smart AI 54 -- body-origin quantization diagnosis

**Status:** complete on 2026-08-13. All seven focused tests are green, and both
mutation proofs were red and restored. They establish `P=M+Q(R)` as the reflection-equivariant
body publication authority and prove its matching common rebase, without touching
production behavior. No pin measurement, full corpus, policy, or Arena work ran.
Smart55 owns the production landing.

The frozen tick-32 Y words are `M=524288`, `R=35258369/65536`, zero momentum,
finished `group_time_raw=65536`, and mapped selected contact
`(time=38127, entity=0 slot=1 -> entity=1, WeaponBody, region=4)`. Separate absolute
division produces:

```text
plain  absolute = 34394996737/65536 = 524826 remainder 1
mirror absolute = 34324479999/65536 = 523749 remainder 65535
mapped mirror   = 1048576 - 523749 = 524827
```

Quantizing the signed response once instead gives plain `524288+538=524826` and
mirror `524288-538=523750`; their sum is exactly `1048576` (`16*ONE`). The retained
common residuals are exactly `+1/65536` and `-1/65536`, reconstruct the original exact numerators
on the next tick, and double reflection restores every frozen word. Smart53's held
anchor remains `published_body + Q(H-O)` and maps exactly.

The required mutations were observed red: zeroing the `+1` response remainder made
the frozen `524826|524827` witness false, and substituting the old absolute quotient
for `M+Q(R)` made the reflection sum `1048575`, not `1048576`. Both mutations were
restored.

## Non-interference rule

Use only `#[cfg(test)]` direct fixtures and pure helpers. Do not add a live call to
wide evaluation, quotient conversion, exact response, inverse mapping, or any other
fallible operation in `World::step`, `stage_exact_contact`,
`commit_exact_contact`, or `wide_rebase_owner_tick`. Do not add a diagnostic `?`,
branch, allocation, hash field, replay row, or browser export. Smart50 demonstrated
that an observing computation which can refuse is a behavior change.

## A -- freeze the successful body row

Beside the existing exact-contact tests in
[`crates/sim/src/world.rs`](../../crates/sim/src/world.rs), freeze the tick-32 body
motor point, owner common scale/mass, `at_group` raw/remainder, momentum raw/remainder,
group time, selected resolution, and already-computed absolute body quotient for both
orientations. The fixture must reproduce committed body Y `524826|524827` after the
same successful mapped contact and must contain no rejection path.

```rust
#[test] fn tick_32_body_fixture_reproduces_524826_524827_without_live_diagnostics() {}
#[test] fn tick_32_body_fixture_has_mapped_resolution_and_exact_owner_input() {}
```

## B -- direct rational publication oracle

Evaluate the body-origin Y rational from the frozen motor/common-response words and
print numerator, denominator, quotient, and remainder for plain and mirror. Establish
which affine reflection law the integer body column must satisfy about `y=8`:

```text
publish(reflect(O_exact)) == 16*ONE - publish(O_exact)
```

Compare the current absolute quotient with candidate canonical laws formed before
quantization: signed displacement from the declared reflection plane, or another
single exact relative rational followed by one quotient. The oracle must explain
`524826|524827` exactly and produce one mapped-equal integer pair without averaging,
one-raw compensation, tolerance, or fixture branch.

```rust
#[test] fn separate_absolute_body_quotients_expose_the_one_raw_reflection_difference() {}
#[test] fn body_origin_relative_to_reflection_plane_has_one_equivariant_quotient() {}
```

If no single relative quotient is exact, stop with the first unequal numerator,
denominator, or response remainder. Do not select a convenient rounding rule after
seeing only the final word.

## C -- prove the rebase law before proposing a fix

Current body rebase stores the exact residual against the published body word. For
each candidate publication law, derive the matching residual algebraically and
advance the frozen owner one tick. Require that evaluation reproduces the same
published body plus retained subraw displacement and that a second reflection returns
the original bytes. Also verify that Smart53's held-relative anchor remains
`published_body + Q(H-O)` and is not shifted by changing the body authority.

```rust
#[test] fn body_publication_and_common_rebase_advance_identically_next_tick() {}
#[test] fn reflecting_body_publication_and_rebase_twice_restores_every_exact_word() {}
#[test] fn body_quantization_does_not_change_held_relative_rebase_authority() {}
```

Mutation proof: zero the frozen common-position remainder and require fixture identity
to fail; replace the relative oracle with the current absolute quotient and require
the reflection-law test to fail. Restore the fixture.

Record exact rationals, current and candidate words, and the proven next-tick law in
this plan and durable research, then stop. A production repair and its pin ownership
require a later pre-code plan. Existing and new pin budgets are zero; do not run the
full audit, damage, policy, or Arena work.

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p sim tick_32_body_fixture --features cartesian-recoil -- --nocapture
cargo test -p sim separate_absolute_body_quotients --features cartesian-recoil -- --nocapture
cargo test -p sim body_origin_relative_to_reflection_plane --features cartesian-recoil -- --nocapture
cargo test -p sim body_publication_and_common_rebase --features cartesian-recoil -- --nocapture
cargo test -p sim reflecting_body_publication --features cartesian-recoil -- --nocapture
cargo test -p sim body_quantization_does_not_change_held --features cartesian-recoil -- --nocapture
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

No server or browser is needed. Smart54 is diagnostic-only.
