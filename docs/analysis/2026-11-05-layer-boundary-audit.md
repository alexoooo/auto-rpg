# Layer boundary and invariant audit

The [clean-boundaries plan](../plans/2026-11-05-clean-layer-boundaries.md) owns corrective work. This record
contains 103 confirmed findings and 2 unresolved questions. A confirmed finding
can be a misplaced responsibility, an inconsistent public contract, or a reproduced failure;
its evidence states which. Source review and passing gates do not prove the absence of defects.
Implementation remains unfinished while these findings remain open.

## Scope and method

The review reads all 891 tracked first-party executable, template and stylesheet files
in the inventory, totalling 105,799 lines, plus the three authored Rapier overlay/build
files. It follows relevant callers, registered declarations, private state, data providers and
failure cleanup. Authored build and research configuration receives a supplemental review.
The [file ledger](2026-11-05-layer-boundary-files.md) gives every path a responsibility and review outcome.
An outcome with no finding means that this review records none for that file.

Small disposable probes check contract failures without training or a gameplay battery. They
cover actual registered parts and physical fixtures where applicability matters, and isolated
serialization, ownership, provenance and worker protocols where physics is irrelevant. Each
finding retains the triggering conditions and observed limit of its evidence.

Upstream dependency internals, the vendored binary archive, binary art, generated lockfile
entries and historical measurement payloads remain outside line-by-line semantic review. Their
first-party adapters, build scripts, authored patch, asset readers, schemas, provenance and
record consumers are included. Research schedule/search payloads are checked through their
executable schema and consumers; this review does not replay archived scores or certify tuned
values. Presentation-only local state is distinguished from durable simulation memory.

## Reading the findings

Each ID names one repair obligation. Related findings can require one coordinated change, but
an owner move, a contract correction and a behavior correction need their own evidence. The
file ledger links every affected path back here. Each unresolved question has a specific
verification task and is not counted as a confirmed defect.

General segment/configuration commands follow declared body capabilities. Anatomical laterality belongs to its body owner;
Arena seating belongs to gameplay. A named constant alone does not resolve that distinction.
Humanoid skins, boxing policies, biped controllers and explicitly scoped research fixtures can
retain their own anatomy. Their fit predicates must describe everything they actually require.

## Foundations and physical/control ownership

<a id="fnd-001"></a>

### FND-001: Synthetic contact fixtures attribute invented values to an anatomical paper

**Where:** [research/contact-friction.mjs](../../research/contact-friction.mjs) (`q synthetic sliding slab`), [research/contact-linked.mjs](../../research/contact-linked.mjs) (`q synthetic linked contact fixture`), [research/contact-step.mjs](../../research/contact-step.mjs) (`synthetic q factory`), [research/contact-stops.mjs](../../research/contact-stops.mjs) (`synthetic q factory`).

**Rule:** A spec number is sourced to its actual paper/asset or tuning purpose; provenance must not claim a paper supplies synthetic geometry/muscle numbers.

**Evidence and effect:** The q factories attach source de-leva-1996 to every synthetic slab/hinge quantity, including arbitrary box geometry, inertia, stiffness and torque; contact-linked explicitly says not anatomical data in the note. Any provenance reader reports de Leva for values that do not come from that source; diagnostic fixtures violate the same spec provenance contract as runtime bodies.

**Repair:** Give synthetic fixtures a dedicated asset or tuned source recording the actual fixture purpose, and retain all values unchanged.

**Verification:** Inspect every synthetic q factory in the contact diagnostics, assert provenance points to the fixture source, and rerun only the affected diagnostic if its numerical data changes.

<a id="fnd-002"></a>

### FND-002: Adapter benchmark rebases imports against deleted engine directory

**Where:** [research/engine-adapter-cost.mjs](../../research/engine-adapter-cost.mjs) (`reference adapter source.replace path resolver`).

**Rule:** Moved callers and diagnostic paths must remain executable; report-only tooling must measure the intended implementation.

**Evidence and effect:** git show reads src/core/physics/rapier.ts, but its relative imports are resolved against src/core/engine. Its ./engine.ts therefore becomes src/core/engine/engine.ts, which does not exist. The paired adapter-cost diagnostic fails before building its reference and cannot establish its advertised before/after timing or trajectory result.

**Repair:** Resolve extracted imports relative to the source path being extracted, or use the reference source tree with its actual dependency paths.

**Verification:** Run a cheap extracted-reference import smoke check against an existing post-move commit before pricing the paired benchmark.

<a id="fnd-003"></a>

### FND-003: Scaling benchmark discards queued GC observations

**Where:** [research/physics-bakeoff/perf.mjs](../../research/physics-bakeoff/perf.mjs) (`PerformanceObserver and once() counting flag`).

**Rule:** Measurement figures must report their actual harness behavior; a GC-contaminated allocation sample must not be reported as allocation per step.

**Evidence and effect:** PerformanceObserver delivers entries asynchronously. once() runs the synchronous scaling interval and resets counting=false before callback delivery; every queued entry is then discarded by if(!counting)return. gcCount can remain zero despite a collection in the timed interval, so heap growth is reported as allocation with an ineffective contamination check.

**Repair:** Collect timestamped GC entries across asynchronous delivery and attribute them to explicit timed intervals before accepting allocation samples.

**Verification:** Disposable Node --expose-gc probe reproducing observer delivery pattern: raw events=1, counted events=0 after 30ms; no simulation.

<a id="fnd-004"></a>

### FND-004: Plain state records collide with reserved vector discriminator

**Where:** [src/core/world/state.ts](../../src/core/world/state.ts) (`loadState tag dispatch`).

**Rule:** Saved plain data restores whole without changing its kind or losing fields.

**Evidence and effect:** saveState accepts a plain record with {"~":"vector",at:[1,2,3],label:"keep"}; loadState treats it as its internal Vector3 encoding. A permitted plain state value reloads as Vector3 and loses label, breaking exact restoration/forks for that value.

**Repair:** Use an unambiguous tagged serialization representation or escape plain records carrying the internal discriminator.

**Verification:** Cheap Node probe restored item.constructor.name=Vector3 and label=null instead of the original plain record.

<a id="fnd-005"></a>

### FND-005: deepFreeze does not freeze permitted Map/Set constants

**Where:** [src/core/world/state.ts](../../src/core/world/state.ts) (`deepFreeze`).

**Rule:** A constant a saved state points at is immutable; deepFreeze documents freezing everything held.

**Evidence and effect:** Object.freeze(Map) does not block set/delete/clear; Object.values(Map/Set) does not descend into their values. Maps/Sets are expressly supported state types above. A declared frozen constant Map can mutate and its nested values remain mutable; shared tuning/state constants can change between forks.

**Repair:** Define and enforce immutable supported-container handling, or reject mutable containers from constants rather than claiming deepFreeze freezes them.

**Verification:** Cheap Node probe: deepFreeze(new Map([["a",1]])).set("a",2) succeeds and get("a") is2.

<a id="fnd-006"></a>

### FND-006: Physical attribute module owns editor presentation and combat help

**Where:** [src/core/bodies/character-attributes.ts](../../src/core/bodies/character-attributes.ts) (`CHARACTER_ATTRIBUTES`).

**Rule:** Core owns physical capabilities; browser/editor presentation belongs to browser/game presentation.

**Evidence and effect:** CHARACTER_ATTRIBUTES includes labels, unit formatting, editor increments and help describing rulebook head/limb damage; validation reads its labels. Physical model validation depends on editor metadata and stock combat prose.

**Repair:** Keep attribute names/ranges and plain validation in the body domain; move editor info/help to browser/game metadata with explicitly shared attribute keys.

**Verification:** Trace consumers and preserve editor labels and validation behavior during split.

<a id="fnd-007"></a>

### FND-007: Physical model families choose stock equipment defaults

**Where:** [src/core/bodies/models.ts](../../src/core/bodies/models.ts) (`Family.info and modelLoadout`).

**Rule:** Anatomy/model construction is separate from game/app default equipment policy.

**Evidence and effect:** HUMANOID embeds held:"sword", quadrupeds held:"empty"; modelLoadout chooses right-hand equipment from these family defaults. Physical catalog decides game spawn/loadout policy, so changing defaults modifies core anatomy module.

**Repair:** Move model equipment defaults and default loadout selection to game/app composition; retain physical compatibility/assembly in bodies.

**Verification:** Trace Duel/matchup/Dungeon default callers; preserve exact selected loadouts.

<a id="fnd-008"></a>

### FND-008: Physical equipment module owns representative evaluation roster

**Where:** [src/core/bodies/items/held.ts](../../src/core/bodies/items/held.ts) (`REPRESENTATIVE`).

**Rule:** Evaluation owns rating conditions; body/item core owns physical equipment and compatibility.

**Evidence and effect:** REPRESENTATIVE selects five loadouts and states which assignments minds are rated on. Evaluation protocol policy is embedded in physical core.

**Repair:** Move representative roster to evaluation conditions owner and update evaluation/research readers; retain full equipment catalog/assembly in body domain.

**Verification:** Reader inventory and exact equality of selected ordered loadouts.

<a id="fnd-009"></a>

### FND-009: Rulebook nested overrides retain mutable caller aliases

**Where:** [src/combat/rulebook.ts](../../src/combat/rulebook.ts) (`rulebook return`).

**Rule:** Tuning is immutable; experiment override creates an immutable independent rulebook.

**Evidence and effect:** rulebook freezes its outer result and copies pointLoad, but spreads override.life, worth, layers and balance by reference. A mutable override.life remains the rulebook life object. Caller can change live combat scoring or assistance policy after construction; parallel/forked worlds can observe different rules without changing configuration identity.

**Repair:** Defensively snapshot and freeze nested supplied policy values, preserving sourced provenance and original numeric behavior.

**Verification:** Cheap pure Node probe mutated caller life.trunk after rulebook construction; rules.life.trunk.value became 7. No simulation.

<a id="fnd-010"></a>

### FND-010: Combat treats every configurable segment as a bare hand

**Where:** [src/combat/blows.ts](../../src/combat/blows.ts) (`limbs map / spared threshold`).

**Rule:** General collision configuration is anatomy-neutral; body/combat traits own injury eligibility.

**Evidence and effect:** watchBlows builds bare-limb set from spec.segments.filter(segment=>segment.configurations), then applies rules.fist exemption on bare anatomical contact. ConfigurationSpec now describes arbitrary declared shapes, not hands. A configurable trunk/tail receives the knuckle injury exemption; a nonconfigurable hand cannot receive it. Physical shape control accidentally chooses combat injury policy.

**Repair:** Declare the intended anatomical eligibility explicitly through body/combat metadata and use that in injury rules; retain existing human hand and foot behavior.

**Verification:** Trace watchBlows land -> limbs.has -> spared -> sideDamage; future cheap custom non-hand configuration regression should compare exact damage with and without irrelevant shape configurability.

<a id="fnd-011"></a>

### FND-011: Detached observations require a literal head segment

**Where:** [src/control/observation.ts](../../src/control/observation.ts) (`observeBody return.head`).

**Rule:** Generic physical readings follow BodySpec.marks.high rather than anatomy names.

**Evidence and effect:** physicalReading reads spec.marks.high; observeBody returns head only when built.segments.has("head"). A valid body naming its high target otherwise loses the high reading in BodyObservation, including bare Mind/research consumers.

**Repair:** Use the same declared high-mark availability in detached observation as physicalReading.

**Verification:** Observed in a disposable probe: valid workshop body with head renamed crown and sole segments renamed sole.A/sole.B, all references updated. At zero world steps soleRefusal returned null, observeBody.head was null despite marks.high=crown, and standingFooting threw Cannot read properties of undefined (reading spec). No simulation or retained test added.

<a id="fnd-012"></a>

### FND-012: Control calibration module imports skill-owned assets and rating protocol

**Where:** [src/control/stance-envelope.ts](../../src/control/stance-envelope.ts) (`imports, WENT/TURNED, envelope providers`).

**Rule:** Shared control owns generic motion mechanics; concrete locomotion owns calibration and evaluation owns trial acceptance.

**Evidence and effect:** The module imports both assets/skills/locomotion/stance and walk-run JSON, exports concrete providers, and defines wentAsAsked/turnedAsAsked used by the research battery. Higher-layer skill data and rating acceptance policy sit inside shared control; source-only import checker misses JSON ownership.

**Repair:** Retain neutral envelope types/interpolation below; move each asset provider beside its locomotion/balance owner and move trial acceptance to owning measurement protocol, injecting provider into stock motor assembly.

**Verification:** Trace walk-run.ts provider and stance-balance.ts envelope; preserve current ordered values, case identity and fingerprint.

<a id="fnd-013"></a>

### FND-013: Stomp and bite policy helpers remain in control

**Where:** [src/control/support-readiness.ts](../../src/control/support-readiness.ts) (`STRIKE_SUPPORT/supportReadiness`), [src/control/quadruped/fit.ts](../../src/control/quadruped/fit.ts) (`fitsJaw`), [src/control/effector-feedback.ts](../../src/control/effector-feedback.ts) (`unintendedContact/contactResponse`).

**Rule:** A single implementation owns its private settings/helpers; shared skill decisions belong with skills, physical control with control.

**Evidence and effect:** supportReadiness/plantedSupport only imported by stomp.ts; fitsJaw only imported by bite/index.ts; contact predicates only used by bite and effector-strike. Control owns skill-specific strike readiness and selected-foe response decisions despite otherwise generic feedback/topology APIs.

**Repair:** Move stomp readiness beside stomp, jaw fit beside bite, and shared strike contact-response predicates under strikes; leave physical samplers and paw motor fit in control.

**Verification:** Exact reader inventory by rg; preserve predicate results and stock numeric settings.

<a id="fnd-014"></a>

### FND-014: Recovery acceptance measurement is mixed into control

**Where:** [src/control/recovery-measurement.ts](../../src/control/recovery-measurement.ts) (`recoveryMeasurement`).

