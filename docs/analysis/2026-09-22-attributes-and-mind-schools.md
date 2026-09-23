# Attributes, progression, and mind schools

Date: 2026-09-22. Updated 2026-09-23 with a first slice of numeric attributes, the
state of per-part health, and what a size stat would take.

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

### A first slice of numeric attributes

Added 2026-09-23. Each stat below scales a number the simulation already reads,
so a point spent on one changes something a fight can show. None of them is wired
as a stat yet, and none is a damage multiplier.

| Stat | The number it scales | What it buys | Bound or caution |
| --- | --- | --- | --- |
| Movement | the locomotion module's `carrier`: `maxSpeedMps` 3.2, `backSpeedMps` 1.9, `strafeSpeedMps` 2.4, `maxAccelerationMps2` 9.0 | closing, escaping, holding a range | Keep the back and strafe ratios, 0.59 and 0.76 of a walk. They exist because a golem that backed off as fast as it advanced could never be cornered. |
| Turning | `carrier.maxYawSpeedRadS` 3.0 and `maxYawAccelerationRadS2` 11.0 | facing a flanker, bringing the weapon side round | none yet |
| Stability | the stagger and fall thresholds, `staggerAtMps` and `fallAtMps` in `src/supported-locomotion-production.ts` | fewer staggers and knockdowns from a blow of a given size | Both thresholds are specific impulse (impulse over supported mass), so a heavier body is already steadier. The stat scales the thresholds, not the mass. |
| Arm speed | `CHAIN_REACH.anchorRate`, 5 | faster strokes and recoveries | Bounded, and the bound is the whole design problem. At rate 18 the driven anchor sat 217 mm from where it was sent and a tip peaked at 75.5 m/s: a flung blade. Every bout-level number rewards that. Gate on the bench's stroke stray, which `tests/golem-bench.test.mjs` already refuses above 50 mm. |
| Armour | each part's `armour` fraction, spent through `armouredDamage` in `src/scoring.ts` | less damage from each blow on that part | Already live, per part, and since skeleton 02 per kind of blow. A stat multiplies the table and stays below 1. |
| Toughness | each part's `health` row (24 to 260 on the golem tables) | more blows before a part is ruined | A multiplier on part rows, not a pool: see the next section. |
| Weight | module masses, through `kg()` and `SHIPPED_MASS_SCALE` | more energy per blow, since `E = 0.5 * mu * v^2` with `mu` the pair's reduced mass (`src/scoring.ts`); more resistance to shoves | It costs speed: a heavier arm moves slower at the same force. The held blade's 1.30 kg does not scale, so weight changes the arm-to-blade ratio as well. |
| Recovery | the biped's `Knockdown` table: `risePeakMps`, `maxLyingSeconds`, `riseHoldsThroughHits` | less time on the floor, and a rise that hits do not interrupt | `maxLyingSeconds` is what keeps a body that is still being struck from lying there for ever. A stat may shorten it and must never remove it. |

