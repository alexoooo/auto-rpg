# Smart130 -- ordinal-31 controlled-arm provenance

**Status:** active next session. This is a bounded, feature-only Lab diagnosis of
the first mismatch frozen by Smart129. It changes no mechanics or policy, reads no
held-out row, and does not reopen the moving competence gate.

## Question and frozen input

Smart129 established that the controlled reference and held arms are solver-positive
on the same 198 Smart128 descriptors, but have unequal rejection counts on nine
rows. This session asks one narrower question at the earliest canonical mismatch:

> On ordinal 31's original active schedules, what is the first tick at which the
> reference and held solver-rejection deltas differ, or does one arm reach its
> original terminal boundary before such a difference is observable?

The sole descriptor is Smart128 ordinal `31`: seed `0`, mirrored `true`, target
`Brute`, approach offset raw `(-163840,0)`, spatial-right-hand mirror grammar and
observed-opponent bearing. Both arms use the existing 28-tick chamber and 28-tick
strike schedule at reach raw `65536`. Chamber effort remains raw `65536` in both.
The reference strike effort is raw `65536`; the held strike effort is raw `0`.
There is no neighbouring descriptor, unmirrored control, alternate horizon or
parameter sweep in this session.

The initial plan incorrectly equated the strike-phase boundary with the first
submitted strike command and therefore expected the first effort-only difference at
tick 28. A focused pre-production measurement superseded that premise: the strike
phase begins at tick 28, but the attacker has no pending decision and submits no
command on ticks 28--35. At tick 36 the pending list includes attacker and defender,
and the first requested and stored difference is only the attacker's right-arm
effort, raw `65536` to `0`. This is an input-schedule correction, not a contact,
solver or mechanics result.

The frozen Smart128 aggregate must be reproduced before the trace is interpreted:

| run | solver rejections | attributed contact | terminal tick |
|---|---:|---|---:|
| reference before | 7 | yes | 47 |
| held | 6 | no | 56 |
| reference after | 7 | yes | 47 |

The two reference brackets must remain equal. Reference ends at its first attributed
sword/body contact, exactly as `measure_case_schedule_with` does now. Held reaches
the original 56-tick maximum because it has no attributed contact. Do not extend the
reference to tick 56, truncate the held to tick 47, or reinterpret either count on a
shared replacement horizon.

## Lab-only implementation seam

Work only in these files:

- `crates/lab/src/strong_strike.rs:339`, beside `measure_case_schedule_with`, owns the
  frozen descriptor, schedule construction, trace rows and comparison;
- `crates/lab/src/tactical_mechanics.rs:452`, beside `incompatible_mode_refusal`, owns
  the mode, fail-closed execution and artifact publication;
- `crates/lab/src/args.rs:9` may expose the parsed option names needed to refuse every
  unrecognized input instead of silently accepting it;
- `crates/lab/src/main.rs:118` lists the new mode in help.

Do not edit `crates/sim` or `crates/policy`. Extract a private schedule descriptor or
`command_at` helper only if that is necessary to make the existing measurement and
the diagnostic share one command grammar. The extraction must not change
`measure_case`, its first-contact break or any corpus ordering.

Add feature-only `tactical-mechanics --ordinal-31-provenance --write PATH`. `--write`
is required and is an output destination, not a measurement override. The mode
accepts no other flag, pair or positional argument. In particular it refuses
`--seed`, `--ordinal`, `--ticks`, `--chamber`, `--strike`, `--reach`, `--effort`,
`--mirrored`, `--threads`, every other tactical mode, a bare `--write`, and an
unknown option, naming the offending input. Without `cartesian-recoil`, it refuses
the mode by name.

Run the bounded driver on one named 16 MiB thread if `World` cannot safely remain on
the MSVC main stack. The worker name and stack size are constants, not CLI inputs.
Worker start failure or panic is a refusal and publishes no artifact.

## Three executions of each scheduled run

Execute `reference_before`, `held`, then `reference_after`. For each scheduled run:

1. Construct two fresh worlds from the same scenario and seed. Generate the same
   requested command from each world's own observation, require the pending lists,
   requested commands, stored commands and receipts to agree, and step them as the
   live and rerun arms.
2. Record every stored articulated command, in submission order, in `sim::Replay`.
   A rejection-bearing `Stored` result or any `NotStored` result is a hard stop.
3. After every active tick, set `Replay::finish(tick + 1)`, call
   `Replay::play_until(tick + 1)`, and require the replay snapshot to equal both
   live snapshots. At the original terminal, also require `Replay::play()` to equal
   the final live state.
