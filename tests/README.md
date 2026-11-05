# Engineering checks

`npm test` runs these cases. Each row identifies a distinct failure and why capability drills do
not establish the same fact. Physical recovery, footing and strike quality are read through
[capability evaluations](../docs/reference/the-table.md); simulation-wide equivalence and cost
use the fingerprint, worker and [step-cost diagnostics](../docs/reference/step-cost.md) when
the change requires them. A successful engineering check does not accept a skill's capability.

Keep observed-failure provenance in the commit that retains or introduces a case. Maintain this
inventory when a case changes. A small fixture that proves a scanner detects a defect is paired
with its repository scan; a clean repository alone cannot distinguish a working scanner from one
that reports nothing.

## Architectural boundaries

[core-boundary.test.mjs](core-boundary.test.mjs) reads source; it does not play bouts. Type checking
permits these imports and operations, and successful drills cannot establish that they are absent.

| Case | Concrete justification |
| --- | --- |
| `nothing the core reaches leaves the core, its packages or its data` | Reject transitive dependencies on pages, Node-only services or unapproved packages that make the core unusable in another runtime. |
| `the boundary check finds a crossing where there is one` | Check the import scanner against real crossings from the Arena page, including a transitive one; the clean-core scan alone cannot show that traversal works. |
| `the core, and what builds a case's world, compute with IEEE's operations and the core's own functions` | Reject engine-dependent transcendental arithmetic that can make browser and Node trajectories differ in their last bits. The fixture distinguishes real operations from comments and names. |
| `a headless world loads no renderer: the bout's, the Crypt run's, the cases', the falls' and the world worker's modules import nothing of Babylon` | Catch renderer imports through runtime-neutral builders outside core, where the core-only import scan has no authority. A drawn Arena room proves the scan detects a renderer. |
| `the core and its lab reach an engine only through the seam: engine.ts's contract and engines.ts's list` | Reject direct Rapier imports outside its adapter and imports bypassing the engine registry. This protects the single initialization boundary and engine replacement. |
| `a mind and its toolkit reach no engine, world, builder, global or chance but its seed: only the report and the order sheet` | Prevent privileged reads or unrecorded randomness and machine time in decision/control code. A seed's successful drill does not prove isolation or reproducibility. |
| `source imports follow responsibility, runtime and package ownership` | Reject upward imports, entry into another implementation's internals and modules omitted from the layer map. The compiler accepts those dependencies; game outcomes do not expose them. |
| `an entrant reaches only libraries, its own folder and its own data` | Prevent an entrant from importing a rival's implementation or privileged application state. A competition result cannot establish independent entrant ownership. |
| `a Commander reaches no engine, world, body or global: only its team's view and the orders it gives` | Enforce the Commander's narrower read/write authority, which is distinct from the Mind boundary and can be bypassed without causing a drill failure. |

## Command transport

[minds/contract.test.mjs](minds/contract.test.mjs) uses a fixed body and a probe that emits distinct
commands, without a planner or skill-selection sweep.

| Case | Concrete justification |
| --- | --- |
| `a body's command is applied the world's delay after it is sent, none before, none again after its level leaves full, and across a save and load` | Detect body-declared actuators omitted by bilateral hand discovery and pose encoding; check muscle activation, assist force and segment configuration requests at exact queue positions; check that suspension discards old commands and saving restores in-flight values. A body can meet a skill's outcome with an early, late or stale command, so a drill cannot establish this timing contract. |
| `a fresh physics fork resets exactly the forces pending at its save` | Detect extra or reordered force resets after loading into a fresh world, which alter Rapier's saved modification flags despite matching body poses. Compare whole saved worlds across steps with a nonzero force, an explicit zero ask and an untouched body; a skill drill does not establish exact saved continuation. |
| `a commanded Mind restores its driver's memory from its own state` | Detect decider and skill memory saved only through a separate controller result. Load the published Mind state into a fresh commanded mind and verify its decider continues from the saved count; a whole-bout fork can hide the omission by saving a second memory root. |
| `recorded orders accept configured gait names across JSON transport` | Detect replay admission rejecting valid configured gait names, including paw gaits and an entrant-defined name, while stock gaits survive. Capability drills give live orders directly and do not establish that saved orders pass the external recording validator. |

[minds/stance-ownership.test.mjs](minds/stance-ownership.test.mjs) exercises a stance's end identifier
and an independent goal on the same effector segment.

| Case | Concrete justification |
| --- | --- |
| `a stance's named bearing end excludes another controller of its segment` | Detect overlapping effector and point goals admitted because a bearing end identifier was treated as a side and prefixed again. A capability drill can succeed without two controllers claiming the same segment. |

