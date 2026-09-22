# Attributes, progression, and mind schools

Date: 2026-09-22

Status: design analysis from the attribute-system discussion, not an implementation
specification or a claim that these progression mechanics already exist. School
names, unlock prices, and compute units are provisional.

## Design direction

A fighter consists of **body + equipment + school + school-specific knowledge +
intelligence budget**.

Progression should purchase identifiable capabilities, not abstract bonuses that
pretend to be physics or intelligence. More capable fighters need not be identical
fighters: specialization and different control architectures are first-class goals.

Keep observations available rather than manufacturing weaker minds through hidden
information, injected aim noise, or arbitrary reaction delays. Differences should
come from physical capabilities, actual controllers, available methods, and how
much computation a mind can afford.

Physically meaningful does not have to mean fully emergent. Walking and turning
speed are useful explicit attributes for this game's movement controller. Fully
contact-driven walking would be a separate locomotion research project, not a
prerequisite for progression.

## The components of a build

| Component | Owns | Does not imply |
| --- | --- | --- |
| Body / morphology | Locomotion module, torso, arms, head, sockets, joints, physical specifications | Every later unlock dominates earlier bodies |
| Equipment | Attached items, geometry, mass, reach, material properties | A weapon-independent damage multiplier |
| School | Mind architecture and supported ways of controlling the fighter | A guaranteed strength tier |
| Knowledge | Unlocked implementations and capabilities within a school | Every mind must represent knowledge as discrete options |
| Intelligence | In-fight compute income per simulated second | Training cost, hidden observations, or arbitrary motor degradation |

Separate what is **known/unlocked** from the **active build**. Unlocking a planner
does not force the player to replace a successful reactive mind. Equipment,
compatibility, physical limits, and compute costs should provide constraints before
we introduce arbitrary skill-slot limits.

## Mind architectures: schools, not a universal meta-policy

The central correction to the initial knowledge-tree proposal is that an
option-selecting meta-policy is only one architecture. A mind may instead directly
produce continuous control commands, optimize command sequences, or combine methods.

Use **mind architecture** technically and **School** as a possible player-facing
term. Reserve **style** for how a particular configured mind fights.

| Illustrative school | Control structure | Possible progression |
| --- | --- | --- |
| Tactician | Selects and coordinates discrete options | Techniques, selection logic, combinations, opponent models |
| Continuous | Directly produces body-control commands | Improved controllers, equipment adaptation, broader behavioural competence |
| Planner | Evaluates simulated futures and selects commands or sequences | Prediction models, search methods, horizon and refinement capabilities |
| Hybrid | Combines particular architectures | Planning over options, continuous execution, specialist switching |

These are illustrative families, not an exhaustive or mutually exclusive taxonomy.
A planner can search over options or continuous commands. A learned model can be
an option selector, a direct controller, or a component of a planner. PPO, NEAT,
scripted logic, and search are implementation/research methods, not inherently
ordered progression tiers.

Unlock capabilities players can recognize, such as anticipating a counterattack,
not promises such as "PPO is smarter." A costly planner may lose to a cheap reactive
controller, particularly when its prediction model is inaccurate.

### Shared authority, different internal representations

All schools must obey the same physical authority and permitted controls. They do
not need the same internal decision structure or the same inventory of options.

The repository's current house rule is that AI acts through the same `Intent`
boundary available to human control. Direct continuous control can mean generating
those commands without choosing options; it does not authorize bypassing the
controller to set poses or joint states directly. Joint-target or torque-level
interfaces would require a separate explicit design decision, a corresponding
control contract, and physical-limit validation.

## Knowledge and wisdom

Prefer a unified progression concept with **school-specific branches**, rather
than unrelated currencies for tactical knowledge and motor skills. Wisdom can name
the points used to unlock knowledge; a separate Wisdom stat needs an independent
purpose before it is added.

Progression can unlock techniques, coordination, tactical recognition, prediction,
and planning. An unlock may bundle execution and selection changes so that a player
receives a usable capability, not several disconnected prerequisites.

This is not a universal skill tree shared structurally by every school:

- A Tactician can unlock an explicit guarded-thrust option.
- A Continuous mind can acquire the same competency through a controller upgrade
  without representing "guarded thrust" as an internal object.
- A Planner can exploit a better model or action representation to discover it.

Common evaluations can measure the competency without imposing common internals.
Cross-school knowledge reuse is possible where an actual interface exists; learning
a technique in one architecture does not automatically transfer its implementation
to another.

Un-ablation is a useful progression/research connection: enabling a particular
component should have an identifiable, measured effect. An upgrade may improve one
matchup and worsen another; label specialization honestly rather than assuming
every unlocked component is universally stronger.

## Intelligence: compute income, not a fixed thinking frequency

Intelligence supplies compute credits per simulated second. With income 12 and no
other charged work, a cost-1 evaluation can run 12 times per second; a cost-2
evaluation can run 6 times. Variable-cost policies can choose between frequent
shallow decisions and less frequent deeper decisions.

The 12 Hz example is illustrative, not a verified or permanent scheduling ceiling.
A runtime update ceiling is separate from the definition of intelligence.

Proposed accounting rules:

- Use reproducible work units, not milliseconds on the player's computer.
- Charge actual supported increments of thinking, not one flat invocation price
  that can hide unlimited search.
