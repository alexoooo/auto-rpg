# Smart AI 43 -- exact actuator reflection

**Status:** stopped at the registered-pin firewall on 2026-08-13. The diagnosed
odd-symmetric correction to the two Y products passed its focused actuator tests,
but the default native web test moved `ARTICULATED_STREAM_DIGEST` from expected
`17857803620601665921` (`0xf7d3a9c73aa59981`) to actual
`544318744924908936` (`0x078dcf03bbd5ed88`). Smart43 budgeted zero registered-pin
moves, so the actuator source and tests were fully reverted. The ordinal-1536 trace
and full 7,560-case audit did not run.

The stop is informative: a default scripted pose stream reaches the same two
products, so exact reflection is not behavior-neutral for existing articulated
fixtures. Smart44 is the successor that may own this one values-pin move; Smart43
does not re-record it or add trace tolerance.

## Reflection law

At yaw zero, reflection across `y = 8` maps:

```text
LeftArm <-> RightArm                 bearing a -> -a
bearing speed s -> -s               height/reach/fatigue/residues -> identical
relative hand/velocity (x,y,z) -> (x,-y,z)
absolute hand (x,y,z) -> (x,16-y,z)
```

For the Smart41 grammar the two body yaws are `ZERO` and `HALF`, both fixed by angle
negation, so this is an integer-coordinate law rather than an approximate geometric
comparison. More generally, reflecting yaw and bearing by angular negation must swap
shoulders, preserve the forward component, negate the body-left component, and
preserve Z. This law applies to
[`hand_position`](../../crates/sim/src/combat/actuator.rs#L108),
[`integrate_arm_unbilled`](../../crates/sim/src/combat/actuator.rs#L242), and
[`integrate_arm_with_recoil`](../../crates/sim/src/combat/actuator.rs#L297), including
active post-contact COM response. `Angle::sin` is already exactly odd and cosine
exactly even; do not edit `fx` or its sine table.

## Checkpoint A -- name the first arithmetic operation

Add a focused test beside `integrate_arm_unbilled` using the exact ordinal-1536
source-41 tick-entry states, Fighter anatomy, swapped sword/shield items, stats,
authority, rates, and commands captured by Smart42. Run the plain right and reflected
left arm for one tick and compare after each substage:

1. inertia and available authority from `arm_available`;
2. bearing/height/reach errors and each `chase` result;
3. updated scalars, speeds, fatigue, work and authority residues;
4. `shoulder`;
5. `arm_length * reach`;
6. `(bearing.cos(), bearing.sin())`;
7. direction multiplied by physical reach;
8. shoulder plus displacement in `hand_position`;
9. final hand and linear velocity;
10. recoil COM offset/update when active.

The test must name and pin the first unequal intermediate raw pair. Do not patch
`hand.y` by one at the output: the correction belongs at the first non-equivariant
operation.

Required tests:

```rust
#[test] fn ordinal_1536_tick_one_names_the_first_non_reflecting_actuator_operation() {}
#[test] fn sine_is_odd_and_cosine_even_at_the_ordinal_1536_bearing() {}
#[test] fn mirrored_shoulders_and_direction_times_reach_are_exact_before_addition() {}
```

If the sine/cosine test fails, stop: that contradicts the `fx` contract and is not an
actuator-local change.

## Checkpoint B -- repair the primitive, not the fixture

After A names the operation, introduce the smallest shared helper in
[`actuator.rs`](../../crates/sim/src/combat/actuator.rs#L103) at the first unequal
primitive. The leading candidate is the polar product in `hand_position`: ordinary
`Fx * Fx` uses an arithmetic right shift, hence rounds a negative non-integral
product down while the corresponding positive product rounds toward zero. If A
confirms that diagnosis, use a sign-symmetric product built from the existing checked
integer vocabulary (or the existing truncation-toward-zero `mul_div` primitive) for
the paired shoulder/polar operations. Apply the same primitive to every term the
reflection law pairs; do not patch the final Y coordinate. If A instead names an
addition, correct that addition and leave multiplication unchanged.

Both `hand_position` and any recoil path reconstructing the same polar displacement
must use the repaired primitive. Do not branch on mirrored mode, ordinal, a fixture,
or the observed one-raw difference. A limb distinction is allowed only if A proves it
is the mathematical canonicalization of the `LeftArm <-> RightArm` law for all
declared cases, rather than a correction for ordinal 1536.

The likely hazard is rounding/parenthesization: mapped terms can agree separately
while rounded world-space sums differ. Use the existing checked deterministic integer
vocabulary. No float, host-dependent intrinsic, unchecked arithmetic, or new
authoritative remainder. If exactness needs a retained remainder/layout rather than a
local evaluation order, stop and author an architecture plan.

Required bounded tests:

```rust
#[test] fn hand_position_is_exact_under_left_right_forward_plane_reflection() {}
#[test] fn one_arm_step_is_exact_under_reflection_at_every_declared_boundary() {}
#[test] fn active_recoil_arm_step_is_exact_under_reflection() {}
#[test] fn fatigue_work_and_all_residues_are_identical_under_reflection() {}
#[test] fn ordinal_1536_tick_one_post_step_pose_is_exactly_mapped() {}
```

Cover both anatomies and limbs; yaw `[ZERO, QUARTER, HALF, THREE_QUARTER, 1731]`
paired with its exact negation;
bearing `[0,1,4096,8192,21845,32767,32768,49152,65535]`; reach
`[ARM_MIN_REACH_RAW,32768,61440,65536]`; three heights; zero/positive effort; and
bearing/linear error at `[-max,-1,0,1,max]`. Use literal stable loops, no RNG.

Mutation proof: restore the old arithmetic and watch the ordinal plus bounded tests
fail. Add a compensating `+1` limb branch and watch another bounded case fail. Restore
production before gates.

## Checkpoint C -- pin firewall and focused trace

Run default goldens before interpreting feature results. `LAB_HASH`, `ROOM_HASH`,
browser hashes, `ARTICULATED_COMMAND_HASH`, `ARTICULATED_STREAM_DIGEST`,
`CONTACT_BEHAVIOR_DIGEST`, combat fingerprints, inference digest, and registered
exact-state pins must remain byte-identical. Smart43 adds no pin. Any move stops the
session.

Then run only:

```powershell
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536
```

It must advance past tick 1 and remain mapped-equal through every chamber/follow tick
plus one following tick across Config, Command, PreStepPose, PostStepPose, Resolution,
Rejection, and CrossingOracle. Success is `phase=none` with the complete tick count.
A later first divergence is recorded by exact tick/phase/pair/cause and stops this
session; do not repair a second subsystem here.

Only equality through the schedule permits a later plan to declare a full audit.
Smart43 itself does not run it, tune mechanics/damage/policy, promote the feature,
register a digest, or open the Arena.

## Verification

Record A's first unequal intermediate, correction, pin results, and trace result in
[`v2-articulated-contact-research.md`](../performance/v2-articulated-contact-research.md).

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p sim ordinal_1536_tick_one -- --nocapture
cargo test -p sim hand_position_is_exact_under -- --nocapture
cargo test -p sim --features cartesian-recoil active_recoil_arm_step -- --nocapture
cargo test -p sim --features cartesian-recoil ordinal_1536_tick_one -- --nocapture
cargo test -p sim
cargo test -p sim --features cartesian-recoil
cargo test -p lab
cargo test -p lab --features cartesian-recoil
cargo test
cargo test -p web
cargo test -p web --features cartesian-recoil

cargo run --release -p lab -- hash
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
node --test tools/wasm_check.js
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536

node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

`wasm_check.js` checks the artifact already present; run it after its matching build.
No development server or browser is needed.