**Rule:** Task/Lab/recovery acceptance owns its criteria; generic control should not choose task completion.

**Evidence and effect:** Function hardcodes lowerTrunk, root/sole up .9, slow .1 and two-foot contact support. Callers are game/lab/ground-mode and recovery research. Control exports a specific humanoid recovery-to-host acceptance procedure, making these task thresholds appear universal physical readings.

**Repair:** Move acceptance assembly to recovery measurement/task owner, keeping reusable detached observation/support geometry in control; preserve current Lab and research behavior.

**Verification:** Trace all six reader paths; compare exact outputs on saved/placed fixtures without changing acceptance thresholds.

<a id="fnd-015"></a>

### FND-015: Hot joint servo allocates solver work on every solve

**Where:** [src/control/servo.ts](../../src/control/servo.ts) (`solveAround`).

**Rule:** The step's dear functions work in arrays made once.

**Evidence and effect:** servoSolve invokes solveAround per clipping pass; solveAround creates F/S arrays and, when fixed freedoms exist, L/b typed arrays for every invocation. Per-step per-body allocation and GC pressure remains in an explicitly hot numeric solve. This audit makes no timing magnitude claim.

**Repair:** Give each servo reusable sized index/factor/RHS work and preserve operation ordering.

**Verification:** Before/after explicit allocation/time diagnostic plus exact solve and fingerprint; do not run broad measurement during source audit.

<a id="fnd-016"></a>

### FND-016: Network fault validator throws on a malformed null layer

**Where:** [src/core/math/learning/recovery-network.ts](../../src/core/math/learning/recovery-network.ts) (`readFaults`).

**Rule:** Expected malformed-input refusal is returned as faults, not a defect throw.

**Evidence and effect:** readFaults checks layers is a nonempty array, then dereferences first.weights and each layer.bias without checking layer is an object. Malformed loaded/configured network can raise TypeError instead of returning the documented faults record.

**Repair:** Validate each layer/row object shape before property access; keep valid inference arithmetic unchanged.

**Verification:** Pure Node networkFaults({actions:1,layers:[null]}) throws: Cannot read properties of null (reading 'weights').

<a id="fnd-017"></a>

### FND-017: Read-only contact translation mutates cached physics contacts and loses identity

**Where:** [src/core/bodies/build/read-view.ts](../../src/core/bodies/build/read-view.ts) (`named`), [src/core/physics/rapier.ts](../../src/core/physics/rapier.ts) (`contactsOf unfiltered cache`).

**Rule:** Read-only body view exposes stable detached identities without modifying engine authority/data.

**Evidence and effect:** named changes contact.other in place. Rapier unfiltered contactsOf and contactManifoldsOf cache these objects. First read replaces engine body with its read view; second refOf processes the already translated view, creating another identity object. Repeated physical reads lose stable identity; own-segment contact sets such as effectorFeedback can misclassify self contacts. Filtered combat watchTouches rebuilds records and is not proven affected.

**Repair:** Translate into separately owned read-contact records or cache detached identity projections without rewriting adapter contact records.

**Verification:** No-simulation cache stub probe: adapterOtherChanged=true, firstIsOwn=true, secondIsOwn=false, stable=false. Trace unfiltered adapter cache and effectorFeedback own Set.

<a id="fnd-018"></a>

### FND-018: Impact mass keeps severed parts articulated after joint release

**Where:** [src/core/bodies/build/contact-mass.ts](../../src/core/bodies/build/contact-mass.ts) (`lineage/update`), [src/combat/touches.ts](../../src/combat/touches.ts) (`massAt`).

**Rule:** Physical impact response reflects current attachment topology; severed parts no longer belong to surviving body.

**Evidence and effect:** contactMass snapshots original joints/lineage and never reads attached(); update includes all segment masses and every original joint. bodyDynamics separately handles cuts, showing the missing topology update. A later blow on surviving anatomy is priced against mass/mobility including detached parts, inconsistent with the actual released physics body.

**Repair:** Partition the current attached component for contact mass queries or rebuild/cache the physical component model when release/restoration changes topology.

**Verification:** No-simulation two-body probe: axial root mass before2.0000000000000004, after joint attached=false still2.0000000000000004; isolated root physical mass1.

<a id="fnd-019"></a>

### FND-019: Standing footing hardcodes humanoid foot segment identifiers

**Where:** [src/control/support.ts](../../src/control/support.ts) (`standingFooting`), [src/skills/locomotion/stance-walk-part.ts](../../src/skills/locomotion/stance-walk-part.ts) (`STANCE_WALK_PART.make`), [src/skills/locomotion/locomotion.ts](../../src/skills/locomotion/locomotion.ts) (`turned`).

**Rule:** Declared BodySpec foot ends determine segment identity; bilateral mechanics need not require humanoid spelling.

**Evidence and effect:** standingFooting resolves foot.${side} for midpoint and length, while stanceFeet/soleRefusal use declared segment identifiers. The locomotion yaw reader repeats the literal names. A valid renamed-foot body passes fit and then fails construction. A declared box-foot body with renamed segments passes the balance fit but fails constructing standard locomotion/guard footing. An otherwise compatible renamed two-foot body fails construction or silently skips orientation correction.

**Repair:** Resolve every foot through stanceFeet/end.segment in standing footing and locomotion yaw, preserving arithmetic and ordering.

**Verification:** Observed in a disposable probe: valid workshop body with head renamed crown and sole segments renamed sole.A/sole.B, all references updated. At zero world steps soleRefusal returned null, observeBody.head was null despite marks.high=crown, and standingFooting threw Cannot read properties of undefined (reading spec). No simulation or retained test added. a disposable probe reproduces the construction/window exception using compatible renamed foot spec and one-support view.

<a id="fnd-020"></a>

### FND-020: Stance applicability omits required leg topology

**Where:** [src/control/support.ts](../../src/control/support.ts) (`soleRefusal/footStatesOf/fitOf`), [src/control/swing-leg.ts](../../src/control/swing-leg.ts) (`swingLegOf`).

**Rule:** An implementation declares applicability and refuses unsupported anatomy before construction.

**Evidence and effect:** soleRefusal tests only left/right box soles. footStatesOf indexes chain[2], swingLegOf indexes hip/knee/ankle and hip abduction; valid generic body ends can lack these. BalancePart fits can report success and then construction throws a TypeError or reads wrong joints instead of returning fit refusal.

**Repair:** Have the stance-owned fit verify exactly the chain and freedoms its motor assumes, using declared from/topology; retain specialized biped motor rather than generalizing its algorithm.

**Verification:** Cheap specification fit probe plus construction on a two-foot body with unsupported chain; no gameplay tuning required.

<a id="fnd-021"></a>

### FND-021: Stance-private planner and state modules remain outside their implementation package

**Where:** [src/control/gait.ts](../../src/control/gait.ts) (`stance footstep planner`), [src/control/stance-state.ts](../../src/control/stance-state.ts) (`Stance internals`).

**Rule:** Original organization plan: each implementation owns internal algorithms/parameters/caches; module used by one implementation lives under it.

**Evidence and effect:** gait.ts is imported by stance.ts and imports stance-state.ts; stance-state is read by stance and its gait only. Their paths appear as general control libraries despite being private stance algorithms/state. Paths still obscure ownership and allow unrelated consumers to treat stance internals as shared APIs.

**Repair:** Group these private modules under the stance implementation; preserve public shared geometry and types used by other controllers/skills.

**Verification:** Import-reader inventory proves one implementation; path rewrite must preserve fingerprint and public callers.

<a id="fnd-022"></a>

### FND-022: Stance reset retains recovery mode flag used by later heading control

**Where:** [src/control/stance.ts](../../src/control/stance.ts) (`stanceControl.reset / command heading`), [src/control/gait.ts](../../src/control/gait.ts) (`ownStep idle branch`).

**Rule:** Reset forgets control under way; new command begins from current body, not prior recovery state.

**Evidence and effect:** reset clears step.swing/facing/catching but not step.recovering. ownStep with no new walk/catch does not clear recovering; command then latches reading.facing instead of using goal.heading while recovering remains true. Diagnostics agent reproduced this with a real built Warrior/controller and no state edits: initial uniform +z velocity 0.8 triggers a natural recovery swing after one step; reset leaves recovering=true and own=null; after zeroing uniform velocity and reading one further step, a two-foot goal heading 0.5 produces materially different heading aim versus a fresh controller on the identical body. After an explicit reset during a naturally triggered catch, a subsequent standing-turn goal can be suppressed by stale recovery-facing state until another walk/catch clears it.

**Repair:** Reset all behavior-relevant recovery phase flags, preserving cumulative counters intentionally retained.

**Verification:** Actual stock workshop-fighter in coreStand, Rapier120Hz. Uniform initial forward linear velocity0.8m/s on every rigid segment. No saved/controller state was altered. Two world steps total. The initial motion legitimately starts a recovery swing. reset cancels the step and clears facing, but leaves recovering true. After stopping the body and reading it, no recovery/own step exists; the ordinary changed-heading stance still latches its current facing. A newly constructed stanceControl reading the identical current body instead asks the requested turn. Normal post-catch retention until a walk is intentional; retention across reset contradicts its separate published contract.

## Mind composition, registration and evaluation

<a id="mg01"></a>

### MG01: General hosting chooses the Arena rulebook

**Where:** [src/minds/host.ts](../../src/minds/host.ts) (`ARENA and rulesOf`), [src/minds/minds.ts](../../src/minds/minds.ts) (`createMind / warmApart`).

**Rule:** Application/game composition supplies concrete rules; Mind hosting receives its grants.

**Evidence and effect:** HostGrants.rules is optional and rulesOf falls back to rulebook("arena"). Both local bodyHost and worker recipes use that result. A reused Mind host silently inherits a particular game rulebook when its caller omits rules.

**Repair:** Require explicit rules at hosting boundaries and resolve gameplay defaults in application/game composition.

**Verification:** Read full host.ts and both local/worker create paths; root independently confirmed.

<a id="mg02"></a>

### MG02: Option root owns stock data and display/behavior metadata

**Where:** [src/minds/option/mind.ts](../../src/minds/option/mind.ts) (`optionMind controller metadata`), [src/entrants/walker/index.ts](../../src/entrants/walker/index.ts) (`OPTIONS`).

**Rule:** Registered components own their behavior, parameters, data reads and labels; shared frameworks do not assert stock assembly properties.

**Evidence and effect:** The root unconditionally declares obeys:true, guard:Guarding and reads strike-profiles/edge-profiles even when configured options/predictions differ. Walker omits the follow-orders Option yet treeObeys sees the root assertion. Assembly-independent root metadata can advertise capabilities/labels it does not implement and load unrelated records.

**Repair:** Move the declarations to actual components/assembly and derive aggregate capabilities from the configured tree.

**Verification:** Read Option root, Walker assembly, catalog treeObeys/phaseLabels/treeData; gameplay consumers still under review.

<a id="mg03"></a>

### MG03: Option skill conflict checks bypass registered declarations

**Where:** [src/minds/option/mind.ts](../../src/minds/option/mind.ts) (`navigationOf and optionsFaults`), [src/minds/option/kinds.ts](../../src/minds/option/kinds.ts) (`OptionKindPart.skills and skillsOf`).

**Rule:** A custom registered component receives the same validation and composition semantics as stock components.

**Evidence and effect:** Assembly reads every OptionKindPart.skills result, but conflict checks read only literal walk configs and StrikeKindPart-specific fields; skillsOf silently retains first support/navigation and deduplicates executor/action names. Custom options declaring incompatible support/navigation or duplicate executor/action settings can pass checks and run a different first declaration.

**Repair:** Validate the same declared component metadata used by assembly; keep stock strike-use rules within the strike implementation contract.

**Verification:** Verified direct call path from controller faults to stock-only checks and from construction to generic metadata assembly; no fabricated runtime mutant.

<a id="mg04"></a>

### MG04: Stand-up route validation recognizes only stock way-up Options

**Where:** [src/minds/option/mind.ts](../../src/minds/option/mind.ts) (`optionMindFaults`), [src/minds/option/rise.ts](../../src/minds/option/rise.ts) (`wayUpOf and waysUpIn`), [src/minds/option/kinds.ts](../../src/minds/option/kinds.ts) (`skillsOf technique declarations`).

**Rule:** Generic mind wiring receives implementations through registration and accepts entrant-owned Options without shared-code edits.

**Evidence and effect:** Route validation extracts techniques only from option.kind===WAY_UP_OPTION.defaults.kind. Construction instead accepts any OptionKindPart.skills().technique. An entrant custom recovery Option can declare and build a valid recovery technique while the root refuses its configuration as having no route to standing.

**Repair:** Obtain recovery capabilities from registered Option metadata and classify technique edges via isWayUp.

**Verification:** Read fault/construction paths and stock discriminator; no simulation needed for the control-flow mismatch.

<a id="mg05"></a>

### MG05: Published Option extension API omits actual callback contracts

**Where:** [src/minds/option/index.ts](../../src/minds/option/index.ts) (`public exports`), [src/minds/option/parts.ts](../../src/minds/option/parts.ts) (`PerceptPart and PredictionPart`), [src/minds/option/percepts.ts](../../src/minds/option/percepts.ts) (`readPart invocation`).

**Rule:** An entrant imports published APIs and itself; a component receives inputs through its public contract.

**Evidence and effect:** Public API exports PerceptPart/PredictionPart, but runtime casts make results to Percept and invokes read(Seen); Percept, Prediction and Seen are only in private percepts.ts. A separately owned percept/prediction must duplicate or infer private callback shapes instead of importing the canonical contract.

**Repair:** Publish the callback contracts from an appropriate public contract entry point, with role-specific factory typing.

**Verification:** Read all public and private Option contract/percept implementation files and the actual factory invocation. The source-boundary published entry point omits the canonical callback inputs.

<a id="mg06"></a>

### MG06: Concrete Option component registries remain in library paths

