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
| `a fresh bout load restores the whole published Mind report before another decision` | Reproduce the answered report kept outside the saved graph, and profile engagement details kept in unsaved situation closures. Compare the complete published report immediately after loading into a fresh same-recipe bout, before another decision can hide the stale data; physics-only replay diagnostics miss this observable failure. |
| `a fallback recovery Option does not count its own transition as an ordinary ascent` | Reproduce generalized recovery discovery treating a reposition as an ascent, suppressing its own transitions and changing brace admission. Construct the real fallback alone at an uncovered ready start and verify registered ascent declarations drive discovery/replacement, including an entrant-owned kind; a full bout can avoid the fallback and conceal the defect. |
| `recorded orders accept configured gait names across JSON transport` | Detect replay admission rejecting valid configured gait names, including paw gaits and an entrant-defined name, while stock gaits survive. Capability drills give live orders directly and do not establish that saved orders pass the external recording validator. |

[minds/stance-ownership.test.mjs](minds/stance-ownership.test.mjs) exercises a stance's end identifier
and an independent goal on the same effector segment.

| Case | Concrete justification |
| --- | --- |
| `a stance's named bearing end excludes another controller of its segment` | Detect overlapping effector and point goals admitted because a bearing end identifier was treated as a side and prefixed again. A capability drill can succeed without two controllers claiming the same segment. |

## Calculation and data regressions

[runtime-data.test.mjs](runtime-data.test.mjs) reproduces saved-record discriminator and
prototype-key loss, mutable container constants, nested rulebook aliasing, cached-contact identity
mutation, detached limbs retaining articulated impact mass, full reply-ring deadlock, partial stage
builds leaking their minds, shape configurability granting a non-extremity an injury exemption,
and worker requests completed by another request or left pending at shutdown. These are
data and lifecycle failures that a skill drill cannot establish.
The same file checks sparse arrays compacted by saving and synchronous worker sends leaking
startup or leaving earlier requests pending. It also reproduces invalid character drafts throwing
for overlapping or impossible geometry, finite scaling factors overflowing or underflowing
physical quantities, and mixed extremes collapsing a hull. These admission failures happen
before a world exists, so capability drills cannot establish the returned refusal contract.

These cases inspect results directly rather than replaying a skill's physical trajectory.

| File and case | Concrete justification |
| --- | --- |
| [runtime-data.test.mjs](runtime-data.test.mjs): `nested configured parts return whole role and value faults before graph traversal` | Reproduce explicit Option service tuning throwing for a wrong role and nested Move gait settings bypassing validation. Check complete path-prefixed role, unknown-kind, value and malformed-shape refusals, plus nested tuning removal; physical drills construct admitted settings and cannot establish this configuration boundary. |
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

[Skill boundary regressions](skills/boundaries.test.mjs) reproduce equal-size run settings with a missing key, malformed staged roll tuning, renamed run channels admitted before construction, sensed collision configurations ignored, undeclared assist writes, dropped profile exit percepts, untracked global data changes, a valid held carrier without an effector, paced guard memory surviving takeover, and rolled toe support missing from a fresh controller fork. It also covers cached support geometry after shape-changing configurations, a recovery that
starts before the host has driven, replacement gait normalization on both axes, physical foot yaw
without an effector actuator, and explicitly selected parts bypassing their body fit. Drills do not
establish command ownership, sampled geometry, data identity, authored applicability or exact
controller restoration. A Lab script with a real decision counter and a queued physical shove
reproduces both memories missing from their state roots; a short save/load replay compares its
orders, decision memory and delivered impulse. The physical fixtures use only the steps needed
to reach those cases. A real low quadruped also reproduces its horizontal clearance
being mistaken for vertical floor penetration; the same case retains avoidance of the arena
parapet.

The worker text case also reproduces absent array indices becoming present `null` elements;
it compares the complete sparse array alongside real `undefined` entries and escaped user tags.

## Evidence tooling and learned inference

