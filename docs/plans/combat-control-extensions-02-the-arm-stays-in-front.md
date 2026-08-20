# Combat control extensions 02 -- the arm stays in front

**Status:** future mechanics session; independent of 01.

The elbow annulus limits height and reach but permits a hand bearing directly behind the
torso. This session gives the simulator one anatomy-owned rear envelope. The browser may
show saturation, but it never owns the clamp.

## Law

After `reachable_extent` clamps height/reach, express the requested bearing relative to
the achieved `body_yaw` and clamp it to the shortest signed interval
`[-ARM_REAR_SWEEP_LIMIT_RAW, +ARM_REAR_SWEEP_LIMIT_RAW]`, with
`ARM_REAR_SWEEP_LIMIT_RAW = 24_576` (three eighths of a turn, 135 degrees). This permits
one eighth-turn of rear reach on either side but cannot point the arm directly backward.
The left/right law is an exact reflection.

The constant is provisional mechanics, not feel calibration: tests pin 24,575, 24,576 and
24,577 on both sides so it cannot drift wider or narrower. A later anatomy-specific value
requires its own measured session; it may not be hidden in a browser gain.

Projection is idempotent. An on-boundary or forward target remains byte-identical. Use
achieved torso yaw, not requested yaw. Route actuator input and commanded-target
publication through the same projected `ArmTarget`, so the diagnostic HUD reports the
target the joint actually chases.

The projection belongs beside the current
[`reachable_extent`](../../crates/sim/src/combat/limb.rs#L116) law. Its two consumers that
must agree are [`reachable_arm_target`](../../crates/sim/src/world/mod.rs#L1725) and
[`commanded_targets`](../../crates/sim/src/world/query.rs#L849); a third client-side copy
would violate the single authoritative owner.

## Files

| file | change |
|---|---|
| `crates/sim/src/combat/limb.rs` | rear-bearing constant and pure projection after the elbow annulus |
| `crates/sim/src/world/mod.rs` | limb-aware projection against achieved body yaw |
| `crates/sim/src/world/query.rs` | publish the projected commanded target |
| `crates/sim/src/world/articulated.rs` | actuator/path invariants |
| `crates/sim/tests/determinism.rs` | rerun/replay and reached-pin fixtures |
| `crates/lab/src/main.rs` | corpus measurement if reached |
| `crates/web/src/lib.rs`, `tools/wasm_check.js` | paired pin updates only after native measurement |
| `docs/design/combat.md` | authoritative rear envelope |
| `docs/reference/hashes.md` | measured reach and any permitted pin move |

## Tests

- `a_target_directly_behind_the_torso_projects_to_the_nearest_rear_boundary`
- `left_and_right_rear_envelopes_are_exact_reflections`
- `bearings_24575_24576_and_24577_pin_both_sides_of_the_limit`
- `a_target_on_or_ahead_of_the_rear_boundary_is_unchanged`
- `rear_projection_is_idempotent_after_the_elbow_annulus`
- `the_rear_limit_uses_achieved_body_yaw_not_commanded_yaw`
- `the_published_target_is_the_rear_limited_target_the_arm_chases`
- `a_rear_limited_run_reruns_and_replays_exactly`

Mutation-check by bypassing projection, using requested yaw, swapping the limb sign and
projecting publication only. Each associated test must fail.

## Hash expectations

This is a values-only mechanics move, not a digest grammar or ABI-layout move. Before
editing, trace all six relevant registry fixtures: `EMBODIED_CORPUS_DIGEST`,
`EMBODIED_GOLDEN_DIGEST`, `ARTICULATED_COMMAND_HASH`,
`EXACT_TRAJECTORY_STATE_DIGEST`, `LIFTED_COULOMB_SOLVER_DIGEST` and the independently
published `ARTICULATED_STREAM_DIGEST`. Corpus, golden and stream are probable movers.
The unstepped command fixture and both exact diagnostics remain unchanged only if their
concrete bytes never reach the projection; that is measured, not assumed. Re-record only
fixtures proven to reach the law, native first and then every wasm/registry mirror.

## Verification

Run the full default and `cartesian-recoil` sim/lab gates, corpus digest, 200-seed replay
verification, release build and both rebuilt wasm checks before the client/docs gates.