## Calculation and data regressions

These cases inspect results directly rather than replaying a skill's physical trajectory.

| File and case | Concrete justification |
| --- | --- |
| [rise-control.test.mjs](skills/recovery/implementations/staged/rise-control.test.mjs): `bearing posture accelerations use the joint turning map, including damping and transfer` | A compound joint pose with nonzero rates distinguishes joint-angle accelerations from motor-axis accelerations. Check the coordinate mapping against the servo calculation for ordinary bearing and weight transfer; standing up eventually does not establish the correctness of this calculation. |
| [skills/profiles.test.mjs](skills/profiles.test.mjs): `every measured profile is of a current skill on a current body` | Detect stored profile keys that match no current body/skill digest and are silently ignored by the chooser. A directly ordered strike can work while selection falls back to unmeasured values. |
| [skills/profiles.test.mjs](skills/profiles.test.mjs): `a strike's record counts its own limb's tries its executor gave up on` | Check that self-abandoned attempts lower that limb's estimate, another limb's record is unchanged and cancelled attempts are excluded. A one-strike trial does not establish learning from a history of stalls. |
| [minds/option/lying.test.mjs](minds/option/lying.test.mjs): `lying retains an opportunity cost against a foe with no modelled hand attack` | Detect zero lost-opportunity cost for remaining down when the foe has no modelled hand attack. Compare durations and an upright out-of-reach state without fixing tuned values; a rise ordered by a drill bypasses this decision rule. |

## Evaluation integrity

[evaluation/swap.test.mjs](evaluation/swap.test.mjs) constructs schedules and resolves subjects without playing them.
The calibration fixture supplies an independently scoped entrant. These checks protect the
measurement system itself; a result computed on the wrong cases cannot validate its own scope.

| Case | Concrete justification |
| --- | --- |
| `CLI ablations inherit calibrated bodies and loadouts before scheduling paired cases` | Prevent an ablated configuration from expanding to bodies/loadouts outside its source calibration or leaving unpaired work in a comparison. |
| `mind batteries admit only a named calibration's bodies and preserve that scope through CLI ablations` | Check court/crowd admission, including refusal when a named calibration fits no protocol case. These schedule paths differ from tournament subject expansion. |
| `a match admits complete pairs within named calibrations and preserves the scope of ablations` | Apply calibration scope to both bodies of each complete match unit, without changing recipes, keys or pairing. Checking only one participant admits an invalid comparison. |
| `every evaluation's default panel names entrants it has` | Detect a stale panel identifier that throws during subject resolution before a requested evaluation can play. |

## Repository integrity

| File and case | Concrete justification |
| --- | --- |
| [documents.test.mjs](documents.test.mjs): `anchors_are_github_slugs_a_repeated_heading_numbered` | Check heading normalization, duplicate suffixes and explicit anchors used when resolving Markdown links. A scanner with incorrect anchor generation rejects working links or accepts broken ones. |
| [documents.test.mjs](documents.test.mjs): `broken_citations_are_the_missing_file_heading_and_target_and_nothing_present` | Prove that citation traversal finds missing files, missing anchors and escaping paths while respecting code fences and reference links. |
| [documents.test.mjs](documents.test.mjs): `comment_marks_are_the_dates_hashes_plan_citations_and_the_owner_in_comments_of_src_only` | Check the comment lexer against strings, regular expressions and nested templates so it does not report executable literals as prohibited comment text or overlook actual comments. |
| [documents.test.mjs](documents.test.mjs): `every_document_cited_resolves_and_no_comment_in_src_holds_a_mark` | Apply the validated citation and comment scanners to the working repository, catching dangling documentation after code or document removal. |
| [script-links.test.mjs](script-links.test.mjs): `broken_links_are_the_missing_module_and_the_missing_name_and_nothing_present` | Prove the research-import scanner follows re-exports and destructured exports and detects both missing modules and missing exported names. |
| [script-links.test.mjs](script-links.test.mjs): `every_research_script_and_script_imports_what_exists` | Catch stale JavaScript research/CLI imports outside the TypeScript compilation before someone starts a run that cannot load. |
| [workspace.test.mjs](workspace.test.mjs): `strays_are_the_untracked_outside_tracked_folders_the_hidden_and_the_garbage_and_nothing_kept` | Check the file inventory against unmanaged snapshots, hidden directories and crash dumps while preserving legitimate ignored tools and work in progress. |
| [workspace.test.mjs](workspace.test.mjs): `the_working_copy_holds_no_strays` | Apply that inventory to the actual workspace so untracked output and hidden storage do not accumulate unnoticed. |
