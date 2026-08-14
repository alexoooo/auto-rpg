# Smart AI 58 -- contact-velocity publication diagnosis

**Status:** complete on 2026-08-13. All eight focused tests are green and the declared
mutations were red and restored. The first failure is weapon centre-of-mass sampling
in `World::build_contact_colliders`, not exact response publication: ordinary `Fx`
multiplication floors the mirrored `swing*balance` product. Smart58 changed no
production behavior, hash, pin, trace, corpus, policy, damage, or Arena UI. Smart59
owns the one-operation landing.

The frozen Y words are hilt delta `1180`, tip delta `7470`, swing `6290`, balance
`36044`, with exact product:

```text
plain:   6290*36044 = 226716760 / 65536 = 3459 remainder 27736
mirror: -6290*36044 = -226716760 / 65536 = -3459 remainder -27736
```

Ordinary `Fx` multiplication publishes `3459|-3460`; hand velocity
`1180|-1180` therefore produces sampled/final contact velocity `4639|-4640`.
Componentwise `mul_div(swing,balance,Fx::ONE)` truncates the signed exact product once
and produces `3459|-3459`, hence `4639|-4639`. At recompute, common response `C=0`
and held response `H=0`; key.b's base, response and final velocity are all zero.
Thus `wide_response_velocity`'s existing `Q(C+H)` is proven innocent for this row.
Restoring ordinary multiplication reproduced the mismatch; perturbing the zero
response/row ownership broke the downstream controls. All mutations were restored.

## Non-interference rule

Use only `#[cfg(test)]` fixtures and pure, bounded test helpers. Do not add a live
diagnostic, momentum evaluation, conversion, branch, allocation, `?`, state column,
hash word, replay row, ABI field, or browser export to scan, recompute, resolution,
stage, commit, or `World::step`. Recreate the already-successful row outside the
authoritative run. Smart50 proved that a fallible observer in production can suppress
the contact it claims to diagnose.

## A -- freeze collider sampling before response

The primary hypothesis is upstream of `wide_response_velocity`. In the test module of
[`crates/sim/src/world.rs`](../../crates/sim/src/world.rs), freeze the real inputs by
which [`World::build_contact_colliders`](../../crates/sim/src/world.rs) samples the
weapon at its centre of mass:

```text
hand_velocity
hilt_delta = requested_hilt - previous_hilt
tip_delta  = requested_tip - previous_tip
swing      = tip_delta - hilt_delta
equipment balance
swing * balance
sampled velocity = hand_velocity + swing * balance
velocity_offset  = sampled velocity - hand_velocity
```

Capture every XYZ raw word for plain and mirror, plus the multiplication's exact
signed numerator and denominator before conversion to `Fx`. The likely first boundary
is ordinary `Fx` multiplication in `swing * balance`: its floor-style negative result
need not be the negation of its positive result. This is a hypothesis, not permission
to replace it with `mul_div`; the fixture must prove the exact numerator/remainder and
show the preceding hand/hilt/tip/swing words already map.

Then, in the test module of
[`crates/sim/src/combat/contact.rs`](../../crates/sim/src/combat/contact.rs), extend
Smart56's successful-row fixture with the real post-response
`ExactContactTrajectory`, `ExactOwnerTrajectory`, and the collider velocity/offset
produced above for both key.a and key.b. Call
[`exact_contact_at_pose`](../../crates/sim/src/combat/contact.rs) directly at time
`38127` and reproduce `velocity_a.y=4639` plain versus mirrored mapped `4640`.

Freeze for each side and each axis:

```text
compatibility/base velocity V
owner common scale and momentum (velocity_raw, remainder)
held mass and held momentum (velocity_raw, remainder), or explicit absence
exact common rational C
exact held rational H
exact combined response C+H
published response Q(C+H)
final contact velocity V+Q(C+H)
```

Do this for both a and b even though a.y is the first unequal published word. Assert
the mapped key, TOI, region, point, normal, impulse-independent fact identity and all
other velocity components so the oracle cannot drift to a different row.

```rust
#[test] fn tick_32_successful_row_reproduces_velocity_a_y_4639_4640() {}
#[test] fn tick_32_weapon_com_sample_names_its_first_oddness_failure() {}
#[test] fn tick_32_contact_velocity_fixture_freezes_both_owner_rows() {}
#[test] fn tick_32_resolution_words_before_velocity_a_remain_mapped() {}
```

## B -- name the first vector quotient boundary

