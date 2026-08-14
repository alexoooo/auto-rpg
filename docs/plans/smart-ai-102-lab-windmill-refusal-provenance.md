# Smart AI 102 -- diagnose the Lab windmill refusal

**Status:** Lab and policy corrections green; workspace stopped later in web. The default seed-5
windmill's sole refusal is tick `2564`, `EnergyNumerator`, in a two-key zero-allocation
group. The corrected Lab suite is green at `79 passed / 0 failed / 5 ignored`, and its
count/cause mutations are red. The full workspace then stopped in policy's
`an_empty_off_hand_does_not_lengthen_the_arm_it_hangs_from`: the guard-reach exact
equality failed even though both formatted values print `0.8101`. The raw audit found
actual `53095`, resting control `35604`, and stale pre-Smart51 expectation `53096`.
Updating only the exact test literal and its owning reference prose made policy green
at `133/133`. The workspace then stopped on two web fixture literals: boundary-cap
tick actual `89` versus expected `85`, and event high-water actual `301` versus
expected `346`. Their ownership is under audit; Smart101 remains stopped and no corpus
case has run.

## A -- freeze the exact failing run and controls

Work only in test code beside `measure_articulated_matchup` and
`a_zero_energy_excess_is_only_evidence_while_the_solver_refuses_nothing` in
`crates/lab/src/main.rs`. Reproduce `Scenario::articulated_duel()`, seed `5`, and
`Script::Windmill` through the production measurement loop. Keep composed and closing
attacks as zero-refusal controls and require their command/state digests remain equal
to an uninstrumented run.

Add a test-only capture that observes already-published World diagnostics after each
ordinary `world.step()`. It must not call an extra scan, recompute, solve, projector or
step. On the first increment of `contact_solver_rejections`, freeze:

```text
script, seed, tick before/after step
ResolutionError from first_contact_rejection
ExactContactRejectionDiagnostic from first_exact_contact_rejection
  tick, phase, cause, key and any published solve-group detail
submitted entity/arm commands for that tick
contact fact/resolution counts before clear, if already authoritatively published
cap hits, energy excess, state digest and replay command ordinal
```

If the exact diagnostic is absent, record that absence beside the coarse error; do not
invent a key. The captured tick must replay identically through the existing recorded
command stream and reproduce the same refusal once. Double-running the capture must
produce byte-equal fields.

```rust
#[test] fn smart101_windmill_refusal_names_its_first_authoritative_boundary() {}
#[test] fn windmill_refusal_provenance_replays_from_the_same_submitted_commands() {}
#[test] fn refusal_capture_does_not_step_scan_or_solve_twice() {}
#[test] fn composed_and_closing_controls_are_unchanged_by_capture() {}
```

## B -- bounded cause split, not a fix

Once A names the phase, add one direct test fixture at that exact tick using the
already-captured authoritative inputs. Compare the failing windmill row with the
nearest valid control only to identify the first unequal input word and the branch it
reaches. Classify it as scan/recompute, driver construction, projector, energy,
capacity/group count, lifecycle or command refusal. Preserve exact key ordering,
selected time, region, fact words and owner/trajectory inputs where applicable.

Mutation proof must make a named diagnostic test red by erasing the first rejection,
changing its tick, phase/cause/key, or reporting a later refusal. Restore every
mutation. A mutation that merely changes the expected test literal is invalid.

Do not change the zero-refusal assertion, solver limits, compatibility/exact domain,
fixture seed/script, actuator, retained geometry, command policy or rejection
accounting. Do not run the full source-41 command: a single central case could take
minutes and would still sit behind a known-red control.

## C -- commands and stop boundary

```powershell
cargo test -p lab a_zero_energy_excess_is_only_evidence_while_the_solver_refuses_nothing -- --nocapture
cargo test -p lab smart101_windmill_refusal -- --nocapture
cargo test -p lab windmill_refusal_provenance -- --nocapture
cargo test -p lab composed_and_closing_controls_are_unchanged_by_capture -- --nocapture
cargo test -p sim --features cartesian-recoil
node tools/check_docs.js
git diff --check
```

Record the exact diagnosis in this plan and the durable research document, then remove
all runtime diagnostic hooks. Test-only frozen input/oracle code may remain only if it
cannot affect production execution. A production correction, if ever wanted, requires
a separate plan after this test-only contract is green. Smart102 has zero pin budget, runs zero corpus cases and
does not authorize retuning, policy, learning or arena UI work.

## Exact default diagnosis

The unmodified default run produced:

```text
script=Windmill seed=5 tick=2564 cause=EnergyNumerator
alpha=369 dissipated=1 weights=[0,0]
key[0]=WeaponBody entity0 slot1 -> entity1 BODY_SLOT
key[1]=WeaponShield entity1 slot1 -> entity0 slot0
contacts=2197 max_energy_excess=0 solver_rejections=1
first_rejection=Some(EnergyNumerator)
```

