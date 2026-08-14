# Smart AI 110 -- name the later exact-scan refusal before mapping

**Status:** complete and reverted. Smart109's sound SegmentBody certificate
advanced the original two refusal intervals, then exposed later seed-0 failures that
the public channel collapsed to `Scan / ExactScan`, `key=None`, `pair=None` at
canonical tick `240 -> 241` and mirrored tick `148 -> 149`. Reapply the certificate
only long enough to name the first internal failing seam. This session changes no
production behavior permanently.

## A -- exact temporary reproduction

Temporarily reapply Smart109's reviewed certificate in
[`crates/sim/src/combat/contact.rs`](../../crates/sim/src/combat/contact.rs): retained
work, eight corners, deterministic endpoint separation/cross axes, strict projection
law, depth `16`, node bound `131071`, `Separated => time + 1`, and unresolved => the
existing `UnsupportedExactSweep`. First require all Smart108 certificate fixtures and
the two original Smart106 provenance controls green.

Run only Tactical versus Tactical seed `0`, once canonical and once mirrored, through
the first rejection. Freeze these reproduction words before adding diagnostics:

```text
canonical tick 240 -> 241, Scan/ExactScan, key None, pair None,
          command/state 1415213072758438895 / 191062832061666801
mirrored  tick 148 -> 149, Scan/ExactScan, key None, pair None,
          command/state 5049344267239224054 / 9535803509025357177
```

Do not run another seed, the 100-trial gate, a corpus or a policy variant. Digest the
World immediately before/after the diagnostic read and require the same ordinary
step, public rejection and receipts. If the temporary certificate does not reproduce
all literals, stop rather than diagnosing a different tree.

## B -- first internal failure before `exact_scan_error`

Add a feature/test-only caller-output record owned by
[`scan_detector_into`](../../crates/sim/src/combat/contact.rs), before
[`exact_scan_error`](../../crates/sim/src/combat/resolution.rs) maps every non-
`UnsupportedExactSweep` refusal to public `ExactScan`. Capture only already-computed
values at the first returned `Err`; never rerun a predicate or allocate while failing.

Use a typed stage enum with this complete ordering:

```text
Preflight
ScratchCapacity
PairOwnerLookup
PairSweptAabb
PairPrimitive
ExactCandidateStage
CertifiedEvidenceProjection
CertifiedEvidenceAlignment
ColliderIdentityLookupA
ColliderIdentityLookupB
FixedPoseRecompute
FixedPoseAbsent
FixedPoseIdentity
FinalCandidateCommit
```

The atomic record contains:

```text
tick/group boundary; stage; exact internal reject
trajectory/owner/collider counts; hostile supported-pair ordinal
optional i/j, key, shape pair, owner indices and primitive branch
required/actual len+capacity for candidates, exact_staging,
  certified_selections, certified_provenance and every retained wide/certificate Vec
preflight result and first owner/trajectory identity that disagreed, if any
certificate entry/result/nodes/depth for SegmentBody, if reached
staged candidate count and last staged key/time/region
selection/provenance counts and first unequal key/time, if any
identity lookup target and match count, if reached
fixed-pose Option/result plus selected vs recomputed key/region, if reached
```

For capacity failure, evaluate the existing condition once into named booleans and
record each required/actual pair before returning. For `Option::ok_or` and `?` sites
in evidence projection, collider lookup and fixed-pose recompute, replace only the
syntax with an explicit match that records the same error then returns it. Preserve
iteration, sort/dedup keys, capacities and return values byte-for-byte.

`first_pair_rejection` remains the public pair diagnostic. Smart110's internal record
is separate so a preflight/staging failure cannot masquerade as a geometry pair. It
is cleared once at scan entry, written once, and never consulted by selection,
resolution, hashing or policy. If multiple conditions could fail, record the first in
ordinary execution order.

## C -- focused proof and mutations

Add:

```rust
#[test] fn smart109_canonical_later_scan_names_its_first_internal_failure() {}
#[test] fn smart109_mirrored_later_scan_names_its_first_internal_failure() {}
#[test] fn exact_scan_internal_record_precedes_public_error_mapping() {}
#[test] fn exact_scan_internal_record_is_first_only_atomic_and_observational() {}
#[test] fn exact_scan_internal_record_names_preflight_capacity_pair_and_stage_controls() {}
```

