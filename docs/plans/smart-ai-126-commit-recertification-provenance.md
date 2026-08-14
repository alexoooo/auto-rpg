# Smart AI 126 -- diagnose commit-recertification outcome loss

**Status:** planned diagnostic only. Smart125 is reverted. This session may
temporarily reproduce its exact branch and capture evidence, but no policy change,
retune, UI edit, pin move or competence claim may survive.

Smart125 raised total contacts from 484 to 564 and WeaponBody contacts from 472 to
537, yet reduced outcome-only body decisions from 55 to 49. One specific authority
hazard must be tested before another policy proposal: `choose_plan` certifies a
predicted chamber-to-commit sweep, while a planner called at the Commit boundary has
already spent its chamber ticks and immediately commands only the observed blade to
the refreshed commit endpoint.

## A -- freeze the two different sweeps

In [`crates/policy/src/articulated_tactics.rs`](../../crates/policy/src/articulated_tactics.rs),
under tests only, reconstruct Smart125's exact `choose_plan` transition without
changing the production planner. Add:

```rust
#[test]
fn commit_recertification_distinguishes_the_hypothetical_new_chamber_from_the_immediate_commit() {}
```

Use the same moving observation that made Smart125's focused test green. Capture:

- cached plan and actual observed weapon at the last Chamber command;
- refreshed `choose_plan` result, selected hand/region/chamber/commit bearings and
  height;
- `candidate_crosses`'s predicted new chamber segment and predicted commit segment;
- the actual observed weapon segment and the same predicted commit segment;
- both swept results against the current published region.

The diagnostic must state separately whether the hypothetical
`predicted_chamber -> predicted_commit` crosses and whether the authoritative command
that would actually execute, `observed_weapon -> predicted_commit`, crosses. Poison
the observed weapon so the two starts coincide and require the distinction to
disappear; replace the immediate start with the hypothetical chamber and require the
named diagnostic test to fail. Restore both mutations. Do not change tolerances or
invent an actuator reconstruction.

Also freeze the `None` case: when refreshed `choose_plan` has no candidate, record
the cached plan and current observed geometry but do not recommend a fallback in this
session.

## B -- first paired rollout divergence

Temporarily reproduce Smart125's exact transition in a diagnostic branch and run the
existing competence grammar in fixed order: canonical seeds `0..50`, then mirrored
seeds `0..50`, ticks ascending to 1,800. Run the unchanged baseline separately from
fresh process state. Stop detailed capture at the first command receipt divergence,
but complete the aggregate classification over all 100 trials.

At the first divergence record:

```text
orientation, seed, tick, subject and foe identity
sampled intent and phase/phase_started
cached and refreshed StrikePlan fields
observed weapon and target-region words
hypothetical chamber->commit crossing
actual observed->commit crossing
baseline and recertified command payloads
first later WW/WS/WB row, refusal and body outcome on each branch
```

Across all 100, count commit transitions by:

- unchanged plan;
- changed region only;
- changed arc/bearing with the same hand;
- changed hand;
- refreshed `None`;
- hypothetical crossing true / immediate crossing false;
- immediate crossing true;
- later WeaponBody contact, pre-refusal body outcome and final outcome.

Hash the ordered diagnostic rows with a new unregistered prefix
`ARPG-SMART126-COMMIT-PROVENANCE`; this is a receipt, not a pin. Preserve Smart125's
aggregate totals as the reproduction control. If they do not reproduce exactly, stop
at the first command/state receipt mismatch rather than interpreting the classes.

## C -- decision boundary

This session answers only whether the two-leg/immediate-leg mismatch explains the
regression and which transition class owns the lost six outcomes. It may conclude
that the hypothesis is false. It does not authorize a commit-only planner, cached
plan retention, different chamber duration, reach/arc/region weights, solver changes,
another 100-fight policy gate or Arena replacement.

Remove every temporary production branch and diagnostic after capture. Require the
controlled preset receipt and ordinary baseline receipts to return exactly, and the
policy suite to return to its pre-Smart125 count.

## Verification

```powershell
cargo test -p policy commit_recertification_distinguishes -- --nocapture
cargo test -p policy
cargo run --release -p lab --features cartesian-recoil -- articulated --competence-gate
cargo test -p lab --features cartesian-recoil tactical_competence -- --nocapture
node tools/check_docs.js
git diff --check
```

Retain the diagnostic stdout log with byte length and SHA-256. Report the exact first
divergence and aggregate classification, then revert. A result is evidence for a
separately predeclared successor, not permission to tune from this run.