**Where:** [src/minds/option/choosers.ts](../../src/minds/option/choosers.ts) (`CHOOSERS`), [src/minds/option/option-kinds.ts](../../src/minds/option/option-kinds.ts) (`OPTION_KINDS`), [src/minds/option/objectives.ts](../../src/minds/option/objectives.ts) (`OBJECTIVES`), [src/minds/option/predictions.ts](../../src/minds/option/predictions.ts) (`PREDICTIONS`).

**Rule:** Application owns composition of concrete implementations; paths distinguish implementation and composition responsibilities.

**Evidence and effect:** These four modules are literal concrete composition lists imported by app/toolkit, unlike other role registries moved under app/registration. The responsibility/path contract remains inconsistent; this is a placement gap rather than a demonstrated runtime defect.

**Repair:** Place the concrete lists in application registration, leaving reusable component implementations under the Option library.

**Verification:** Read every list content and app/toolkit import path in prior bounded audit; no simulation required.

<a id="mg07"></a>

### MG07: Optional Option list defaults are rejected by catalog validation

**Where:** [src/minds/catalog.ts](../../src/minds/catalog.ts) (`treeValidation many-slot check`), [src/minds/option/mind.ts](../../src/minds/option/mind.ts) (`OptionMindConfig and configured`), [src/parts/parts.ts](../../src/parts/parts.ts) (`slotList`).

**Rule:** Existing configurations retain their declared meaning; expected configuration refusals follow the documented slot contract.

**Evidence and effect:** OptionMindConfig permits omitted/null options and configured() resolves them to supplied defaults; slotList marks optional:true. treeValidation rejects every non-array many slot before applying optional/default semantics. GAME.treeFaults returns options: a list of option parts for both documented fallback forms, so the root fallback cannot be used through the ordinary validated API.

**Repair:** Resolve optional-list fallback semantics consistently in validation/traversal/construction, preserving omitted/null versus explicit empty lists.

**Verification:** Executed cheap real GAME.treeFaults probe in a disposable probe; both omitted and null forms rejected, explicit [] reaches route validation.

<a id="mg08"></a>

### MG08: Published answer report snapshot is outside saved state

**Where:** [src/minds/minds.ts](../../src/minds/minds.ts) (`createMind said closure and saidReport`).

**Rule:** Every value read in a later step belongs to the saved state or is rebuilt after load; fresh supported forks continue exactly.

**Evidence and effect:** Local createMind keeps the last answered report in closure variable said; returned state/body state do not include it and no report onLoad hook refreshes it. Prospects/navigation/actions are read from that snapshot. The published report immediately after fresh same-recipe load differs from the saved bout report. The next physical tape matched in the probe; a physical continuation divergence is not established.

**Repair:** Keep the answer snapshot in state or rebuild it at the supported load boundary without changing answer-phase timing.

**Verification:** Real stock hands Option bout, left drill Commander, 120 steps; fresh same-recipe load. a disposable probe records sameReport:false and a matching first next tape. Team.sense reads the report before the next answer.

<a id="mg09"></a>

### MG09: Option readiness substitutes a stock lowering for the selected locomotion value

**Where:** [src/minds/option/strike.ts](../../src/minds/option/strike.ts) (`around`), [src/minds/option/rise.ts](../../src/minds/option/rise.ts) (`readiness with around`).

**Rule:** Generic wiring preserves the selected component parameters and uses the same command context for readiness and execution.

**Evidence and effect:** around(sight) supplies STANCE_LOWER. Strike and recovery Options pass that context to readiness. The actual skill arbiter uses intent.lower or legs.lower, a required declaration of the selected locomotion. A custom locomotion declaring another lower value is preflighted under one height and executed under another.

**Repair:** Publish the actual default action context through the shared report/Sight contract and use it for readiness; keep stock lowering in its implementation.

**Verification:** Read all Option strike/rise callers and skills/framework/arbiter.ts context construction. The mismatch is direct; no fabricated component probe was used.

<a id="mg10"></a>

### MG10: Generic Commander lookup closes over concrete implementations

**Where:** [src/minds/command/commander.ts](../../src/minds/command/commander.ts) (`commanderOf and createCommander`), [src/minds/command/commanders.ts](../../src/minds/command/commanders.ts) (`COMMANDERS`), [src/game/arena/team.ts](../../src/game/arena/team.ts) (`createCommander`), [src/game/dungeon/run.ts](../../src/game/dungeon/run.ts) (`Commander construction`), [src/evaluation/crypt-clear/index.ts](../../src/evaluation/crypt-clear/index.ts) (`Commander subject lookup`).

**Rule:** Application composition chooses concrete implementations; game/framework code receives registered lookup contracts.

**Evidence and effect:** commanderOf and createCommander import a literal registry that imports all seven stock Commanders. Arena, Crypt and evaluation resolve through that closed lookup; GameContext supplies no Commander lookup. Adding an independently owned Commander requires editing the generic factory/stock registry rather than supplying application registration.

**Repair:** Pass the Commander registration through application composition into generic lookup and game contexts, with implementations retaining their own defaults and faults.

**Verification:** Read every Commander implementation, registry, factory and actual Arena/Crypt/evaluation caller.

<a id="mg11"></a>

### MG11: Sibling Commander tuning controls unrelated game activation

**Where:** [src/minds/command/independent.ts](../../src/minds/command/independent.ts) (`SIGHT_METRES and ALERT_SECONDS`), [src/minds/command/mob.ts](../../src/minds/command/mob.ts) (`sibling tuning import`), [src/game/dungeon/run.ts](../../src/game/dungeon/run.ts) (`WAKE_METRES and LEVELS`).

**Rule:** A module owns its rule and tuning; shared consumers depend on a narrow shared owner or explicit composition inputs.

**Evidence and effect:** Mob imports Independent Commander sight/alert constants. DungeonRun imports Independent sight and derives global wake/rest distances from it, regardless of the selected enemy Commander. Changing one Commander tuning changes another Commander and physical activation/rest policy in Crypt runs that do not select Independent.

**Repair:** Give genuinely shared perception/activation policy its own owner, or supply selected policy parameters explicitly; keep Commander-specific tuning within the implementation.

**Verification:** Read all three modules and the sight/wake/rest consumers. No simulation is required to establish the dependency.

<a id="mg12"></a>

### MG12: Normal placement and candidate search refusals are thrown internally

**Where:** [src/game/dungeon/encounters.ts](../../src/game/dungeon/encounters.ts) (`generateEncounterLevel and populateEncounters`), [src/game/dungeon/crypt-dungeon.ts](../../src/game/dungeon/crypt-dungeon.ts) (`CryptLayoutError refusals`), [src/game/dungeon/level.ts](../../src/game/dungeon/level.ts) (`generateLevel exhausted search`), [src/game/dungeon/attribute-placement.ts](../../src/game/dungeon/attribute-placement.ts) (`configuredSpawn`), [src/game/lab/actor.ts](../../src/game/lab/actor.ts) (`labActor admission`), [src/evaluation/fall.ts](../../src/evaluation/fall.ts) (`checkFall and refused placement`), [src/evaluation/technique.ts](../../src/evaluation/technique.ts) (`refused placement`), [src/evaluation/run.ts](../../src/evaluation/run.ts) (`casesOf admission`).

**Rule:** AGENTS: an expected refusal is a returned value; a catch belongs at a reporting boundary.

**Evidence and effect:** Encounter generation throws EncounterSpaceError for a candidate pack that does not fit, catches it inside the search and tries another. Other layout/placement/admission builders throw for ordinary unsupported conditions or exhausted finite searches, despite some adjacent ground-start paths already returning refused. Expected incompatibilities are indistinguishable from defects to callers, and the candidate search uses exception control flow below any reporting boundary.

**Repair:** Return typed refusal/outcome values through internal search/admission/build contracts; convert to CLI/row reporting only at the reporting boundary while retaining the message.

**Verification:** Read the complete generated-layout, configured-placement, Lab, case scheduling and fall/technique call paths. Encounter catch proves an expected search outcome directly.

<a id="mg13"></a>

### MG13: Crypt simulation memory has no plain state root

**Where:** [src/game/dungeon/run.ts](../../src/game/dungeon/run.ts) (`DungeonRun mutable gameplay fields and plan`), [src/game/dungeon/actors.ts](../../src/game/dungeon/actors.ts) (`fighter and outAt membership`), [src/game/dungeon/map.ts](../../src/game/dungeon/map.ts) (`Door.open`).

**Rule:** AGENTS: step-changing simulation memory is plain data in one state object per module.

**Evidence and effect:** DungeonRun carries gameplay status, perception deadline, delivered orders, exploration, actor wake/out membership, mutable door state and Commander memory across class fields, maps/sets and actor objects, with no state root containing them. The gameplay memory cannot be enumerated/copied through the common state contract. This is not a claim that Crypt exposes a supported fork API; it currently does not.

**Repair:** Separate durable gameplay values into explicit plain state roots and rebuild the runtime body/observer/index links from those values.

**Verification:** Read all 567 lines of DungeonRun, its actor/map/Commander consumers and evaluation Crypt wrapper. Confirmed state ownership gap; no unsupported fork was attempted.

<a id="mg14"></a>

### MG14: Generic Lab and skill evaluations inspect private Option assembly schemas

**Where:** [src/game/lab/attack-target.ts](../../src/game/lab/attack-target.ts) (`strikeActions`), [src/evaluation/baseline/cases.ts](../../src/evaluation/baseline/cases.ts) (`strikeSubject`), [src/evaluation/strike/index.ts](../../src/evaluation/strike/index.ts) (`skillSubject`), [research/case-learning-environment.mjs](../../research/case-learning-environment.mjs) (`presetMind`).

**Rule:** Game/evaluation peers consume explicit capability contracts or reports; registered minds retain ownership of their private configuration layout.

**Evidence and effect:** Lab reads root.options and invokes Option skillsOf. Baseline and named Strike subjects read root.options via strikesIn and reject frame-shaped configs. The learning helper selects options by the strike- name prefix and rewrites their private skill field. A registered custom or wrapped mind can provide the same runtime actions yet lose target introspection, named strike admission and training selection solely because its config layout differs.

**Repair:** Publish capability/introspection and deliberate research transformation hooks owned by the relevant registered implementation, or explicitly scope these utilities to Option-specific adapters.

**Verification:** Read each full helper and its scenario/evaluation consumers. Named Strike subject code explicitly refuses non-root.options layouts; no artificial runtime mutant was used.

<a id="mg16"></a>

### MG16: Some evaluation subject adapters discard preset calibration or character metadata

**Where:** [src/evaluation/unseen/index.ts](../../src/evaluation/unseen/index.ts) (`subjects named presets`), [src/evaluation/unseen/cases.ts](../../src/evaluation/unseen/cases.ts) (`faults ignores named calibration`), [src/evaluation/crowd/index.ts](../../src/evaluation/crowd/index.ts) (`subjects named presets`), [src/evaluation/crowd/cases.ts](../../src/evaluation/crowd/cases.ts) (`faults and world character omission`).

**Rule:** The same named entrant keeps its character and named calibration semantics across evaluation subjects and admission.

**Evidence and effect:** Unseen copies only preset.character and its admission never checks presetFitsModel. Crowd copies only preset.models, omits character from the subject, checks modelHolding without it and its Crypt world has no character/attributes forwarding. Unseen can schedule a named calibration outside its declared models. Crowd evaluates the default character while labeling a preset whose character overrides would change the body.

**Repair:** Preserve both metadata fields and forward the physical character to the actual world construction; apply the same named-calibration predicate used by Match/Locomotion.

**Verification:** Read Subject/mindSubject, every relevant subject adapter, admission and world construction; compared with Match and Locomotion propagation. This is a confirmed extension contract path, not a claim that an existing stock preset currently exercises nonempty overrides.

<a id="mg17"></a>

### MG17: Rise classifies an unreached fixture as a passed outcome

**Where:** [src/evaluation/rise/index.ts](../../src/evaluation/rise/index.ts) (`riseOutcome`).

**Rule:** An unreached fixture says so and does not establish a skill pass; failures-first evidence must retain relevant non-successes.

**Evidence and effect:** riseOutcome returns passed:true when link.entry===null, including not-entered links. Numeric done figures separately exclude those links and the label remains not entered. A trial whose technique never enters is colored as a passed trial in the Ratings strip. This is not evidence that the skill passed its entry condition or completed recovery.

**Repair:** Represent unreached/invalid fixtures separately from successful outcomes, or return passed:false with an explicit unreached reason while retaining the numeric exclusion.

**Verification:** Read Rise outcome and Ratings rendering. Ratings reelOf only supports bout worlds, so no claim is made about a skipped Rise live reel.

<a id="mg18"></a>

### MG18: Technique-case sub-Mind omits its technique run memory from Mind.state

**Where:** [src/evaluation/technique.ts](../../src/evaluation/technique.ts) (`runs construction and sub-Mind state`).

**Rule:** Every Mind includes all step-carried implementation memory in its one state graph, including registered children.

**Evidence and effect:** The case creates mutable TechniqueRun instances in runs, but its sub-Mind exposes state containing only link/phase/commands/reading values. runs[k].state is not linked. The adjacent standalone rising bed explicitly includes run.state and predecessor.state. This Mind violates the complete state contract even though the technique evaluation does not expose a supported save/load wrapper.

**Repair:** Link each run state into the case state at construction and keep runs as runtime behavior attached to that saved data.

**Verification:** Read full technique-case sub-Mind and rising.ts standalone sub-Mind for comparison. No unsupported evaluation fork was claimed.

<a id="mg19"></a>

### MG19: Historical cap analysis combines rows without code/protocol pool identity

**Where:** [research/cap-series.mjs](../../research/cap-series.mjs) (`record collection and matchup grouping`).

**Rule:** Minds and measurements compare alike; historical figures from different code/protocols are read again before comparison.

