# Engineering checks

`npm test` runs these cases. Each row identifies a distinct failure and why capability drills do
not establish the same fact. Physical recovery, footing and strike quality are read through
[capability evaluations](../docs/reference/the-table.md); what a step allocates is held under
ceilings ([step cost](#step-cost)); simulation-wide equivalence and time use the fingerprint,
worker and [step-cost diagnostics](../docs/reference/step-cost.md) when the change requires them.
A successful engineering check does not accept a skill's capability.

Keep observed-failure provenance in the commit that retains or introduces a case. Maintain this
inventory when a case changes. A small fixture that proves a scanner detects a defect is paired
with its repository scan; a clean repository alone cannot distinguish a working scanner from one
that reports nothing.

## The rules

- **Tests are a liability; less is more.** Each retained case has a concrete failure and a reason
  capability drills or existing diagnostics do not establish it, in this inventory. Skill
  behaviour belongs in drills and paired evaluations; broad replay batteries and timing are
  explicit diagnostics, while what a step allocates is held by its ceilings. No test file has a
  blanket exemption. A new test reproduces
  a concrete observed regression: its commit names the failure and the broken code on which it
  fails. A new feature, a contract by itself or an artificial mutant is not a reason to add one.
  Keep it under about 10 s; how well a mind plays is a match, not a test.
- **Test the contract**: inputs, outputs, what can be observed; never a tuned number or a last
  run's trajectory. Rules and replay are held to exact equality.
- **A fixture that did not reach its case says so** before the asserts; bouts are capped. A
  fixture is a recipe or a placed pose, not stored bytes.
- **A green test can assert nothing**: assert whole records, with a fixture that can show the
  defect, along the whole path.
- **Never green by relaxing**: no eased threshold, easier seed or regenerated expectation. A red
  physical check names its recipe, seed, condition and value against its limit.
- **Node imports `src/` directly**: relative imports carry `.ts`; no parameter properties. The
  headless stand is `tests/harness/core-stand.mjs`.
- **Under CPU load a dropped test count is a timeout**, not a regression: re-run on a quiet
  machine.

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
| `source imports follow responsibility, runtime and package ownership` | Reject upward imports, including type-query imports, entry into another implementation's internals and modules omitted from the layer map. The compiler accepts those dependencies; game outcomes do not expose them. |
| `an entrant reaches only libraries, its own folder and its own data` | Prevent an entrant from importing a rival's implementation or privileged application state. A competition result cannot establish independent entrant ownership. |
| `a Commander reaches no engine, world, body or global: only its team's view and the orders it gives` | Enforce the Commander's narrower read/write authority, which is distinct from the Mind boundary and can be bypassed without causing a drill failure. |

## Step cost

[core-step-cost.test.mjs](core-step-cost.test.mjs) reads what a body's step allocates, KiB, each
fixture in a process of its own, against `CEILING` ([allocation
ceilings](../docs/reference/step-cost.md#allocation-ceilings)). A step's time is the machine's;
its allocation is the same on every machine and is what a `map`, a spread or a copy put back into
a step shows up as. Drills and evaluations play the same with garbage or without, so none of them
sees it. Deleted with the suite's pruning (`7116f8a4`), the gate was not there when the mind's
report copy began walking its kit and gaits every step and the stand check began deep-freezing a
whole observation every step: on `9acd8a3e` the Option Mind's bout read 798 KiB a body a step
over its 739, and a rising Skeleton 674 over 324.

| Case | Concrete justification |
| --- | --- |
| `a_standing_body_s_step_allocates_no_more_than_its_ceiling` | Two skeletons standing under the command layers: the control path every body runs. It grew from 106 to 126 KiB a body a step unseen, most of it the arbiter's per-step iterators and a closure per muscle channel. |
| `every_game_mind_s_step_allocates_no_more_than_the_ceiling` | Each game mind's bout, under one ceiling. Reproduces the report copy that read every key of the kit and the gaits each step (798 KiB on `9acd8a3e`). |
| `a_down_body_s_step_allocates_no_more_than_its_ceiling` | The Warrior lying under its ground reader: every fixed support read each step, a path the standing and bout fixtures do not reach. |
| `a_rising_body_s_step_allocates_no_more_than_its_ceiling` | A stand-up target fall under the stand's verification, which the evaluation and the Lab run every step. Reproduces the deep-frozen observation built each step to read three numbers (674 KiB on `9acd8a3e`). |
| `the_meter_sees_an_array_made_in_a_step` | The positive control: a 4096-element array made each step must read at least half its size, so a meter that reads nothing cannot pass the ceilings. |

## Command transport

[minds/contract.test.mjs](minds/contract.test.mjs) uses a fixed body and a probe that emits distinct
commands, without a planner or skill-selection sweep.

| Case | Concrete justification |
| --- | --- |
| `a body's command is applied the world's delay after it is sent, none before, none again after its level leaves full, and across a save and load` | Detect body-declared actuators omitted by bilateral hand discovery and pose encoding; check muscle activation, assist force and segment configuration requests at exact queue positions; check that suspension discards old commands and saving restores in-flight values. A body can meet a skill's outcome with an early, late or stale command, so a drill cannot establish this timing contract. |
| `a fresh physics fork resets exactly the forces pending at its save` | Detect extra or reordered force resets after loading into a fresh world, which alter Rapier's saved modification flags despite matching body poses. Compare whole saved worlds across steps with a nonzero force, an explicit zero ask and an untouched body; a skill drill does not establish exact saved continuation. |
| `a commanded Mind restores its driver's memory from its own state` | Detect decider and skill memory saved only through a separate controller result. Load the published Mind state into a fresh commanded mind and verify its decider continues from the saved count; a whole-bout fork can hide the omission by saving a second memory root. |
| `a fresh bout load restores the whole published Mind report before another decision` | Reproduce the answered report kept outside the saved graph, and profile engagement details kept in unsaved situation closures. Compare the complete published report immediately after loading into a fresh same-recipe bout, before another decision can hide the stale data; physics-only replay diagnostics miss this observable failure. |
| `a mind's report is what it said at its answer, through a sword bout, a fall it rises from and a Crypt run` | Reproduce a report owner writing into a value the mind has said: navigation moved its route's end round a corner in place, which changed the published route after the answer (seed 10's hero, 6.5 s in). At every answer compare the published report with a whole copy of the live one; an Option Mind bout, a stand-up fall with its release and resume, and a Crypt route between them change every field the decision and the skills write. A drill reads the live skills, not what the mind said, so it cannot see the stale report. |
| `a bout whose minds' menus are read every step plays as it does unread` | Reproduce a menu read that changed the mind it read: a blow's readiness asks its aim, and the surface aim held each opening it found, so a Commander's or a screen's read made holds the mind had not, and its later blows aimed elsewhere (found at 60 Hz, `fd0a953b`; with reads keeping, the sword bout below plays other poses). The aims now keep nothing when a menu asks (`keepingNothing`). Every pose of an Option Mind sword bout read every step against the bout unread; a drill always has its reader, so it cannot compare. |
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
The browser pool case reproduces Random Crypt startup blocking before nested workers initialize:
the pool stays pending until every worker acknowledges startup, and a failed startup stops the
whole pool. Node skill drills start threads through a different transport.

These cases inspect results directly rather than replaying a skill's physical trajectory.

[arena-setup.test.mjs](arena-setup.test.mjs) reproduces screen menus and mind editors reading
unloaded stomp, recovery and bite data during compatibility checks. It loads the declared
compatibility data, checks human and jawed bodies, and leaves unrelated construction
data unloaded in a fresh process without the Node preload; capability drills preload the data and
cannot expose this startup failure.

| File and case | Concrete justification |
| --- | --- |
| [runtime-data.test.mjs](runtime-data.test.mjs): `nested configured parts return whole role and value faults before graph traversal` | Reproduce explicit Option service tuning throwing for a wrong role and nested Move gait settings bypassing validation. Check complete path-prefixed role, unknown-kind, value and malformed-shape refusals, plus nested tuning removal; physical drills construct admitted settings and cannot establish this configuration boundary. |
| [rise-control.test.mjs](skills/recovery/implementations/staged/rise-control.test.mjs): `bearing posture accelerations use the joint turning map, including damping and transfer` | A compound joint pose with nonzero rates distinguishes joint-angle accelerations from motor-axis accelerations. Check the coordinate mapping against the servo calculation for ordinary bearing and weight transfer; standing up eventually does not establish the correctness of this calculation. |
| [skills/profiles.test.mjs](skills/profiles.test.mjs): `every measured profile is of a current skill on a current body` | Detect stored profile keys that match no current body/skill digest and are silently ignored by the chooser. A directly ordered strike can work while selection falls back to unmeasured values. |
| [skills/variations.test.mjs](skills/variations.test.mjs): `a character holding two variations of a skill strikes by each, and each reads as it does alone` | Two variations of one skill must be two executors and two actions, each measured as it is when held alone, so holding a second never voids the first's profiles. A fight with one variation held cannot show a second one's executor shadowing or renaming it. |
| [characters.test.mjs](characters.test.mjs): `a model carries as many characters as the registry lists, one of them its own` | The registry must admit two characters on one model and refuse a model's own character on another body, a bad skill name and a model with none; the shipped file has one character a model, so no fight can show a second one being refused or a wrong one standing for its model. |
| [characters.test.mjs](characters.test.mjs): `a character resolves on its own model and refuses another, and a model alone is its own character` | Refuse a character on another model's body and an unknown name before construction, and resolve a model alone to its own character's skills; a fight built from a resolved character never meets these inputs. |
| [characters.test.mjs](characters.test.mjs): `the Arena's matchup names characters, a model standing for its own, and a bout builds each side's` | A link names characters, an older link models, and a recipe names a character only where it is not its model's own, so recipes saved before characters had names still read alike; a bout cannot show a link read to the wrong character or a recipe building another model's character. |
| [skills/variations.test.mjs](skills/variations.test.mjs): `a character's skills are a list of skill/variation, none twice, carried whole by a link` | Refuse a bare skill, a duplicate and the old map before construction, and keep a link's list as written, empty or absent apart; a fight built from a resolved character never meets these inputs. |
| [skills/variations.test.mjs](skills/variations.test.mjs): `every skill part, whatever its role, runs only on a body whose character holds it` | Each skill part of every role must fit some character that holds it and refuse the same body once its character drops it; the shipped characters hold everything they run, so no fight shows a guard, gait, technique or navigation run without being held. |
| [skills/profiles.test.mjs](skills/profiles.test.mjs): `a strike's record counts its own limb's tries its executor gave up on` | Check that self-abandoned attempts lower that limb's estimate, another limb's record is unchanged and cancelled attempts are excluded. A one-strike trial does not establish learning from a history of stalls. |
| [minds/option/lying.test.mjs](minds/option/lying.test.mjs): `lying retains an opportunity cost against a foe with no modelled hand attack` | Detect zero lost-opportunity cost for remaining down when the foe has no modelled hand attack. Compare durations and an upright out-of-reach state without fixing tuned values; a rise ordered by a drill bypasses this decision rule. |

## Evaluation integrity

[evaluation/travel.test.mjs](evaluation/travel.test.mjs) replays contact inputs on a real body's read geometry without playing a gait.

| Case | Concrete justification |
| --- | --- |
| `travel reads attached toe support for entry, stepping and quiet standing` | The travel reader misses physical toe-only support, losing entry, first-leg coverage and quiet standing. Replay the observed contact topology through the whole reading and exclude detached toes; a gait drill cannot isolate reader arithmetic from controller behaviour. |

[evaluation/swap.test.mjs](evaluation/swap.test.mjs) constructs schedules and resolves subjects without playing them.
The calibration fixture supplies an independently scoped entrant. These checks protect the
measurement system itself; a result computed on the wrong cases cannot validate its own scope.

| Case | Concrete justification |
| --- | --- |
| `CLI ablations inherit calibrated bodies and loadouts before scheduling paired cases` | Prevent an ablated configuration from expanding to bodies/loadouts outside its source calibration or leaving unpaired work in a comparison. |
| `mind batteries admit only a named calibration's bodies and preserve that scope through CLI ablations` | Check court/crowd admission, including refusal when a named calibration fits no protocol case. These schedule paths differ from tournament subject expansion. |
| `a match admits complete pairs within named calibrations and preserves the scope of ablations` | Apply calibration scope to both bodies of each complete match unit, without changing recipes, keys or pairing. Checking only one participant admits an invalid comparison. |
| `every evaluation's default panel names entrants it has` | Detect a stale panel identifier that throws during subject resolution before a requested evaluation can play. |
| `every evaluation protocol and the Node stand play on the game's engine` | The falls, the Rise drill and the baseline's stand-up were pinned to parent-axis `rapier` while the game runs `DEFAULT_ENGINE`, so stand-up was tuned and graded on physics play never uses. Read every registered protocol's engine and the stand's default; a drill plays on whatever engine its protocol names and cannot detect the mismatch. |

## Repository integrity

| File and case | Concrete justification |
| --- | --- |
| [documents.test.mjs](documents.test.mjs): `anchors_are_github_slugs_a_repeated_heading_numbered` | Check heading normalization, duplicate suffixes and explicit anchors used when resolving Markdown links. A scanner with incorrect anchor generation rejects working links or accepts broken ones. |
| [documents.test.mjs](documents.test.mjs): `broken_citations_are_the_missing_file_heading_and_target_and_nothing_present` | Prove that citation traversal finds missing files, missing anchors and escaping paths while respecting code fences and reference links. |
| [documents.test.mjs](documents.test.mjs): `comment_marks_are_the_dates_hashes_plan_citations_and_the_owner_in_comments_of_src_only` | Check the comment lexer against strings, regular expressions and nested templates so it does not report executable literals as prohibited comment text or overlook actual comments. |
| [documents.test.mjs](documents.test.mjs): `every_document_cited_resolves_and_no_comment_in_src_holds_a_mark` | Apply the validated citation and comment scanners to the working repository, catching dangling documentation after code or document removal. |
| [script-links.test.mjs](script-links.test.mjs): `broken_links_are_the_missing_module_and_the_missing_name_and_nothing_present` | Prove the research-import scanner follows re-exports and destructured exports and detects both missing modules and missing exported names. |
| [script-links.test.mjs](script-links.test.mjs): `every_research_script_and_script_imports_what_exists` | Catch stale JavaScript research/CLI imports outside the TypeScript compilation before someone starts a run that cannot load. |
| [workspace.test.mjs](workspace.test.mjs): `strays_are_the_untracked_outside_tracked_folders_the_hidden_and_the_garbage_and_nothing_kept` | Check the file inventory against unmanaged snapshots, hidden directories, crash dumps, research runs no README names and a file added to Git past the rule that ignores it, while preserving legitimate ignored tools and work in progress. |
| [workspace.test.mjs](workspace.test.mjs): `the_working_copy_holds_no_strays` | Apply that inventory to the actual workspace so untracked output, hidden storage, research runs past their budget or unnamed by a README, and files both tracked and ignored do not accumulate unnoticed. |

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
| [skill-search.test.mjs](skill-search.test.mjs): `searched recovery angles remain inside the body ranges at both decoded endpoints` | The Skeleton roll search decoded hip flexion below its anatomical minimum, so candidate trials threw rather than testing a roll. Check both decoded endpoints through the staged recipe's admission on each humanoid and each searched recovery; successful drill trials do not cover the search's range. |
| [tooling.test.mjs](tooling.test.mjs): `one entrant cannot remove another through the shared registry line` | Reproduce a single entrant deleting a rival from the shared array while the ownership classifier still calls the change its own. A match does not check source ownership. |
| [tooling.test.mjs](tooling.test.mjs): `build source identity canonicalizes included authoring text but preserves binary bytes` | Reproduce identical Python, PowerShell and Markdown inputs receiving different build identities after checkout line-ending conversion; keep binary distinctions intact. |
| [tooling.test.mjs](tooling.test.mjs): `idle learning-worker errors survive until the next protocol request` | Reproduce a background environment failure discarded while no request waits; the next trainer request must receive that failure. Skill outcomes do not establish worker error delivery. |
| [tooling.test.mjs](tooling.test.mjs): `a reported research job failure closes every worker before rejecting` | Reproduce a rejected posture job leaving its worker message listener alive and preventing child exit. The check asserts every owned worker is terminated before failure reaches the caller. |
| [learning-network.test.mjs](learning-network.test.mjs): `malformed learned layers return faults instead of throwing while inspecting shape` | Reproduce a null first layer throwing before a configuration refusal can be returned. A trained policy contains valid shapes and cannot establish malformed-record admission. |
| [learning-network.test.mjs](learning-network.test.mjs): `learned inference retains clipped observation and action preprocessing` | Reproduce exported inference omitting the trainer's observation clamp, including a non-saturated final action, and preserve its pre-tanh action bound. Successful drills do not establish export/trainer equivalence. |

[rapier-hooks.test.mjs](rapier-hooks.test.mjs): `a contact-layer callback defect reaches the world-step caller unchanged` reproduces a material callback throwing while the vendored WASM bridge silently returns a successful step. The overlapping-contact fixture verifies the original thrown value and callback receiver at the actual engine boundary; a normal bout installs no material layer and cannot exercise this defect.

`an articulated force-based angular spring uses radians` catches a generic motor row using a
half-angle sine instead of radians, doubling a free spring's displacement.
`an articulated contact enforces its material compression cap` catches generic contacts ignoring
a requested compression cap. Both use a fixed root to isolate those contracts;
ordinary capability drills use impulse joints and rigid contacts, so cannot expose these defects.

## Layer contract regressions

`the punch from guard does not begin its drive with its striking arm away from its guard or still moving`
in [skills/boundaries.test.mjs](skills/boundaries.test.mjs) reproduces a fight punch committing
while its elbow is displaced and moving. It checks every striking-arm freedom on each hand,
then lets the arm at its guard begin; strike outcomes alone do not establish when it begins.

[skills/locomotion/cycle-run.test.mjs](skills/locomotion/cycle-run.test.mjs) checks the running reference through its published knee-channel requests.

| Case | Concrete justification |
| --- | --- |
| `run cadence scales clip feedforward with the reference phase` | Cadence advances the reference faster or slower while its feed-forward velocity can retain the unscaled rate. Two servo times separate that velocity from pose feedback on a real body, then compare it with the reference's finite difference. A locomotion drill can hide the missing factor through pose feedback. |

[skills/locomotion/learned-run.test.mjs](skills/locomotion/learned-run.test.mjs) checks travel answer timing through the research adapter.

| Case | Concrete justification |
| --- | --- |
| `a travel answer acts over exactly its own decision interval` | Reproduce learned corrections taking the outputs held before the trainer answers, so each action acts a decision late and takes its predecessor's reward. Eight distinct answers through the adapter on a real body are checked on every step of their own transition. Training runs and drills read returns, which the lag only lowers. |
| `restoring a moving start preserves the curriculum's stop and pace orders` | Restoring a moving snapshot writes into a cue's borrowed order object, replacing stop with go across episodes. Replay stop, go and stop from a physically reached native walk; check the complete scripts and delivered paces. A drill plays one case without this repeated training reset. |

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
| `walking preserves requested world velocity while facing turns` | Updating the facing before converting the moving-frame velocity rotated a fixed world order. Compare the complete stance command during the observed simultaneous walk and turn; movement drills hide the small per-step rotation. |
| `ordered facing keeps route facing on a long trip and takes over before stopping` | A short backing correction faced its route and stopped facing away; preserving explicit facing for an entire trip also prevented the forward-only run from running to a distant place. Punch drills cover the short correction but never the long trip's route-facing policy. |
| `fallen footprints retain observed elevation through navigation memory` | A fixed world height made an elevated fallen body disappear from navigation at its supporting level. |
| `a changed destination retains a planned route while locomotion is unavailable` | Reproduce a dragged destination clearing the navigation report during an unavailable movement step. Check the updated route around a wall and suppressed movement together; skill drills do not check paths reported between movement steps. |

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
| `mind threads send a gait value replaced since it was last said` | Transport suppressed changed gait values. A report's owners now replace a value that changes (`gaitLimits`), so the thread sends a field by identity: a replaced gait value crosses, and one said already does not. |
| `frame measurement retains worker cost and excludes interpolation-only batches` | Worker time was omitted and zero-step presentation batches were divided into timing figures. |
| `the shape renderer draws an admitted capsule with coincident endpoints` | Valid zero-length capsules reached a renderer that rejected their coincident endpoints. |

| File and case | Concrete justification |
| --- | --- |
| [evaluation/swap.test.mjs](evaluation/swap.test.mjs): `custom subjects retain execution scope through normalization` | Custom subject adapters lost body restrictions and attributes. |
| [evaluation/swap.test.mjs](evaluation/swap.test.mjs): `a run's rows refuse incomplete or conflicting cases` | Incomplete rows were admitted, and of two rows that read one case differently the first was taken without agreement. |
| [evaluation/swap.test.mjs](evaluation/swap.test.mjs): `a table cell is valued only on every protocol case with none faulted` | One passing row satisfied a full run cell; null fault readings were dereferenced. |
| [evaluation/swap.test.mjs](evaluation/swap.test.mjs): `Cover requires an attempted attack before untouched can pass` | An opponent that never attacked produced a passing untouched result. |
| [skills/boundaries.test.mjs](skills/boundaries.test.mjs): `resource compilation separates segment names from services and uses physical bearing chains` | Valid segment names collided with logical services, and a bearing end without an effector lost its support channels. |
| [skills/boundaries.test.mjs](skills/boundaries.test.mjs): `Option skills assemble with physical feet alone and an effector named assist` | Stock physical feet without optional actuators and an opaque renamed hand failed before their skill assembly could stand. |
| [skills/boundaries.test.mjs](skills/boundaries.test.mjs): `admission resolves guard, staged channels and timed strike and gait settings before construction` | Admitted null guard tuning, absent staged channels and zero divisors threw during construction; a neutral-only hand received an undeclared open command. |
| [skills/boundaries.test.mjs](skills/boundaries.test.mjs): `default skill assembly roots the one configured memoryful aim` | Saving the default assembly omitted its hidden aim's memory and retained later calls after restoration. |
| [skills/boundaries.test.mjs](skills/boundaries.test.mjs): `Move does not erase a gait's complete runs setting when sharing instances` | Generic gait sharing erased a concrete configuration field and merged independently configured controllers. |
| [skills/profiles.test.mjs](skills/profiles.test.mjs): `a skill's identity includes the selected aim's declared data` | Aim-owned data changed without changing the skill digest. |
| [skills/profiles.test.mjs](skills/profiles.test.mjs): `a zero-length failed profile trial has a finite failed rate` | A failed zero-duration trial produced NaN instead of a failed finite rate. |
| [tooling.test.mjs](tooling.test.mjs): `closing research workers settles queued work and refuses work after close` | Closing a pool left queued promises pending and admitted subsequent work. |
| [tooling.test.mjs](tooling.test.mjs): `research worker exit after a completed sibling rejects and closes all workers` | A worker exit after its sibling completes settles the remaining job and terminates both workers. The fixture requests that exit from the completion callback; skill outcomes do not establish worker cleanup. |
| [minds/contract.test.mjs](minds/contract.test.mjs): `a measured Lab script follows an explicit numeric walk without a gait envelope` | A valid numeric order reached the script but received zero obedience value without a calibration, so the chooser held still; trace the measured actor through selection to its first landing. Calibrated drills do not reach this path. |

## Recovery fixture and reporting

| Case | Concrete justification |
| --- | --- |
| [evaluation/technique-code.test.mjs](evaluation/technique-code.test.mjs) | Rise reused every cached front-sit-back case after the Rogue's sit-back record changed because technique worlds named their code but omitted their data. Verify scheduled keys change for each installed record read, while an unread record leaves them alone; a played recovery outcome cannot establish cache invalidation. |
| [evaluation/rising-target.test.mjs](evaluation/rising-target.test.mjs) | The Warrior club-and-buckler fresh fixture (`evaluation/fixtures/warrior-club-buckler-falls.jsonl`) contains an unproduced fall that was counted against recovery; verify its exclusion from the counts and the mean time to stand. The same observed shove, held once, must produce a fall with escalating retries. Drills do not establish fixture coverage or report arithmetic. |

| [skills/boundaries.test.mjs](skills/boundaries.test.mjs): `idle foot placement survives its own weight-shift tracking error and yields to a catch` | A wide placed Warrior cancels its own weight shift when tracking lags, repeating planted-foot attempts. Preserve the lift request through that observed lag and release it for a real catch; a recovery drill does not isolate cancellation ownership. |
