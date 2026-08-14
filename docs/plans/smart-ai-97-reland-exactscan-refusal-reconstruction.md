# Smart AI 97 -- reconstruct the Smart96 ExactScan refusal

**Status:** complete. The recovered Smart96 boundary is tick `79`, phase `Recompute`,
public `ExactScan`, WeaponBody fighter RightArm to brute `BODY_SLOT`: selected `902`,
one scan candidate, one mapped member, zero recomputed facts. Its provenance is
`CompatibilityFallback`, Legs region, accepted root `902`, zero visits and feature
`0`. The cause is earlier than Smart96 staging: proven-zero
`scan_detector_into` returns compatibility candidates before exact certification.
Smart97's hooks were reverted. No production behavior, pin, tolerance, bound, audit
or corpus changed. Smart98 owns the feature-path early-return correction.

## A -- reconstruct exactly the stopped reland in a test seam

Work in cfg(test) code in `crates/sim/src/combat/contact.rs`,
`crates/sim/src/combat/resolution.rs` and `crates/sim/src/replay.rs`. Do not edit the
feature production path used by ordinary builds. Extract the smallest callable test
driver that composes the already-proven pieces exactly as Smart96 did:

1. compatibility candidate enumeration;
2. retained `try_reserve(64)` for selection, canonical facts, parallel provenance
   and wide scratch;
3. boundary-started exact certification for every enumerated WW/WS/WB pair;
4. `(time,key)` selection and one-to-one provenance pairing;
5. canonical fixed-pose staging before suppression; and
6. clear/rescan after an accepted group.

Drive the byte-identical replay scenario and commands through loop index `79` and
beyond until the first public refusal. Freeze the restored control separately:

```text
restored baseline public cause   ResolutionCount
reconstructed reland cause       ExactScan
```

The cfg(test) reconstruction must reproduce `ExactScan` before any cause hook is
trusted. If it does not, stop and record the first state/selection difference from
the stopped Smart96 run rather than diagnosing a nearby program.

```rust
#[test] fn smart96_reconstruction_reproduces_exactscan_not_baseline_resolutioncount() {}
#[test] fn smart96_reconstruction_uses_the_declared_reserve_and_parallel_evidence() {}
```

Mutation proof: bypass exact certification and require restoration of the baseline
`ResolutionCount`; omit reserve or evidence pairing and require a different named
precondition failure. Restore both mutations.

## B -- capture first phase, key and internal cause without changing authority

Add a cfg(test)-only forced hook passed explicitly through the reconstruction. It is
not stored on `World`, not public, not hashed, and never runs in feature production:

```rust
struct ExactScanFailureTrace {
    tick: u32,
    group_ordinal: u8,
    phase: RelandPhase,
    key: Option<ContactKey>,
    pair_indices: Option<(usize, usize)>,
    internal: ExactScanReject,
    selection_time: Option<u32>,
}

enum RelandPhase {
    CompatibilityEnumeration,
    ExactRowLookup,
    ExactCertification,
    SelectionEvidencePairing,
    CanonicalRecompute,
    DiagnosticProjection,
    ClearAndRescan,
}
```

At every existing `Result<_, ExactScanReject>` boundary in the reconstructed reland,
record only if the trace is empty, then return the original error unchanged. Coupled
or preflight failures with no unique pair keep `key=None`; never accuse the first
sorted row. A pair-owned failure records the exact key and unique indices. Subsequent
errors cannot overwrite the first trace.

Capture the internal enum variant and any existing nested trajectory subtype without
collapsing it to `CompatibilityIdentity` or `ResolutionError::ExactScan`. Do not add
new arithmetic evaluation, retry, candidate, fallback or allocation merely to enrich
the trace.

```rust
#[test] fn smart96_reland_names_the_first_exactscan_phase_key_and_internal_cause() {}
#[test] fn coupled_reland_failure_does_not_invent_a_contact_key() {}
#[test] fn later_reland_errors_cannot_replace_the_first_trace() {}
```

Mutation proof: move capture one boundary later; collapse the internal cause; assign
the first mapped key to a keyless failure; overwrite on a later error. Each test must
go red and be restored.

## C -- force each seam to validate attribution

Provide cfg(test)-only forced refusal injection before each reland phase. The hook is
an explicit parameter such as `Option<ForcedRelandFailure>`; it does not branch in
production and cannot mutate authoritative inputs. For each phase assert:

- exact tick/group;
- key presence only when the phase owns a unique pair;
- chosen time presence only after certification;
- the injected internal cause survives unchanged; and
- selection, canonical fact, suppression, resolution, trajectory and diagnostic
  staging remain unchanged before the failing phase's atomic commit.

```rust
#[test] fn forced_reland_failures_name_every_phase_without_partial_commit() {}
#[test] fn forced_canonical_and_projection_failures_clear_fact_and_evidence_together() {}
```

Include forced `CompatibilityIdentity`, `ArithmeticEnvelope`, `Budget`, trajectory
failure, canonical `None`, key mismatch, region mismatch and stale evidence pairing.
Canonical `None`/mismatch may use the Smart96 named detail, but its public mapping
remains `ExactScan`. A log line printed under `--nocapture` is supplemental only; the
test must assert the returned trace struct exactly.

Mutation proof: commit one fact before a forced second-fact failure; retain projected
`wide_toi` after forced mismatch; report selection time during enumeration. Each
atomicity/phase test must fail and be restored.

## D -- direct frozen-input oracle and stop

Once the real reconstructed refusal is named, freeze its exact input rows and call
that phase directly twice: once as reconstructed and once with only the diagnosed
precondition corrected in cfg(test). This is a diagnostic counterfactual, not a fix.
Record the exact before/after outcome and the next phase reached. If the correction
does not remove the refusal, the proposed cause is incomplete and Smart97 stops
without a successor.

Revert all hooks and reconstruction helpers after recording:

- public cause `ExactScan`;
- tick/group/phase;
- exact key or justified `None`;
- pair indices and selection time when owned;
- exact `ExactScanReject`/nested subtype;
- forced-hook mutation evidence; and
- direct counterfactual result.

Only then may a new pre-code plan authorize a narrow production correction. Smart97
runs no pin measurement/update, wasm digest, full feature suite, Smart87 geometry,
mechanics audit, damage selection or 7,560-case corpus.

```powershell
cargo test -p sim smart96_reconstruction_reproduces_exactscan_not_baseline_resolutioncount --features cartesian-recoil -- --nocapture
cargo test -p sim smart96_reconstruction_uses_the_declared_reserve_and_parallel_evidence --features cartesian-recoil -- --nocapture
cargo test -p sim smart96_reland_names_the_first_exactscan_phase_key_and_internal_cause --features cartesian-recoil -- --nocapture
cargo test -p sim coupled_reland_failure_does_not_invent_a_contact_key --features cartesian-recoil -- --nocapture
cargo test -p sim later_reland_errors_cannot_replace_the_first_trace --features cartesian-recoil -- --nocapture
cargo test -p sim forced_reland_failures_name_every_phase_without_partial_commit --features cartesian-recoil -- --nocapture
cargo test -p sim forced_canonical_and_projection_failures_clear_fact_and_evidence_together --features cartesian-recoil -- --nocapture
cargo test -p sim --no-run --features cartesian-recoil
cargo test -p sim --no-run
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

## Completed reconstruction

The reconstructed reland's first rejection is:

```text
tick                    79
phase                   Recompute
public cause            ExactScan
key                     fighter RightArm -> brute BODY_SLOT, WeaponBody
selected_time_raw       902
scan_candidates         1
mapped_time_members     1
recomputed_facts        0
wide primitive          CompatibilityFallback
region                  Legs
accepted_root_raw       902
visit_count             0
closest_feature         0
```

Those words prove the Smart94/96 exact-certification code was not reached: an exact WB
sweep would report `SegmentBodyRegion`, nonzero visits and the already-proven root
`905`. `scan_detector_into` detects proven-zero response and returns immediately from
the compatibility dispatcher, preserving the compatibility candidate at `902`; the
driver maps it, canonical recompute correctly returns `None`, and phase Recompute maps
that empty member to public `ExactScan` in the temporary reland.

This supersedes reserve/provenance as explanations for the Smart96 first refusal.
Those Smart95 repairs remain valid integration requirements, but the first root cause
is the zero-response early return. Diagnostic reconstruction and hooks were reverted.
The correction boundary is feature exact scanning only: non-feature and explicitly
compatibility callers retain their existing proven-zero compatibility contract.