**Evidence and effect:** The script loads every record into one key map, then groups rows by subject IDs and JSON condition only. It ignores recorded subject versions, pool.environment/protocol, harness and each record play; exactly two rows are assumed to be a mirrored pair. Two opposite-side rows from different versions/pools can form one apparent matchup, while larger mixed groups are silently discarded. The recommended cap can be based on incomparable evidence.

**Repair:** Partition by recording provenance and subject versions before assembling complete mirrored pairs, and report incomplete or incompatible evidence explicitly.

**Verification:** Read complete cap-series and record/history contracts. Direct grouping-key proof, no historical rows reinterpreted.

<a id="mg20"></a>

### MG20: Empty-hand league reuses a bout after its cap or engine changes

**Where:** [research/empty-hand-league.mjs](../../research/empty-hand-league.mjs) (`keyOf, played and games filtering`).

**Rule:** A cached result key includes the physical protocol and source/harness identity it claims.

**Evidence and effect:** The cache key contains epoch/config hashes/gap only; --cap is absent, and report filtering also omits cap. Engine/source identity is not recorded beyond a manually supplied epoch. Defaults additionally name removed presets classic/puncher/scrapper/behaviours. Changing --cap within the same epoch skips the new bouts and rates prior cap rows as the requested run. The documented default command fails before running with current registry names.

**Repair:** Use the shared recording/case identity including cap, engine and code identity; resolve defaults from the current explicit stock assembly or retire the obsolete diagnostic.

**Verification:** Read complete generation, append, resume and report paths and current entrant manifests. No broad league run was launched.

<a id="mg21"></a>

### MG21: Crypt blow diagnostic calls an undefined damage reader

**Where:** [research/crypt-blows.mjs](../../research/crypt-blows.mjs) (`onBlow living reduction`).

**Rule:** Executable diagnostics must run their advertised path and report the actual measurement.

**Evidence and effect:** onBlow calls lost(side), but the file declares no lost function or import; it imports lifeTaken and uses that name elsewhere. The first blow with a living side raises ReferenceError instead of producing the advertised living-side damage record.

**Repair:** Call the owning lifeTaken predicate/reader consistently and retain cleanup on the failure path.

**Verification:** Read the entire module and resolved all local/imported bindings; no simulation needed for the undefined binding.

<a id="mg22"></a>

### MG22: Arena seating types are owned by anatomical laterality

**Where:** [src/game/arena/duel.ts](../../src/game/arena/duel.ts) (`Side import and SIDES re-export`), [src/evaluation/evaluation.ts](../../src/evaluation/evaluation.ts) (`Figure side contract`), [src/evaluation/contest.ts](../../src/evaluation/contest.ts) (`scoreOf winner contract`).

**Rule:** Independent domains own their contracts even when their current representation is equal; shared anatomy does not define game participant identity.

**Evidence and effect:** Duel seats, winner identity and evaluation participant sides import Side/SIDES/otherSide from core/bodies/bilateral.ts, the same contract used for limbs and hands. Game seating and score APIs depend on the anatomical laterality owner. This is type/ownership conflation; the two-seat left/right gameplay representation itself is not a humanoid assumption or demonstrated runtime defect.

**Repair:** Give the Arena participant-seat contract its own game owner and keep anatomical Side with the body utilities, preserving the same literal values and order.

**Verification:** Read Arena and evaluation callers plus parent cross-check; this is a contract ownership finding, not a request to change gameplay seats.

<a id="mg23"></a>

### MG23: Human reference figures gate the Strike trial outcome

**Where:** [src/evaluation/strike/read.ts](../../src/evaluation/strike/read.ts) (`hit reference comparisons and landed outcome`), [src/evaluation/strike/index.ts](../../src/evaluation/strike/index.ts) (`strikeOutcome passed flag`).

**Rule:** AGENTS says the person's figures are a scale reported beside each reading and gate nothing.

**Evidence and effect:** StrikeHit fast/heavy/hard compare measured speed, mass or energy against scaled BAR figures. The trial is landed only if meetsBar(hit), and strikeOutcome marks passed only for landed. A mechanically completed strike can be marked weak/failed solely for being below a human reference figure. The reference is an outcome gate, despite the stated measurement contract.

**Repair:** Keep the human reference beside the measurement and define the trial outcome using the skill's own stated contract, without using the reference as a pass gate.

**Verification:** Read complete Strike reader and index including meetsBar and BAR derivation. This finding concerns outcome classification, not trial admission or a claim that any strike works.

<a id="root-support"></a>

### ROOT-SUPPORT: Generic actuation requires a foot or paw standing-height implementation

**Where:** [src/minds/command-layers.ts](../../src/minds/command-layers.ts) (`Generic actuation requires a foot or paw standing-height implementation`), [src/control/support.ts](../../src/control/support.ts) (`Generic actuation requires a foot or paw standing-height implementation`).

**Rule:** Reusable contracts exclude stock assembly and private algorithms; implementation tools follow their owner.

**Evidence and effect:** commandLayers initializes standing with unconditional standingHeight, which throws when the body has neither foot nor paw supports, even with a separately supplied motor. Independent implementations require editing shared code or inheriting undeclared specialized behavior.

**Repair:** Obtain reference support facts from the selected capability and retain foot/paw calculations with their applicable implementations.

**Verification:** Review actual component assembly and exercise a distinct registered implementation through the affected public contract.

<a id="root-estimate"></a>

### ROOT-ESTIMATE: Shared aim and engagement contracts close over stock estimate units

**Where:** [src/skills/framework/aim-part.ts](../../src/skills/framework/aim-part.ts) (`Shared aim and engagement contracts close over stock estimate units`), [src/skills/intent/action-aim.ts](../../src/skills/intent/action-aim.ts) (`Shared aim and engagement contracts close over stock estimate units`), [src/minds/engagement.ts](../../src/minds/engagement.ts) (`Shared aim and engagement contracts close over stock estimate units`).

**Rule:** Reusable contracts exclude stock assembly and private algorithms; implementation tools follow their owner.

**Evidence and effect:** AimPart.unit, AimEstimate and EngagementCandidate each repeat opening | net, although their generic consumers only need compatible declared units. Independent implementations require editing shared code or inheriting undeclared specialized behavior.

**Repair:** Publish one extensible estimate-unit contract and compare estimates only in compatible declared units.

**Verification:** Review actual component assembly and exercise a distinct registered implementation through the affected public contract.

<a id="root-aims"></a>

### ROOT-AIMS: Shared skill framework contains concrete aiming policies

**Where:** [src/skills/framework/aims.ts](../../src/skills/framework/aims.ts) (`Shared skill framework contains concrete aiming policies`), [src/app/registration/aims.ts](../../src/app/registration/aims.ts) (`Shared skill framework contains concrete aiming policies`).

**Rule:** Reusable contracts exclude stock assembly and private algorithms; implementation tools follow their owner.

**Evidence and effect:** CENTRE_AIM, SURFACE_AIM and LEG_HEIGHT_AIM combine concrete algorithms, preference tuning and implementation configuration in the framework; the Surface implementation explicitly uses bilateral human hands. Independent implementations require editing shared code or inheriting undeclared specialized behavior.

**Repair:** Keep Aim/AimPart/Aimed contracts shared and place each algorithm and tuning with its capability owner; explicitly validate each specialization.

**Verification:** Review actual component assembly and exercise a distinct registered implementation through the affected public contract.

<a id="root-tables"></a>

### ROOT-TABLES: Option loop consumes a concrete profile-table schema

**Where:** [src/minds/option/decider.ts](../../src/minds/option/decider.ts) (`Option loop consumes a concrete profile-table schema`), [src/minds/option/kinds.ts](../../src/minds/option/kinds.ts) (`Option loop consumes a concrete profile-table schema`), [src/minds/option/mind.ts](../../src/minds/option/mind.ts) (`Option loop consumes a concrete profile-table schema`).

**Rule:** Reusable contracts exclude stock assembly and private algorithms; implementation tools follow their owner.

**Evidence and effect:** The decider casts the selected prediction provider output to ProfileTables and the Option input contract consumes strikes/edges tables; root construction supplies measured prediction/tree defaults. Moving reads and Guarding metadata alone does not remove this downstream coupling. Independent implementations require editing shared code or inheriting undeclared specialized behavior.

**Repair:** Make the selected planner/prediction model compatibility explicit, or inject its evaluation through the provider-owned contract; move stock defaults and labels with the actual providers. Do not merely relocate the root literals.

**Verification:** Review actual component assembly and exercise a distinct registered implementation through the affected public contract.

<a id="root-tools"></a>

### ROOT-TOOLS: Implementation tools remain in a flat research namespace

**Where:** [research/punch-drill.mjs](../../research/punch-drill.mjs) (`Implementation tools remain in a flat research namespace`), [research/punch-export.mjs](../../research/punch-export.mjs) (`Implementation tools remain in a flat research namespace`), [research/punch-policy-check.mjs](../../research/punch-policy-check.mjs) (`Implementation tools remain in a flat research namespace`), [research/core-stance-envelope.mjs](../../research/core-stance-envelope.mjs) (`Implementation tools remain in a flat research namespace`), [research/core-stance-trials.mjs](../../research/core-stance-trials.mjs) (`Implementation tools remain in a flat research namespace`).

**Rule:** Reusable contracts exclude stock assembly and private algorithms; implementation tools follow their owner.

**Evidence and effect:** These tools own the particular punch or stance model, data schema and private introspection while their paths and commands present them as general research utilities. Independent implementations require editing shared code or inheriting undeclared specialized behavior.

**Repair:** Place implementation-specific tools, schemas and kept assets with their owner, updating every caller, command and link; retain explicitly shared harnesses separately.

**Verification:** Review actual component assembly and exercise a distinct registered implementation through the affected public contract.

## Skills, applicability, state and owned research

<a id="sk-assist-ownership"></a>

### SK-ASSIST-OWNERSHIP: Action assist writes bypass concrete control ownership

**Where:** [src/skills/framework/action-resources.ts](../../src/skills/framework/action-resources.ts) (`writes`), [src/skills/framework/arbiter.ts](../../src/skills/framework/arbiter.ts) (`assist claim merge`), [src/skills/framework/action.ts](../../src/skills/framework/action.ts) (`ActionClaim.assist`).

**Rule:** One owner per concrete control; a component may write only controls it reserves.

**Evidence and effect:** Direct probe accepts assist claims from two nonoverlapping endpoint resources; arbiter merges each assist and optionally locomotion assist by last assignment with no slot reservation. Independent admitted actions can overwrite whole-body assist, or locomotion overwrite an action assist; legality depends on merge order.

**Repair:** Represent assist ownership in the compiled resource map and validate/arbitrate it, or require the documented whole-body owner before permitting an assist claim.

**Verification:** a disposable probe prints bothAssistWritesAccepted:true and resourcesOverlap:false; trace arbiter lines154-168.

<a id="sk-hold-placement"></a>

### SK-HOLD-PLACEMENT: Framework owns one concrete guard holding policy

**Where:** [src/skills/framework/hold.ts](../../src/skills/framework/hold.ts) (`holdUp/HOLD_SECONDS`), [src/skills/guard/guard-part.ts](../../src/skills/guard/guard-part.ts) (`holdUp import`).

**Rule:** Private control rules and tuning live with their capability implementation; a module used by one implementation belongs under it.

**Evidence and effect:** holdUp implements a particular critically damped rule that rotates held equipment upright at a fixed response; sole source importer is guard-part.ts. Framework directory contains guard-specific policy and tuning despite generic guard composition being injected.

**Repair:** Move holdUp and its constant under guard implementation ownership and update the importer; preserve the algorithm.

**Verification:** Read hold.ts in full and confirm sole runtime importer guard-part.ts; no behavioral probe needed for placement.

<a id="sk-profile-exit"></a>

### SK-PROFILE-EXIT: Profile reader drops declared non-range exit percepts

**Where:** [src/skills/framework/profile.ts](../../src/skills/framework/profile.ts) (`profileReading.expect exit aggregation`).

**Rule:** Published generic records preserve the fields their contract accepts and describes.

**Evidence and effect:** Trial.exit and Expected.exit admit arbitrary percept numbers, but aggregation reads only trial.exit.range and emits range only. A valid measured custom percept is silently absent when the profile is read.

**Repair:** Aggregate declared exit keys with presence counts, retaining existing range arithmetic/order.

**Verification:** a disposable probe: trial exit balance:0.4 becomes expectedExit:null.

<a id="sk-data-digest"></a>

### SK-DATA-DIGEST: Skill identity assumes every registered data key is body-indexed

**Where:** [src/skills/framework/profile.ts](../../src/skills/framework/profile.ts) (`readSkillDigest and techniqueDigest`).

**Rule:** Registered data owns its schema; changed skill inputs must change profile identity.

**Evidence and effect:** Part.reads names arbitrary DataKeys; digest slices every dataOf(key)[body] or null. Distinct global records both hash null. Profiles can remain fresh after a custom skill global weights/settings dataset changes.

**Repair:** Let data owner or part supply its identity slice/digest, with explicit per-body record adapter for current data.

**Verification:** a disposable probe: global gain1 and gain2 records produce identical skillDigest.

<a id="sk-window-two-supports"></a>

### SK-WINDOW-TWO-SUPPORTS: Generic downed-target window placement assumes exactly two symmetric feet

**Where:** [src/skills/intent/action-window.ts](../../src/skills/intent/action-window.ts) (`besideLying`), [src/skills/framework/menu.ts](../../src/skills/framework/menu.ts) (`menuOf windowSpot call`).

**Rule:** Generic skill wiring accepts configured locomotion/body geometry rather than imposing a bilateral implementation.

**Evidence and effect:** besideLying unconditionally dereferences first two StanceReading.ends; feetClear checks only two mirrored points with fixed radius/column. Single-support custom body crashes and additional multipod supports are omitted from clearance decisions.

**Repair:** Use configured locomotion clearance/footprint over all supported ends, or isolate this two-foot placement policy behind explicit applicability/injection.