- Charge in-fight inference separately from offline training. Expensive training
  does not by itself justify expensive inference.
- Accrue on simulation time, not rendering or wall time; pausing earns no credits.
- Consider a small capped reserve for bursts. Initial credit and reserve capacity
  remain design choices; indefinite idle accumulation should not buy unlimited
  thinking at first contact.
- A policy need not evaluate merely because credits are available. Scheduling can
  depend on commitment, uncertainty, or bounded event detection.

Cross-architecture cost calibration remains unresolved. Search steps, neural
inference, and scripted execution need explicit cost models; calling all of them
"one evaluation" would erase the intended tradeoff. Deterministic game credits
also do not replace real runtime safety limits.

Foresight is primarily a resulting capability: a mind can spend its budget on
depth, breadth, refinement, or opponent prediction. Deeper search is not necessarily
better when the model is wrong.

### Corrected motor-control accounting boundary

An earlier simplification proposed free skill execution and paid tactical thought.
That is too specific to hierarchical minds: a continuous controller may combine
execution and decision-making in the same inference.

The preferred boundary is instead:

- **Shared physical servos and physics** run at their normal fixed rate, outside
  the mind's compute budget.
- **Mind-specific computation** is charged wherever it lives: option selection,
  option execution logic, continuous inference, event analysis, or look-ahead.

An option's execution may be very cheap, but naming an algorithm a skill must not
make its intelligence free. Conversely, a low-budget fighter must not get a broken
physics timestep or a deliberately destabilized servo.

Between mind updates, the permitted body interface can retain a target or execute
an already issued bounded trajectory. The exact continuation, interruption, and
budget-exhaustion rules require specification. Any state-dependent computation in
that continuation must have an explicit accounting classification.

## Skills where an architecture uses them

Options are a natural implementation of skills for hierarchical minds: they have
admission conditions, execution policies, and completion/failure conditions.

Motor coordination can improve through genuinely different controllers: accounting
for momentum, coordinating arm and wrist, maintaining edge alignment, or recovering
to a useful guard. Novices need not be expert controllers with random errors added.

Skills may be general, equipment-specific, morphology-specific, or combinations.
A sword thrust requires a compatible arm and sword; a natural head strike need not
require a hand slot.

Do not force one whole-body option at a time. To support moving while guarding and
attacking, composable skills should declare required capabilities, owned control
channels, interruption rules, and termination conditions. Conflicting skills cannot
both own the same channel. Start with a few explicit combinations rather than a
universal composition engine. Coordination itself can be an unlock.

## Body, items, and durability

Morphology should branch into stronger and more diverse constructions rather than
only increasing one power number. Physical tradeoffs should be measured where they
exist; explicit balance rules should not be described as emergent physics.

Candidate body specifications:

- **Strength:** actual actuator force/torque limits, not a damage multiplier.
- **Actuation speed:** joint/target movement-rate limits, distinct from force even
  if an upgrade changes both.
- **Movement:** walking and turning capabilities, with directional movement
  differences retained. Acceleration can remain module tuning initially.
- **Durability:** specific material and connection resistance, if implemented.

Items/end effectors carry their own geometry, mass, reach, and relevant material
properties. Body and item construction interact with controller competence; a
controller good with a light sword need not work equally well with a heavy club.

Do not invent a global health pool merely to complete an RPG attribute list.
Separate **construction** (resistance and connection strength) from **condition**
(accumulated damage, failed connections, missing parts). Severance resistance is
one possible property, not resistance to all damage. The damage/failure model must
be settled before promising particular durability upgrades.

Precision, endurance, and integrity are not assumed to be emergent attributes.
Any such mechanic needs an actual controller or physical mechanism and evidence,
not just a plausible name.

## Evaluation and research implications

Measure proficiency instead of adding a decorative "Sword 73" modifier. Examples
include thrust accuracy while moving, recovery after misses, defensive performance
against reference attacks, and adaptation across equipment.

Combat rating describes a configured build and evaluation context: body, equipment,
school/controller version, unlocked capabilities, and compute allowance. A policy
rating under a fixed reference body is still useful, but must not silently imply
the same rating under every build. Preserve dated evaluation evidence rather than
discarding every rating on every code change.

Evaluate architectures across compute allowances and opponents. More computation
or a larger repertoire is not evidence of improvement by itself. Include competence
probes, diverse bouts, physical validity checks, and visual review. Slow privileged
research teachers must remain distinguishable from playable budgeted minds.

Related research context:

- [AI strength and research plan](../plans/2026-09-20-ai-strength-and-research.md)
- [AI portfolio and teachers plan](../plans/2026-09-21-ai-portfolio-and-teachers.md)

## Open decisions before implementation

1. Final player-facing terminology and whether Wisdom is an unlock currency.
2. The first supported schools and their concrete, validated progression nodes.
3. Compute-cost units across architectures, initial credit, reserve capacity,
   scheduling limits, and runtime safety limits.
4. How active controllers continue safely when the mind cannot afford an update.
5. Which control interfaces remain shared, and whether any lower-level experimental
   interface is worth adding without violating physical authority.
6. Unlock-versus-loadout rules and the scope of cross-school transfer.
7. Local damage, material failure, and connection failure before defining health.

The design goal is genuine, visible capability growth with multiple viable ways to
think and fight, without requiring fully physical locomotion or forcing every mind
into the option hierarchy.
