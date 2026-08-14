# Smart AI 60 -- next-tick hand provenance

**Status:** complete on 2026-08-13. All six focused tests are green and the declared
mutations were red and restored. Every tick-33 resolution, owner/rebase, committed
hand/recoil and tick-34 entry word maps. The first failure is tick-34 recoil actuator
`next_offset=(new-old)*balance`: ordinary `Vec3*Fx` floors the mirrored Y product one
word farther. Smart60 changed no production behavior, hash, pin, trace, corpus,
policy, damage, or Arena UI. Smart61 owns the single-product landing.

```text
old/new direction Y  27667|-27667 -> 30738|-30738
old/new length offset 55334|-55334 -> 61476|-61476
delta                 6142|-6142; balance 36044
ordinary Fx product   3378|-3379; mul_div 3378|-3378
com_accel/max          102|614
legacy relative hand -14040|14041; published 441359|441358
oracle relative hand -14040|14040
```

Direction-times-length already maps and remains a control. Restoring ordinary
multiplication reproduced the final mismatch; perturbing an earlier retained
commit/recoil word made ordered provenance fail earlier. Both mutations were restored.

## Non-interference rule

Use only `#[cfg(test)]` frozen fixtures and pure/infallible test capture of values the
authoritative path has already computed. Do not add a runtime wide evaluation,
conversion, inverse pose call, branch, allocation, `?`, state column, hash word,
replay row, ABI field, or browser export. No diagnostic may change whether contact is
accepted, staged, committed, rebased, or integrated. Smart50's false green remains
the reason this boundary is strict.

## A -- freeze both sides of the tick boundary

In the test module of [`crates/sim/src/world.rs`](../../crates/sim/src/world.rs), drive
the focused ordinal through tick 33 with cumulative Smart51/53/55/57/59 repairs and
copy the already-computed rows into fixed structs. For the hero's mapped attacking
limb, capture plain/mirror at these exact boundaries:

1. selected `ContactResolution` identity, impulse and now-equal fact;
2. solved `ExactOwnerTrajectory` before rebase;
3. output of [`wide_rebase_owner_tick`](../../crates/sim/src/combat/contact.rs), every
   common and held `at_group`, momentum raw/remainder and group time;
4. staged `ExactArmCommit`: `hand`, `linear_velocity`,
   `post_contact_com_velocity`, `replace_recoil`;
5. committed `ArmState`: `previous_hand`, `hand`, `linear_velocity`, fatigue,
   work residue, post-contact velocity and active flag;
6. stored `World::exact_owners` after commit;
7. tick-34 retained contact entry and command/target/authority/item/yaw/anatomy inputs
   before `drive_articulated_arms`.

Map Left/Right limb identity before comparing, negate Y vector fields, reflect Y
positions about `16*ONE`, and compare X/Z directly. The test must report the first
unequal scalar word in this order, not merely assert final hand.

```rust
#[test] fn tick_33_commit_to_tick_34_entry_names_the_first_unequal_word() {}
#[test] fn tick_33_rebased_exact_owner_maps_every_common_and_held_word() {}
#[test] fn tick_33_arm_commit_and_committed_recoil_map_before_next_actuation() {}
```

If a tick-33 commit/rebase word is first, stop there. Do not proceed by overwriting it
with its mirror. Record its exact rational source and quotient boundary.

## B -- decompose the next actuator without re-diagnosing fixed products

Only if every tick-33 and tick-34-entry word maps, pass the frozen `ArmState` and
inputs directly to [`integrate_arm_with_recoil`](../../crates/sim/src/combat/actuator.rs)
in a `#[cfg(test)]` fixture. Capture, in production order:

```text
entry_bearing, entry_hand, entry_com, was_active
integrate_arm_unbilled output bearing/height/reach and forward hand
old/new equipment direction, segment length, balance, next_offset
com_accel and com_max
per-axis error, desired_hand, desired_com, clamped delta, next_com
free_hand, requested hand, crosses predicates
chosen hand, linear_velocity, desired_com after choice
post_contact_active and retained post_contact_com_velocity
fatigue/work residue inputs and outputs
```

The two actuator Y product corrections from Smart44/51 and Smart59's COM sampling are
already landed. Assert their exact mapped products as controls; do not assume the
first later mismatch licenses another global multiplication change. In particular,
freeze old/new direction Y as `27667|-27667` and `30738|-30738`; prove their length
products `55334|-55334` and `61476|-61476` map; then isolate delta `6142|-6142` times
balance `36044`. Ordinary `Vec3*Fx` produces `3378|-3379`, while componentwise signed
`mul_div` produces `3378|-3378`. Keep the integer `update` clamp, crossing decision
and fatigue billing separate so relative hand `-14040|14041` is assigned to this
first source rather than a later consumer.

```rust
#[test] fn tick_34_recoil_actuator_provenance_names_its_first_unequal_word() {}
#[test] fn tick_34_fixed_actuator_products_remain_exact_mirror_controls() {}
#[test] fn tick_34_crossing_choice_and_post_contact_lifetime_are_mapped() {}
```

Do not use `inverse_hand`, recompute contact, or derive a new authoritative pose in
the diagnostic. The returned `ArmState.hand` is the pose word under diagnosis.

## C -- direct oracle and mutation, then stop

Once the first unequal word is known, construct the smallest pure rational/integer
oracle for that one boundary. It must preserve all earlier captured words, make the
tick-34 hand map as `plain_y + mirror_y == 16*ONE`, and leave the opposite arm and
body byte-identical. No tolerance, averaging, one-raw compensation or fixture branch
is allowed.

Mutation proof: restore the exact diagnosed operation in the test oracle and require
`441359|441358` to return. Independently perturb the immediately preceding retained
owner/recoil word and require the provenance ordering test to fail earlier. Restore
the green oracle. This proves diagnosis only; a later pre-code plan must own any
production repair.

Record the first unequal word, exact numerators/denominators/remainders or integer
operands, responsible function, candidate law and mutation results in this plan and
durable research, then stop. Smart60 has zero existing-pin moves and zero new pins.
Do not run the full mirror trace, audit, corpus, policy, damage, server, or browser.

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p sim tick_33_commit_to_tick_34_entry --features cartesian-recoil -- --nocapture
cargo test -p sim tick_33_rebased_exact_owner --features cartesian-recoil -- --nocapture
cargo test -p sim tick_33_arm_commit_and_committed_recoil --features cartesian-recoil -- --nocapture
cargo test -p sim tick_34_recoil_actuator_provenance --features cartesian-recoil -- --nocapture
cargo test -p sim tick_34_fixed_actuator_products --features cartesian-recoil -- --nocapture
cargo test -p sim tick_34_crossing_choice --features cartesian-recoil -- --nocapture
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