**Verification:** a disposable probe reproduces the construction/window exception using compatible renamed foot spec and one-support view.

<a id="sk-guard-resume"></a>

### SK-GUARD-RESUME: Stock guard resume retains interrupted ward motion

**Where:** [src/skills/guard/guard.ts](../../src/skills/guard/guard.ts) (`guardSkill.resume`).

**Rule:** Skill.resume states whatever was underway is over; takeover must start from the body current pose.

**Evidence and effect:** state.wards stores interpolated at/turn/time; resume is an empty function and does not discard them. After takeover, a shield ward may continue from old goal/time rather than current returned pose.

**Repair:** Reset each saved ward to null on resume; verify resulting stock behavior as a defect fix rather than a refactor.

**Verification:** skills-guard-probe begins a real paced ward then resumes: identical active ward object remains.

<a id="sk-move-applicability"></a>

### SK-MOVE-APPLICABILITY: Configured gait selector hardcodes sole-body applicability

**Where:** [src/skills/locomotion/move-part.ts](../../src/skills/locomotion/move-part.ts) (`MOVE_PART.fits`).

**Rule:** Generic wiring receives implementation applicability from the components it composes.

**Evidence and effect:** MoveConfig accepts arbitrary registered gait legs and constructs them through supplied Legs, but MOVE_PART uses fitsSoles regardless of configured gaits. A custom paw/capsule-support gait cannot use the generic selector even when every selected gait fits that body.

**Repair:** Derive selector applicability from its configured gait parts through supplied lookup; retain stock defaults own gait fit.

**Verification:** Source trace gaits config lines41-49 and construction83-91 against unconditional fitsSoles at81; The applicability and constructor requirements are traced in source.

<a id="sk-nav-trunk-names"></a>

### SK-NAV-TRUNK-NAMES: Generic navigator clearance identifies anatomy by Trunk suffix

**Where:** [src/skills/locomotion/navigation/sensed-bounds.ts](../../src/skills/locomotion/navigation/sensed-bounds.ts) (`clearanceOf`), [src/skills/locomotion/navigation/navigation.ts](../../src/skills/locomotion/navigation/navigation.ts) (`routeWalker baseRadius`).

**Rule:** General physical readers use declared body metadata rather than body segment name conventions.

**Evidence and effect:** clearanceOf examines only segment names matching /Trunk$/; stock navigation parts fit anyBody. Renaming otherwise identical trunk segments makes body radius zero and shrinks solid/crowd clearance.

**Repair:** Resolve central body geometry through declared marks/root or an explicit owner-supplied footprint rather than suffix matching.

**Verification:** a disposable probe prints identical-body rename clearance original0.2149296577917674 / renamed0.

<a id="sk-nav-default"></a>

### SK-NAV-DEFAULT: General navigation wiring owns the stock implementation choice

**Where:** [src/skills/locomotion/navigation/navigator.ts](../../src/skills/locomotion/navigation/navigator.ts) (`GAME_NAVIGATION/navigatorOf`), [src/minds/option/mind.ts](../../src/minds/option/mind.ts) (`navigation fallback/uses`).

**Rule:** Application/fighter assemblies own concrete default selections; generic role wiring receives configured implementations.

**Evidence and effect:** navigatorOf substitutes visibility-navigation for null/undefined; Option shared framework also imports/advertises that default. Replacing stock assembly cannot remove the hidden default dependency from shared navigation/Option code.

**Repair:** Supply default navigation config from assembly, preserving stock omitted/null behavior at its owning controller registration.

**Verification:** Read navigator.ts in full; static importer/call trace through skills/assembly and minds/option mind/kinds.

<a id="sk-held-clearance-capability"></a>

### SK-HELD-CLEARANCE-CAPABILITY: Any-body stock navigation requires all held carriers to be effectors

**Where:** [src/skills/locomotion/navigation/held-clearance.ts](../../src/skills/locomotion/navigation/held-clearance.ts) (`heldClearance carrier construction`), [src/skills/locomotion/navigation/visibility-navigation.ts](../../src/skills/locomotion/navigation/visibility-navigation.ts) (`VISIBILITY_NAVIGATION.fits`).

**Rule:** Applicability must state every construction requirement; held items are physical loads and need not be endpoint controls.

**Evidence and effect:** heldClearance throws for a held segment absent from BodySpec.effectors; navigation parts declare anyBody. A valid torso-mounted or otherwise non-effector item can make a fitting navigation part fail during construction.

**Repair:** Read observed geometry for all equipped segments, or make applicability return the unsupported observation requirement before construction.

**Verification:** Stock workshop-fighter armed with woodenClub in hand.right, with only optional hand.right EffectorSpec omitted. All physical segments, configurations and held item data unchanged. coreStand/buildBody succeeds; zero world steps. This is a valid body with a rigid load on an endpoint that is not independently offered as a control effector. Navigation fits it, then its held geometry constructor throws. The failure is observed before navigation/locomotion dynamics, rather than inferred from an unsupported torso fixture.

<a id="sk-walk-run-fit"></a>

### SK-WALK-RUN-FIT: Walk/run fit declares only soles while constructors require named human channels

**Where:** [src/skills/locomotion/walk-run-part.ts](../../src/skills/locomotion/walk-run-part.ts) (`WALK_RUN_PART.fits`), [src/skills/locomotion/cycle-run.ts](../../src/skills/locomotion/cycle-run.ts) (`limbOf/armSwing construction`).

**Rule:** A specialized implementation may require human anatomy, but its fits predicate must express those requirements.

**Evidence and effect:** fitsSoles checks feet/sole form, while runCycle and armSwing immediately require hip/knee/ankle named freedoms and bilateral human shoulders. A two-foot custom model can fit the part then throw or emit goals for absent channels.

**Repair:** Publish/use a complete controller applicability predicate including required channels/points, rather than weakening the algorithm or treating it as universal.

**Verification:** skills-extension-probe: rename hip.left only, fits returns null and make throws a gait needs a joint hip.left.

<a id="sk-profile-recovery-ownership"></a>

### SK-PROFILE-RECOVERY-OWNERSHIP: Generic profile module owns recovery key/schema and edge-specific lookup

**Where:** [src/skills/framework/profile.ts](../../src/skills/framework/profile.ts) (`DataOf augmentation and edgeExpected`).

**Rule:** Capability data schema/read policy belongs to that capability; shared numerical profile reading stays general.

**Evidence and effect:** Shared profile.ts declares strike-profiles and edge-profiles and hardcodes recovery default key plus technique lookup. Recovery-specific selection and data ownership remain mixed into the common profile utility.

**Repair:** Keep profile schema/interpolation generic; place capability key declarations/read helpers with strikes/recovery data owners.

**Verification:** Full profile.ts read; edgeExpected directly calls dataOf edge-profiles by default.

<a id="sk-paw-gait-composition"></a>

### SK-PAW-GAIT-COMPOSITION: Paw gait composition normalizes replacement gaits through stock trot tuning

**Where:** [src/skills/locomotion/quadruped/paw-legs.ts](../../src/skills/locomotion/quadruped/paw-legs.ts) (`ordersOf / stopping`), [src/skills/locomotion/quadruped/parts.ts](../../src/skills/locomotion/quadruped/parts.ts) (`GaitReach`).

**Rule:** Generic registered wiring consumes an implementation through its declared contract.

**Evidence and effect:** PawMoveConfig accepts arbitrary registered trot/crawl factories and uses their reach for envelopes; ordersOf divides by REPTILE_TROT.speed and stopping returns REPTILE_TROT.acceleration regardless selected factory. A replacement gait with a different declared speed receives the wrong fraction for a requested physical speed; braking estimates describe the stock gait.

**Repair:** Use selected gait physical reach/stopping metadata or an explicit composition policy supplied by assembly.

**Verification:** Read make resolution, envelope assembly, ordersOf and pace conversions end to end.

<a id="sk-technique-sides"></a>

### SK-TECHNIQUE-SIDES: Recovery binding ignores declared technique sides

**Where:** [src/skills/recovery/skills.ts](../../src/skills/recovery/skills.ts) (`groundSkills`), [src/skills/recovery/technique.ts](../../src/skills/recovery/technique.ts) (`TechniquePart.sides`).

**Rule:** A role owner declares applicability and generic binding respects it.

**Evidence and effect:** Every fitting part is bound to [sides.left,sides.right] without reading part.sides. Stock rolls declare right only, staged parts left only. A registered one-sided probe receives both effectors. Unavailable start sides appear in the action menu and can be attempted through generic binding.

**Repair:** Build each technique action from its declared sides and resolve only requested side bindings.

**Verification:** Disposable skills-extension-probe: sides [right] returns [foot.left,foot.right].

<a id="sk-recovery-end-binding"></a>

### SK-RECOVERY-END-BINDING: Any fitting ground technique additionally requires anatomical bilateral foot or paw ends

**Where:** [src/skills/recovery/skills.ts](../../src/skills/recovery/skills.ts) (`sideEffectors / groundSkills`).

**Rule:** General skill wiring uses registered capability requirements rather than inventing implementation prerequisites.

**Evidence and effect:** groundSkills accepts arbitrary fitting TechniquePart then unconditionally requires two feet/paws on opposite x sides through sideEffectors. The technique role does not declare that requirement. A valid fitting central-support/capsule-end recovery cannot be composed and throws before its implementation runs.

**Repair:** Let the technique declare its action binding/resources, or express a deliberately narrower adapter applicability and return its refusal.

**Verification:** Read TechniquePart, sideEffectors and groundSkills path; custom part prototype confirms action wiring overrides its side metadata.

<a id="sk-held-control"></a>

### SK-HELD-CONTROL: Held recovery adapter advertises a configuration operation that always throws

**Where:** [src/skills/recovery/held-body.ts](../../src/skills/recovery/held-body.ts) (`heldBody configurations.request`), [src/skills/recovery/technique.ts](../../src/skills/recovery/technique.ts) (`TechniqueRun.step`).

**Rule:** Declared supported operations work; expected unsupported capabilities use narrower types or returned refusal.

**Evidence and effect:** heldBody supplies a BodyControl to TechniqueRun but its configurations.request throws unconditionally. TechniqueRun contract exposes the ordinary full command interface without a capability restriction. A custom technique can satisfy the declared role then fail by using an advertised actuator.

**Repair:** Expose a narrower explicit recovery command capability/refusal or implement supported held configuration commands; preserve intentional implementation limits rather than demand feature growth.

**Verification:** Direct function body and public call path inspected; no physical run needed.

<a id="sk-run-validator"></a>

### SK-RUN-VALIDATOR: Run settings validator accepts a missing required key replaced by an unknown one

**Where:** [src/skills/locomotion/cycle-run.ts](../../src/skills/locomotion/cycle-run.ts) (`validRunCycle`).

**Rule:** Configuration validators reject values the algorithm cannot interpret.

**Evidence and effect:** Validator checks only key count, finite values and a subset of named fields. Replacing cv with invented keeps count and is accepted; later p.cv participates in numeric control. A configuration accepted as complete produces undefined-derived NaN commands.

**Repair:** Require the exact known own-key set before numeric/range checks.

**Verification:** skills-extension-probe: delete cv and add invented with same value returns true.

<a id="sk-sensed-configuration"></a>

### SK-SENSED-CONFIGURATION: Surface geometry queries ignore the observed segment configuration

**Where:** [src/skills/perception/openings.ts](../../src/skills/perception/openings.ts) (`capsule/polyhedron/entryShapes and surfaceEntry`), [src/skills/strikes/bite/jaw-aim.ts](../../src/skills/strikes/bite/jaw-aim.ts) (`search`), [src/skills/locomotion/navigation/held-clearance.ts](../../src/skills/locomotion/navigation/held-clearance.ts) (`heldClearance / bodyAhead`).

**Rule:** Physical targeting reads the body as sensed, including its applied physical shape.

**Evidence and effect:** BodySense.segments exposes configuration, but all cached primary shapes use segment.shape and callers pass only sensed position/rotation. surfaceContains/surfaceEntry/nearSurface/upperSurface therefore keep initial geometry after configuration switches. These functions serve generic target projection and jaw arc interception, beyond boxing selection. Own-body heldClearance/bodyAhead likewise capture rigidOf default colliders once and their Sight contract has no configuration state; sensed-bounds.ts correctly resolves observed configurations and demonstrates the existing alternative. Aiming and occlusion disagree with the observed collider after a segment changes configuration.

**Repair:** Resolve declared configurationShapeAt for the sensed configuration before immutable shape derivation; retain caches per actual shape/configuration.

**Verification:** skills-schema-probe: same declared segment has compact sphere radius .1 and expanded .9; point .4 from frame origin is reported outside for both observed configurations.

<a id="sk-staged-validation"></a>

### SK-STAGED-VALIDATION: Staged recipe validators admit values the player cannot safely interpret

**Where:** [src/skills/recovery/implementations/staged/stages.ts](../../src/skills/recovery/implementations/staged/stages.ts) (`postureFaults / recipeFaults`), [src/skills/recovery/implementations/staged/records.ts](../../src/skills/recovery/implementations/staged/records.ts) (`validStepUp`).

**Rule:** A module owning a settings rule publishes a validator matching executable prerequisites.

**Evidence and effect:** postureFaults compares angles to bounds without finite check, so NaN survives; seconds/limit accept positive Infinity. validStepUp validates timings but does not validate optional roll poses or rest values even though stepUpRecipe consumes them. A custom immutable recipe/tuning can pass advertised validation then emit NaN commands, remain unbounded, or throw while building its roll.

**Repair:** Validate all consumed optional structures and finite domain values in owner predicates before player construction.

**Verification:** skills-schema-probe: validStepUp accepts roll:{} then stepUpRecipe throws Cannot convert undefined or null to object; NaN hip posture + Infinity pose duration yields stageFaults [].

<a id="sk-bite-applicability"></a>

### SK-BITE-APPLICABILITY: Bite fit omits physical jaw and support requirements consumed by its executor