**Strength is missing on purpose.** An arm's force ceiling is not a stat on these
chains. A force sweep from 1,400 N to 14,000 N on a 29.5 kg chain stopped changing
above about 3,900 N (AGENTS.md, "On a low-axis chain the anchor's rate limit
shapes a commanded move"). The rate limit shapes a move; the force ceiling does
not. So "Strength" as an arm ceiling would scale a number that changes nothing
above that point. It becomes a stat only where a sweep shows its ceiling actually
binds, which might be the legs, the neck or the waist, and nobody has measured
those yet.

**A first slice** would be Movement, Turning, Arm speed, Toughness and Armour. The
five are independent, each is one table, and all but Arm speed are safe across a
wide range. Stability, Weight and Recovery come next: each of them interacts with
knockdowns and shoves, which are still being tuned.

### Health is already per part; the bar is a readout

What exists on 2026-09-23:

- **Every part has its own health and armour.** A blow wounds the part it lands on.
- **The bar is an aggregate, not a pool.** `vitality()` is a weighted reading of
  every part's wound. A bout ends when a `fatal` part is severed or at zero, or when
  the bar reaches zero (`beaten()` in `src/bout.ts`).
- **A ruined part goes limp**, through `BuiltChain.limp`. A ruined leg hobbles, and
  with every leg ruined the carrier answers `GOLEM_RUIN.strippedMobility`, which is
  0.3, of its command.
- **A part driven past its breaking point comes off.** That point is
  `CONFIG.combat.severMargin`, 0.5 of the part's health beyond zero. So a ruined limb
  does not soak blows for ever.
- **Equipment is never wounded.** This covers the shield plate, the whip's lash and
  weight, and since 2026-09-23 the blade, mace and maul. A blow on any of them is a
  parry.

So condition is already local, which is what this section asked for. A health stat
should therefore be the Toughness multiplier on part rows. A whole-body pool would
make it irrelevant where a blow lands, and making that matter is the reason the
per-part model exists.

One piece of arithmetic to keep in mind: `Golem.scaleVitality` normalises the
weights to `GOLEM_ASSEMBLY.vitalityTotal`. Raising every part's health by the same
factor lengthens a fight and leaves its shape alone. Raising one part's health
makes that part a better place to take a blow.

### Size

A size factor `s` scales every length of the body by `s`. Under geometric
similarity at constant density the rest follow:

| Quantity | Scales as | At s = 1.25 |
| --- | --- | --- |
| length, reach, collision radius | s | 1.25 |
| mass | s^3 | 1.95 |
| rotational inertia | s^5 | 3.05 |
| torque to hold a pose against gravity (m g L) | s^4 | 2.44 |
| force for the same acceleration | s^3 | 1.95 |
| natural linear speed of walking or swinging | sqrt(s) | 1.12 |
| natural durations (a stride, a swing) | sqrt(s) | 1.12 |
| angular rates | 1 / sqrt(s) | 0.89 |
| blow energy at natural speed (m v^2) | s^4 | 2.44 |

That gives a real trade rather than a free tier. A big body has more reach and
much harder blows. It turns and swings more slowly in angular terms. It is also
more stable, because the stagger thresholds divide the incoming impulse by the
body's own mass. Toughness has no physical law here: health could scale with a
part's cross-section (s^2) or its volume (s^3), and that is a design choice.

**Size cannot be a render-time scale.** Every table is read when a module is built,
and many of its numbers were measured on today's size rather than derived from it.
Examples: `lashReach`, the carrier limits, the stability thresholds, the anchor
rate, `ANCHOR_DRIVE.linearForce` (derived from the driven mass the bench prints),
and the bench's stroke exclusion windows. Masses would follow the law through
`kg()`, but those measured numbers would not. Equipment has its own size as well:
`TERMINAL_BLADE.mass` does not scale with the body, so a large golem holding the
same sword has a different arm-to-blade balance. That balance is exactly the
wrist-weld mass ratio that once produced the jiggle.

The recommendation is a build-time `size` factor passed to every module builder.
Each table is scaled by the laws above, and each measured constant is re-derived
at the new size rather than scaled. Start with 0.8 to 1.25 and gate both ends on
the Node bench (stroke stray, anchor lag, stability at rest) and on a bout sweep
before the range widens. Equipment keeps its own size.

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

- [Research record](../../research/RESEARCH.md), where the AI strength plan's outcome now lives
  (the plan itself was deleted once implemented: `git show f40c5f7:docs/plans/2026-09-20-ai-strength-and-research.md`)
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
   Partly settled on 2026-09-23 (see "Health is already per part"). Damage is local,
   a ruined part goes limp, and a breaking point takes it off. Still open: whether a
   connection's strength should differ from the health of the part it holds, and
   what a severed part is worth afterwards.
8. Which stats from the first slice to wire, over what ranges, and whether a size
   factor is worth the re-derivation it demands. Decided 2026-09-23: all nine, as
   multipliers at 1.00, each measured before its range is set, with weight and size
   as two stats. The plan set is `docs/plans/2026-09-23-attributes-00-overview.md`.

The design goal is genuine, visible capability growth with multiple viable ways to
think and fight, without requiring fully physical locomotion or forcing every mind
into the option hierarchy.
