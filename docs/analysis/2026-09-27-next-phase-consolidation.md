# Preparing the next phase: characters, equipment and encounters

2026-09-27. Recommendations following the owner's proposed direction and a review of the
current body, equipment, AI and game-mode boundaries. This records a design proposal, not
implemented functionality or a verdict that the unfinished AI experiments have succeeded.

## Direction

The game is physically based, AI-driven combat. Stone golems made the original modelling and
control problem tractable; human and skeleton bodies subsequently entered that framework.
The workshop human now demonstrates a realistic visual model following the physical body.

The next phase should support many morphologies: humans, skeletons, zombies, quadrupeds,
insectoids and monsters. Shared AI is useful where it works, but body-specific and
equipment-specific controllers are welcome. A high skill ceiling matters more than having
one universal policy.

The intended modes are:

- **Arena:** configure arbitrary fights.
- **Ladder:** design a character, defeat a dummy, then face progressively harder enemies or
  waves without a fixed endpoint.
- **Dungeon:** retain and expand the existing mode toward a spiritual successor to Diablo 1.
  Initially complete one level, with Warrior and Rogue character choices.

Equipment should include footwear, leg and torso armour, helmets, shields, and one- and
two-handed weapons, including bow, staff and maul. Items need real properties such as weight
and protection. The player continues to give orders while AI performs the physical combat.

## Preserve the working foundations

Keep Babylon/Havok, fixed solver stepping, control on the physics clock, physical contacts
and damage, severing, and the browser/headless parity. Preserve the workshop asset pipeline:
the skin follows achieved physical transforms, weapon visuals follow real equipment bodies,
and the same physical profile runs headlessly without loading visual assets.

Keep the capability declarations, command authority boundary, supported locomotion work,
headless benchmarks, exact-fork research and useful reference policies. Retain dungeon
navigation, visibility, exploration and atmosphere. Consolidation should grow out of these
working pieces.

The main obstacles are inherited assumptions: `GolemSetup` describes five fixed slots,
effectors are still keyed by two hand names, observations focus on one opponent, and Arena
and Dungeon have different encounter execution paths.

## Separate anatomy, appearance, equipment and fighting style

Give a character four independent descriptions:

| Description | Owns |
|---|---|
| Body | Anatomy, joints, physical limits, natural weapons and attachment points |
| Appearance | Skin, clothing meshes, proportions and visual attachments |
| Equipment | Item instances, occupied mounts, protection, mass and geometry |
| Fighting style | Compatible controllers, tactical preferences and learned policies |

Warrior and Rogue can initially be presets combining these descriptions. A zombie can reuse
human anatomy and equipment while changing locomotion, injury rules and behavior. An arm
must remain an arm after its sword is dropped.

## Generalize bodies through concrete examples

`GolemSlot` in `src/golem/module.ts` fixes locomotion, torso, head, primary and secondary.
`ChannelDeclaration` in `src/body-command.ts` still identifies effectors through `HandName`.
Move shared contracts toward named body parts, mounts and actuators with declared capabilities.
A hand, jaw, tail or stinger should have its own identity. Human UI can retain main-hand and
off-hand labels.

Each body family should own its assembly and locomotion controller. Shared infrastructure
provides joints, contacts, damage, observations and actuator contracts. A quadruped should not
need a humanoid shoulder model. Keep the golem assembly as one supported body builder.

Prove the boundary with the workshop human and one simple quadruped that walks and bites.
Build that quadruped early enough to expose assumptions before implementing many more bodies.

## Make equipment authoritative physical data

The [workshop integration](../workshop-fighter-integration.md) currently makes boots and armour
cosmetic; human mass and protection remain unchanged. Close that gap first.

An item definition should own mass, mass distribution, collision geometry, protection coverage,
attachment requirements and visual assets. An item instance owns identity and mutable condition,
if condition is part of the game. Inventory, physics construction, damage and UI must read the
same definitions.

Armour protects the regions it covers. Boots contribute weight in the legs and a helmet
protects the head. Count mass once even when appearance and collision use different objects.

Two-handed equipment needs a coordinated grip model: one weapon, multiple attachment
relationships and a controller coordinating them. The existing maul provides groundwork, but
occupying two sockets is not enough to describe all interactions. A bow also needs draw, aim,
release, ammunition and projectile ownership.

Start with representative items: boots, leg armour, torso armour, helmet, sword, shield, maul
and bow. Expand the catalogue, including staves, after these exercise the full equipment path.

## Share one encounter runtime across modes