**Where:** [src/skills/strikes/bite/index.ts](../../src/skills/strikes/bite/index.ts) (`fitsBite / biteExecutor`), [src/skills/strikes/bite/jaw.ts](../../src/skills/strikes/bite/jaw.ts) (`jawOf / mouthOf`).

**Rule:** Specialized skills may require particular anatomy, but applicability must describe those requirements before construction.

**Evidence and effect:** fitsBite combines fitsJaw (bite point, mouth parent, neck exists) and record/whole override. jawOf additionally requires directed tooth surface; executor indexes neck.dofs[1], samples pawReader, and defaults effectors to literal head while jawOf discovers its actual name. A supplied whole tuning permits a structurally accepted jaw to throw or publish no usable effector on a compatible renamed head.

**Repair:** Own and export a bite-specific fit predicate for teeth, neck freedoms, paw support policy and actual effector binding; return refusal for unsupported anatomy.

**Verification:** Read fitsJaw, bite registration, jawOf/mouthOf and executor construction end to end.

<a id="sk-stomp-applicability"></a>

### SK-STOMP-APPLICABILITY: Stomp applicability promises less than its bilateral constructor requires

**Where:** [src/skills/strikes/stomp-part.ts](../../src/skills/strikes/stomp-part.ts) (`STOMP_PART.fits`), [src/skills/strikes/stomp.ts](../../src/skills/strikes/stomp.ts) (`stompExecutor strikeOf/hipOf`).

**Rule:** Implementation applicability must cover construction prerequisites, including research whole-tuning cases.

**Evidence and effect:** The record predicate is bypassed by a valid whole tuning. The remaining fit only requires one foot.left/right strike effector, while constructor builds both strikes and immediately dereferences both hip.left/right joints and bilateral sole support. A custom body accepted by the public part fit can fail construction instead of returning an unsupported-anatomy refusal.

**Repair:** Require complete bilateral stomp anatomy/points/channels in owner fit; retain its deliberate human implementation scope.

**Verification:** Read wholeStomp/recordFault semantics and immediate constructor dereferences; analogous renamed-gait probe establishes the general applicability path.

<a id="sk-research-stance-api"></a>

### SK-RESEARCH-STANCE-API: Retained stance research uses unsupported side-keyed stance readings and goals

**Where:** [research/core-stance-trials.mjs](../../research/core-stance-trials.mjs) (`stand/edge/step/shove/walk/turn`), [research/skills/recovery/implementations/staged/sit-back.mjs](../../research/skills/recovery/implementations/staged/sit-back.mjs) (`stance goals/readings`), [research/skills/recovery/rising-budget.mjs](../../research/skills/recovery/rising-budget.mjs) (`stance goals/readings`), [research/skills/recovery/witness/climb.mjs](../../research/skills/recovery/witness/climb.mjs) (`stance goals/readings`), [research/skills/recovery/witness/crouch-steady.mjs](../../research/skills/recovery/witness/crouch-steady.mjs) (`stance goals/readings`), [research/skills/recovery/witness/rise-witness.mjs](../../research/skills/recovery/witness/rise-witness.mjs) (`stance goals/readings`), [research/stance-stagger.mjs](../../research/stance-stagger.mjs) (`stance goals/readings`), [research/core-posture-trials.mjs](../../research/core-posture-trials.mjs) (`handed stance command`), [research/locomotion-run.mjs](../../research/locomotion-run.mjs) (`runOnce, running, swaying`), [research/locomotion-wrench.mjs](../../research/locomotion-wrench.mjs) (`runOnce, running, swaying`), [research/run-cycle-search.mjs](../../research/run-cycle-search.mjs) (`trial`).

**Rule:** Organization and boundary refactors migrate executable research consumers while preserving their meaning.

**Evidence and effect:** StanceGoal.feet accepts bearing-end names such as foot.left/foot.right. The listed research paths supply SIDES (left/right), or read side-keyed soles/touching/asked fields while StanceReading exposes ends[name].middle/touching/asked. The posture handover therefore selects no matching bearing feet. The locomotion wrench sway fixture also supplies hands.request in place of the configuration command interface. Retained diagnostics can fail during readout or attribute failure to a controller that receives no matching supports; envelope/sweep consumers inherit that invalid evidence.

**Repair:** Give specialized stance diagnostics an explicit side-to-bearing-end adapter and current command interface. Update every retained mode and its envelope/sweep consumers together, preserving trial geometry and scoring.

**Verification:** Check actual name resolution and run bounded startup/readout fixtures for each retained diagnostic mode before using its results. The handover name mismatch is established without a simulation; no training or capability gain is claimed.

<a id="sk-surface-aim-fit"></a>

### SK-SURFACE-AIM-FIT: Surface aim applicability omits its named human arm prerequisites

**Where:** [src/skills/framework/aims.ts](../../src/skills/framework/aims.ts) (`SURFACE_AIM.fits / sensedDrift`), [src/skills/perception/openings.ts](../../src/skills/perception/openings.ts) (`openingSelector consider`), [src/skills/strikes/arm-reach.ts](../../src/skills/strikes/arm-reach.ts) (`armOf`).

**Rule:** A specialized implementation owns and advertises the physical requirements its algorithm consumes.

**Evidence and effect:** SURFACE_AIM has fits:anyBody and aimsWith hand.left/right, while openingSelector requires knuckles and placedReach requires literal shoulder/elbow/wrist/head/feet. Renaming only shoulder.left preserves effector model and physical chain but fit still accepts. An accepted custom arm configuration throws during aim selection rather than being refused at composition.

**Repair:** Move the concrete human arm aim to its owner and provide a matching structural applicability predicate, or derive needed arm geometry from its explicit effector chain.

**Verification:** skills-schema-probe: fit null; first aim throws workshop-fighter has no shoulder.left.

<a id="sk-staged-limb-state"></a>

### SK-STAGED-LIMB-STATE: Staged bearing limbs retain support memory outside the player state graph

**Where:** [src/skills/recovery/implementations/staged/limbs.ts](../../src/skills/recovery/implementations/staged/limbs.ts) (`riseLimbs / footLimb / proppedLimb`), [src/skills/recovery/implementations/staged/staged.ts](../../src/skills/recovery/implementations/staged/staged.ts) (`state.bear`).

**Rule:** All values affecting future steps belong to exposed plain state so fresh forks reproduce the same controller.

**Evidence and effect:** riseLimbs constructs private FootState.memory.rolled. footLimb.read reads its previous value to latch toe support; bear chooses rolled rows and contact patch accordingly. proppedLimb also retains along across zero-span reads. stagedRise.state only includes made.tasks, not this memory. Restoring the exposed player state into a fresh controller can choose different support constraints, despite identical physical snapshot and recipe.

**Repair:** Expose the persistent limb/support state and include it under stagedRise.state; keep geometry overwritten each call as scratch.

**Verification:** Read dependency path confirmed; skills-staged-state-probe isolates rolled latch and shows continued rolled constraint rows versus fresh null rows for identical current read/bear inputs. Probe deliberately raises ground argument to suppress heel gate; it is a controller-state probe, not a physically measured failure.

<a id="sk-research-state"></a>

### SK-RESEARCH-STATE: Recovery research sub-minds omit durable controller memory from state

**Where:** [research/skills/recovery/implementations/staged/sit-back.mjs](../../research/skills/recovery/implementations/staged/sit-back.mjs) (`sub-mind construction`), [research/skills/recovery/witness/rise-witness.mjs](../../research/skills/recovery/witness/rise-witness.mjs) (`bearer work.toward`).

**Rule:** A custom Mind exposes durable changing data in state, including owned controller state.

**Evidence and effect:** sit-back returns state:{trial}, omitting run.state and closure begun; bearer.begin stores toward direction in scratch work, and subsequent step reads it without overwriting, while bearer.state contains memory/orient only. Saved/fresh copies of these supported research minds cannot restore their current phase and bearing direction.

**Repair:** Expose run state, begun and retained bearing direction in their owning plain state; leave only fully overwritten work outside it.

**Verification:** Full function and caller state composition inspected; no bout run needed.

<a id="sk-research-assist-api"></a>

### SK-RESEARCH-ASSIST-API: Rest probe invokes a writer on read-only assist

**Where:** [research/rest-probe.mjs](../../research/rest-probe.mjs) (`fall`).

**Rule:** Boundary refactors migrate authored executable callers to permitted command/lifecycle operations.

**Evidence and effect:** fall calls body.assist.withdraw(), but Body.assist is AssistReading and exposes no withdraw. This branch runs when its body goes limp. The documented rest probe fails at its intended transition rather than reading settling.

**Repair:** Withdraw the assist through the embodiment/lifecycle authority or command the approved zero-assist path before setting limp.

**Verification:** Compared call with live Body.assist type and AssistReading implementation.

<a id="sk-hot-buffers"></a>

### SK-HOT-BUFFERS: Recovery control steps allocate limb-sized intermediate arrays repeatedly

**Where:** [src/skills/recovery/implementations/staged/staged.ts](../../src/skills/recovery/implementations/staged/staged.ts) (`bear supports`), [src/skills/recovery/implementations/staged/lowering.ts](../../src/skills/recovery/implementations/staged/lowering.ts) (`pushes`), [src/skills/recovery/righting/righting.ts](../../src/skills/recovery/righting/righting.ts) (`rise SupportGoal`).

**Rule:** Dear per-step functions work in arrays made once, with operation order preserved.

**Evidence and effect:** staged bear filters/maps limbs into fresh support/corner lists each control step; lowering pushes rebuilds one object per muscle each held step; righting rise maps every end into new support goals each step. These are repeated physics-control paths, not infrequent UI/report work. Controller costs include avoidable morphology-scaled allocation and garbage collection on active recovery.

**Repair:** Preallocate per-instance work/command arrays sized at construction and overwrite records, preserving exact numeric order; measure before/after only when implementing the speed rewrite.

**Verification:** Full hot call chains inspected; allocation sites explicit. No performance claim or timing measurement made.

<a id="sk-research-legacy-config"></a>

### SK-RESEARCH-LEGACY-CONFIG: Authored learned-puncher config no longer resolves in the application catalog

**Where:** [research/learned-puncher.json](../../research/learned-puncher.json) (`mind.kind`).

**Rule:** Retained configurations describe current executable code or are removed; extension consumers use registered implementations.

**Evidence and effect:** The retained mind uses kind fighter and old behaviours/stand-up structure. Current catalog rejects its root kind; repository reference search finds no active importer of this config. The apparent reusable research subject cannot construct on current code and carries obsolete vocabulary beside current tools.

**Repair:** Delete the unconsumed legacy artifact or migrate it to current registered controller/parts with an explicit consumer; do not add generic compatibility logic.

**Verification:** skills-schema-probe treeFaults returns no part of kind fighter.

<a id="sk-tuning-refusal"></a>

### SK-TUNING-REFUSAL: Malformed JSON tuning throws from the catalog validation path

**Where:** [src/skills/strikes/straight-punch.ts](../../src/skills/strikes/straight-punch.ts) (`validStraightPunchPart`), [src/skills/strikes/bite/index.ts](../../src/skills/strikes/bite/index.ts) (`validBite`), [src/skills/strikes/stomp-part.ts](../../src/skills/strikes/stomp-part.ts) (`validStompPart`), [src/skills/recovery/righting/righting.ts](../../src/skills/recovery/righting/righting.ts) (`wholeRecipe`), [src/skills/perception/openings.ts](../../src/skills/perception/openings.ts) (`validOpeningTuning`).

**Rule:** An expected configuration refusal is a returned value; the rule owner exports a total validator for its input boundary.

**Evidence and effect:** treeFaults of registered straight-punch, jaw-bite, stomp, righting-recipe and surface parts with tuning:null throws property/null conversion errors. These part fault readers directly call validators typed as valid structures without checking their JSON object shape. A normal malformed authored/imported configuration escapes the validation/reporting path as a programming exception instead of named config faults.

**Repair:** Guard unknown structure at the owning validator/part boundary and return its invalid-tuning fault; validate nested arrays/objects before their readers. Keep semantic numeric requirements local.

**Verification:** Cheap direct treeFaults probe on five registered {kind,tuning:null} inputs reproduces throws for each; no world constructed.

## Application and transport

<a id="app-codec"></a>

### APP-CODEC: Plain-data codec collides with user record fields

**Where:** [src/app/apart/codec.ts](../../src/app/apart/codec.ts) (`encodeExact / decodeExact`).

**Rule:** Exact transport retains supported plain values and own field names.

**Evidence and effect:** A direct encode/decode probe turns {$n:"ordinary user data"} and {$u:...} into undefined, treats {$f:...} as a shelf pointer, and drops an own __proto__ field. Valid plain report data can be lost or interpreted as transport metadata.

**Repair:** Escape user records that overlap tag signatures and preserve own keys during encoding/decoding.

**Verification:** Disposable direct round trips reproduce all four cases.

<a id="app-requests"></a>

### APP-REQUESTS: World worker replies settle unrelated requests

**Where:** [src/app/browser/worker/client.ts](../../src/app/browser/worker/client.ts) (`WorldLink.step / tape response handling`), [src/app/worker/protocol.ts](../../src/app/worker/protocol.ts) (`WorldLink.step / tape response handling`).

**Rule:** Each asynchronous request settles only after its corresponding work completes.

**Evidence and effect:** Two step requests (1 and 120 steps) both resolve after one stepped reply because the handler drains the entire waiting array; tape uses the same pattern. A caller can observe incomplete work or a response to a different request.

**Repair:** Carry request identifiers or strictly queue requests and settle one matching reply.

**Verification:** Fake Worker probe resolves both promises after one reply.

<a id="app-pending"></a>

### APP-PENDING: World worker disposal and faults leave requests pending

**Where:** [src/app/browser/worker/client.ts](../../src/app/browser/worker/client.ts) (`openWorld fail / abort / dispose`).

**Rule:** Owned asynchronous work has an observable completion or refusal on failure and disposal.