First trace `build_contact_colliders` from hand velocity through COM sampling. Only
then trace the downstream construction in
[`wide_response_velocity`](../../crates/sim/src/combat/contact.rs) and
[`exact_contact_at_pose`](../../crates/sim/src/combat/contact.rs), without using a
positional affine frame. Velocity is a vector: reflection requires Y negation and
X/Z identity, not reflection about `8*ONE` or translation by a body origin.

For common and held terms separately print the exact rational numerator,
denominator, quotient and remainder for plain/mirror. Then print their exact sum,
the single quotient, compatibility `V`, and final addition. Assert at every boundary:

```text
C_mirror.y == -C_plain.y
H_mirror.y == -H_plain.y
(C+H)_mirror.y == -(C+H)_plain.y
Q(C+H)_mirror.y == -Q(C+H)_plain.y
V_mirror.y == -V_plain.y
```

Treat `wide_response_velocity`'s existing `Q(C+H)` as a control unless its frozen
words disprove oddness. The first failure determines ownership. Explicitly
distinguish:

- hand/hilt/tip/swing are odd but the COM `swing * balance` sample is not;
- exact common or held momentum/remainder already fails oddness;
- common and held are odd separately but were individually quotiented before sum;
- exact `C+H` is odd and `Q` is odd, but compatibility `V` is not;
- both terms are odd but their final addition is assembled from a stale or wrong row.

Truncation toward zero of one signed exact rational is the candidate publication law:
`publish_velocity = Q(V_exact)`, with `Q(-x)=-Q(x)`. Do not round, compensate one raw
unit, average mirrors, use tolerance, or reuse Smart57's positional shared frame.

```rust
#[test] fn common_and_held_velocity_rationals_name_the_first_oddness_failure() {}
#[test] fn combined_exact_velocity_is_quotiented_once_for_each_contact_side() {}
#[test] fn contact_velocity_is_a_vector_and_uses_no_position_frame() {}
```

If compatibility `V` is the first failure, the world fixture above is its required
pre-quotient provenance; do not merely negate the observed integer. A test-only
`fx::mul_div(swing, balance, Fx::ONE)` is the candidate odd-symmetric oracle only if
the exact product diagnosis proves it. It must preserve the positive word and make
the negative word its exact opposite. No production helper changes in Smart58.

## C -- direct oracle and mutations, then stop

For each of a and b, form the complete exact contact velocity rational before
publication, including the exact compatibility/motor term plus common and optional
held response, and quotient the final signed rational once. Require plain/mirror Y
quotients to be opposites and X/Z to match. Require the frozen `ContactFact` to differ
only at the diagnosed velocity word(s); point, normal, TOI, key, region and selection
remain byte-identical.

```rust
#[test] fn complete_exact_contact_velocity_is_odd_for_a_and_b() {}
#[test] fn one_velocity_quotient_repairs_only_the_frozen_velocity_words() {}
```

Mutation proof: in the test oracle only, use ordinary `Fx` multiplication for the COM
sample and require `4639|4640` to return; use the proven exact signed product quotient
and require `4639|-4639`. Independently perturb the already-odd `Q(C+H)` control and
require the downstream composition test to fail. Restore the green test oracle. This
is evidence for a later production plan, not authorization to edit live code.

Record exact rational words, the responsible function, both sides' corrected vector
words, and mutation results in this plan and durable research, then stop. Smart58 has
zero existing-pin moves and zero new pins. Do not run the full trace, audit, corpus,
policy, damage, server, or browser.

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p sim tick_32_successful_row_reproduces_velocity --features cartesian-recoil -- --nocapture
cargo test -p sim tick_32_weapon_com_sample --features cartesian-recoil -- --nocapture
cargo test -p sim tick_32_contact_velocity_fixture --features cartesian-recoil -- --nocapture
cargo test -p sim tick_32_resolution_words_before_velocity --features cartesian-recoil -- --nocapture
cargo test -p sim common_and_held_velocity_rationals --features cartesian-recoil -- --nocapture
cargo test -p sim combined_exact_velocity --features cartesian-recoil -- --nocapture
cargo test -p sim contact_velocity_is_a_vector --features cartesian-recoil -- --nocapture
cargo test -p sim complete_exact_contact_velocity --features cartesian-recoil -- --nocapture
cargo test -p sim one_velocity_quotient_repairs --features cartesian-recoil -- --nocapture
cargo test -p sim --features cartesian-recoil
cargo test -p sim
cargo test -p fx
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

`wasm_check.js` checks the artifact already present; each call follows its matching
build. No trace, corpus, server, or browser is needed.
