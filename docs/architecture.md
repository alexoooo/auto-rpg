# How Auto-RPG is built

A fighter is a body of rigid segments and joints driven by muscles; a mind writes the muscles'
command, a blow is whatever one body carries into another, and it wounds by the energy it brings.
The pages draw what the physics did.

- **Babylon.js draws; Rapier simulates.** Rapier is vendored
  ([vendor/rapier](../vendor/rapier/README.md)).
- **Everything that fights is the core's** (`src/core/`). The screens build on it; it never imports
  them, nor Babylon: it has its own vectors and plain poses (`Pose`), and a page draws a puppet it
  poses from them (`followBody`, `src/render/puppet.ts`).
- **One world step** (`World.step`, 120 Hz) owns physics, control, combat and the clock.

## The layers

The core is layered by what each part is built on, bottom first. A module imports its own layer or
one below.

| Layer | Where | Job |
|---|---|---|
| Base | `math/`, `state.ts`, `sources.ts`, `command-delay.ts` | exact arithmetic, state, provenance, the delay line |
| Spec | `spec/`, `human/`, `items/`, `reptile/spec.ts`, `reptile/physique.ts`, `character-attributes.ts` | a body as data, every number sourced |
| Engine and world | `engine/`, `world.ts`, `recording.ts` | the physics contract and the fixed step |
| Build | `build/`, `read-body.ts`, `read-motion.ts`, `clock.ts` | the spec made into engine bodies and joints; readings back |
| Muscles and rules | `muscle/`, `rules/`, `touches.ts`, `control/assist.ts` | torque within strength and speed; blows, wounds, levels; the assist |
| Parts and data | `parts/`, `data/`, `learning/` | the part tree, catalogs, mind data, learners |
| Motor control and the mind seam | `control/`, `mind/`, `body.ts`, `physical-body.ts`, `observation.ts`, `equipment.ts` | goals made muscle commands; a mind embodied, its host and senses |
| Skills | `skills/`, `intent/`, `navigation/`, `perception/`, `mind/decider.ts`, `mind/engagement.ts`, `mind/choice.ts`, `mind/report.ts` | an intent made a body command; what a decider asks and reads |
| Recovery | `recovery/`, `mind/kit.ts`, `skills/kit.ts` | getting up; a mind's kit of skills |
| Minds and command | `option/`, `reptile/`, `command/`, `mind/config.ts`, `mind/controller.ts`, `mind/minds.ts`, `mind/apart.ts`, `parts/entrant.ts` | Option Mind, the quadruped, Commanders, making a mind from its config |
| Top | `toolkit.ts`, `models.ts`, `combatant.ts` | the toolkit's catalog, the body models, enlisting a fighter |

