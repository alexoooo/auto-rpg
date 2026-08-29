# Construct Forge -- body and AI co-design

## Current status -- implemented, not closed (2026-08-28)

The body/control/Mind contracts, procedural Warden, Forge, physical probe, exact saved-selection
Fight path, Lab, graph policy software and fail-closed trainer are implemented. The former authored
corpus corrected the earlier power failure but is superseded because its seed labels did not perturb
physics. The replacement seeded eight-worker corpus is now recorded and rejected: all eight bouts
time-capped, 234,442 steps were stuck and two rows lacked bilateral damage. Its 212 named
resource/hardware transitions are retained as telemetry; unexplained capability disappearance is
zero and is not a rejection reason. Production learning therefore remains blocked and has written no shard, update or
artifact. The visible mouse-only onboarding and product verdict
also remain owed to a person. Keep this plan set until both the technical blocker and human protocol
are resolved.

## Outcome

Turn the sword prototype into a laboratory for player-built ancient combat machines without
removing Warrior, Broot, Centipede or KayKit Knight. A player assembles a physical golem, groups
generic joints into control systems, installs closed-loop actions, programs a tactical mind and
runs the result in an auto-battle arena. The same two-axis mechanism may aim a crossbow, sweep a
sword or become one corner of a locomotion system; its role comes from configuration rather than
from a hard-coded `Arm`, `Leg` or `Turret` class.

The target is the intersection of Die by the Sword's physical weapon control, MechWarrior's
machine construction, One Must Fall's exaggerated chassis and an AI programming game. The AI is
not an opponent hidden behind the game. Building it is the game.

## The three graphs

One saved construct owns three related graphs.

1. **Body graph.** Rigid parts, joints, sockets, collision geometry, mass, armour, power and
   mounted modules. It says what physically exists.
2. **Control graph.** Named groups of joints and modules, closed-loop action definitions and
   exclusive resource claims. It says what the body can be asked to do.
3. **Mind graph.** Installed sensors, conditions, utility rules and action requests. It says why
   one available action is selected rather than another.

The boundary between them is load-bearing. A body part does not become a leg because its schema
says `kind: "leg"`; four ordinary limbs become a locomotion system when a gait controller groups
their joints and foot-contact sensors. An action does not write a mesh transform or play an
animation. It reads physics, writes motor targets and owns a completion/refusal condition.

~~~ts
interface ActionRequest {
  readonly action: string;
  readonly parameters: Readonly<Record<string, number | string | boolean>>;
}
~~~

The installed `ActionSpec`--not the caller--resolves that action ID to its group and claims. Program
priority and declaration index travel as scheduler metadata; they are not forgeable request fields.

The action scheduler may run compatible requests together -- walk, aim, reload and cover -- but
two requests cannot command the same joint or spend the same exclusive resource. Conflict
resolution is explicit program data and stable declaration order, never object-property order or
whichever callback happens to run first.

Blueprint topology is a set, while a Mind program is a sequence. `parts`, `joints`, `sockets`,
`modules`, control groups, actions, group members and claim lists are canonicalized by stable ID;
their input array order has no meaning. Program rules retain their declared array order and that
index is their final arbitration tie-break. Runtime request arrival order and worker completion
order are never authority. Observation order is canonical type rank then stable ID, not whichever
order an editor, JSON parser or worker happened to produce.

## Current seams to preserve

- `Combatant` in `src/units.ts#L48` is the arena boundary, but its public `mind`, `view` and
  `intentObserver` are Fighter-specific. Session 02 replaces those host assumptions with an
  opaque, surface-tagged control endpoint while preserving the existing humanoid path exactly.
- `UnitDefinition` in `src/units.ts#L96` remains the registry entry. A construct definition points
  at a blueprint and control surface instead of pretending to own two hands.
- `Intent` in `src/mind.ts#L74` and tactic v2 remain the humanoid command contract. They are not
  widened into an arbitrary bag of construct commands and existing research artifacts are not
  migrated.
- `Combat` watches a list of `Striking` objects from `src/combat.ts#L39`. Session 07 generalizes
  striker attribution from a mandatory hand to a stable effector ID while leaving humanoid
  reports byte-for-byte equivalent.
- Headless stepping continues through `runBout` in `scripts/measure.mjs#L219`, fixed physics time
  and the existing worker primitives. Construct experiments get their own contract digest and do
  not silently enter the current humanoid research matrix.

## Standing contracts

1. **Physics and appearance share one description.** A procedural plate may bevel, inset and
   layer the same authoritative dimensions; it may not cover an unrelated collider. No imported
   humanoid skin and no AI-authored vertex manipulation enter this path.
2. **AI and debugging controls issue the same actions.** A person may press an action button or
   supply its target, but may not bypass the scheduler to set a joint angle. Auto-battle remains
   the primary play mode.
3. **Actions are closed-loop skills.** `Walk`, `Aim`, `Cut`, `Brace` and `Recover` observe the
   current body every physics step. They are not animation clips or timed lists of angles.
4. **Installed hardware determines the live action set.** Severing a bearing, exhausting a
   magazine or removing a sensor changes capabilities immediately and cancels actions that can no
   longer execute.
5. **Sensors are facts, not conclusions.** Range, contact, joint state, line of sight and damage
   may be installed. `willHit`, `bestTarget` and `winning` belong to the mind.