4. Stop that run only by its original Smart128 rule: first attributed sword/body
   contact or the 56-tick schedule maximum.

This produces live/rerun/replay equality for each reference bracket and the held
arm. It does not implement a second replay engine in Lab.

## Tick record and comparison boundary

Copy tick-local slices immediately after `World::step`, before the next step can
overwrite scratch. Each trace row records, in a fixed field order:

- tick before and after, pending entity IDs in order, and each entity's requested
  and stored `ArticulatedCommandV1::payload_bytes()`;
- submission receipt, `StateDigest` domain/schema/value before and after, and the
  first attributed-contact marker;
- `contact_solver_rejections()` before and after plus the tick delta,
  `contact_cap_hits()` before and after, and the full `contact_resolutions()` rows;
- `first_contact_rejection()`, `first_exact_contact_rejection()`,
  `exact_scan_pair_rejection()` and the complete
  `exact_contact_group_diagnostics()` slice;
- `exact_external_energy()` and the tick maximum of
  `energy.after_raw.saturating_sub(energy.before_raw)`, plus the cumulative
  strike-phase maximum used by Smart128;
- for attacker and defender, public articulated pose/grips and all five raw
  integrity and wound lanes, blood, shock and severed mask from
  `observe_articulated`.

The exact first-rejection diagnostic is cumulative; the scan-pair and group
diagnostics are tick-local. Preserve empty values rather than substituting the last
nonempty row. The state digest does not include the diagnostic-only rejection
counter, so digest equality never substitutes for the explicit counter comparison.

Compare reference-before with held only while both original schedules are active.
Predeclare three different boundaries:

1. Ticks `28`--`35` must contain no attacker submission. At tick `36`, the pending
   list must include attacker and defender and the first requested/stored command
   difference must change only the attacker's right-arm effort (`65536` versus `0`).
   The superseded tick-28 assumption confused a phase boundary with a decision-clock
   boundary. This expected tick-36 input difference is not the solver finding. Later
   command rows remain evidence and are not assumed equal after state diverges.
2. Report the first authoritative state-digest difference independently.
3. Compare the per-tick solver-rejection deltas and cumulative counts through the
   common active prefix. Stop the provenance comparison at the first solver-delta
   mismatch. If the reference reaches tick 47 first, report
   `terminal-boundary-before-solver-divergence` and do not extend it for comparison.

The individual held and reference runs still complete to their original terminals
to reproduce `7/contact@47`, `6/no-contact@56`, and the equal reference brackets.
No later cross-arm row is analysed after the preregistered solver or terminal
boundary.

Keep the boundary decision as data, not an incidental loop break. The implementation
shape is:

```rust
enum ProvenanceBoundary {
    SolverDelta { tick: u32 },
    TerminalBeforeSolverDelta { arm: ArmKind, tick: u32 },
}

for (reference, held) in reference.rows.iter().zip(&held.rows) {
    if reference.solver_delta != held.solver_delta {
        boundary = ProvenanceBoundary::SolverDelta { tick: reference.tick_after };
        break;
    }
    if reference.terminal || held.terminal {
        boundary = ProvenanceBoundary::TerminalBeforeSolverDelta {
            arm: if reference.terminal { ArmKind::Reference } else { ArmKind::Held },
            tick: reference.tick_after,
        };
        break;
    }
}
```

Evaluate the solver delta before the terminal flag on the same post-step row, so a
rejection difference on reference contact tick 47 is not incorrectly hidden by the
contact terminal.

## Artifact and fail-closed rules

Write deterministic ASCII, line-oriented
`smart130-ordinal31-arm-provenance-v1`. Encode command bytes as fixed lowercase hex,
integers explicitly, enums by fixed names and arrays in declaration order; do not
depend on map iteration. Include the frozen descriptor and scenario fingerprint,
the three terminal summaries, full recorded rows through each original terminal,
and one focused boundary section containing both arms' solver deltas and complete
first/scan/group diagnostics.

Publish only after every check passes. Create a sibling temporary with `create_new`,
flush it, and rename it to an absent destination. Refuse an existing destination or
temporary path. On a handled write or verification failure remove only the exact
temporary file created by this invocation. Never leave a partial final artifact.

Stop red, publish nothing, and do not run the second evidence pass if any of these
occurs:

- ordinal 31, its scenario fingerprint, schedule or first effort-only command
  difference is not the frozen one;
