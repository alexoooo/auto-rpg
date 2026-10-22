# General AI testbed

## Why

Make the shared infrastructure a clean, simple testbed for configurable AI-controlled bodies.
The standard humanoid fighter is one useful assembly of components; its choices do not define
what every Mind, body or experiment must be. Different decision algorithms remain competing
implementations, sharing mechanisms where their contracts agree.

The core already provides important boundaries: granted perception and actuation, deterministic
world steps, explicit state, replay and a direct-policy path. Preserve these while separating
construction, coordination, controller policy, inspection and scenario rules.

An abstraction earns its place by removing a concrete special case, allowing an experiment to
replace one implementation, or letting a new implementation plug in without modifying its host.
Keep the normal fighter easy to configure; avoid a universal interface that makes every kind of
component pretend to do the same work.

## Steps with checks

### 1. Separate component construction from coordination

`fighterSkills` (`src/core/mind/fighter.ts`) builds locomotion, guard, support and executors.
Its supplied-executors argument makes executors a special case. Keep a convenient standard
fighter builder, with construction delegated to the registered factories for every component
it selects. The runtime receives constructed components and owns their coordination.

Use a small Vanguard assembly as the first client: its custom punch is an ordinary configured
executor in its assembly. Its registry may contain entrant-local components without requiring
the common factory to import that entrant. Remove the special injection path after its callers
use the same construction mechanism.

Check: standard configurations still build through the convenience builder; Vanguard can replace
its executor without changing common orchestration; configuration, links and saves retain the
selected implementation and settings.

### 2. Separate resource arbitration from humanoid fighter policy

`skillSet` (`src/core/skills/arbiter.ts`) combines action admission and command ownership with
navigation construction, the default guard posture, two guarding hands, gait coordination and
checks of specific support stages. Extract the coordinator for lifecycle, ownership and command
composition. Navigation, guarding, locomotion and support supply their own commands and declared
constraints. Their standard humanoid combination remains a reusable assembly.

Check: conflicting writes are refused, relinquished controls return to their declared defaults,
and an alternate guard or support implementation needs no new stage-name checks in the arbiter.
Preserve operation order and fingerprints in an extraction that claims unchanged behaviour.

### 3. Make registration own implementation consistently

Executors and locomotion already register factories. `BEHAVIOUR_PARTS`
(`src/core/mind/behaviours.ts`) describes behaviours whose execution lives in the central
`actionTactics` switch (`src/core/mind/action-tactics.ts`). Move each behaviour's implementation,
configuration validation and state behind its registration. Leave the decision engine with the
explicit priority and composition rules.

Colocate each implementation's accepted configuration with its owner, including keys and value
validation. Keep editor descriptions from acquiring validation authority. Reuse the existing
part contracts where they fit, and allow a composed Mind to resolve its own registered parts.
Follow the roadmap's component contribution scope when implementations move into
`src/core/components/`; update the scope checker with that first move.

Check: adding an ordinary behaviour requires its implementation and registry entry, without
editing the decision engine. Invalid values and cross-component references still fail before
motion state is constructed. A locally registered component round-trips through the editor,
recipe and saved configuration.

### 4. Give the humanoid command layer an explicit scope

`BodyView` and `commandable` (`src/core/body.ts`) assume two fists, a head, box soles and a
standing stance. `Intent` (`src/core/mind/intent.ts`) requires left/right hand guarding. These
are useful capabilities of the humanoid command layer, separate from a general physical body.

Keep the general body interface about segments, joints, effectors, contacts and actuators.
Place biped stance and hand guarding in an explicitly humanoid layer. Components declare the
capabilities they need and report why another body cannot supply them. Build on `ReadBody`,
`PhysicalBody` and the direct-policy path instead of introducing duplicate body representations.

Check: existing humanoid controllers retain their behaviour; a non-humanoid controller uses the
general facilities without fabricated fists, head or stance fields. Shared names alone do not
establish physical competence across body families; their tasks remain the evidence.

### 5. Separate construction compatibility from competition eligibility

`treeRefusal` (`src/core/mind/catalog.ts`) combines structural fit with declared equipment use
and attack availability. Separate valid configuration, required body capabilities, equipment
limitations and the scenario's eligibility requirements.

A locomotion experiment may deliberately carry an unused weapon; a defensive experiment may
deliberately omit attacks. A fight can require usable attacks or supported equipment as its own
entry rule. Actual actuator, permission and physical safety constraints remain mandatory.

Check: those experimental controllers can be constructed when their capabilities suffice, while
a competition requiring attacks refuses them with a scenario-specific reason. Construction,
pickers and evaluation still read the predicates owned by the relevant rule.

### 6. Make recovery use the configured control facilities