**Evidence and effect:** After ready, fail only notifies listeners; abort/dispose terminate the worker without rejecting pending step/tape promises. Diagnostics and UI operations can wait indefinitely after an owned worker exits.

**Repair:** Track resolve/reject pairs and reject every pending operation on fault, abort and disposal.

**Verification:** Fake Worker probe records terminated worker and still-pending step promise.

<a id="app-loaders"></a>

### APP-LOADERS: Mind workers initialize unselected entrant data

**Where:** [src/app/node/mind-worker.ts](../../src/app/node/mind-worker.ts) (`GAME.loadData(GAME.dataKeys)`), [src/app/browser/worker/mind.worker.ts](../../src/app/browser/worker/mind.worker.ts) (`GAME.loadData(GAME.dataKeys)`).

**Rule:** Independent entrant initialization and case identity follow selected declared dependencies.

**Evidence and effect:** Both worker entry points load every registered key before receiving a make request; treeData and case code select only the chosen component tree. An unrelated entrant loader can run or fail before an otherwise unchanged selected mind starts, outside its recorded dependency set.

**Repair:** Load required declared data for requested recipes before their creation and retain deterministic startup/ordering.

**Verification:** Source trace through catalog.treeData, selected tree identity and worker startup; cross-reviewed against catalog owner.

<a id="app-editor"></a>

### APP-EDITOR: Generic mind editor interprets private field names

**Where:** [src/app/browser/ui/mind-editor.ts](../../src/app/browser/ui/mind-editor.ts) (`Generic mind editor interprets private field names`).

**Rule:** Declared ownership, returned refusals and explicit lifetimes follow AGENTS.md and the layer boundary goal.

**Evidence and effect:** The editor recognizes config.regions and adds an aim slot by name instead of taking all editable shape from the selected part declaration. A registered private configuration with the same names can receive stock strike semantics.

**Repair:** Declare region editors and component slots with their owner; render those declarations without inspecting private fields.

**Verification:** Use the triggering configuration, failed construction or transport boundary directly; avoid unrelated simulation measurements.

<a id="app-inspector"></a>

### APP-INSPECTOR: Inspector reconstructs obsolete root configuration slots

**Where:** [src/app/browser/ui/mind-inspector.ts](../../src/app/browser/ui/mind-inspector.ts) (`Inspector reconstructs obsolete root configuration slots`).

**Rule:** Declared ownership, returned refusals and explicit lifetimes follow AGENTS.md and the layer boundary goal.

**Evidence and effect:** defaultSlot maps stance to locomotion and effectors to guard; readout selects top-level config[slot] and highlights executors. OptionMindConfig instead assembles these through option parts. Its initial HELD rows additionally hardcode stance, lumbar flexion and two human hands in the generic inspector. The current generic inspector cannot locate composed locomotion and guard ownership consistently.

**Repair:** Publish actual configured component paths with inspected ownership and render those paths.

**Verification:** Use the triggering configuration, failed construction or transport boundary directly; avoid unrelated simulation measurements.

<a id="app-refusal"></a>

### APP-REFUSAL: Editor and reel validation throw expected refusals

**Where:** [src/app/browser/ui/attribute-editor.ts](../../src/app/browser/ui/attribute-editor.ts) (`Editor and reel validation throw expected refusals`), [src/app/browser/arena/case-link.ts](../../src/app/browser/arena/case-link.ts) (`Editor and reel validation throw expected refusals`), [src/app/browser/arena/reel.ts](../../src/app/browser/arena/reel.ts) (`Editor and reel validation throw expected refusals`), [src/app/browser/arena/main.ts](../../src/app/browser/arena/main.ts) (`Editor and reel validation throw expected refusals`).

**Rule:** Declared ownership, returned refusals and explicit lifetimes follow AGENTS.md and the layer boundary goal.

**Evidence and effect:** attributeEditor.read throws when ordinary input validation returns null; readReel and reelTrials throw for malformed or unsupported user-selected cases. Callers catch invalid drafts to retain values. Expected invalid input and defects share the exception channel.

**Repair:** Return validation/refusal records and report them at UI boundaries; reserve exceptions for defects and operational failures.

**Verification:** Use the triggering configuration, failed construction or transport boundary directly; avoid unrelated simulation measurements.

<a id="app-build"></a>

### APP-BUILD: Partial worker-stage and dungeon builds lack complete cleanup

**Where:** [src/app/worker/stage.ts](../../src/app/worker/stage.ts) (`Partial worker-stage and dungeon builds lack complete cleanup`), [src/app/worker/duel-stage.ts](../../src/app/worker/duel-stage.ts) (`Partial worker-stage and dungeon builds lack complete cleanup`), [src/app/worker/crypt-stage.ts](../../src/app/worker/crypt-stage.ts) (`Partial worker-stage and dungeon builds lack complete cleanup`), [src/app/browser/dungeon/main.ts](../../src/app/browser/dungeon/main.ts) (`Partial worker-stage and dungeon builds lack complete cleanup`), [src/evaluation/fall.ts](../../src/evaluation/fall.ts) (`buildStandFall`), [src/evaluation/technique.ts](../../src/evaluation/technique.ts) (`buildTechnique`), [src/evaluation/play.ts](../../src/evaluation/play.ts) (`playCase build before disposal block`), [src/app/browser/lab/main.ts](../../src/app/browser/lab/main.ts) (`loadWorld and current assignment`).

**Rule:** Declared ownership, returned refusals and explicit lifetimes follow AGENTS.md and the layer boundary goal.

**Evidence and effect:** Team/Crypt stages create mind workers before awaited world construction without failure cleanup; a failed beside-duel build leaves the main stage allocated. Fall and technique evaluation builders allocate a world before potentially failing admission or registered factories. Lab load creates actor/drawing resources before scenario.start and transfers them to current only afterward. Crypt launch cleans by comparing run references, so a first build failing between scene allocation and RunView leaves both run references null and skips cleanup. A failed construction can retain worlds, workers or rendering resources before a completed owner receives them.

**Repair:** Own partial resources in a construction lifetime with failure cleanup; transfer that lifetime only after every required constructor succeeds. Preserve the original refusal or defect message.

**Verification:** Exercise each listed failure boundary with a bounded rejecting factory/admission and observe cleanup, including a first Crypt launch and a failed beside duel. These findings are source-path traces, not a claim that every ordinary successful build leaks.

<a id="app-flags"></a>

### APP-FLAGS: Application APIs retain bare positional mode flags

**Where:** [src/app/browser/audio/game-audio.ts](../../src/app/browser/audio/game-audio.ts) (`Application APIs retain bare positional mode flags`), [src/app/browser/dungeon/main.ts](../../src/app/browser/dungeon/main.ts) (`Application APIs retain bare positional mode flags`), [src/app/browser/environment/crypt-kit.ts](../../src/app/browser/environment/crypt-kit.ts) (`Application APIs retain bare positional mode flags`), [src/app/browser/arena/room.ts](../../src/app/browser/arena/room.ts) (`Application APIs retain bare positional mode flags`).

**Rule:** Declared ownership, returned refusals and explicit lifetimes follow AGENTS.md and the layer boundary goal.

**Evidence and effect:** new GameAudio(true, mount) selects the Crypt sound mode; assembleCryptKit(container, placements, false) selects unmerged geometry. These first-party call contracts violate the named construction-option rule.

**Repair:** Use named construction options for the fixed presentation modes, while preserving third-party API signatures.

**Verification:** Use the triggering configuration, failed construction or transport boundary directly; avoid unrelated simulation measurements.

<a id="app-screen-css"></a>

### APP-SCREEN-CSS: Arena stylesheet has unreachable scoped body selectors

**Where:** [src/app/browser/arena/style.css](../../src/app/browser/arena/style.css) (`Arena stylesheet has unreachable scoped body selectors`), [index.html](../../index.html) (`Arena stylesheet has unreachable scoped body selectors`).

**Rule:** Declared ownership, returned refusals and explicit lifetimes follow AGENTS.md and the layer boundary goal.

**Evidence and effect:** The selectors prefix body:has(...) with #screen-root[data-screen=arena] as an ancestor. The body is an ancestor of the screen root in the document, so these selectors cannot match. The stylesheet does not enforce its documented setup/pause visibility conditions; JavaScript currently supplies some equivalent hiding.

**Repair:** Express conditions on the mounted screen root or explicit screen attributes; verify setup, pause and verdict rendering.

**Verification:** Use the triggering configuration, failed construction or transport boundary directly; avoid unrelated simulation measurements.

<a id="app-ring"></a>

### APP-RING: Reply backpressure can block completion before draining

**Where:** [src/app/apart/box.ts](../../src/app/apart/box.ts) (`reply capacity and completion wait ordering`), [src/app/apart/host.ts](../../src/app/apart/host.ts) (`reply capacity and completion wait ordering`), [src/app/browser/worker/minds.ts](../../src/app/browser/worker/minds.ts) (`reply capacity and completion wait ordering`), [src/app/browser/worker/mind.worker.ts](../../src/app/browser/worker/mind.worker.ts) (`reply capacity and completion wait ordering`).

**Rule:** Declared ownership, returned refusals and explicit lifetimes follow AGENTS.md and the layer boundary goal.

**Evidence and effect:** The producer waits when the shared reply ring fills, while browserMindWorkers waits on DONE/ANSWERED counters before mindThreads drains replies. A bounded two-message probe with a 256-byte ring and two 200-byte replies reaches completion1, times out waiting for completion2, then reaches completion2 immediately after the first reply is drained. Waiting for a later batch or warm-up completion can block while its writer waits for the same reader to free space. Ordinary small replies do not establish a supported upper bound.

**Repair:** Drain while waiting or define and enforce sufficient bounded capacity; test a full ring without a simulation battery.

**Verification:** Reproduce aggregate overflow across queued batches/warm-up with bounded waits, then verify draining and completion without enlarging the nominal fight fixture.

<a id="app-bench-run"></a>

### APP-BENCH-RUN: Physics bench permits overlapping runs on one yield channel

**Where:** [src/app/browser/physics-bench/main.ts](../../src/app/browser/physics-bench/main.ts) (`runAll, tick, click handlers`).

**Rule:** A timed run answers one comparable decision; resource and completion ownership must be unambiguous.

**Evidence and effect:** Run buttons stay enabled while runAll is suspended. Every tick replaces the single yielder.port1.onmessage callback, so overlapping callers can overwrite a pending resolver; results and status also share one accumulator. Repeated clicks can mix timed runs, strand a prior run or publish done while another is pending.

**Repair:** Serialize runs, disable controls while one is active and give any queued request an owned completion.

**Verification:** Use two simultaneous tick requests and overlapping clicks without a long physics measurement.

<a id="ae01"></a>

### AE01: Ratings record and acceptance globs point at a nonexistent directory

**Where:** [src/app/browser/ratings/records.ts](../../src/app/browser/ratings/records.ts) (`FILES and ACCEPTED import.meta.glob`).

**Rule:** A source move preserves the user-visible ability to read kept evidence and owner acceptances.

**Evidence and effect:** The relative ../../assets paths resolve from src/app/browser/ratings to src/app/assets. Kept records and accepted.json live in repository-root assets. Both the glob and acceptedOf lookup use the stale relative prefix. The Ratings record menu has no bundled records despite433 kept record files. The acceptance locator is also wrong; there are currently no accepted.json files, so no existing acceptance is claimed lost.

**Repair:** Resolve the record and acceptance globs from the new source location, keeping the exclusion and lookup prefix consistent.

**Verification:** Read all Ratings files and resolved the two filesystem paths: stale src/app/assets/evaluations does not exist; root assets/evaluations has433 JSONL files and0 accepted.json files. No browser session or build was run.

<a id="ae02"></a>

### AE02: The down-body allocation fixture returns the unsupported sub-Mind shape

**Where:** [tests/harness/garbage.mjs](../../tests/harness/garbage.mjs) (`lying and downBody`), [tests/harness/step-allocation.mjs](../../tests/harness/step-allocation.mjs) (`down-body fixture selection`).

**Rule:** Executable diagnostics implement the current Mind boundary and report their actual fixture.

**Evidence and effect:** lying returns wants/begin/end/step at its root and directly writes own.muscles.activation/velocity. downBody passes lying as a SubMindMaker. Current SubMindMaker returns a MindConstruction containing mind and has/dispose metadata; OwnBody muscle readings no longer contain command arrays. The advertised down-body allocation path cannot construct/control a valid sub-Mind; it fails before measuring the intended fixed-support steps.

**Repair:** Implement the lying fixture using a complete MindConstruction and write zero commands only in act(control).

**Verification:** Read complete fixture, allocation caller and current hosting/SubMindMaker contract. No profiling or simulation was needed to establish the incompatible object shape.

## Evidence, tools and the authored vendor overlay

<a id="scr-001"></a>

### SCR-001: Entrant ownership check accepts removal of another entrant

**Where:** [scripts/entrant-check.mjs](../../scripts/entrant-check.mjs) (`registryLine/changeOf`).

**Rule:** An entrant change touches its own files and its own registration; other entrant changes are mixed.

**Evidence and effect:** registryLine accepts every line beginning export const ENTRANTS for any entrant name. The actual registry contains OPTION, WALKER and BARE on that one line. An Option change deleting Walker is classified entrant option, defeating the tool assurance that another Mind is not moved unseen.

**Repair:** Compare parsed before/after registration entries or require per-entrant isolated registry lines; allow only the selected entrant manifest/import and its own list entry.

**Verification:** Cheap pure probe in a disposable probe: paths Option/index.ts plus app/entrants.ts, old [OPTION,WALKER,BARE] and new [OPTION,BARE] => {kind:entrant,name:option}. No repository changes.

<a id="scr-002"></a>

### SCR-002: Historical import count checks do not establish declared schedule coverage

**Where:** [scripts/evaluation-import.mjs](../../scripts/evaluation-import.mjs) (`importRun rated/unseen schedule validation`).

