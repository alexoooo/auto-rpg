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

## Retire before building

The following items are sized from a code survey on 2026-09-27. Most of the AI code on `main`
has no future in the next phase. Clearing it first makes the new boundaries cheaper to draw and
prevents agents from maintaining abandoned paths.

- **Policy set.** The arena picker offers about twenty policies from `POLICIES` in `src/mind.ts`.
  They sit on four full copies of one tactical state machine: `golemTactics` in
  `src/golem/tactics.ts`, and `tactics-v2.ts`, `tactics-v3.ts` and `tactics-v4.ts`, about 6,400
  lines together. Each later version spreads the previous table and rewrites the state machine.
  About 500 KB of solved tables and network weights ship in the page bundle:
  `style-model-tables.ts`, `duel-model-tables.ts` and `researched-lab.json`.
  All of these were tuned and rated on stone-golem fights. The dungeon runs only the v1 family
  (`FAMILY_POLICY` in `src/golem/family.ts`).
  - Keep v1's duelist family as the reference floor. It is the default and the only dungeon
    mind.
  - Also keep at most one stronger rated mind as a second reference.
  - Tag the commit before removing the rest from `src/`. Keep their results and provenance under
    `research/`.
- **Skill-ceiling plan set.** Close sessions 06-09 explicitly. The footwork channels failed their
  enablement gate. The effector and wrist-target work found no headroom. Every experimental
  channel is off by default (`DEFAULT_CHANNEL_FLAGS` in `src/body-command.ts`).
  - Keep the `BodyCommand`/`ChannelDeclaration` seam and capability publication, because the
    layered AI below builds on them.
  - Keep the benches.
  - Either delete the URL-gated experiment paths (`channel-experiments.ts`,
    `effector-preview*.ts`) or record them as frozen.
- **The name "Warrior".** The historical Warrior (`arm.ts`, `weapon.ts`, `arrow.ts`, cut
  2026-09-18) is still discussed throughout `AGENTS.md` and in code comments. "Warrior" is now
  a playable class. Remove the leftovers:
  - the Warrior motor fields in `CONFIG.arm`, which nothing reads;
  - `UnitKind`, which has the single member `"golem"`;
  - `UnitLoadout`.
  Then refer to the old body as "the retired Warrior" where history must mention it.
- **Two human paths.** Make the workshop model the human and retire the legacy human appearance,
  unless it earns a place as a separate costume. Today the workshop fighter is not a family. It
  is `family: "human"` plus an optional `human` profile, so every human feature has two paths.
- **Dead code and stale prose.**
  - Code with no production caller: `neuralFeatures`, `FEATURE_NAMES`, `HUMANOID_CONTROL_SURFACE`,
    and the `pilotFeatures`/`pilotTrace` exports used only by tests.
  - Comments that cite scripts that no longer exist (`scripts/measure.mjs`, `tune.mjs`,
    `tournament.mjs`) and retired minds (`golem-neural`, `golem-learner`, `golem-snapshot`,
    `golem-selector`).
  - `obeysOrders` stays until the orders rework below replaces it.
- **Working-tree hygiene.**
  - Prune the stale worktrees: 13 were registered on 2026-09-27, several of them under `%TEMP%`.
  - Merge or delete the unmerged branch `physics-rate-servo-tuning`.
  - Delete `bash.exe.stackdump` from the root.
- **`AGENTS.md`.** Turn it into a short list of current invariants, commands and house rules, each
  a line or two long and linked to its history. Move the incident narratives to
  `docs/history.md`. Today it is 73 KB, loaded into every agent session. Much of it describes
  deleted code: Warrior weapons, arrows, `rigview.ts`, and a `PhysicsViewer` that nothing uses.

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
A non-biped carrier already works: the stone `multileg` in `src/golem/locomotion/multileg.ts` is
a six-legged tripod gait. The quadruped's new questions are therefore a head-mounted natural
weapon and an `Intent` without two hands, not whether legs other than two can walk.

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

Several existing hooks help:

- Every `GolemPart` already carries an optional `armour`. That may be a per-hit-kind table
  (`ArmourByHit` in `src/scoring.ts`), which `Golem.applyDamage` combines with the attribute
  armour.
- Terminals already carry `massKg`, and `itemMassKg` keeps held items out of the body-weight
  scaling.
- An armour item is therefore mostly two things: mass added to the parts it covers, and an armour
  table applied to those parts. The damage model does not need rewriting.

Holdables are less far along. `bow` and `axe` are in the `WeaponKind` vocabulary in
`src/hands.ts`, but no terminal builds either, and there is no staff. The arena parts bin
(`src/golem/parts-bin.ts`) is the only loot and inventory today. It stores whole effector module
ids and should be replaced by item instances, not extended.

## Share one encounter runtime across modes

