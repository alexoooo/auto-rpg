# Smart AI 106 -- name the first moving-duel exact rejection

**Status:** complete; diagnosis stops at the SegmentBody primitive. Both seed-0
orientations reproduce a first `Scan / ExactUnsupportedSweep` rejection with no
contact key. The copied pair evidence names a supported, overlapping SegmentBody
branch at group time zero; Smart107 owns its internal conservative-advance progress.
No policy, mechanics, tolerance, pin or Arena default changed.

## A -- fixed first-rejection order

Add `articulated --competence-rejection-provenance` beside the competence gate in
[`crates/lab/src/main.rs`](../../crates/lab/src/main.rs#L1126), behind
`cartesian-recoil`. It accepts no measurement-changing override. Reuse exactly seeds
`0..50`, tick cap 1,800, Tactical on both sides,
the canonical and reflected `Scenario::articulated_duel()` fixtures, and fresh policy
instances.

Define "first" before reading a row as lexicographic
`(seed, mirrored false before true, tick)`. Drive each fixed trial only until its first
increment of `World::contact_solver_rejections`; collect its row, then choose the
minimum tuple across all 100 trials. Do not use thread completion order, contact count,
damage, outcome or rejection cause to choose it. If any trial has no rejection, record
that fact but do not promote it over an earlier tuple. A second run must select the
same tuple and bytes.

The diagnostic observes the normal decision loop. It must not call a second
`world.step`, contact scan, exact recompute, solver, projector or policy decision.
Immediately after the rejecting authoritative step, copy the already-published:

```text
seed, mirrored, tick before/after
contact_solver_rejections before/after
first_contact_rejection
first_exact_contact_rejection: tick, phase, cause, optional key
all exact_contact_group_diagnostics for that tick
  group ordinal, selected time, scan/mapped/recomputed/closure/driver/lifted/output counts
  reject detail, mapped/recomputed keys
  compatibility_sweep and wide_toi evidence including pair, region and primitive
submitted command record ordinal and state/command digest receipts
```

The optional rejection key stays `None` when authority supplies none. Do not accuse
the first sorted group member by convenience. If a key exists, require it appear in
the named group's mapped/recomputed/evidence rows as appropriate; if it does not,
print the absence and stop rather than manufacture a pair or primitive.

## B -- policy-stage and geometry provenance

Use concrete `TacticalArticulatedPolicy` instances in the diagnostic so their public
`diagnostics()` can be sampled before and after the one ordinary `decide` call. For
each fighter on the rejecting tick, freeze:

```text
subject/opponent IDs and faction; policy phase and sampled intent
StrikePlan opponent, region, hand, chamber/commit bearings and height, or None
threat/opponent-recovering flags
observed body position/yaw, arm length, hand radius
observed weapon hilt/tip/radius for both hands
observed target region lower/upper/radius/present
offered and stored body yaw, move, intent, both arm bearing/height/reach/effort/grip
submission rejection, if any (Smart103 says the total must remain zero)
```

For a present plan, independently reconstruct only the policy's documented predicted
chamber/commit segments from those public observation and command words. Label them
`policy_prediction`; they are not collider or solver authority. Separately identify
the rejecting pair's authoritative primitive solely from the copied group
`wide_toi`/`compatibility_sweep` row. For WeaponBody, print the named weapon segment
and body-region capsule; for WeaponWeapon, both segments; for WeaponShield, the
segment and shield corners. Include previous/requested raw endpoints and radii when
the authoritative evidence publishes them. Never substitute a predicted segment for
a missing authoritative row.

Add a frozen direct test after the first run records literals:

```rust
#[test] fn smart103_first_moving_rejection_names_seed_mirror_tick_and_phase() {}
#[test] fn smart103_rejection_key_names_its_group_pair_and_primitive_or_is_explicitly_none() {}
#[test] fn smart103_policy_stage_geometry_is_the_single_offered_command() {}
#[test] fn smart103_provenance_capture_does_not_step_scan_solve_or_decide_twice() {}
#[test] fn smart103_first_rejection_is_independent_of_thread_completion_order() {}
```

The frozen test must compare every captured integer/enum/optional word, not formatted
debug text. Preserve policy prediction and authoritative geometry as distinct structs.

## C -- mutation and commands

Make named tests red independently by erasing the exact rejection, changing its tick
or phase/cause/key, selecting a later seed/orientation, swapping wide and compatibility
primitive provenance, copying the policy-predicted pair into the authoritative row,
and calling policy `decide` twice before capture. Restore every mutation. Also rerun
with one and four diagnostic worker threads; the selected tuple and receipt must be
identical even though completion order differs.

```powershell
cargo test -p lab --features cartesian-recoil smart103_first_moving_rejection -- --nocapture
cargo test -p lab --features cartesian-recoil smart103_rejection_key -- --nocapture
cargo test -p lab --features cartesian-recoil smart103_policy_stage_geometry -- --nocapture
cargo test -p lab --features cartesian-recoil smart103_provenance_capture -- --nocapture
cargo run --release -p lab --features cartesian-recoil -- articulated --competence-rejection-provenance
cargo test -p sim --features cartesian-recoil
cargo test -p policy
node tools/check_docs.js
git diff --check
```

Record exact stdout, wall time and any retained log path/byte length/SHA-256. If no log
is retained, say so. Remove temporary print hooks; the bounded Lab diagnostic and
typed tests may remain because they observe existing public evidence and cannot reach
authoritative state.

## D -- stop boundary and pins

Smart106 stops after naming the first exact phase/cause/key, pair/primitive, group
boundary and policy-stage geometry. It does not fix the cause or generalize from one
row. A correction, if justified, requires a new pre-code plan and a replay of the
unchanged Smart103 95/100 gate.

Expected registered pin moves are zero. `ARTICULATED_STREAM_DIGEST` remains
`0xdbbd86fedd61c4c7`; geometry/contact/command/legacy/learned pins, state grammar,
replay codecs and all ABIs remain unchanged. Smart104 stays blocked. Do not run a new
corpus, retune ordinal 3144, change policy selection, update a pin, enable the Arena
default or perform browser verification in this session.

## Completed evidence

The bounded diagnostic ran seed 0 in both orientations. Canonical first increments
the rejection counter `0 -> 1` across tick `210 -> 211`; mirrored does so across
`110 -> 111`. Both exact rows are:

```text
phase=Scan cause=ExactUnsupportedSweep key=None group_time_raw=0
aabb_supported=true aabb_disjoint=Some(false)
branch=SegmentBody reject=UnsupportedExactSweep
```

Canonical pair provenance is collider indices `0,4`, entity/owner `0,1`, with
`Body(slot=255,present=true) -> Segment(slot=1,present=true)`. Mirrored is indices
`1,3`, entity/owner `0,1`, with
`Segment(slot=1,present=true) -> Body(slot=255,present=true)`. The missing key is
authoritative: the primitive refuses before it can publish a region candidate and
therefore before a `ContactKey` exists.

Canonical used exactly 211 steps and decision counts `[18,12]`; mirrored used 111
steps and `[10,7]`. Offered and stored commands were equal and no submission was
refused. Policy diagnostics and offered/stored command words were captured, but their
stdout literals were not retained and are not reconstructed here. Receipts were:

```text
canonical command 0xb253af14209d3b54 state 0xe89532e009d7dd50
mirrored  command 0x27dab82def0eafac state 0x2c826ddcb0629f86
```

All five focused typed tests passed. Erasing the exact diagnostic made its named test
red; changing the pair branch from `SegmentBody` to `SegmentShield` made the pair test
red; both mutations were restored. No output log or SHA-256 was retained. Smart106
therefore proves the controller submitted legal commands and locates the first lost
contact authority inside SegmentBody scanning, but it does not prove which region,
iteration or conservative-advance branch causes that primitive to refuse.