- a submission is refused, a cap is hit, or positive energy excess appears;
- live, rerun or replay differs in any recorded field at any active tick;
- the aggregate is not reference `7/contact@47`, held `6/no contact@56`, reference
  `7/contact@47`, or the two reference brackets differ;
- a solver-delta mismatch is reported after the common active prefix, or neither
  the earliest mismatch nor the earlier terminal is named exactly once;
- the worker or atomic writer fails.

Anatomy changes are recorded, not selected for and not used to choose the boundary.
This session must not infer that commanded effort caused a later state or solver
difference merely because effort is the first differing input.

## Tests and mutation proof

Add these exact Lab tests under `cartesian-recoil`:

- `ordinal_31_is_the_frozen_first_solver_count_mismatch`
- `ordinal_31_first_command_difference_is_right_arm_effort_at_tick_36`
- `ordinal_31_live_rerun_and_replay_match_every_active_tick`
- `ordinal_31_reproduces_the_reference_held_reference_bracket`
- `provenance_stops_at_the_first_solver_delta_or_earlier_terminal`
- `tick_local_exact_diagnostics_are_copied_before_the_next_step`
- `provenance_refuses_a_missing_or_reordered_replay_submission`
- `ordinal_31_provenance_refuses_every_measurement_override`
- `ordinal_31_provenance_artifact_is_byte_identical_and_atomic`

Use a test-only mutation enum at the trace/comparison seam. At minimum, show the
named tests red when (a) one copied solver-rejection event is suppressed coherently
from both its tick delta and cumulative count evidence, (b) one stored replay
submission is removed, and (c) the comparison is allowed to pass the earlier
terminal. Also mutate one tick-local group diagnostic and prove the live/rerun/replay
equality check fails. Restore every mutation before the production build; a passing
test without its witnessed red mutation is not accepted.

## Verification and evidence

Run the focused gates, then the complete feature Lab gate and documentation checks:

```powershell
cargo test -p lab --features cartesian-recoil ordinal_31
cargo test -p lab --features cartesian-recoil provenance
cargo test -p lab --features cartesian-recoil
cargo test -p sim --features cartesian-recoil exact_trajectory_live_rerun_and_replay_match_every_tick_and_breakpoint
node tools/check_docs.js
git diff --check
```

Commit the clean source and tests before producing evidence. From that one clean
MSVC x86-64 Windows commit, run the fixed command twice, sequentially, with a
final fixed 1800-second timeout per run:

```powershell
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --ordinal-31-provenance --write target/smart130-ordinal31-A.txt
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --ordinal-31-provenance --write target/smart130-ordinal31-B.txt
Get-FileHash -Algorithm SHA256 target/smart130-ordinal31-A.txt,target/smart130-ordinal31-B.txt
```

Require both exits `0`, byte-identical artifacts, equal SHA-256 values and no sibling
temporary files. The original 600-second bound was too short: evidence A from clean
source authority `e7b09120ca0974267e1d4ca04261922453cea30f` remained live until the
wrapper returned exit `124` at 600.073 seconds. Its preflight found no Cargo or Lab
process and neither final nor sibling temporary path; its postflight found neither
artifact, the same clean HEAD and no remaining process. It emitted no program
decision or refusal, B was not run, and the attempt is an operational non-result --
not a World timeout or mechanics result.

The completed focused trace took 1254.45 seconds and the complete feature Lab gate
took 1323.4 seconds, superseding the earlier 1--5 minute estimate and supporting the
final 1800-second bound. Do not extend it again. Restart A and B from one clean
docs-only descendant of the unchanged source authority above. If A fails or times
out, publish nothing and do not run B. If B fails or times out, A remains operational
evidence only and does not authorize a Smart130 decision.

## Decision boundary and pin budget

- A solver-delta mismatch inside the common active prefix authorizes only a new,
  separately planned diagnosis of the named tick, phase and group evidence.
- `terminal-boundary-before-solver-divergence` authorizes only a plan about the
  matched evidence protocol's unequal terminal exposure. It does not authorize a
  mechanics correction or a 56-tick reference extension in this session.
- Receipt, replay, bracket or instrumentation failure authorizes repair of this
  diagnostic only.

There is no tuning, held-out run, competence run, training or promotion on any
branch. No registered hash is expected to move: all legacy pins,
`ARTICULATED_COMMAND_HASH`, `ARTICULATED_STREAM_DIGEST`,
`EXACT_TRAJECTORY_STATE_DIGEST`, `LIFTED_COULOMB_SOLVER_DIGEST`,
`CONTACT_BEHAVIOR_DIGEST` and `LEARNED_INFERENCE_DIGEST` remain unchanged.
