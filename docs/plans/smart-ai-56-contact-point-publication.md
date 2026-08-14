# Smart AI 56 -- contact-point publication diagnosis

**Status:** complete on 2026-08-13. All seven frozen-oracle tests are green and both
declared mutations were red and restored. The successful exact recompute row keeps
TOI `38127`, `WeaponBody`, Legs region `4`, and mapped key/velocities; its point alone
first publishes as `514088|514089`. Smart56 proves three publication boundaries and
the shared-frame point/normal authority without changing production behavior. No pin,
trace, corpus, policy, damage, or Arena work ran. Smart57 owns the landing.

The exact closest Y words are:

```text
A plain  = 52291122109816685043510180080016864147
           /103775061921195370460915180666880
         = 503889 remainder 9933407471017330090608963367827
A mirror = 56524917219262671732914416402937498733
           /103775061921195370460915180666880
         = 544686 remainder 93841654450178040370306217299053
B plain/mirror = 524288/1 exactly
```

Thus separate absolute `Q(A)` already maps as `503889|503890`; `Q(B)` happens to be
exact, and integer `midpoint(Q(A),Q(B))` is the third non-equivariant boundary,
producing the observed `514088|514089`. With key.a owner's integral tick-start body
motor frame `M0=458752|589824`, direct
`M0+Q(((A+B)/2)-M0)` publishes `514088|534488`, whose sum is exactly `1048576`.
Publishing both endpoints in that same frame gives
`[503889,524288]|[544687,524288]`: each pair sums to `1048576` and their deltas are
opposites, so the normal maps too. Mutating the point oracle back to midpoint of
absolute endpoint quotients restored `514088|514089`; independently restoring
absolute A/B publication broke the endpoint/normal reflection proof. Both mutations
were restored.

## Non-interference rule

Use only `#[cfg(test)]` fixtures and pure test helpers. Do not add a live diagnostic,
wide conversion, closest-point recomputation, branch, allocation, `?`, state column,
hash word, replay row, ABI field, or browser export to candidate selection,
resolution, staging, commit, or `World::step`. The row must be observed by recreating
its frozen successful inputs outside the authoritative run; no diagnostic is allowed
to refuse or suppress contact.

## A -- freeze the successful row before decomposing it

In the test module of
[`crates/sim/src/combat/contact.rs`](../../crates/sim/src/combat/contact.rs), freeze
the successful tick-32 `ExactContactTrajectory`, `ExactOwnerTrajectory`, and
compatibility rows already used by the focused ordinal fixture. Drive
[`exact_contact_at_pose`](../../crates/sim/src/combat/contact.rs) directly at the
now-equal accepted time. The identity inherited from Smart48/49 is:

```text
weapon previous  [[678151,451563,26213],[799703,500607,26213]]
weapon requested [[677638,452743,26213],[796458,508077,26213]]
Legs previous/requested [[786432,524288,0],[786432,524288,52428]]
radii [2621,19660], toi 38127
entity 0 slot 1 -> entity 1 BODY_SLOT, WeaponBody, region 4
```

The listed segment words identify the selected scan input; the fixture must retain
the real post-response exact trajectories and owners used by recompute rather than
pretend those compatibility endpoints are the recomputed closest pair. Reflect Y
about `8*ONE` and map the held slot. First prove that both frozen candidates retain
the same TOI, key, kind, region, velocities, group ordinal, alpha, impulse, energy,
and channels, while constructing the shipped `ContactResolution.fact.point`
reproduces `514088|514089`. Record the current normal too: it is downstream of the
same endpoint quotients and may contain a latent mismatch even though point is the
first published unequal word. This prevents a point-only oracle from silently
diagnosing a different candidate.

```rust
#[test] fn tick_32_successful_row_reproduces_resolution_point_514088_514089() {}
#[test] fn tick_32_resolution_words_other_than_point_map_exactly() {}
```

## B -- locate all three non-equivariant quotient boundaries

Recreate, one boundary at a time, the production successful-row path in
[`exact_contact_at_pose`](../../crates/sim/src/combat/contact.rs):

1. accepted `TimeOfImpact(38127)` and the selected region;
2. the exact wide closest rationals returned by `wide_segment_body_at_time`;
3. separate absolute `wide_point_to_vec3(closest.a)` and
   `wide_point_to_vec3(closest.b)` quotients;
4. `make_candidate`'s midpoint of those two already-quantized integer endpoints.

For every boundary assert X/Z equality and the exact Y affine mapping about
`16*ONE`. Print the pre-division numerator, denominator, quotient, and remainder on
both sides. The diagnosed chain contains three non-equivariant boundaries: absolute
quotient of closest A, absolute quotient of closest B, then integer midpoint of the
two quotients. Tests must name each rather than stopping after the first visible point
word. Do not substitute the legacy compatibility recomputation: the trace row comes
from exact recompute after response.

```rust
#[test] fn reflected_resolution_point_provenance_names_its_first_unequal_word() {}
#[test] fn exact_recompute_closest_a_and_b_expose_both_absolute_quotients() {}
#[test] fn integer_midpoint_of_quotiented_endpoints_exposes_the_third_boundary() {}
```

Test-only provenance may copy private ratios into a compact fixed struct, but it must
not expose private types, raw remainders, or diagnostics through `sim`'s public API.
Use fixed arrays, not a `Vec`, so the oracle is bounded and allocation-free.

## C -- direct canonical oracle and mutation proof

Use the integral tick-start body motor origin `M0` belonging to `ContactKey.a`'s owner
as the canonical affine frame. From the exact wide closest points, compute the exact
midpoint before any quotient and publish each component as:

```text
point = M0 + Q(((A + B) / 2) - M0)
```

This must map `514088` to its exact reflected word without separately publishing A
or B and without an integer endpoint midpoint. Also diagnose the normal's latent
dependency: publish A and B individually as `M0+Q(A-M0)` and `M0+Q(B-M0)` before
forming their delta/normal. Both endpoints must use the same `M0`; two absolute
frames can reproduce the point symptom under a different name.

```rust
#[test] fn exact_midpoint_relative_to_key_a_motor_origin_maps_exactly() {}
#[test] fn closest_endpoints_relative_to_one_motor_origin_make_normal_map_exactly() {}
```

Mutation proof: replace the direct point oracle with `midpoint(Qabs(A), Qabs(B))` and
require `514088|514089` to return; independently restore absolute A/B publication in
the normal oracle and require its endpoint/reflection assertion to fail. Restore the
green test helpers. This proves the future authority without editing production.

Record the exact first unequal numerator/denominator/quotient/remainder, responsible
function, and green candidate law in this plan and durable research. Stop. A later
pre-code plan must own any production repair and predict its pins. Smart56 has zero
existing-pin moves, zero new pins, and must not run the full mirror trace, full audit,
or 7,560-case corpus.

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p sim tick_32_successful_row --features cartesian-recoil -- --nocapture
cargo test -p sim tick_32_resolution_words_other_than_point --features cartesian-recoil -- --nocapture
cargo test -p sim reflected_resolution_point_provenance --features cartesian-recoil -- --nocapture
cargo test -p sim exact_recompute_closest --features cartesian-recoil -- --nocapture
cargo test -p sim integer_midpoint_of_quotiented --features cartesian-recoil -- --nocapture
cargo test -p sim exact_midpoint_relative_to_key_a --features cartesian-recoil -- --nocapture
cargo test -p sim closest_endpoints_relative_to_one --features cartesian-recoil -- --nocapture
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

No trace, corpus, server, or browser is needed. `wasm_check.js` checks the artifact
already present, so each invocation follows its matching build.