| File and case | Concrete justification |
| --- | --- |
| [tooling.test.mjs](tooling.test.mjs): `one entrant cannot remove another through the shared registry line` | Reproduce a single entrant deleting a rival from the shared array while the ownership classifier still calls the change its own. A match does not check source ownership. |
| [tooling.test.mjs](tooling.test.mjs): `historical import refuses a complete count played at undeclared gaps` | Reproduce imported rows at gap 99 passing count checks for a protocol declaring gap 1. An imported rating cannot validate its own scenario coverage. |
| [tooling.test.mjs](tooling.test.mjs): `build source identity canonicalizes included authoring text but preserves binary bytes` | Reproduce identical Python, PowerShell and Markdown inputs receiving different build identities after checkout line-ending conversion; keep binary distinctions intact. |
| [tooling.test.mjs](tooling.test.mjs): `idle learning-worker errors survive until the next protocol request` | Reproduce a background environment failure discarded while no request waits; the next trainer request must receive that failure. Skill outcomes do not establish worker error delivery. |
| [tooling.test.mjs](tooling.test.mjs): `a reported research job failure closes every worker before rejecting` | Reproduce a rejected posture job leaving its worker message listener alive and preventing child exit. The check asserts every owned worker is terminated before failure reaches the caller. |
| [learning-network.test.mjs](learning-network.test.mjs): `malformed learned layers return faults instead of throwing while inspecting shape` | Reproduce a null first layer throwing before a configuration refusal can be returned. A trained policy contains valid shapes and cannot establish malformed-record admission. |
| [learning-network.test.mjs](learning-network.test.mjs): `learned inference retains clipped observation and action preprocessing` | Reproduce exported inference omitting the trainer's observation clamp, including a non-saturated final action, and preserve its pre-tanh action bound. Successful drills do not establish export/trainer equivalence. |

[rapier-hooks.test.mjs](rapier-hooks.test.mjs): `a contact-layer callback defect reaches the world-step caller unchanged` reproduces a material callback throwing while the vendored WASM bridge silently returns a successful step. The overlapping-contact fixture verifies the original thrown value and callback receiver at the actual engine boundary; a normal bout installs no material layer and cannot exercise this defect.

## Layer contract regressions

[layer-contracts.test.mjs](layer-contracts.test.mjs) reproduces the physical, command and observation
failures below. Skill drills cannot establish admission before allocation, complete command delivery
or exact saved-state compatibility.

| Case | Concrete justification |
| --- | --- |
| `physics refuses different gravity and rate before changing the destination` | Same-topology worlds accepted incompatible snapshots, contradicting their public gravity and configured rate; compare the complete destination snapshot after refusal. |
| `convex clearance separates rounded corners and edge-cross-edge hulls` | Face distances rejected a clear capsule at a hull corner, and face normals missed separated rotated hull edges; retain intersecting controls beside the observed fixtures. |
| `two-freedom joints refuse nonorthogonal axes` | A two-axis frame accepted diagonal second axes because each axis was checked only against its own copy. |
| `completed equipment and canonical up cannot contaminate shared constants` | Cached equipment and the canonical up vector permitted mutation shared by subsequent callers. |
| `failed body construction removes every completed segment` | A second allocation failure left the first rigid body without a returned owner. |
| `senses admit opaque prototype names and restore their complete frames` | Inherited object keys prevented valid body identifiers from entering the senses; restore and compare their complete saved frames. |
| `paw admission consumes its declared support point and patch` | Fit accepted an absent declared endpoint and refused a valid renamed one; rectangular patches also require their constructor's box shape. |
| `command layers deliver changed tracking, bracing and moving-frame goals` | Command equality dropped consumed response, firm, unbend, origin and drift fields before the real motor received them. |
| `pacing detects changed orders from a provider reusing its object` | Aliased remembered orders hid a provider's pace change and delayed the next decision. |
| `walk pricing refuses zero pace and bounds tiny-pace pressure sampling` | Valid zero pace hung the pressure loop; tiny positive pace made its work unbounded. |
| `fallen footprints retain observed elevation through navigation memory` | A fixed world height made an elevated fallen body disappear from navigation at its supporting level. |

[layer-lifetimes.test.mjs](layer-lifetimes.test.mjs) checks ownership and settlement that ordinary
completed bouts do not exercise:

| Case | Concrete justification |
| --- | --- |
| `reply boxes preserve FIFO beyond exact Number counters` | Converting a BigInt counter before taking its offset lost ring positions beyond exact Number representation. |
| `mind thread disposal stops every link when its first post throws` | A failed stop post prevented disposal of later links. |
| `a fatal lane answer closes pending siblings before rejection` | A fatal answer rejected while a sibling still owned its worker. |
| `a lane retains loss reported during spawn and clears synchronous post failures` | Spawn-time loss was discarded and synchronous sends retained timeout state. |
| `every browser physics benchmark disposes after its first prepare fails` | Benchmark worlds lost their only disposal path when preparation threw. |
| `late Arena callbacks and local Dungeon warming release every hosted mind` | A late construction callback and local warm-up abandoned completed hosted minds. |
| `a worker startup frame failure reports its error and disposes the completed stage` | Startup failures after stage creation left its resources live and its request unanswered. |
| `mind threads resend values changed inside a stable gait object` | Transport compared object identity and suppressed changed gait values. |
| `frame measurement retains worker cost and excludes interpolation-only batches` | Worker time was omitted and zero-step presentation batches were divided into timing figures. |
| `the shape renderer draws an admitted capsule with coincident endpoints` | Valid zero-length capsules reached a renderer that rejected their coincident endpoints. |

| File and case | Concrete justification |
| --- | --- |
| [evaluation/swap.test.mjs](evaluation/swap.test.mjs): `custom subjects retain execution scope through normalization, recording and reconstruction` | Custom subject adapters lost body restrictions and attributes, while code identity skipped standalone strike and technique implementations. |
| [evaluation/swap.test.mjs](evaluation/swap.test.mjs): `record admission and every keyed evidence reader refuse incomplete or conflicting cases` | Incomplete rows were admitted and history, Ratings and reels selected conflicting first occurrences without agreement. |
| [evaluation/swap.test.mjs](evaluation/swap.test.mjs): `a table cell requires every protocol case and keeps faulted coverage failed` | One passing row satisfied a full run cell; null fault readings were dereferenced. |
| [evaluation/swap.test.mjs](evaluation/swap.test.mjs): `Cover requires an attempted attack before untouched can pass` | An opponent that never attacked produced a passing untouched result. |
| [skills/boundaries.test.mjs](skills/boundaries.test.mjs): `resource compilation separates segment names from services and uses physical bearing chains` | Valid segment names collided with logical services, and a bearing end without an effector lost its support channels. |
| [skills/boundaries.test.mjs](skills/boundaries.test.mjs): `Option skills assemble with physical feet alone and an effector named assist` | Stock physical feet without optional actuators and an opaque renamed hand failed before their skill assembly could stand. |
| [skills/boundaries.test.mjs](skills/boundaries.test.mjs): `admission resolves guard, staged channels and timed strike and gait settings before construction` | Admitted null guard tuning, absent staged channels and zero divisors threw during construction; a neutral-only hand received an undeclared open command. |
| [skills/boundaries.test.mjs](skills/boundaries.test.mjs): `default skill assembly roots the one configured memoryful aim` | Saving the default assembly omitted its hidden aim's memory and retained later calls after restoration. |
| [skills/boundaries.test.mjs](skills/boundaries.test.mjs): `Move does not erase a gait's complete runs setting when sharing instances` | Generic gait sharing erased a concrete configuration field and merged independently configured controllers. |
| [skills/profiles.test.mjs](skills/profiles.test.mjs): `a skill's identity includes the selected aim's declared data` | Aim-owned data changed without changing the skill digest. |
| [skills/profiles.test.mjs](skills/profiles.test.mjs): `a zero-length failed profile trial has a finite failed rate` | A failed zero-duration trial produced NaN instead of a failed finite rate. |
| [tooling.test.mjs](tooling.test.mjs): `closing research workers settles queued work and refuses work after close` | Closing a pool left queued promises pending and admitted subsequent work. |
| [tooling.test.mjs](tooling.test.mjs): `research worker exit after a completed sibling rejects and closes all workers` | Research pools omitted exit settlement after another worker had already completed its job. |
| [minds/contract.test.mjs](minds/contract.test.mjs): `a measured Lab script follows an explicit numeric walk without a gait envelope` | A valid numeric order reached the script but received zero obedience value without a calibration, so the chooser held still; trace the measured actor through selection to its first landing. Calibrated drills do not reach this path. |