`tests/core-boundary.test.mjs` holds it: `LAYERS` is this table, the registries exempt.
`CORE_PACKAGES` makes `option/` a package only what is built on it (the quadruped's frame) imports,
so another mind is built beside Option Mind, not on it. `UP_STACK` lists imports up a layer, or
into a package from outside it; it is empty and only shrinks. The same test keeps the core to
itself, its engine's package and JSON under `assets/`, and every headless world builder free of
Babylon.

## Spec and provenance

A `BodySpec` (`src/core/spec/body.ts`) is a body in its reference pose (metres, +y up, +z forward,
soles on y = 0): segments with mass, inertia, shapes and stiffness; a joint tree, each freedom with
its axis, range and muscle; effectors (a named point on a segment and the ancestor `base` whose
chain moves it); bearing ends; wounds; the down rule (`DownSpec`); and anything held. `bodyKey`
names a body for everything measured on it.

- **Models** (`BODY_MODELS`, `modelSpec`, `src/core/models.ts`): the humans are built in
  `src/core/human/spec.ts`, the quadrupeds in `src/core/reptile/spec.ts`.
- **A character** (`CharacterConfig`, `resolveCharacter`) is a model plus its attributes
  (`CHARACTER_ATTRIBUTES`). A physique (`physiqueFigure`, `src/core/human/physique.ts`) scales one
  thing a factor: size every length at the same density, weight the mass alone, strength every peak
  torque, speed every muscle's unloaded speed; a combination whose nonadjacent segments meet is
  refused. Haste raises only the legs' unloaded muscle speed.
- **Items** (`src/core/items/`): `HELD` is what a hand may hold; `armedWith` and `withLoadout` arm
  a body; `REPRESENTATIVE` are the loadouts every rating covers. An item's frame is y along the
  grip or blade, x across, z out. Families share code, never values.

**Every number in a spec is a `Quantity`** (`src/core/spec/quantity.ts`): a value, a unit and its
origin. A leaf is `sourced` from an entry of `SOURCES` (`src/core/sources.ts`): a citation, an
asset file or one line on what it is tuned for. Anything else is `derive`d by a named rule whose
code writes no factor. Tuning is immutable: an experiment passes an override in.

## Arithmetic

A bout is the same double for double in every JavaScript engine. An engine's own `Math.sin` and
kin differ between engines in the last bit, so the core, and whatever builds a case's world,
computes with `+ - * /`, `Math.sqrt` and its own functions (`src/core/math/real.ts`, fdlibm's kept
operation for operation; `turn.ts`). A power is written as products. `EXACT_MATH` in
`tests/core-boundary.test.mjs` names the members of `Math` allowed.

The step's dear solves work in arrays made once with the body, which carry nothing between calls;
`tests/core-step-cost.test.mjs` holds a step's time and allocation
([step cost](reference/step-cost.md)).

## Build and engine

**The engine contract** (`src/core/engine/engine.ts`) names no engine's types: a fixed step that
writes every body's `Pose`; bodies that never sleep, with the spec's mass and the centre of mass's
velocity; friction `CONTACT_FRICTION` unless a material names its own, no bounce; freedom k as
angular axis k of the joint's frame, limited as `jointAngles` reads it; a motor as a velocity
constraint with a torque ceiling each way (`setMotorBounds`), its whole-step impulse read back
(`motorStepImpulse`); contacts with the solver's impulse (`contactsOf`, `tellContacts`); a joint
that comes apart (`EngineJoint.release`); grips (`addGrip`); a whole-world save and in-place load
(`PhysicsWorld.save`, `load`), refused by a world built otherwise.

- `engines.ts` lists the engines (`ENGINES`, the game's `DEFAULT_ENGINE`) and is the only module
  that imports one. A new engine passes the physics bench (`src/physics-bench/`), then
  `CORE_ENGINE=<name> npm test`.
- `rapier.ts` implements it, its wasm loaded once a realm (`rapierModule`), its solver
  conditioning named `SOLVER`.

**Build** (`buildBody`, `src/core/build/build-body.ts`) makes an engine body a segment and a joint a
spec joint, a held item's mass folded into its segment, the body in the pose its joints demand (a
fighter's guard, `builtAngles`). Readings back: `jointAngles`, `bodyDynamics` (mass matrix, gravity
and bias), `contactMass` and `contactGive`.

- **Toes** (`src/core/build/toes.ts`): a massless slab hinged at the ball, bending as the heel
  lifts; the stance reads the sole from the box and the toes (`src/core/control/support.ts`).
- **Separate items** (`src/core/equipment.ts`, unused by the game's fighters): an item as its own
  body gripped by joints after geometric capture, reached only through a granted port
  (`equipment-port.ts`); a refused grip refuses the whole action.

## Muscles

`driveMuscles` (`src/core/muscle/driver.ts`) turns each freedom's activation and speed into a motor
target and torque ceilings: activation times the peak torque that way times the joint's strength
times Hill's force-velocity factor (`force-velocity.ts`). A speed beyond reach is a torque at the
ceiling; zero holds.

- **Strength** is state on the body (`BuiltBody.strength`), read wherever a peak torque is
  (`strengthAt`), lowered by a crippled limb (`crippleLimb`). A side may have a tendon in series
  (`MuscleSpec`), a spring while its muscles push.
- **A body runs at a level** (`BodyLevel`, `MuscleDriver.setLevel`): `full` (mind stepped, motors
  driven), `limp` (motors released, no mind), `held` (released, every segment fixed). Leaving
  `full` the mind is told (`Mind.idle`); back, it goes on from the body as it is. The level is the
  rules' ([Rules and wounds](#rules-and-wounds)).

## Motor control

Motor control (`src/core/control/`) turns a `BodyCommand` (a posture, effector goals, timed pushes,
driven points, a stance goal) into muscle commands.

- **The command layers** (`commandLayers`) are what a mind builds on its own body: a `HostMind`
  over its motor, read each step through a `BodyView` (`src/core/body.ts`); they are independent of
  skills and deciders.
- **The motor** is a part of role `motor` (`MOTORS`); the game's is the whole-body solve
  (`motorControl`, `solve.ts`): the bearing solve and the servo in one weighted least-squares
  problem, a torque past strength pinned and solved again. It says what goals it carries and what
  it left undone (`MotorControl.carries`, `unmet`).
- **Effector goals** (`EffectorGoal`, `kinematics.ts`): named points of an effector follow
  minimum-jerk paths to places in the root's frame, `through` a place or `follows` a moving end; a
  `firm` goal braces the limb through what it strikes. Only the channels between an effector's base
  and its segment are its reach.
- **The bearing solve** (`bearing.ts`) asks the wrench the aim needs, shares it among the ground
  patches within friction and centre of pressure, and gives each limb its inverse dynamics; what the
  patches miss is asked of the assist.
- **Balance** is a part of role `balance` (`BALANCES`); the game's is the stance
  (`stance-balance.ts`): the centre of mass kept inside the support by forces the ground can give,
  steps placed from the capture point, a body without box soles refused. What a body was measured
  to hold is its envelope, read by `bodyKey` from `assets/core/*-envelope.json`.
- **The assist** (`Assist`, `assist.ts`) is a force at the root and a moment that no muscle gives:
  asked by the mind, shortened to the body's ceiling, applied through the solver step, metered. The
  ceiling is the character's balance, a per cent of its weight (`Rulebook.balance`,
  `balanceCeiling`); with none it gives nothing.

## Skills

A skill set (`skillSet`, `src/core/skills/framework/arbiter.ts`) turns an `Intent`
(`src/core/intent/intent.ts`) into a `BodyCommand` each step: locomotion, guard and low support
beneath, executors running discrete actions over them. Every skill answers `Skill.resume`; the
arbiter releases every action when another mind takes the body.

- **An action** (`ActionRequest`, `action.ts`) has an id, a name, an effector and a sensed target
  region. Admission reads readiness and reserves resources (joints, effectors, hand pose, legs);
  actions overlap where reservations allow. An executor runs `prepare`, `commit` and `release` and
  ends once (`Ended`). It never closes distance; the decider does.
- **Parts.** Each kind is a line of its role's list (`EXECUTORS`, `GUARDS` and the like), its
  module owning its config's keys, defaults, faults, fit and maker. `usableSkills` builds only the
  executors the body can use, naming the rest.
- **Tuned per body**: an executor's settings are its body's record (`SkillRecord`), read as mind
  data by `bodyKey` from `assets/core/<skill>.json` (`dataOf`). A body with no record does not use
  the skill.
- **Locomotion** (`Locomotion`): legs take one goal (`LegsGoal`) and say what they left undone
  (`LegsUnmet`), their envelope and how fast they stop. `stance-walk` walks within the stance's
  envelope; `walk-run` hands over to a run cycle fitted to motion capture
  (`assets/core/run-cycle.json`) that drives the legs, asking the assist only to right the pelvis;
  `move` chooses among gaits by rules or by name.
- **The straight punch** (`straight-punch.ts`) drives the arm flat out at a contact pose solved
  each step, on a timed schedule (`TimedPush`). Steered, a network (`learned-punch.ts`) adds to the
  trunk's and arm's pushes, asks the legs and keeps or halts the walk; it is its body's record
  (`PunchRecord`), trained by `research/run-train.py` and exported by `research/punch-export.mjs`.
- **Held blows** strike with what the hand holds (`StrikingFace`), naming the mechanism they meet
  with (`ExecutorPart.meets`). The thrust is the punch's drive with the blade's point; a swing winds
  up to its record's angles, pushes on its `TimedPush` schedule and returns to guard; through
  either, `faceAligner` servos the wrist onto the face's line.
- **The stomp** (`stomp.ts`) is a strike cycle down from a high chamber onto a body lying ahead. A
  strike's window (`strikeWindow`) keeps the two bodies clear.
- **The guard** (`GuardPart`) owns the arms' rest: where the body is built, where free hands go,
  where a blow returns; it may set a told hand between threat and target, or a buckler's face toward
  the foe's weapon. **Low support** (`support-fold.ts`) folds the stance onto a planted base for low
  blows.

**Stand up** (`src/core/recovery/`). A body down rises by techniques (`TECHNIQUES`), run by the
ground executor, which holds the whole body and asks no stance. The game's (`STAND_UP`) are edges
of a graph of positions (`graph.ts`), each `from` one position `to` another, begun `moving` or
`still`, handing the body on at the first cut read slow enough (`CUTS`, `HAND_OVER`). The route is
the least expected time to standing over the edges' measured profiles (`choose`,
`assets/core/edge-profiles.json`); an edge with no profile prices nothing, and a body no edge takes
is rolled over. The staged riser (`stagedRise`) plays a `Recipe` of pose and bearing stages
(`rise/stages.ts`).