The same measurement gave composed `contacts=2440`, excess `0`, rejections `0`, and
closing `contacts=2287`, excess `0`, rejections `0`. Repeated default probes named the
same tick and cause. The feature-only diagnostic's `ExactUnsupportedSweep` rows are a
different disabled-feature contract and are not evidence about this default failure.

The refusal occurs in the compatibility solver's allocation path: both simultaneous
rows have zero allocation weight even though the group reports one raw dissipated
unit. This is neither an exact scan failure nor evidence that Smart100's retained
geometry changed selection. The temporary logging/early-continue branches used to
read the three summaries were reverted and may not be landed.

## Authorized test-only correction

Edit only the `#[cfg(test)]` module in `crates/lab/src/main.rs`. Preserve
`a_zero_energy_excess_is_only_evidence_while_the_solver_refuses_nothing` as the
zero-refusal audit for `Script::Composed` and `Script::ClosingAttacks`; both must still
assert contacts, zero excess, zero rejection count and `first_rejection=None`.

Move `Script::Windmill` into a separate named regression which asserts all of its
diagnosed default words:

```rust
#[test]
fn the_default_windmill_names_its_single_zero_weight_energy_refusal() {
    let trial = measure_articulated(&Scenario::articulated_duel(), 5, Script::Windmill);
    assert_eq!(trial.contacts, 2_197);
    assert_eq!(trial.max_energy_excess, 0);
    assert_eq!(trial.solver_rejections, 1);
    assert_eq!(trial.first_rejection, Some(sim::ResolutionError::EnergyNumerator));
}
```

This correction does not call the refusal sound or use its zero excess as evidence;
it stops the unrelated default compatibility control from claiming the run was
refusal-free while retaining a loud exact regression. Make the new test red by
changing count `1`, cause `EnergyNumerator`, and by silently omitting Windmill from
both tests; restore each mutation. Do not change production Lab measurement, sim,
solver allocation, scenario, seed, scripts or Smart41 eligibility.

Run the corrected tests and then the entire workspace. Smart101 remains stopped if
either control, the exact windmill regression or any workspace test is red:

```powershell
cargo test -p lab a_zero_energy_excess_is_only_evidence_while_the_solver_refuses_nothing -- --nocapture
cargo test -p lab the_default_windmill_names_its_single_zero_weight_energy_refusal -- --nocapture
cargo test
node tools/check_docs.js
git diff --check
```

Only a fully green workspace returns control to Smart101's already-declared corpus
checkpoint. Smart102 itself still runs no corpus and authorizes no production fix,
pin movement, retune, policy, learning or UI work.

## Green Lab evidence and next workspace stop

The landed test-only correction keeps all three scripts in one table and compares
the pair `(solver_rejections, first_rejection)`: Windmill must be
`(1, Some(EnergyNumerator))`, while Composed and ClosingAttacks remain `(0, None)`.
`target/smart102-count-mutation.log` proves changing the expected count makes the test
red; `target/smart102-cause-mutation.log` proves changing the cause to `Projector`
makes it red. The complete Lab portion of `target/smart102-workspace-final.log` is:

```text
79 passed; 0 failed; 5 ignored; 5.69s
```

The same workspace run continued through the intervening crates and stopped in
policy:

```text
articulated_script::tests::an_empty_off_hand_does_not_lengthen_the_arm_it_hangs_from
assertion failed: a guard's reach on the same hand
left: 0.8101
right: 0.8101
132 passed; 1 failed; 0 ignored; 4.41s
```

The display rounded away the exact literal difference. The read-only audit found:

```text
actual held-out capsule raw       53095
empty/resting capsule raw         35604
old ordinary-multiply expectation 53096
```

Smart51's reflection-safe signed product owns the one-raw move; the command remains
three-quarter reach and the empty-hand control remains byte-identical. Therefore the
only authorized correction is `53096 -> 53095` in the policy test and the paired
`53,096 / 0.81019 -> 53,095 / 0.81017` row in
`docs/reference/articulated-mechanical-gate.md`. Changing production policy, reach,
actuator arithmetic, tolerance or the empty-hand word is forbidden. A mutation back
to `53096` must reproduce the exact red assertion before restoration.

Smart101 remains corpus-held until the corrected policy test and complete workspace
are green. Smart102 does not treat this audit as a workspace pass and authorizes no
corpus, pin, retune, learning or UI work.

The second workspace run `target/smart102-workspace-final-2.log` confirms the accepted
corrections before reaching web: Lab is `79/79`, policy is `133/133`, and default sim
is `542 passed / 0 failed / 1 ignored`. Web then reports:

```text
the_boundary_clinch_reaches_the_contact_group_cap
actual Some(89), expected Some(85)

the_high_water_corpus_fills_at_most_half_the_event_buffer
actual 301, expected 346

web: 122 passed; 2 failed; 4 ignored; 0.81s
```

These are distinct fixtures and neither value is authorized to move from the failure
alone. Hold the corpus and await an audit of whether Smart51/59 behavior legitimately
changed the boundary/high-water witnesses or exposed a production regression. Do not
edit web expectations, capacities, event publication or contact limits in Smart102.