Arena uses `stepControlledPair` in `src/control-host.ts`. `DungeonRun` in
`src/dungeon/run.ts` already supports multiple actors but owns a separate observation, policy
and locomotion sequence. Extract shared ownership of actor registration, clocks, observation,
control, contacts, damage events, spawning and disposal. Modes supply objectives and lifecycle
rules. Preserve the fairness boundary: everyone observes before anyone acts.

Separate actor identity, faction and collision behavior. `src/physics.ts` uses left/right
collision categories extensively. Establish explicit behavior for allied collisions, friendly
fire, self-collision, neutral actors and projectiles in a small multi-actor physical test before
expanding wave sizes.

Expose nearby threats and relevant terrain as well as a selected target to AI. A duelist may
focus on one opponent while still noticing another attacker.

## Keep layered AI with replaceable controllers

The proposed control flow is:

`player orders -> tactical decisions -> coordinated movement skills -> bounded physical actuators`

Share targeting, navigation, threat assessment and equipment knowledge where useful. Allow
family-specific locomotion and weapon-specific skills. An insect and a swordsman can understand
the same order to close distance while executing it differently.

Skills should accept continuous direction, reach, timing, orientation and effort, and report
progress and failure. Support feints, interrupted attacks, recovery and coordination. Keep finer
control available to stronger policies and offline search so a fixed menu of attacks does not
become the next ceiling. AI must continue to act through physical actuators within their limits.

Accurate pose tracking is not evidence of better combat. The
[wrist target study](2026-09-27-wrist-task-target.md) demonstrates reachable pose tracking but
does not establish headroom. The [trajectory follow-up](2026-09-27-effector-trajectory-followup.md)
also found no wounds in its sampled target trajectories. Preserve the experimental controls and
evaluate effective strikes, defenses and recovery before promoting them. These studies do not
prove that the approach cannot work in other engagements.

Authored motion can provide reference targets or training examples while physics remains
authoritative. [DeepMimic](https://xbpeng.github.io/projects/DeepMimic/index.html) demonstrates
that general approach. Learned motion control is an optional research path; useful scripted
controllers should remain available throughout development.

## Make skill ceiling a recurring acceptance test

Maintain a compact benchmark suite for approaching without stalls, striking exposed regions,
defending, recovering from disruption, handling heavier weapons and losing an effector.
Compare weak and strong policies on identical bodies, then stronger policies on disadvantaged
bodies. Include varied opponents, equipment, starts and both corners.

Measure outcomes alongside movement quality, failures and runtime cost. Scoring exploits and
repeated jamming do not establish the intended skill ceiling. Keep a few stable reference
policies and retire superseded production implementations after replacements pass the gates.
Preserve research results and their provenance.

## Add persistent character state before progression

A saved character describes equipment, attributes, training choices and any persistent injuries.
A live body is a runtime instance of that character. Use versioned definitions and item IDs for
saves, rather than Babylon objects or physics snapshots. This lets one character design enter
Arena, Ladder and Dungeon and provides a home for inventory and progression.

Injury persistence requires explicit mode rules. With dismemberment, successive waves involve
more than carrying over a health bar. Healing, restoration, replacement equipment and death
need deliberate rules. This proposal does not choose those rules yet.

## Build Ladder first, then complete one dungeon level

Ladder exercises creation, equipment, transitions, enemy generation, rewards and persistence in
a small setting. Start with a dummy and a short curated progression. Extend it through enemy
composition, equipment, competence and encounter conditions.

The next weakest enemy should mean an increasing challenge tier calibrated across representative
characters. Matchups can be non-transitive: archers, shield fighters and fast beasts may counter
one another. Endless progression should not rely on unbounded physical size or motor force.

For Dungeon, complete the loop of selecting Warrior or Rogue, exploring, fighting distinct
enemies, finding and equipping useful loot, overcoming a final encounter and finishing the level.
That experience will expose the RPG requirements before more levels multiply them.

## Suggested sequence and first milestone

1. Establish the shared encounter runtime and multi-actor rules.
2. Separate character anatomy and equipment, with persistent character descriptions.
3. Complete the workshop Warrior and Rogue paths; test body contracts with the simple quadruped
   during this foundation work.
4. Build a short Ladder using those same characters and encounters.
5. Complete one dungeon level using the established systems.

The first milestone: create a workshop Warrior, equip armour and a sword or maul, fight a dummy
then a skeleton, retain the character between encounters, and run those same encounters headlessly.

Alongside this work, correct stale architectural comments, distinguish active research from
historical experiments, and eventually shorten `AGENTS.md` into current invariants linked to
incident history. Broad renaming should follow real boundary changes. These recommendations
do not mark unfinished visual reviews or skill-ceiling release gates as complete.