## Minds

**The seam.** A `Mind` (`src/core/mind/mind.ts`) is `step(senses, dt)`: from what its body senses
to its muscles' command, its assist's ask and its hands' poses, which is all a mind does to the
world. It is made with its own body (`OwnBody`); its memory is its `state`. A person gives `Orders`
(`src/core/intent/orders.ts`), never muscle commands.

- **The host** (`BodyHost`, `host.ts`) is all a mind's maker gets: the spec, the clock, the parts
  its config may name (`PartLookup`), the seed (its only chance, through `randomStream`), its phase,
  the rules, and one way to take the body (`take`). Its grants (`HostGrants`) are fixed.
- **Senses** (`Senses`, `senses.ts`): the clock, its side and life, and every other body
  (`BodySense`), read once before any mind (`createSenses`), others late by `Rulebook.reaction`.
- **What a mind builds**: the command layers (`commandedMind`), sub-minds that take the body in rank
  order (`SubMind`, `hosting`), or a policy on detached observations (`policyMind`).
- **Deciding.** A decider (`Decider`, `decider.ts`) decides an intent at its pace (`Pace`), every
  step the body is down, and at once when it is back from another mind, its orders change or an
  action ends; the skills make the command every step from the intent last decided.
- **The report** (`MindReport`, `report.ts`) says what a mind is engaged in, weighing and doing,
  read without moving its state. Screens and Commanders read the report, never a mind's kind or
  state.

