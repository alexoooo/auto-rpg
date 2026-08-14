# Smart AI 107 -- trace SegmentBody conservative-advance progress

**Status:** complete; both named pairs terminate in the overlapping sub-raw interval
branch. The mirrored row exposes every requested rational. The canonical row's large
closest/separation/safe-step values exceeded the diagnostic's `i128` conversion and
were reported `None`, so it cannot yet decide whether the interval contains contact.
Smart108 owns a 4096-bit swept separation certificate. No correction is proposed.

## A -- exact frozen pair inputs, not another moving search

Work only under `#[cfg(test)]` in
[`crates/sim/src/world.rs`](../../crates/sim/src/world.rs) and
[`crates/sim/src/combat/contact.rs`](../../crates/sim/src/combat/contact.rs#L2532).
Reproduce `Scenario::articulated_duel()`, Tactical versus Tactical, seed 0 and the
ordinary decision loop through canonical tick 210 and mirrored tick 110. Before the
rejecting step, freeze these Smart106 pair identities:

```text
canonical  collider 0 Body entity0 slot255 owner0
           collider 4 Segment entity1 slot1 owner1
mirrored   collider 1 Segment entity0 slot1 owner0
           collider 3 Body entity1 slot255 owner1
group time 0; both present; swept AABB supported and not disjoint
```

Assert every identity/shape/owner/presence word before invoking a helper. Copy the
named exact trajectories, owner rows and colliders into independent test scratch with
the same declared capacities as production. The helper must run
`wide_sweep_segment_body`'s current region order and arithmetic on those copies; it
must not call or mutate the live World's scan, recompute, solver, projector or step.
Digest the live World before/after the helper and require equality, then execute the
one ordinary rejecting step and require the same Smart106 phase/cause/pair row.

Do not search another seed, tick, pair, tolerance or target region. Canonical and
mirror are two named controls, not candidates to choose between.

## B -- bounded per-region and per-visit record

Add a `#[cfg(test)]` caller-output trace beside
[`wide_segment_body_at_time`](../../crates/sim/src/combat/contact.rs#L2329),
[`wide_segment_body_speed`](../../crates/sim/src/combat/contact.rs#L2399),
[`wide_safe_step`](../../crates/sim/src/combat/contact.rs#L2416), and
[`wide_sweep_segment_body`](../../crates/sim/src/combat/contact.rs#L2532). Keep private
wide rationals private; the test record may own their exact canonical
numerator/denominator words because it compiles into no library or wasm artifact.

The bound is the production bound: five anatomy regions in ordinal order, at most 96
visits each, at most 480 visit rows. Reserve once before replay and refuse test capture
growth. For every present region record:

```text
region ordinal and presence
region swept-AABB result over [group_time,65536]
L1 relative speed exact numerator/denominator
visit ordinal and time_raw
closest A and B XYZ exact numerator/denominator; closest feature
distance_sq, combined radius, radius_sq
signed separation = distance_sq - radius_sq
d = L1(A-B)
safe-step denominator = (d + radius) * speed
safe-step quotient exact numerator/denominator
floor_nonnegative result and applied advance=min(step,65536-time)
distance-vs-radius comparison and decision
```

Use a typed decision enum with exactly the production exits:

```text
RegionAabbDisjoint
AbsentRegion
ContactAtCurrentTime
SeparatedAtTickEnd
ZeroRelativeSpeed
PositiveAdvance
ZeroAdvanceAdjacentContact
ZeroAdvanceAdjacentSeparatedIntervalDisjoint
UnsupportedSubRawInterval
Budget
ArithmeticOrTrajectoryRefusal(cause)
```

For `step == 0`, record adjacent `time+1`, its closest A/B/distance/radius comparison,
and the one-word region AABB result. `UnsupportedSubRawInterval` is only the exact
production branch where current and adjacent integer times are separated but the
one-word swept AABBs are not disjoint. Record the returned
`ExactScanReject` beside that decision. If either named control fails through a
different branch, preserve it rather than forcing this expected label.

Print canonical and mirror rows without mapping away raw words, followed by a second
mapped comparison that reflects Y and Left/Right slots. Preserve region ordinals
under the existing LeftArm/RightArm reflection law. No floating point, abbreviated
hash in place of a rational, or formatted `Fx` decimal is admissible evidence.

## C -- direct oracles and mutations

Add:

```rust
#[test] fn smart106_canonical_segment_body_names_its_first_root_progress_failure() {}
#[test] fn smart106_mirrored_segment_body_names_its_first_root_progress_failure() {}
#[test] fn smart106_segment_body_progress_replays_the_production_cause_branch() {}
#[test] fn smart106_segment_body_progress_is_bounded_and_leaves_world_unchanged() {}
#[test] fn smart106_segment_body_progress_maps_regions_and_rationals_under_reflection() {}
```

The first two freeze every row through the first terminal branch, including the exact
region, visit, time, closest/radius/separation/speed/quotient/advance words. The third
requires the traced terminal cause equal the ordinary World's
`ExactUnsupportedSweep` and copied pair diagnostic. The fourth requires capacity
`480`, no growth, clean reuse, unchanged World digest and exactly one later World
step. The fifth compares the two independently captured controls after the declared
mapping; it reports rather than tolerates the first unequal rational word.

Make tests red independently by changing region order, substituting whole-body for
region radius, replacing L1 speed, rounding the quotient upward, turning a zero step
into one, omitting the adjacent comparison, and treating overlapping one-word AABBs
as proof of separation. Restore every mutation. These are diagnostic sensitivity
tests, not candidate fixes.

```powershell
cargo test -p sim --features cartesian-recoil smart106_canonical_segment_body -- --nocapture
cargo test -p sim --features cartesian-recoil smart106_mirrored_segment_body -- --nocapture
cargo test -p sim --features cartesian-recoil smart106_segment_body_progress -- --nocapture
cargo test -p sim --features cartesian-recoil
cargo test -p lab --features cartesian-recoil smart103_first_moving_rejection -- --nocapture
node tools/check_docs.js
git diff --check
```

Retain exact stdout or a log with path, byte length and SHA-256. Remove temporary live
prints. The test-only trace helper may remain only if it is unreachable from normal
feature/default builds.

## D -- stop boundary and pins

Stop after naming the first divergent/terminal region iteration and exact cause
branch for each named orientation. Do not alter `wide_safe_step`, root selection,
one-word interval refusal, AABB law, region order, visit budget, policy schedule,
ordinal 3144, damage, or the competence gate. A correction requires a new pre-code
plan supported by both traces.

Expected registered pin moves are zero. No production code is changed, so geometry,
contact, stream, command, legacy and learned pins, hash grammar, replay and ABI must
all remain unchanged. Smart104/105 stay blocked. Run no corpus, retune, full competence
gate, wasm promotion or browser verification.

## Completed evidence

Canonical seed 0 reaches Legs region `4`, visit `21`, at raw times `22139 -> 22140`.
Relative L1 speed is exactly `227512707351111 / 1963290027425792`, closest feature is
`0`, combined radius is `23592`, and radius squared is `556582464`. Both current and
adjacent integer times are separated, the one-word swept AABBs overlap, safe-step
floor/applied advance are `0`, and the terminal decision/cause is
`UnsupportedSubRawInterval / ExactUnsupportedSweep`. The current closest B is:

```text
[23485155949256547/29957428397,
 17438878133318434/29957428397,
 16966]
```

Closest A.z is also `16966`. Closest A.x/y and the derived distance, separation,
`d`, denominator and safe-step quotient exceeded the trace's `i128` diagnostic and
were printed `None`. No compact fingerprint or hash was captured. This is a measured
diagnostic limitation, not arithmetic evidence that those values are absent.

Mirrored seed 0 reaches Torso region `1`, visit `16`, at raw times `58016 -> 58017`.
Its complete row is:

```text
speed       2441/16384
feature     2
A           [1709143409/2048,1027213835/2048,29484499/512]
B           [1733923963/2048,973610325/2048,29484499/512]
distance^2  435926517608377/524288
radius      28835
radius^2    831457225
separation  3472027577/524288
d           1224751/32
denominator 5241976711/524288
quotient    3472027577/5241976711
floor       0
applied     0
adjacent distance^2 446385983253156161/536870912
one-word AABB overlap true
decision/cause UnsupportedSubRawInterval / ExactUnsupportedSweep
```

These are two independently first-rejecting moving rows at different ticks and body
regions; they are not asserted to be reflected copies of one local state. Four focused
tests passed. Changing the recorded region by `+1` and changing the one-word AABB
result from overlap to disjoint each made a named test red; both mutations were
restored. No retained log or SHA-256 was reported. The evidence establishes why the
integer-time scan refuses, but endpoint separation plus AABB overlap does not answer
whether continuous contact actually occurs inside either one-word interval.
In separating-axis terms, the diagnostic found no separating axis for either swept
one-word AABB. That result only keeps each pair in the narrow phase: it is neither a
contact certificate nor a proof that the moving medial segments remain separated.