Standing actions use executors and resource claims. Recovery uses sub-minds; `standUp`
(`src/core/mind/ground/stand-up.ts`) constructs its own motor, locomotion and guard posture.
Make motor selection, cancellation, whole-body takeover, handback and reporting explicit across
the standard toolkit. Supply recovery with its selected control facilities through the same
construction rules as standing skills.

Preserve whole-body takeover and the ability of a Mind to drive muscles directly. A common
lifecycle does not require every recovery technique to become a standing attack executor.

Check: selecting a motor for a standard assembly also determines recovery's motor unless its
configuration explicitly selects another. Takeover interrupts prior commitments, handback starts
from the body's actual state, and a save/load during either transition resumes exactly.

### 7. Separate common inspection from particular decision algorithms

`Tactics` (`src/core/mind/tactics.ts`) refers to the Options controller's `Offer` and the action
controller's `ActionEngagement`. The skills runtime also stores tactics state and exposes tactical
engagement. Have the composed Mind own the composition of component states. Each component
retains its explicit memory and publishes its own inspection data.

Common reports describe common facts such as active actions, held resources and refusal reasons;
algorithm-specific offers, candidates and scores remain optional extensions. A new planner can
explain itself without adopting another controller's decision model.

Check: existing inspectors retain their useful information, a distinct planner can publish its
own details, and replay/forking includes every component's state without duplicate mutable owners.

### 8. Express Vanguard experiments as component choices

Vanguard (`src/core/entrants/vanguard/mind.ts`) assembles wrappers through flags for committed aim,
prediction, adaptive evasion, routing and other choices, with dependencies between those flags.
Express targeting, executor, movement and decision choices as explicit component configurations.
Retain body-specific calibration as named data where needed; prefer capability-based selection
over model-name selection where the same rule applies.

Check: replace the planner, punch executor, navigation or recovery independently without editing
shared orchestration. An ablation replaces one component while retaining the other settings,
conditions and permissions. This cleanup makes no claim that Vanguard meets its separate win-rate
target ([Vanguard](2026-10-21-vanguard.md)).

### 9. Separate scenario simulation and adjudication from presentation

Headless evaluation reuses `Duel` (`src/arena/duel.ts`), preserving one bout implementation.
Give scenario construction, recording and adjudication explicit ownership outside the Arena
screen, consumed by both the browser and evaluation. Keep recipes explicit about conditions,
permissions, termination and scoring; preserve shared simulation rather than copying it.

Remove the mandatory rendering-scene dependency as a later, separately checked extraction:
`buildBout` (`src/evaluation/bout.ts`) creates a Babylon scene, segment bodies carry transform
nodes, and `World.step` (`src/core/world.ts`) updates the private render ID. Physics owns the
authoritative transforms; presentation consumes them. Retain exact arithmetic and the engine
contract, without replacing Babylon's math merely to remove a package name.

Check: the same recipe and inputs produce the same bout in browser and Node; headless execution
needs no rendering scene after the transform extraction; rendering never advances simulation.
Keep recording identity checks and save compatibility explicit throughout the move.

### Landing checks

- Land small, reviewable changes on main, starting with construction and arbitration. Coordinate
  movement changes with [Movement and command](2026-10-21-movement-and-command.md) and scenario
  work with [Ratings](2026-10-21-ratings.md); preserve their existing shared pipelines.
- Run `npm run check` and `npm test` for code changes, plus `npm run build` for browser code,
  assets or build changes. A toolkit extraction claiming no behaviour change keeps the
  fingerprint against the preceding commit; name moved cases for intentional behaviour changes.
- Add fast tests only for concrete ownership, configuration, lifecycle or replay defects. Use
  existing tasks for physical competence; architectural cleanup does not require a tournament.
- Update the architecture as each boundary changes and the roadmap as work lands. Check cited
  files and anchors, whitespace and line endings. Keep temporary files and servers under the
  workspace rules in [AGENTS.md](../../AGENTS.md).

## Done when

- Standard fighter assembly uses the same registered construction mechanism as its alternate
  components, with no entrant-specific executor injection in the common factory.
- Shared arbitration coordinates declared ownership and lifecycle without knowing guard policy,
  hand count or support implementation stage names.
- Behaviours own their implementations; component configuration, validation and state have clear
  owners, and common inspection does not import a particular planner's decision vocabulary.
- The physical-body interface is distinct from humanoid command capabilities, and experimental
  construction is distinct from a competition's eligibility rules.
- Recovery uses explicitly configured control facilities and preserves exact takeover, handback
  and fork behaviour.
- Vanguard demonstrates independent component replacement through complete, portable configs.
- Browser and evaluation share scenario construction and adjudication, with headless simulation
  independent of a rendering scene.
- Required checks pass, the current boundaries are documented in the architecture, and this plan
  is deleted when the work lands.