Arena uses `stepControlledPair` in `src/control-host.ts`. `DungeonRun` in
`src/dungeon/run.ts` already supports multiple actors but owns a separate observation, policy
and locomotion sequence. Extract shared ownership of actor registration, clocks, observation,
control, contacts, damage events, spawning and disposal. Modes supply objectives and lifecycle
rules. Preserve the fairness boundary: everyone observes before anyone acts.

The pair assumption is wide:

- `Side` and the `LEFT_*`/`RIGHT_*` collision bits in `src/physics.ts`.
- `stepControlledPair` and `ControlledBody.observe(opponent)` in `src/control-host.ts`.
- `Matchup`, `Ring` and `settle` in `src/bout.ts`.
- `Combat(side)` with a single `attach` target.
- `BoutRecorder`, `FightEnd`, the HUD, setup and the camera in `src/main.ts`.

The dungeon works around it:

- It places the hero and companions on `"left"` and every enemy on `"right"`.
- It finds the struck body through `Combat.attachResolver`.
- It brings up its own engine and Havok, and hand-writes its own multi-actor step loop.
- Allies therefore pass through each other, `avoidCrowd` in `src/dungeon/run.ts` steers them
  apart, and friendly fire is impossible.

Separate actor identity, faction and collision behavior. Establish explicit behavior for allied
collisions, friendly fire, self-collision, neutral actors and projectiles. Prove it in a small
multi-actor physical test before expanding wave sizes.

**Spike the collision budget first.** Havok filters on 32-bit membership and collide-with masks.
The two-side table already spends bits per side, and bits per actor will not scale to a wave. The
open question is how a body excludes its own parts while colliding with everyone else's. Candidates
include layers by role plus per-constraint collision disabling between jointed parts, together
with the command-volume clearance already used for owner-held equipment. Answer it with a
measured test before the runtime's actor model is fixed, because every other part of the runtime
depends on the answer.

Expose nearby threats and relevant terrain as well as a selected target to AI. A duelist may
focus on one opponent while still noticing another attacker.

## Keep layered AI with replaceable controllers

The proposed control flow is:

`player orders -> tactical decisions -> coordinated movement skills -> bounded physical actuators`

Share targeting, navigation, threat assessment and equipment knowledge where useful. Allow
family-specific locomotion and weapon-specific skills. An insect and a swordsman can understand
the same order to close distance while executing it differently.

Orders are not inputs to minds today:

- No mind reads `Orders` (`src/orders.ts`), and none declares `obeysOrders`.
- `GolemDriver.step` in `src/golem/golem-control.ts` passes each intent through
  `OrderFollower.obey`. When an order is active, this overwrites the mind's `forward` and
  `strafe`, and its `turn` when facing away from the enemy.
- The dungeon composes movement separately in `composeIntent` (`src/dungeon/commands.ts`).

In the new stack the tactical layer takes the order as an input and decides how to honour it
while defending itself. Arena and Dungeon share that path.

The exact-fork machinery (`src/fork/`, `src/forkable.ts`) is a strategic asset for the skill
ceiling. A bit-exact capture of the whole physical world makes search-based tactics possible:
roll several continuations forward and choose among them. Such a ceiling rises with compute,
unlike a hand-tuned state machine. Keep every new controller `Forkable` from the start.

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

Build this suite before the new AI, with the v1 duelist as its floor. Every new controller is
then judged by the suite from its first day, not by a bespoke study. Generalize the policy league
(`research/league.mjs`, `src/policy-rating.ts`) to rate a combination of body, equipment and mind
rather than a mind on a stone body. The Ladder's challenge tiers need the same rating.

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

0. Retire and clean up, as listed above, including the `AGENTS.md` restructure. This takes one or
   two sessions, each landing as its own commit with `npm test`, `npm run check` and `npm run
   build` green.
1. Spike the collision budget, then establish the shared encounter runtime and multi-actor rules.
2. Separate character anatomy and equipment, with persistent character descriptions.
3. Complete the workshop Warrior and Rogue paths; test body contracts with the simple quadruped
   during this foundation work.
4. Build a short Ladder using those same characters and encounters.
5. Complete one dungeon level using the established systems.

The first milestone: create a workshop Warrior, equip armour and a sword or maul, fight a dummy
then a skeleton, retain the character between encounters, and run those same encounters headlessly.

Broad renaming should follow real boundary changes. These recommendations do not mark unfinished
visual reviews or skill-ceiling release gates as complete.

## Open decisions for the owner

1. **Stone golems.** Do they remain a playable and enemy family, or become legacy? The
   recommendation is to keep them as enemies, since they are the most tuned bodies in the tree.
2. **Dungeon control.** Does the player steer the hero directly, as in Diablo, or give orders as
   in the Arena? The dungeon currently mixes keyboard movement with automatic attacks. The answer
   decides what the orders layer must express.
3. **Skill-ceiling plan set.** Is it closed, as recommended above, or are any of sessions 06-09
   still wanted?
4. **Legacy human.** Is it retired in favour of the workshop model, or kept as a costume?