The first two freeze every supplied tick/receipt and the new exact stage/cause/count
row. The mapping test requires that row to exist before the unchanged public
`Scan / ExactScan`, while `first_pair_rejection` remains `None` unless the named stage
is genuinely pair-local. The observational test compares state, commands, candidates,
published rows and all retained capacities with capture enabled/erased.

Construct direct failures for each stage family: malformed owner identity for
`Preflight`, one-short retained capacity for `ScratchCapacity`, a frozen pair
primitive refusal, erased `wide_toi` for evidence projection, misaligned evidence,
missing A/B collider identity, absent recompute, and recomputed key/region mismatch.
Make tests red by erasing the first record, recording after public mapping, relabeling
the diagnosed stage, overwriting it with a later failure and making capture call the
certificate a second time. Restore every mutation.

```powershell
cargo test -p sim --features cartesian-recoil smart109_canonical_later_scan -- --nocapture
cargo test -p sim --features cartesian-recoil smart109_mirrored_later_scan -- --nocapture
cargo test -p sim --features cartesian-recoil exact_scan_internal_record -- --nocapture
cargo test -p sim --features cartesian-recoil smart108_ -- --nocapture
cargo test -p sim --features cartesian-recoil synchronous_segment_body_axis -- --nocapture
cargo test -p lab --features cartesian-recoil smart103_first_moving_rejection -- --nocapture
```

Retain exact stdout or a log path, byte length and SHA-256. No live `println!`, second
scan, cloned World or diagnostic-only wide evaluation may remain.

## D -- stop and revert

Stop after naming the earliest internal stage/cause and exact operands for each
orientation. Do not fix that stage, alter the certificate, retune ordinal 3144, rerun
competence or touch Arena. A production decision requires a later pre-code plan based
on the two captured rows.

Revert the temporary Smart109 production certificate and all runtime diagnostic
fields/helpers. Test-only frozen fixtures may remain only if they compile into no
library or wasm artifact; otherwise revert them too. Require the original Smart106
first refusals and receipts restored after cleanup.

Expected pin moves are zero. Geometry, contact, stream, command, legacy and learned
pins, replay/hash grammar and all ABI versions remain unchanged. Run no wasm pin
measurement, corpus, competence gate or browser work.

```powershell
cargo test -p sim --features cartesian-recoil smart106_ -- --nocapture
cargo test -p sim --features cartesian-recoil
cargo test -p sim
cargo test -p lab --features cartesian-recoil smart103_first_moving_rejection -- --nocapture
node tools/check_docs.js
git diff --check
```

## Completed evidence

Both later failures occur at `Preflight`, before hostile pair ordinal `0`. The exact
internal cause is `Trajectory(NonCanonical)`, so the public `Scan / ExactScan` and
absent pair record were faithful but too coarse. At each failure the group boundary
is `0`, with `5` trajectories, `2` owners, `5` colliders, and zero staged candidates,
certified selections or provenance rows. Key, time, region and recompute are all
`None`.

The first invalid word in each orientation is the common-response Y momentum:

```text
canonical tick 240, owner 0, axis 1
  position raw/remainder 0 / 0
  momentum velocity_raw/remainder -4281 / +522941925551308800
  common_scale 1283938665662054400
  command/state 1415213072758438895 / 191062832061666801

mirrored tick 148, owner 1, axis 1
  position raw/remainder 0 / 0
  momentum velocity_raw/remainder +13220 / -27462693414
  common_scale 59914856794
  command/state 5049344267239224054 / 9535803509025357177
```

In each row the nonzero quotient and remainder have opposing signs, which violates
`validate_coordinate` even though the remainder magnitude is below the positive
scale. No combined rational momentum numerator was retained, and none is reconstructed
here. No log, SHA-256 or mutation count was reported. The temporary certificate and
runtime diagnostic were reverted; the Lab feature check, original refusal control and
diff check were green afterward. Smart111 must find the first producer of these
representations rather than relaxing preflight.
