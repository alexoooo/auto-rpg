# Smart AI 39 -- predeclared ordinary-strike corpus

**Status:** ready to implement. This declaration was revised before any Smart39
measurement was run. Smart38's failed centre and first neighbour remain evidence;
this session does not edit their bytes, tolerances, solver bounds, or recorded
failure. Existing registered-pin movement and new-pin budgets are both zero.

[Smart38 checkpoint C](smart-ai-38-bounded-lifted-coulomb-solver.md#checkpoint-c----retained-strike-and-robust-mirrored-mechanical-gate)
stopped exactly where its declaration required. This successor does not invent a
third grid after seeing that result. It reuses the bounded strong-strike grid already
declared and measured before the lifted solver existed in
[`strong_strike.rs`](../../crates/lab/src/strong_strike.rs#L350). That earlier run's
7,560 ordinary oriented fights found 312 individually eligible rows and zero eligible
mirror pairs under the old response law. Running the same bytes through the new law
is a comparison, not post-hoc tuning.

The session selects on contact mechanics only. Cut, thrust, pressure, integrity,
wounds, blood, severance, winner, and policy score cannot enter selection. Its exit
is one literal ordinary-command schedule which is productive on both mirrored sides
and under nine local timing/reach cases per side. Only after that schedule is fixed
does a separate outcome test ask whether its centre is a visibly strong wound. If
that test fails, do not choose a more damaging runner-up.

## Checkpoint A -- rerun the existing bounded grid

Keep the selector and measurement in
[`crates/lab/src/strong_strike.rs`](../../crates/lab/src/strong_strike.rs#L168).
Do not add a parallel corpus module or a second measurement implementation. Expose
the selector crate-privately to
[`tactical_mechanics.rs`](../../crates/lab/src/tactical_mechanics.rs#L251) and add
`tactical-mechanics --strike-corpus` to that command's existing argument refusal and
the help text in [`main.rs`](../../crates/lab/src/main.rs#L113). The CLI owns the
auditable release run; the ignored test below owns focused development.

This is Lab instrumentation, not another simulation path. Construct
`DuelConfigV1`, submit only ordinary `ArticulatedCommandV1` rows through
`World::submit_articulated_v1`, and step the public World. The defender submits the
neutral articulated command on every decision. Nothing writes pose, collider,
anatomy, velocity, exact owner state, or a contact row after `World::new`.

The central domain is exactly the literals already present in
[`strong_strike.rs`](../../crates/lab/src/strong_strike.rs#L350):

```rust
const INTERIOR_CHAMBER_TICKS: [u32; 7] = [8, 12, 16, 20, 24, 28, 32];
const INTERIOR_STRIKE_TICKS: [u32; 6] = [12, 16, 20, 24, 28, 32];
const INTERIOR_REACH_TARGETS_RAW: [i32; 5] =
    [32_768, 40_960, 49_152, 57_344, 61_440];
const APPROACH_OFFSETS: [Vec2; 9] = [
    Vec2::new(Fx::from_int(-3),       Fx::from_int(-1)),
    Vec2::new(Fx::from_int(-3),       Fx::ZERO),
    Vec2::new(Fx::from_int(-3),       Fx::ONE),
    Vec2::new(Fx::from_ratio(-5, 2),  Fx::from_int(-1)),
    Vec2::new(Fx::from_ratio(-5, 2),  Fx::ZERO),
    Vec2::new(Fx::from_ratio(-5, 2),  Fx::ONE),
    Vec2::new(Fx::from_int(-2),       Fx::from_int(-1)),
    Vec2::new(Fx::from_int(-2),       Fx::ZERO),
    Vec2::new(Fx::from_int(-2),       Fx::ONE),
];
```

Target anatomy order is `[Fighter, Brute]`; mirror order is `[false, true]`;
seed is `0`; the right arm attacks Legs at effort `ONE`; and the shipped loadout,
stats, target `(12, 8)`, and existing chamber/follow bearing construction remain
unchanged. Enumeration order is chamber ticks, strike ticks, reach raw, target
anatomy, approach offset, then mirror. This is
`7 * 6 * 5 * 2 * 9 * 2 = 7_560` oriented runs, or 3,780 mirrored central pairs.
Run every one and collect rejection counts. Remove the old `'grid` early exit:
neither the first eligible individual nor the first eligible pair ends the run.

### Mirror and central eligibility

Use the existing reflection across `y = 8`: approach offset `(x,y) -> (x,-y)`;
entity, faction, loadout, attacking hand, region numbering, and shipped yaw remain
unchanged. Derive the approach bearing from each actual spawn offset. The mirrored
chamber and follow commands must be the exact angular negations of the plain commands.
The shipped yaws zero and `HALF` are their own reflected headings. Add a focused test
for this transform before trusting pair counts.

Reuse the existing `interior_contact` predicate rather than creating a looser second
definition. A central side is mechanically eligible only when it has exactly one
uniquely attributed right-sword/body contact, the published crossing exists, contact
reach lies inclusively between `ONE/4 + 1_024` and `ONE - 1_024`, arm velocity plus
hilt and tip deltas are nonzero, selected impulse and physical dissipated energy are
nonzero, and command refusals, exact-solver rejections, competing facts, cap hits,
and energy increase are all zero. Revalidate restitution and the circular Coulomb
cone through Smart38's feature-only law helper rather than inferring validity merely
from publication.

Convert a central or local run immediately into a selection-only row. It may contain
case literals, mapped contact identity/region/TOI/point/normal/impulse, physical
dissipated energy, crossing and legality booleans, but no damage, anatomy, severance,
winner, or policy fields. The selection function accepts only this stripped type.

### Frozen local robustness corpus

For every centrally eligible mirrored pair -- not merely the first -- run this
literal local product around the centre while holding chamber ticks, anatomy,
approach offset, seed, command height, hand, effort, and all configuration bytes
fixed:

```rust
const STRIKE_TICK_DELTAS: [i32; 3] = [-1, 0, 1];
const REACH_DELTAS_RAW: [i32; 3] = [-256, 0, 256];
```

Enumeration is strike-tick delta outer, reach delta inner, then plain and mirror.
That is nine cases per side and eighteen oriented cases per central pair. Every
declared centre keeps these values legal: strike ticks remain positive and the
largest reach is `61_696`, below `ONE`. Run all eighteen cases for every centrally
eligible pair even after a robust pair has been found. This preserves a bounded,
complete result rather than making traversal order an accidental selector.

A pair is robust only when all eighteen local sides satisfy the central mechanical
predicate and every plain/mirror pair has the same mapped `ContactKey` and region,
exact physical dissipated energy, TOI within one raw word, and point, normal, and
impulse mapped by `(x,y,z) -> (x,-y,z)` within one raw word per component. These
tolerances are frozen here and cannot widen after a result.

Evaluate the complete central grid and all local cases belonging to every eligible
central pair. Among robust pairs, choose deterministically:

1. maximise the minimum physical `energy_dissipated_raw` across its eighteen cases;
2. minimise central `chamber_ticks + strike_ticks`;
3. minimise the central ordinal in the literal enumeration above.

The first key is maximin physical energy lost by the exact response, not allocated
damage. Print every central rejection count, every robust pair and its three-part
key, the selected literals, all eighteen selected mechanical rows, and an
unregistered audit checksum over the declared arrays plus those rows. The checksum
is a research receipt, not a golden and not authority.

Required tests:

```rust
#[test] fn the_existing_grid_has_7560_oriented_runs_and_no_early_exit() {}
#[test] fn the_strong_strike_mirror_negates_both_schedule_bearings() {}
#[test] fn the_local_freeze_is_strike_ticks_by_reach_and_has_eighteen_orientations() {}
#[test] fn mechanical_ranking_uses_worst_case_dissipation_then_duration_then_ordinal() {}
#[test] fn contradictory_damage_sidecars_cannot_change_mechanical_selection() {}
#[test] #[ignore = "bounded Smart39 corpus selection; use the release CLI for evidence"]
fn select_the_predeclared_ordinary_strike_corpus() {}
```

Make the no-early-exit test inject more than one eligible ordinal and assert every
declared central run and every eligible pair's eighteen local runs were visited.
Deliberately restore the old `'grid` break, invert the maximin comparison, and break
the mirrored follow bearing; watch the three corresponding tests fail, then restore
them.

Run the declared audit once, with no measurement-dependent arguments:

```powershell
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --strike-corpus
```

If no robust pair exists, stop. Record all mechanical rejection counts here and in
[`v2-articulated-contact-research.md`](../performance/v2-articulated-contact-research.md)
without adding an input, changing a tolerance, stopping early, or falling back to a
damaging individual row. A later plan may declare a different domain.

## Checkpoint B -- literal eighteen-case sim gate

Only after checkpoint A selects a pair, paste its anatomy, offset, chamber ticks,
strike ticks, reach raw, ordinal, and audit checksum into the feature-only fixture
beside
[`measure_ordinary_lifted_strike`](../../crates/sim/src/world.rs#L9736). Do not
derive selected values by rerunning the Lab search inside sim. Replace Smart38's two
ignored failed-corpus tests at
[`world.rs`](../../crates/sim/src/world.rs#L9817) with these gates:

```rust
#[test] fn selected_ordinary_strike_and_eighteen_cases_pass_the_mirrored_mechanical_gate() {}
#[test] fn selected_ordinary_strike_retains_both_remainders_across_the_following_tick() {}
#[test] fn mechanically_selected_centre_records_a_visibly_strong_wound_after_selection() {}
#[test] fn the_selected_held_control_is_inert() {}
#[test] fn the_selected_gate_refuses_direct_pose_or_exact_state_provenance() {}
```

The first two tests read mechanics only and repeat checkpoint A's mirror, local
strike-tick/reach product, eligibility, mapping, and one-word tolerances. The exact
remainder test remains in sim, where the feature-only test view already exists; do
not add a public Lab or browser ABI merely to select the corpus.

The third test runs only after the mechanical winner is literal. On each mirrored
centre it requires positive cut or thrust and at least `6_554` raw integrity loss in
the attributed region -- ten percent of `Fx::ONE`, rounded up. This outcome bar is
declared before the audit and earns “visibly strong”; it does not choose the corpus.
If the mechanically strongest robust centre misses it, stop and record that outcome.
Do not choose the next centre. The held control changes only attacking-arm effort
from `ONE` to `ZERO` and must produce no weapon/body contact, energy, anatomy change,
refusal, or cap.

Show both boundaries are real: temporarily zero the selected impulse before
publication and watch the mechanical gate fail before it reads damage; separately
raise the required integrity loss by one above the measured centre and watch only
the outcome gate fail. Restore both lines before the full gates.

Checkpoint B then replaces the ordinary schedule in
[`crates/sim/src/replay.rs`](../../crates/sim/src/replay.rs#L407) with the selected
literal centre, preserving that fixture's wall/cap purpose. It must restore at least
two accepted breakpoints, retain both exact remainder classes plus ordinary release,
and make live run, rerun, and recorded-command replay agree at every tick without an
`ExactSolver` refusal. This completes the missing ordinary-corpus prerequisite for
Smart38 checkpoint D; it does not itself register a digest.

## Checkpoint C -- evidence and handoff

Record the unchanged 7,560-run domain, rejection counts, selected literal, maximin
physical energy, all eighteen local mirror results, held control, and post-selection
wound evidence in the durable
[`articulated contact research record`](../performance/v2-articulated-contact-research.md).
Update Smart38's status in place to link this result. If A and B pass, resume Smart38
checkpoint D's native/rerun/replay/wasm digest work. Smart39 does not tune policy,
enable `cartesian-recoil` by default, create `ARTICULATED_HASH`, or claim the Arena
goal is complete.

## Pin budget

**Existing registered pin movement budget: zero.** `LAB_HASH`, `ROOM_HASH`,
`BATTLE_HASH`, `SWAP_HASH`, `BOW_HASH`, `ARTICULATED_COMMAND_HASH`,
`ARTICULATED_STREAM_DIGEST`, `CONTACT_BEHAVIOR_DIGEST`, contact-format pins, combat
fingerprints, `LEARNED_INFERENCE_DIGEST`, and any already-registered exact-trajectory
digest must remain byte-identical. The Lab audit checksum is not registered.

Smart39 may add no pin. `LIFTED_COULOMB_SOLVER_DIGEST`, if still absent, remains the
one-time native/wasm agreement owned by Smart38 checkpoint D after this corpus and its
ordinary replay pass. Any existing move stops the session and is not re-recorded.

## Verification

Run focused default and feature tests before the full gates. `wasm_check.js` checks
the artifact already on disk, so run it immediately after its matching build.

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p lab strong_strike -- --nocapture
cargo test -p lab --features cartesian-recoil strong_strike -- --nocapture
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --strike-corpus
cargo test -p sim selected_ordinary_strike -- --nocapture
cargo test -p sim --features cartesian-recoil selected_ordinary_strike -- --nocapture
cargo test -p sim --features cartesian-recoil exact_trajectory_replay -- --nocapture

cargo test -p sim
cargo test -p sim --features cartesian-recoil
cargo test -p lab
cargo test -p lab --features cartesian-recoil
cargo test

cargo test -p web
cargo test -p web --features cartesian-recoil
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
node --test tools/wasm_check.js

node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

No development server or browser is needed for this corpus session. Arena promotion
and visible review remain later boundaries after Smart38's digest and tactical
calibration pass.