6. **Every refusal is named.** Invalid blueprints, incompatible sockets, impossible action groups,
   unknown program references and unsupported learned actions fail before a bout or at the exact
   capability edge; none fall back to a different part or action.
7. **Construction is transactional.** Preview, bout build and failed import return all meshes,
   bodies, constraints, observers and program state to their prior census.
8. **The old game stays measurable.** Sessions touching shared execution code bracket the change
   with `npm run measure -- --only duelist-swinger --bouts 120` at seed 20260823. Existing tactic,
   feature, research and artifact digests must not move unless a session explicitly supersedes
   them; none in this plan does.

## Session order

| session | landable result | depends on |
| --- | --- | --- |
| [01](construct-forge-01-blueprint-contract.md) | pure, versioned body-blueprint grammar and validator | -- |
| [02](construct-forge-02-control-host-seam.md) | body-specific control surfaces behind one arena endpoint | 01 |
| [03](construct-forge-03-physics-compiler.md) | transactional physics/procedural-render compiler | 01 |
| [04](construct-forge-04-action-runtime.md) | groups, closed-loop actions, claims and concurrent scheduler | 02, 03 |
| [05](construct-forge-05-bronze-warden.md) | one fixed Bronze Warden selectable beside existing units | 02, 03, 04 |
| [06](construct-forge-06-quadruped-locomotion.md) | four generic limbs configured as locomotion | 04, 05 |
| [07](construct-forge-07-articulated-mounts.md) | one two-axis mount drives either sword or auto-crossbow | 04, 05 |
| [08](construct-forge-08-damage-and-capabilities.md) | severance, power/ammo state and live capability loss | 06, 07 |
| [09](construct-forge-09-mind-program.md) | sensor-limited utility/behavior program drives a whole bout | 08 |
| [10](construct-forge-10-forge-blueprints.md) | in-game body Forge, canonical save/import and safe preview | 09 |
| [11](construct-forge-11-action-workshop.md) | no-code group, action and Mind editors | 10 |
| [12](construct-forge-12-auto-battle-lab.md) | matchup lab, explanations, headless bouts and parallel batches | 11 |
| [13](construct-forge-13-graph-observation-contract.md) | variable-body observation and candidate-action codec | 12 |
| [14](construct-forge-14-learning-runtime.md) | graph policy inference, training/checkpoint software and parity | 13 |
| [15](construct-forge-15-learning-rung.md) | measured interruptible learning ladder or explicit negative result | 14 |
| [16](construct-forge-16-integration-and-playtest.md) | player verdict and durable close-out | 12 plus either 15 or the session-12 early-negative record |
| [17](construct-forge-17-humanoid-effigy.md) | fixed two-foot Swordbearer archetype and honest mixed-body baseline | 07, 09, 16 |

Sessions 01--12 produce the game without requiring learned AI. Sessions 13--15 begin only after
the authored Mind can complete meaningful bouts and a person judges the build-program-observe loop
worth training. A weak game does not earn compute merely because a trainer exists.

## Versioned contracts introduced

- `CONSTRUCT_BLUEPRINT_VERSION = 1` -- physical topology and module vocabulary.
- `CONSTRUCT_ACTION_VERSION = 1` -- action/group/parameter grammar and scheduler semantics.
- `CONSTRUCT_PROGRAM_VERSION = 1` -- sensor, condition, utility and arbitration grammar.
- `CONSTRUCT_OBSERVATION_VERSION = 2` -- variable graph features, per-axis joints and mirror rules.
- `CONSTRUCT_POLICY_VERSION = 2` -- graph encoder, candidate scorer and checkpoint codec.

Each version owns a canonical JSON spelling and integrity checksum. The browser-safe FNV-1a
integrity implementation in `src/learning/artifact.ts#L98` may be reused; SHA-256 remains the
authority for downloaded public assets, not for live editor state. A schema mutation must make a
synthetic old fixture fail before the version is re-recorded.

The v1 import ceilings are contract, not padding: at most 128 parts, 127 joints, 256 sockets,
256 modules with 16 primitive components and 16 sensor channels each (256 channels total), 128
groups with 64 joint/module members each, 256 actions with 32 parameters and 16 extra resource
claims each, 512 program rules, 4,096 expression nodes at depth at most 64 and 1 MiB of canonical
saved bytes. A variable graph may use any smaller supported size without padding or truncation.
Exceeding a ceiling is a named import refusal, and every ceiling participates in the appropriate
contract digest.

One collision rule is feasible within Havok's 32-bit filters and is frozen here: intact parts and
modules owned by the same construct do not collide with one another; they collide with the world
and the opposing side. A severed subtree is relayered as debris and then collides with world,
fighters and other debris. V1 has no arbitrary per-part exclusion list and no compiler may pretend
the fixed side masks implement one.

## First proof, not the whole game

The first construct is the Bronze Warden: armoured core, four identical articulated limbs, a
shield bearing and one dorsal two-axis socket. The socket accepts either an auto-crossbow or a
sword. Its initial Mind can walk, turn, brace, recover, aim, fire, cut and cover. That is enough to
prove the thesis; arbitrary decorative meshes, campaign economy, salvage rarity and online sharing
are deliberately outside this plan.

Every landed session runs from `sword-prototype/`:

~~~powershell
npm test
npm run check
npm run build
~~~

Session 16 deletes this plan set only after its durable contracts, measurements and negative
results have moved into `docs/design.md`, `docs/measurements.md`, `README.md` and `AGENTS.md`.