**Rule:** Recorded comparisons name the exact scenarios/protocol actually played; claimed complete schedules must verify each expected condition.

**Evidence and effect:** Rated rows require unique pair/gap tuples and total count, but never verify gap membership or enumerate the declared pair-by-gap schedule. Unseen checks also accept arbitrary gap values provided both sides exist. Incorrect or incomplete scenario coverage can be imported as a complete declared tournament and supply ratings/notes.

**Repair:** Enumerate expected tuples from the header protocol and entrants, compare exact coverage, and validate unseen opponent/condition membership. Keep archived records unchanged.

**Verification:** Cheap provenance fixture with two entrants, declared gaps [1], rows at gaps [99,99], correct byte/hash metadata and valid current-build provenance: importRun accepts both rows. a disposable probe; no simulations.

<a id="scr-003"></a>

### SCR-003: Markdown-only pull/merge skips mandatory document validation

**Where:** [scripts/pull-merge.mjs](../../scripts/pull-merge.mjs) (`Markdown-only validation branch`).

**Rule:** AGENTS prose-only changes run tests/documents.test.mjs, diff whitespace and line-ending gates before landing.

**Evidence and effect:** Non-Markdown merge calls build/tests. Markdown-only branch only logs a reminder, then commits a pending merge if tree identity is unchanged. Broken links/anchors or invalid prose citations can be automatically committed by the authorized merge command without the required gate.

**Repair:** Run node --test tests/documents.test.mjs on the Markdown-only path, retaining the existing whitespace and line-ending checks and one validation pass.

**Verification:** Read-only control-flow trace; no fetch, merge, commit or broad gate executed.

<a id="scr-004"></a>

### SCR-004: Moved righting tools retain incorrect repository-relative paths

**Where:** [scripts/skills/recovery/righting/righting.mjs](../../scripts/skills/recovery/righting/righting.mjs) (`ROOT and asset lookup`), [scripts/skills/recovery/righting/righting-forks.mjs](../../scripts/skills/recovery/righting/righting-forks.mjs) (`default OUT path`).

**Rule:** Private tool ownership moves preserve working commands and temporary output remains under repository .tmp.

**Evidence and effect:** righting.mjs computes ROOT with ../.. from scripts/skills/recovery/righting, yielding scripts/skills; assets lookup is therefore scripts/skills/assets/<model>/body.json. Fork output ../../.tmp similarly yields scripts/skills/.tmp. The documented righting search fails before starting; default fork captures write to the wrong hidden source-tree directory.

**Repair:** Resolve repository root with the actual moved depth or common repository helper, then join root .tmp/righting; retain explicit caller --out paths.

**Verification:** Path resolution alone establishes the nonexistent body asset path and incorrect output root. No simulation or output command invoked.

<a id="scr-005"></a>

### SCR-005: Dungeon texture registration reads the nonexistent renderer path

**Where:** [scripts/dungeon/fetch-textures.mjs](../../scripts/dungeon/fetch-textures.mjs) (`registryPath`).

**Rule:** Organization moves update filesystem path readers, not only ES import specifiers.

**Evidence and effect:** registryPath joins root/src/render/textures.json; current canonical registry, comment and refusal message all name src/app/browser/render/textures.json. The documented texture registration command throws ENOENT before inspecting specs or downloads.

**Repair:** Rebase the filesystem path to the current renderer registry, keeping byte checks, row layout and catalog provenance exact.

**Verification:** Read path comparison; no network request or asset rewrite performed.

<a id="scr-006"></a>

### SCR-006: Physical anatomy asset generators share definitions through browser renderer ownership

**Where:** [scripts/core/hand-envelope.mjs](../../scripts/core/hand-envelope.mjs) (`renderer fist definition dependency`), [scripts/skeleton/bone-fit.mjs](../../scripts/skeleton/bone-fit.mjs) (`renderer physical grouping/parser dependency`), [scripts/core/man-envelope.mjs](../../scripts/core/man-envelope.mjs) (`humanoid-only physical measurement tool`), [scripts/core/workshop-envelope.mjs](../../scripts/core/workshop-envelope.mjs) (`humanoid-only envelope extraction`).

**Rule:** Original organization plan: shared modules live in narrowest common owner; private tests/tools/assets mirror ownership. Rendering consumes physical definitions, rather than owning definitions used to generate anatomy.

**Evidence and effect:** Hand envelope geometry is generated using FIST/fistTurns exported from app/browser/render/fist.ts. Skeleton physical mass/hulls group source pieces via SKELETON_PIECES/parseSkeletonArt from app/browser/render/skeleton-skin.ts. The three scripts/core envelope tools are explicitly human-only, unlike shared glb.mjs. Physical shape provenance and renderer definitions remain intertwined; a renderer-owned pose/piece mapping change can alter regenerated physical contact geometry or mass grouping. The naming does not reveal actual humanoid ownership.

**Repair:** Extract only shared authored pose/piece mapping and neutral source reader under appropriate humanoid/skeleton body or shared art owner; let renderer and generators consume them. Group human-only envelope tools with humanoid ownership; retain genuinely shared glTF primitives. Preserve all asset numbers and bindings.

**Verification:** Full-source generator callpaths read. This is an ownership correction, not a claim that current generated shapes are wrong or a request to make appearance authoritative. Future path/definition extraction checks include asset data equality.

<a id="scr-007"></a>

### SCR-007: Build identity canonicalization omits included text input formats

**Where:** [scripts/build-identity.mjs](../../scripts/build-identity.mjs) (`TEXT/contentOf`).

**Rule:** Build identity promises checkout line endings do not distinguish identical input content.

**Evidence and effect:** buildInputs includes every file under scripts/assets/public, but TEXT omits .py, .ps1 and .md. contentOf therefore hashes those textual sources as raw bytes. Equivalent LF versus CRLF checkouts produce different build identities and provenance despite the declared canonical source snapshot.

**Repair:** Normalize all included text input formats through an explicit comprehensive format set or text classification, keeping binary inputs byte-exact.

**Verification:** Cheap hashBuildInputs fixture in a disposable probe: LF/CRLF same for .ts but different for .py, .ps1 and .md. No build or simulation executed.

<a id="rsr-export"></a>

### RSR-EXPORT: Exported training policy omits observation clipping

**Where:** [research/run-train.py](../../research/run-train.py) (`VecNormalize construction and export`).

**Rule:** A retained policy record describes the policy used to generate its evidence.

**Evidence and effect:** VecNormalize uses clip_obs=10.0. export folds mean and scale into the first linear layer but emits only weights/bias, without the input clamp; the runtime Network has no matching normalization clamp. The two functions differ for observations outside the clamp. The saved network can act differently from the trained/evaluated policy on large normalized observations.

**Repair:** Represent and execute the preprocessing in the exported contract or use a training/export pipeline whose preprocessing is exactly representable. Check action preprocessing at the same boundary.

**Verification:** Compare deterministic training and exported outputs on ordinary and clipped observation vectors, including a non-saturated final action.

<a id="rsr-server-fault"></a>

### RSR-SERVER-FAULT: Training server discards unsolicited idle-work failures

**Where:** [research/run-learning-server.mjs](../../research/run-learning-server.mjs) (`work catch and parent message handler`).

**Rule:** A failed environment reports its failure rather than silently continuing evidence collection.

**Evidence and effect:** Worker work() posts an error on idle failure; parent message listener clears waiting and invokes w?.(message). Between trainer requests waiting is null, so the background error is discarded. A failed idle environment can continue participating without its trainer receiving the failure.

**Repair:** Keep worker failure state independently of pending requests and report it on the training protocol, with owned process cleanup.

**Verification:** Make idle() fail between requests and observe the next protocol response carry the same error.

<a id="vo01"></a>

### VO01: The contact-layer WASM bridge silently converts callback exceptions into ordinary contact

**Where:** [vendor/rapier/auto-rpg.patch](../../vendor/rapier/auto-rpg.patch) (`bindings/typescript/src/pipeline/physics_hooks.rs modify_solver_contacts`).

**Rule:** A throw is a defect; catches occur only at reporting boundaries and keep its message.

**Evidence and effect:** The added bridge invokes callback.apply inside if let Ok(value). An Err is discarded without reporting or propagation. pair_update creates a fresh zero layer before the call and commits it afterwards, so a thrown physical-material callback silently leaves ordinary contact. A caller using the published contactLayer hook can receive a successful world step computed with different physical contact behavior after its material rule failed. The current core installs no layer, so this is an exposed overlay contract/error-reporting defect, not a demonstrated current gameplay regression.

**Repair:** Propagate or report the callback error with its original message at the engine boundary, rather than committing a successful ordinary-contact step after a defect.

**Verification:** Read the authored JS declaration, Rust callback bridge and pair-update layer initialization/writeback. No build, numerical simulation, artificial callback failure or upstream source expansion was performed.

<a id="exp-001"></a>

### EXP-001: Unconsumed source exports retain orphaned API surface and implementation code

**Where:** [src/skills/kit.ts](../../src/skills/kit.ts) (`gaitLegsOf`), [src/parts/fields.ts](../../src/parts/fields.ts) (`optionalNumber`), [src/skills/intent/movement.ts](../../src/skills/intent/movement.ts) (`walkGoal`), [src/skills/recovery/implementations/staged/stages.ts](../../src/skills/recovery/implementations/staged/stages.ts) (`CONTACT_RISE`), [src/minds/engagement.ts](../../src/minds/engagement.ts) (`engagementWithDetails`), [src/minds/decider.ts](../../src/minds/decider.ts) (`AroundDecider`), [src/control/whole-body/tasks.ts](../../src/control/whole-body/tasks.ts) (`supportEdgeIncludes`), [src/control/whole-body/joint-stops.ts](../../src/control/whole-body/joint-stops.ts) (`checkedJointStopSettings`), [src/core/bodies/object-senses.ts](../../src/core/bodies/object-senses.ts) (`createObjectSenses`), [src/minds/option/limbs.ts](../../src/minds/option/limbs.ts) (`isLimbRole`), [src/skills/perception/openings.ts](../../src/skills/perception/openings.ts) (`highestSurface`), [src/core/bodies/build/joint-state.ts](../../src/core/bodies/build/joint-state.ts) (`rateBiasToRef`), [src/skills/locomotion/navigation/sensed-bounds.ts](../../src/skills/locomotion/navigation/sensed-bounds.ts) (`clearFootTranslation`).

**Rule:** AGENTS: An export needs an importer; a published field needs a reader.

**Evidence and effect:** The 16 listed export names each occur exactly once in first-party source/tests/scripts/research: their declaration. No named import/re-export, namespace import or export-star graph edge consumes these names, and none is supported by the published body/parts/minds barrels. Each declaration was read before confirmation. Existing dynamic stages import reads SIT_BACK, not CONTACT_RISE. Unused generic helpers, validators, observer construction and a staged experimental recipe remain exposed as if they were supported current APIs. Their published contracts and code accrue maintenance without an actual reader; this also obscures which paths enforce validation.

**Repair:** Remove the redundant exports and any entirely unreachable definitions/dependencies, after checking public-entry guarantees. If an intended invariant needs a validator, wire it at its real owner/caller and establish that callpath instead of retaining an unused checker. Do not add artificial consumers or tests just to keep the names.

**Verification:** Read-only AST/import graph artifacts: unused-export-candidates.json and unused-export-graph.json. Definition/caller source reviewed; no source edits, simulations or broad gates. Public barrel re-exports count as supported API and were excluded.

## Unresolved questions

<a id="sk-research-worker-error"></a>

### SK-RESEARCH-WORKER-ERROR: Research worker failure completion needs a lifecycle probe

**Where:** [research/core-posture-runs.mjs](../../research/core-posture-runs.mjs), [research/core-stance-envelope.mjs](../../research/core-stance-envelope.mjs), [research/core-stance-sweep.mjs](../../research/core-stance-sweep.mjs), [research/punch-policy-check.mjs](../../research/punch-policy-check.mjs), [research/locomotion-run.mjs](../../research/locomotion-run.mjs), [research/locomotion-wrench.mjs](../../research/locomotion-wrench.mjs), [research/run-train.py](../../research/run-train.py), [research/run-cycle-search.mjs](../../research/run-cycle-search.mjs).

**Known:** These pools reject the per-worker promise on error message but neither terminate that worker nor close every pool member in finally. core-posture-runs also omits error/exit handlers. Worker parentPort listeners remain active after the promise rejects. locomotion-run rejects on a worker error without terminating the pool; locomotion-wrench terminates for a message error but its worker error listener only rejects. run-train closes its Node subprocess only after a successful training loop; initialization, export or training exceptions bypass it. run-cycle-search terminates its workerPool only after a successful score/search; a failed score throws before cleanup. Explicit finally cleanup is absent in these paths. CLI exit or stdin closure may already reclaim the workers/server; a persistent resource leak is not established.

**Resolve:** Use one pool finally termination path, error/exit rejection handling and cleanup of pending listeners while preserving original error text. Own workers/processes in a finally-protected lifetime across initialization, job execution and export, then surface the original failure. Use a bounded failing child process, observe its exit and every worker/server PID, and distinguish successful process teardown from a pending request. An attempted pool-failure probe is inconclusive; no leak is counted as confirmed.

<a id="app-sw-scope"></a>

### APP-SW-SCOPE: Cross-origin isolation registration escapes a subpath deployment

**Where:** [src/app/browser/isolate.ts](../../src/app/browser/isolate.ts), [.github/workflows/pages.yml](../../.github/workflows/pages.yml).

**Known:** A /auto-rpg/ page registers /auto-rpg/coi-sw.js with scope resolved from ../.., which is /. Pages builds explicitly use /auto-rpg/. The requested scope extends outside the script directory; the deployed response header and resulting registration failure still need verification.

**Resolve:** Keep worker scope within the actual application base and verify isolation on the subpath deployment. Use the triggering configuration, failed construction or transport boundary directly; avoid unrelated simulation measurements.