**A mind is its config.** A `MindConfig` is plain data tagged by kind; `createMind` (`minds.ts`)
makes it by the kind's `Controller` found in a `Catalog` (`src/core/parts/catalog.ts`). A mind is a
tree of parts (`Part`, `parts.ts`), each with a role, a stage, fields, slots and defaults, saying
why a body cannot carry it out (`fits`) and what is wrong with its config (`faults`). Roles are an
open list (`RoleParts`). `treeFaults` names each fault by path; `tuning` never travels in a link.

**Option Mind** (`src/core/option/`, `OPTION_MIND`) is the reference mind. It chooses among
options of the kinds in `OPTION_KINDS`, each a skill applied to a target (`Option`): its entry
(`Readiness`), the resources it claims, its model (`Terms`: duration, what it deals and takes, the
`Place` it leaves), its step, and a status.

- **Percepts** (`PERCEPTS`) are read once a step into the `Situation`; **predictions**
  (`PREDICTIONS`) price from measured profiles (`Profile`, `src/core/skills/framework/profile.ts`),
  a stale one unread and a model with none priced by its prior.
- **The objective** (`OBJECTIVES`): `few-terms` values an option in a share of a body's life
  beside its orders at the person's `OBEDIENCE`.
- **The chooser** (`CHOOSERS`) runs the toolkit's set selection (`selectSet`,
  `src/core/mind/choice.ts`): the best option on offer, then the best whose claims are still free,
  rest options last; a running option that does not yield keeps its claims. The set's step is one
  intent (`stepSet`). It decides afresh on a percept's cue, at an exit, or on its phase.
