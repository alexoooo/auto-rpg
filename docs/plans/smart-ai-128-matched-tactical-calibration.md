# Smart AI 128 -- matched stationary Tactical calibration

**Status:** measurement implementation complete and verified; the two calibration
receipts have not yet been collected. This session repairs and reruns the stationary
matched strong-reference/Tactical calibration against the retained
`cartesian-recoil` mechanics. It does not run the moving 100-fight competence gate,
open the held-out seed range, change either controller, promote the feature, or create
a pin.

The last complete calibration predates exact-contact authority closure. It reported
519 structurally invalid rows out of 900: 308 had no reference WeaponBody fact, 207
had multiple WeaponBody or competing facts, and only 385 carried the required single
uncontested reference fact. Those categories overlap with the remaining validity
checks. They are historical controls, not expected values to copy into a new result.

At the start of this session the harness was not yet an adequate recorder for the
rerun. Its durable
[post-mechanics contract](../performance/smart-ai-matched-tactical.md#post-mechanics-rerun-contract)
required cap, temporally coherent attribution and anatomy evidence that the old
[`TacticalRow`](../../crates/lab/src/tactical_mechanics.rs#L39) and its CSV did not
fully carry; `--held-out` printed structural validity rather than the documented
productivity decision; and the Lab help still called calibration unimplemented. The
implementation below now repairs those seams and passed the focused mutation-backed
tests, `cargo test`, the full feature workspace, the documentation checker and the
diff checker before any calibration was run. Existing registered pins moved zero.

## A -- freeze the corpus and the four matched arms

Keep the existing iterator in
[`corpus_cases`](../../crates/lab/src/tactical_mechanics.rs#L358) byte-for-byte in
meaning and order:

```text
seed 0..24, outermost and ascending
mirrored false, true
target anatomy Fighter, Brute
APPROACH_OFFSETS[0..9], in declared array order
```

That is `25 * 2 * 2 * 9 = 900` cells. A cell runs, in this exact order, on four
fresh Worlds built from the same scenario fingerprint, seed, mirror, anatomy and
offset:

```text
strong-before: fixed strong schedule, effort 1
held control:  fixed strong schedule, effort 0
subject:       TacticalArticulatedPolicy::default() against a neutral defender
strong-after:  the same fixed strong schedule, effort 1
```

Every offered command enters through `World::submit_articulated_v1`. The subject is
the ordinary observation-driven policy. It must not call
`controlled_robust_strike`, use ordinal 3144, use source-41's declared-spawn bearing,
read World truth, or reuse policy state between cells. The held row and equal strong
brackets are the controls. A default-build corpus would ask a separate feature-delta
question and is not part of this denominator.

Add a single corpus descriptor used by iteration, reporting and tests rather than
repeating the dimensions in three places:

```rust
const CALIBRATION_SEEDS: core::ops::Range<u64> = 0..25;
const CALIBRATION_CASES: usize = 25 * 2 * 2 * strong_strike::APPROACH_OFFSETS.len();
```

Preserve the 56-tick strong schedule and each generated scenario's existing maximum.
Do not tune an offset, schedule, reach, target anatomy or policy constant after seeing
the output.

## B -- make every validity claim observable

Extend [`TacticalRow`](../../crates/lab/src/tactical_mechanics.rs#L39) and the CSV row
with the fields needed to decide the declared grammar:

```rust
first_contact_attributed_facts: u32,
first_contact_competing_facts: u32,
cap_hits: u32,
pressure_raw: u64,
integrity_loss_raw: [i32; BodyPart::COUNT],
wound_gain_raw: [i32; BodyPart::COUNT],
blood_loss_raw: i32,
unattributed_anatomy_changes: u32,
waterfall: Waterfall,
```

Both first-contact counts are frozen from the same resolution slice on the first tick
that contains an attributed fact. `first_contact_attributed_facts` uses the existing
`belongs_to` identity/hand/region predicate; `first_contact_competing_facts` counts
every other published resolution row on that tick, matching
[`StrikeMeasurement::competing_facts`](../../crates/lab/src/strong_strike.rs#L471).
Do not reduce either count to a boolean, update one count on a later tick, or count a
later contact as if it competed in the selected resolution slice. Keep
`waterfall.weapon_body_facts` as the separate cumulative count over the complete
Tactical run; it must not supply the first-contact uniqueness decision.

Read `cap_hits` from `World::contact_cap_hits()` after the run. Keep energy excess
paired with cumulative `contact_solver_rejections`; neither may short-circuit to zero
when a mode is off. Preserve cut, thrust and pressure separately. On every tick,
compare all `BodyPart::ALL` integrity and wound lanes before and after the step.
Attribute a change only when it is in that tick's intended region and the same tick
carries a matching cut-or-thrust fact; every change in another lane, or without that
fact, increments `unattributed_anatomy_changes`. Record blood loss separately from
all body-part lanes. Blood neither supplies matching-region integrity loss nor hides
an unattributed lane change, and a blood change does not itself increment
`unattributed_anatomy_changes`. It changes only `blood_loss_raw` and its CSV column;
the held control still requires blood to remain unchanged.

Replace the present loose booleans with two named, pure classifications:

```rust
struct StructuralValidity {
    bracket_equal: bool,
    reference_unique: bool,
    reference_crossed: bool,
    held_inert: bool,
    held_legal: bool,
    reference_legal: bool,
    tactical_legal: bool,
}

struct TacticalProductivity {
    unique_crossing_contact_with_dissipation: bool,
    cut_or_thrust_with_matching_integrity_loss: bool,
}
```

`reference_legal` and `tactical_legal` each require zero submission refusals, solver
rejections, cap hits and maximum energy excess. Tactical legality additionally
requires zero unattributed anatomy changes and requires a crossing no later than an
attributed contact. Reference uniqueness is exactly one attributed WeaponBody fact
and zero competitors; reference crossing is the existing swept published-region
oracle. Held inertness keeps every existing zero-contact, zero-energy and unchanged
anatomy/blood clause. `held_legal` independently requires zero held-command submission
refusals, solver-rejected ticks, cap hits and maximum energy excess. Structural
validity requires both; never fold an illegal but otherwise motionless held row into
`held_inert` or report it as a valid control.

Productivity is deliberately separate from structural validity. Freeze the first
attributed contact once, including its hand and region, the crossing for that same
hand/region, the attributed and competing rows in that exact resolution slice, that
slice's dissipation and cut-plus-thrust, and same-tick integrity loss in the frozen
region. Later plans, contacts, dissipation or damage may not rewrite or supply this
evidence. The first predicate requires the frozen crossing no later than contact,
exactly one attributed Tactical WeaponBody fact, zero competitors and nonzero
physical dissipation. The second requires positive frozen `cut + thrust` and positive
same-tick integrity loss in that frozen region. Pressure is reported and never
satisfies the damage predicate; an open wound is reported but is not required because
thrust need not open one. The denominator is all 900 cells, never only reference
contacts or otherwise valid-looking rows.

Write every primitive field and both classifications to CSV in a fixed header order.
Flatten the integrity-loss and wound-gain arrays into Head, Torso, LeftArm, RightArm
and Legs columns in `BodyPart::ALL` order. Flatten `Waterfall` into the literal
columns `commits`, `crossings`, `weapon_body_facts`, `positive_closing`,
`dissipated_groups`, `above_floor`, `cut_or_thrust`, `integrity_losses`,
`open_wounds`, and `body_decisions`; do not serialize a Debug struct into one cell.
Use decimal integers, lowercase `true|false`, the existing lowercase anatomy names,
and no debug formatting. Include a final newline. The summary must print counts split
by mirror and target anatomy as well as the total:

```text
cases; bracket drift; reference missing; reference ambiguous; reference uncrossed
held inertness invalid; held illegal by submission/solver/cap/energy
reference illegal by refusal/solver/cap/energy
tactical illegal by refusal/solver/cap/energy/unattributed/cross-order
reference meaningful strikes
tactical unique crossing/contact/dissipation
tactical cut-or-thrust plus matching integrity loss
```

Update [`main.rs`](../../crates/lab/src/main.rs#L118) so help names the implemented
`--calibration` mode and its `--write`/`--summary-write` output paths accurately.
Make incompatible modes and either valueless output option return named, testable
refusals before work begins. `--summary-write` mirrors the deterministic bytes printed
to stdout and changes no measurement input; do not add a measurement-changing
override.

## C -- tests must defend the reporter

Add these exact tests beside the harness:

```rust
#[test] fn matched_calibration_is_exactly_nine_hundred_ordered_cells() {}
#[test] fn matched_rows_share_fingerprint_seed_mirror_anatomy_and_offset() {}
#[test] fn structural_validity_rejects_each_refusal_cap_energy_and_attribution_failure() {}
#[test] fn held_validity_reads_contact_energy_caps_and_anatomy_without_short_circuiting() {}
#[test] fn productivity_does_not_count_pressure_or_an_unmatched_integrity_loss() {}
#[test] fn productivity_keeps_all_nine_hundred_rows_in_its_denominator() {}
#[test] fn calibration_csv_has_a_fixed_header_order_and_final_newline() {}
#[test] fn incompatible_tactical_mechanics_modes_are_refused_by_name() {}
```

Construct classification tests from small value fixtures rather than rerunning the
900 cells. For each field named in `structural_validity_rejects...`, begin with one
valid fixture, mutate only that field and require the classification to turn false.
For the held-control test, separately inject one held submission refusal, solver
rejection, cap hit and raw energy excess, then make the reporter ignore each field in
turn; the test must go red for every mutation. Also mutate a non-intended integrity
lane and a non-intended wound lane and require their distinct CSV fields and the
unattributed count to change. Mutate blood separately and require only
`blood_loss_raw`, its CSV field and held inertness to change -- never the unattributed
count. For productivity, separately mutate dissipation, the frozen first-contact
competitor count, pressure-only damage, intended-region integrity loss and denominator
selection and observe the named test fail before restoring it. Prove that a crossing
after contact is illegal and that later contact, dissipation and damage cannot rewrite
or supply the frozen first-contact evidence. Exercise `calibration_csv_row` itself:
require the full fixed header/row column count, exact named-field placement and final
newline. Independently bypass both valueless output-option refusals and the summary
byte writer and observe their named tests fail before restoring them.

Keep the existing cross-cutting tests for bracket identity, seed-range disjointness,
identity attribution and unattributed anatomy changes. Do not weaken the retained
source-41, exact-trajectory or lifted-solver tests to make this reporter green.

```powershell
cargo test -p lab --features cartesian-recoil matched_calibration -- --nocapture
cargo test -p lab --features cartesian-recoil structural_validity -- --nocapture
cargo test -p lab --features cartesian-recoil held_validity -- --nocapture
cargo test -p lab --features cartesian-recoil productivity -- --nocapture
cargo test -p lab --features cartesian-recoil calibration_csv -- --nocapture
```

Commit the measurement implementation green before collecting evidence. The source
commit in the evidence record is that clean commit, not a later documentation commit
and not a dirty tree.

## D -- run twice and decide without opening held-out work

First run the focused diagnostic. It is smoke evidence only and has no verdict:

```powershell
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --quick
```

Then run the complete calibration twice from fresh processes at the same clean source
commit:

```powershell
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --calibration --write target/smart128-calibration-a.csv --summary-write target/smart128-calibration-a.log
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --calibration --write target/smart128-calibration-b.csv --summary-write target/smart128-calibration-b.log
```

Retain stdout for both runs under `target/`. Record each CSV and log's byte length and
SHA-256, the source commit, Rust target triple, feature name and wall time in
[`smart-ai-matched-tactical.md`](../performance/smart-ai-matched-tactical.md). The two
CSV files must be byte-identical, their SHA-256 values equal, and their printed
summaries and retained log bytes must be identical. Wall time is measured externally
and is not part of the deterministic summary. A mismatch is `invalid-nondeterministic` and
stops before interpretation.

One calibration is 900 cells times four 56-tick Worlds, at most 201,600 World steps.
Smart125's 180,000-step moving gate took 286,636 ms on this laptop. Budget roughly
5--15 minutes per exact calibration and 10--30 minutes for the pair, but record the
actual times rather than treating that estimate as a limit. Do not detach the runs or
launch a second Cargo process concurrently.

### Structural decision

Every one of the 900 rows must satisfy all seven `StructuralValidity` fields. Any
structural-invalid row produces `invalid-stop-before-held-out`. Report all counts and
intersections, preserve the two receipts, and stop. In particular:

- do not run `tactical-mechanics --held-out`;
- do not run `articulated --competence-gate`;
- do not choose a subset, widen an offset or tune from the failed rows;
- do not reinterpret contact, damage or a later body outcome as structural validity.

The historical `519/900` result makes a red stop plausible. It does not authorize
copying that result or skipping the rerun.

### Productivity decision

Only when structural invalidity is exactly zero may the two productivity rates be
interpreted. Over the frozen 900-row denominator require:

```text
unique crossing/contact with nonzero dissipation >= 855/900 (95%)
positive cut-or-thrust with matching regional integrity loss >= 810/900 (90%)
```

Report reference meaningful strikes and every Tactical waterfall stage even when
the thresholds fail. A productivity failure is `revise`; it does not license a
policy or mechanics edit in this session. Passing both thresholds records
`calibration-pass-plan-held-out` -- permission to write a separate held-out plan,
not permission to run the existing `900_000..900_100` range and not evidence that the
moving 95/100 competence gate passed.

## E -- authority, pin budget and stop boundary

This is Lab-only measurement fidelity plus evidence. Expected registered hash moves
are exactly zero. In particular, all legacy hashes,
`ARTICULATED_COMMAND_HASH`, `ARTICULATED_STREAM_DIGEST`,
`CONTACT_BEHAVIOR_DIGEST`, `EXACT_TRAJECTORY_STATE_DIGEST`,
`LIFTED_COULOMB_SOLVER_DIGEST` and `LEARNED_INFERENCE_DIGEST` remain unchanged.
The two CSV/log SHA-256 values and any ordered command/state receipts are evidence
receipts, not golden pins. Any registered move stops rather than being re-recorded.

Do not edit `crates/policy`, `crates/sim`, `crates/web`, the controlled Arena preset,
feature defaults, replay/hash grammar or browser UI. Do not train, promote Tactical,
create `ARTICULATED_HASH`, run the held-out stationary range, run the moving 100-fight
gate, or reopen `v2-18`. A passing stationary calibration authorizes only the next
plan.

After the measurement code commit and again after the evidence update:

```powershell
cargo test
cargo test --workspace --features cartesian-recoil
node tools/check_docs.js
git diff --check
```

Because this session is confined to Lab and Markdown, it does not change the wasm
artifact. If review expands the source scope into `sim`, `policy` or `web`, stop and
write a replacement plan with the repository's native/default-feature/wasm gates
before making that expansion.