- **The rise** (`groundOptions`): each technique an option where its entry admits the body as it
  lies, priced by its edge's expected seconds down; repositioning only from a posture no technique
  begins from.

**The Option Reptile** is Option Mind over a frame (`FramePart`), the quadruped's
(`QUADRUPED_FRAME`), with its own layers and options. A new family of bodies is a frame.

**Entrants.** An `Entrant` (`src/core/parts/entrant.ts`) is one AI: its kinds of mind, parts and
presets, each kind scoped `<name>:`, listed in `ENTRANTS` (`src/entrants/index.ts`). `GAME`
(`src/entrants/game.ts`) is the game's catalog, `MINDS` what a person picks, `defaultMind` each
model's preset, `modelRefusal` why a mind cannot play a body.

### Adding an entrant

1. A folder `src/entrants/<name>/` whose `index.ts` exports its manifest, a line in `ENTRANTS`,
   and its data under `assets/entrants/<name>/`. It imports the core and itself only
   (`tests/core-boundary.test.mjs`); `node scripts/entrant-check.mjs` names a change as its own.
2. Most entrants are presets: configs of the `option` kind over the toolkit's parts and their own.
3. A part of its own, of any role, is a module and a line of its manifest's `parts`, kind
   `<name>:<kind>`.
4. A kind of mind of its own is one `controller({ ... })`: a config type, defaults, faults and a
   maker that takes the body once (`host.take`) and returns its `state`.
5. What is not a role is the toolkit's: a new extension point opens in the core in its own change.

`tests/mind-contract.test.mjs` runs each mind against itself, forks and replays it;
`tests/swap.test.mjs` swaps in a stub of each role from outside `src/` (`tests/fixtures/swap/`) by
config alone. How well it fights is a match ([Evaluations](#evaluations)).

## Command

A **Commander** (`Commander`, `src/core/command/team.ts`) stands to a team as a mind to a body: it
reads the members' pooled view (`TeamView`) and the level as its host answers it (`TeamLevel`),
keeps its memory in `state`, and gives each member orders (`TeamDecision`). A person's `Command`
(`commands.ts`) reaches it at once. Its host asks it once a step, after the senses and before every
mind.

`COMMANDERS` registers the kinds (`createCommander`); `party` leads a person's side, in the Arena
through `teamOfOne`. `tests/core-boundary.test.mjs` keeps `src/core/command/` from the engine,
world, bodies, enlistment, a mind's host and the senses hub, globals and chance;
`tests/command-contract.test.mjs` has each kind lead a bout, fork it and replay it from its orders.

## One world step

`createWorld(engine)` (`src/core/world.ts`) makes a world with one fixed step (`PHYSICS_HZ`). A
step runs, in order: the sensing hooks (`World.sense`); the preparing hooks (`World.prepare`:
hands' and toes' shapes, and at a delay each mind deciding on its mirror); the step hooks
(`World.beforeStep`: each body's `driveMuscles`, the mind's motor part, or at no delay the mind
itself, then the motors set); one solver step and the clock; the post-physics observations
(`World.afterPhysics`); the after-step hooks (`World.afterStep`: blows, readings). A page advances
by real time (`World.advance`); `scene.render()` never steps. What a step writes is plain data in
one `state` object a module (`src/core/state.ts`), so a bout forks by copying its state.

### The command delay

What a mind sends is applied `World.delay` steps later (`COMMAND_DELAY`, one step in the game): its
muscles' command, assist ask and hand poses, each through a ring (`src/core/command-delay.ts`) that
is state, so a bout forks with commands in flight. A body's time starts at its first decision
carried out (`BodyView.born`).

At a delay each mind reads a mirror of its body (`mirrorBody`), refreshed from numbers the world
writes once a step. The mind is split: **its step decides** on the body as the mirror shows it, and
**its motor part carries the decision out** a delay later on the body as it is (`Mind.move`,
`motorPart`), reading its own body alone and the senses as last decided on. The quadruped refuses
a delay over one. Given a place for minds (`World.minds`), minds run on other threads
(`mindThreads`, in Node or a cross-origin isolated page) and a bout is the same step for step, but
not saved or forked (`MIND_APART`).

### The world in a worker

The Arena's, the crowd fight's and the Crypt's worlds step in a Web Worker each (`src/worker/`),
built headless as Node builds them (`buildBout`, `buildTeamBout`, `buildCryptRun`), the same to the
bit (`tests/world-worker.test.mjs`). The worker takes the steps real time owes, a bounded number a
pass, and sends each step's frame and news; a world that cannot keep up plays slow while the page
keeps its rate. The page's input is applied before the next step and taped. The page (`openWorld`)
poses a puppet of each body between the two frames it shows (`posePuppet`).

## Bouts, tapes and replay

A bout (`Duel`, `src/arena/duel.ts`) is built from a recipe (`DuelRecipe`), plain data: bodies,
minds, loadouts, seed, end rules and the rest. A bout is deterministic: a recipe plays the same to
the bit in Node and in the page (`buildBout`, `src/evaluation/bout.ts`).

- **Verdict**: a side is out by the first end rule that puts it out (`END_RULES`, the game's
  `GAME_ENDS`). Both on one step is a draw; at the cap the fuller life wins.
- **Tape** (`Duel.tape`): every order with its step; recipe and tape are the whole bout
  (`Duel.play`). **Order sheets** (`SheetLog`) replay a bout with no mind (`replayedBody`).
- **Save** (`Duel.save`, `Duel.load`) loads only into a bout of the same recipe and build
  (`RecordingIdentity`). A case's code (`caseCoder`, `scripts/build-identity.mjs`) is the import
  closure of what it plays, so an edit re-keys only the cases that reach it.

## Evaluations

Every question of how well something does is an evaluation (`src/evaluation/`, `EVALUATIONS`), one
path for Node, its workers and a page; `scripts/evaluate.mjs` runs it.

- **A case module** (`<id>/cases.ts`, `Cases`) gives each protocol's conditions, the world of a case
  (`CaseWorld`, `WORLD_BUILDERS`) and its reader; **a description** (`<id>/index.ts`, `Evaluation`)
  the question, subjects, figures and a drill trial's `outcome`.
- **A case's key** is the digest of everything it plays; a row (`Row`) is found again by its key, so
  only changed cases replay. `--write` keeps a record under `assets/evaluations/<id>/`
  (`record.ts`), grouped into pools with numbered versions (`history.ts`).
- **Contests**: `match` (two minds, each on each side, one digest), `tournament` (Bradley-Terry,
  `rating.ts`), `unseen`. The panel report (`compare.ts`, `settle.ts`) pairs a subject with its
  baseline and stops once settled; `npm run compare` (`record-comparison.ts`) pairs saved records.
- **Batteries and drills**: a battery plays one subject over its conditions; a drill's trials pass
  or fail, its rungs its protocols (the strike's bar in `strike/read.ts`). Only the owner accepts a
  rung (`accepted.json`).
- **The table** (`src/evaluation/table/`): Option Mind on every body by loadout by skill
  (`tableCells`), each cell judged from the newest records (`verdictOf`).
- **Falls** (`fall.ts`): one body felled on one bed (`buildFall`), its stand verified
  (`STAND_CHECK`); a stand-up is read on the [owner's
  target](reference/rising.md#the-owners-target).

## Rules and wounds

The rules (`src/core/rules/`) are one rulebook for the Arena and the Crypt (`Rulebook`), free of
any page.

- **Down** is the spec's rule (`DownSpec`, `src/core/control/ground.ts`): a human is down when a
  segment but its `bearers` is near its lowest point; a quadruped when it tips or sinks.
  `PhysicalBody.down` is read at the step's first look, before physics, so a fight sees every body
  down at one point.
- **A blow has no striker** (`watchBlows`, `blows.ts`): two segments of two sides the solver pushes
  apart while closing have met (`watchTouches`), its energy half the reduced effective mass
  (`contactMass`) times the closing speed squared (`impactEnergy`). The surfaces share it as springs
  in series (`energyShares`); two rigid items meeting clash. Stiffness tables and the fist's
  threshold: [wounds](reference/wounds.md).
- **Damage**: a side's share times its mechanism's worth over `Rulebook.unit` (`sideDamage`); a bare
  hand or foot on flesh lets the first of its share go (`Rulebook.fist`). A held point breaches
  `Rulebook.layers` and goes in against `resistance` as deep as its energy drives it (`pointWound`).
- **A bite** wounds by the impulse it brings beyond a threshold load over the interval, at a rate
  (`pointLoadDamage`, `pointLoad`); a held item intercepts it.
- **Life** (`pool.ts`): one bar a body and one a limb. A blow takes its damage times its part's
  group factor (`Rulebook.life`); an empty limb bar cripples it (`crippleLimb`); an edge strong
  enough severs (`cutOff`). A body is out when slain, beheaded or maimed.
- **Levels** (`levelsOf`, `levels.ts`): a body with nothing to do and nobody near is `held`; any
  other is `full` in the fight and `limp` out of it; the fight gives the distances (`LevelRule`).

## The screens

`index.html` is one document (`src/app.ts`, `src/app-route.ts`): the menu and each screen by
`?play=`. The shell mounts one screen at a time, disposes the last explicitly and keeps setup
choices for the tab. Every page is in `vite.config.ts`'s `rollupOptions.input`.

| Screen | Where | What it is |
|---|---|---|
| Arena | `src/arena/` | two bodies under a `Duel`, to a verdict; a person may lead a side |
| Crowd fight | `src/arena/crowd.ts` | two teams (`crowdFight`, `TeamBout`) |
| Crypt | `src/dungeon/` | a party in a generated dungeon (`DungeonRun`), each side under a Commander |
| Lab | `src/lab/` | one body in a scenario (`scenarios.ts`) |
| Ratings | `src/ratings/` | each evaluation's records; a drill's trials open in the Arena as a reel |

- **Links are recipes.** An Arena address is its bout's recipe (`recipeOf`); an edited mind travels
  whole without `tuning` (`src/ui/mind-link.ts`); a reel (`#reel=`) plays recorded cases from their
  recipes and tapes.
- **Cosmetics never carry authority.** The arena's solids are colliders (`arenaSolids`), the same
  on the page and the stand; the visible room is checked against them (`validateRoomPlacements`).
  The Crypt's walls and doors are fixed boxes (`dungeonSolids`).
- **Drawing** (`src/render/`): a skin reads only segment poses and whether each is on its body, else
  the collision shapes are drawn; art comes through the asset pipeline ([assets](art/assets.md)).
- **Sound** (`src/audio/`) is synthesized (`GameAudio`): a body is heard by its touches and its
  motion through the air (`hearTouches`, `airOf`); a blow's debris is its own cue.
