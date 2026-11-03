# How Auto-RPG is built

A fighter is a body of rigid segments and joints driven by muscles; a mind writes the muscles'
command, a blow is whatever one body carries into another, and it wounds by the energy it brings.
The pages draw what the physics did.

- **Babylon.js draws; Rapier simulates.** Rapier is vendored
  ([vendor/rapier](../vendor/rapier/README.md)).
- **Everything that fights is the core's** (`src/core/`). The screens build on it; it never imports
  them, nor Babylon: its vectors are its own (`src/core/math/vector.ts`), its bodies plain poses
  (`Pose`), and a page draws a puppet it poses from them (`followBody`, `src/render/puppet.ts`).
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

`tests/core-boundary.test.mjs` holds it: `LAYERS` is this table, the registries (`parts/lookup.ts`,
`parts/catalog.ts`, `mind/kinds.ts`, `toolkit.ts`) exempt. `CORE_PACKAGES` makes `option/` a package
only what is built on it (the quadruped's frame) imports, so another mind is built beside Option
Mind, not on it. `UP_STACK` lists imports up a layer, or into a package from outside it; it is empty
and only shrinks. The same test keeps the core to itself, its engine's package and JSON under
`assets/`, and every headless world builder (bout, Crypt run, cases, falls, world worker) free of
Babylon.

## Spec and provenance

A `BodySpec` (`src/core/spec/body.ts`) is a body in its reference pose (metres, +y up, +z forward,
soles on y = 0): segments with mass, inertia, collision shapes and surface stiffness; a joint tree,
each freedom with its axis, range and muscle; effectors (a segment, a named point and the ancestor
`base` whose chain moves it); bearing ends (`BearingEndSpec`: feet, hands, shins, paws); wounds;
the down rule (`DownSpec`); and anything held. `bodyKey` names a body for everything measured on it.

- **Models** (`BODY_MODELS`, `modelSpec`, `src/core/models.ts`): the Warrior, the Rogue and the
  Skeleton (`workshop-fighter`, `workshop-rogue`, `crypt-skeleton`, `src/core/human/spec.ts`, their
  feet toed, `toedFigure`), and the quadrupeds `reptile` and `rat` (`src/core/reptile/spec.ts`).
- **A character** (`CharacterConfig`, `resolveCharacter`) is a model plus Size, Weight, Strength,
  Speed, HP, Balance and Haste (`CHARACTER_ATTRIBUTES`). A physique (`physiqueFigure`,
  `src/core/human/physique.ts`) changes one thing a factor: size every length at the same density,
  weight the mass alone (each segment broadened), strength every peak torque, speed every muscle's
  unloaded speed. A combination whose nonadjacent segments meet is refused.
- **Items** (`src/core/items/`): `HELD` is what a hand may hold; `armedWith` and `withLoadout` arm
  a body; `REPRESENTATIVE` are the loadouts every rating covers. An item's frame is y along the
  grip or blade, x across, z out. Families share code, never values.

**Every number in a spec is a `Quantity`** (`src/core/spec/quantity.ts`): a value, a unit and its
origin. A leaf is `sourced` from an entry of `SOURCES` (`src/core/sources.ts`), whose kind is
`literature` (a citation), `asset` (a file and what is taken from it) or `tuned` (one line on what
it is set for). Anything else is `derive`d by a named rule whose code writes no factor. Tuning is
immutable: an experiment passes an override in (`RulebookOverride`, a stance tuning).

## Arithmetic

A bout is the same double for double in every JavaScript engine. An engine's own `Math.sin` and
kin differ between engines in the last bit, so the core, and whatever builds a case's world,
computes with `+ - * /`, `Math.sqrt` and its own functions (`src/core/math/real.ts`, fdlibm's kept
operation for operation, `sin` through `cbrt`, `hypot` its own; the turns `turnAboutToRef` and
`turnBetweenToRef`, `turn.ts`). A power is written as products. `EXACT_MATH` in
`tests/core-boundary.test.mjs` names the members of `Math` allowed.

The step's dear solves (`linalg.ts`, `flat.ts`, `bodyDynamics`, the reach solve) work in arrays
made once with the body, which carry nothing between calls; `tests/core-step-cost.test.mjs` holds a
step's time and allocation ([step cost](reference/step-cost.md)).

## Build and engine

**The engine contract** (`src/core/engine/engine.ts`) names no engine's types: a fixed step that
writes every body's `Pose`; bodies that never sleep, with the spec's mass and the centre of mass's
velocity; friction `CONTACT_FRICTION` unless a material names its own (the greater taken), no
bounce; freedom k as angular axis k of the joint's frame, limited as `jointAngles` reads it; a motor
as a velocity constraint with a torque ceiling each way (`setMotorBounds`), its whole-step impulse
read back (`motorStepImpulse`); contacts with the solver's impulse (`contactsOf`, or number by
number, `tellContacts`); a joint that comes apart (`EngineJoint.release`); grips (`addGrip`); a
whole-world save and in-place load (`PhysicsWorld.save`, `load`), refused by a world built
otherwise.

- `engines.ts` lists the engines (`ENGINES`), the only module that imports one: `rapier`
  (parent-axis limit rows), `rapier-coordinate` (limit rows on the measured angle, the game's
  `DEFAULT_ENGINE`), and each with friction at each contact point (`rapier-coulomb`,
  `rapier-coordinate-coulomb`). A new engine passes the physics bench (`src/physics-bench/`), then
  `CORE_ENGINE=<name> npm test`.
- `rapier.ts` implements it, its wasm loaded once a realm (`rapierModule`), its solver
  conditioning named `SOLVER`.

**Build** (`buildBody`, `src/core/build/build-body.ts`) makes an engine body a segment and a joint a
spec joint, a held item's mass folded into its segment (`rigidOf`), the body in the pose its joints
demand (a fighter's guard, `builtAngles`, `src/core/mind/minds.ts`). Readings back: `jointAngles`,
`bodyDynamics` (mass matrix, gravity and bias, gyroscopic torque included), `contactMass` and
`contactGive` (the mass a contact meets, joints held by their muscles).

- **Toes** (`src/core/build/toes.ts`): a massless slab hinged at the ball, bending as the heel
  lifts, in whole `TOE_STEP`s so each step's shapes are made once; the stance reads the sole from
  the box and the toes (`soleCorners`, `fitSole`, `src/core/control/support.ts`).
- **Separate items** (`src/core/equipment.ts`, unused by the game's fighters): an item as its own
  body gripped by joints after geometric capture, reached only through a granted port
  (`equipment-port.ts`); a refused grip refuses the whole action.

## Muscles

`driveMuscles` (`src/core/muscle/driver.ts`) turns each freedom's activation and speed into a motor
target and torque ceilings: activation times the peak torque that way times the joint's strength
times the force-velocity factor (`force-velocity.ts`: Hill's curve, an eccentric branch). A speed
beyond reach is a torque at the ceiling; zero holds.

- **Strength** is state on the body (`BuiltBody.strength`), read wherever a peak torque is
  (`strengthAt`), lowered by a crippled limb (`crippleLimb`). A side may have a tendon in series
  (`MuscleSpec.tendonPositive`, `tendonNegative`), a spring while its muscles push.
- **A body runs at a level** (`BodyLevel`, `MuscleDriver.setLevel`): `full` (mind stepped, motors
  driven), `limp` (motors released, no mind), `held` (released, every segment fixed). Leaving
  `full` the mind is told (`Mind.idle`); back, it goes on from the body as it is. The level is the
  rules' (`levelsOf`, [Rules and wounds](#rules-and-wounds)).

## Motor control

Motor control (`src/core/control/`) turns a `BodyCommand` (a posture, effector goals, timed pushes,
driven points, a stance goal) into muscle commands.

- **The command layers** (`commandLayers`) are what a mind builds on its own body: a `HostMind`
  (look, act, release, resume) over its motor, read each step through a `BodyView`
  (`src/core/body.ts`); they are independent of skills and deciders.
- **The motor** is a part of role `motor` (`MOTORS`); the game's is the whole-body solve
  (`WHOLE_BODY_MOTOR`, `motorControl`, `solve.ts`): the bearing solve and the servo (`servo.ts`,
  over `SERVO_SECONDS`) in one weighted least-squares problem, a torque past strength pinned and
  solved again. It says what goals it carries (`MotorControl.carries`) and what it left undone
  (`MotorControl.unmet`).
- **Effector goals** (`EffectorGoal`, `kinematics.ts`): named points of an effector follow
  minimum-jerk paths to places in the root's frame; two lay a line (`solveReach`); a path may run
  `through` its place or `follows` a moving end; a `firm` goal braces the limb through what it
  strikes. Only the channels between an effector's base and its segment are its reach.
- **The bearing solve** (`bearing.ts`): `carryRoot` asks the wrench the aim needs,
  `shareGroundWrench` (`contact-wrench.ts`) shares it among the patches within friction and centre
  of pressure, `bearLimbs` gives each limb its inverse dynamics; what the patches miss is asked of
  the assist.
- **Balance** is a part of role `balance` (`BALANCES`); the game's is the stance (`STANCE_BALANCE`,
  `stance-balance.ts`): the centre of mass kept inside the support by forces the ground can give,
  steps placed from the capture point (`catchStep`, `gait.ts`), a body without box soles refused
  (`soleRefusal`). What a body was measured to hold is its envelope (`stanceEnvelope`,
  `walkRunEnvelope`, from `assets/core/*-envelope.json` by `bodyKey`).
- **The assist** (`Assist`, `assist.ts`) is a force at the root and a moment that no muscle gives:
  asked by the mind, shortened to the body's ceiling, applied through the solver step, metered. The
  ceiling is the character's balance, a per cent of its weight with a moment a per cent
  (`AttributeSpec.balance`, `Rulebook.balance`, `balanceCeiling`); with none it gives nothing. Haste
  (`AttributeSpec.haste`) raises only the legs' unloaded muscle speed.

## Skills

A skill set (`skillSet`, `src/core/skills/framework/arbiter.ts`) turns an `Intent`
(`src/core/intent/intent.ts`) into a `BodyCommand` each step: locomotion, guard and low support
beneath, executors running discrete actions over them. Every skill answers `Skill.resume`; the
arbiter releases every action when another mind takes the body.

- **An action** (`ActionRequest`, `action.ts`) has an id, a name, an effector and a sensed target
  region. Admission reads readiness and reserves resources (joints, effectors, hand pose, legs);
  actions overlap where reservations allow. An executor runs `prepare`, `commit` and `release` and
  ends once in a bounded ledger (`Ended`). It never closes distance; the decider does.
- **Parts.** Each kind is a line of a role list (`EXECUTORS`, `LOCOMOTIONS`, `GUARDS`, `SUPPORTS`,
  `AIMS`, `MOVE_RULES`), its module owning its config's keys, defaults, faults, fit and maker.
  `configuredExecutors` makes a mind's executors through the host's lookup; `usableSkills` builds
  only those the body can use, naming the rest.
- **Tuned per body**: an executor's settings are its body's record (`SkillRecord`), read as mind
  data by `bodyKey` (`dataOf`, `src/core/data/store.ts`, `assets/core/<skill>.json`, its bodies in
  `<skill>.meta.json`). A body with no record does not use the skill (`recordFault`).
- **Locomotion** (`Locomotion`): legs take one goal (`LegsGoal`) and say what they left undone
  (`LegsUnmet`), their envelope and how fast they stop (`STANCE_STOPPING`, `RUN_STOPPING`).
  `stance-walk` walks within the stance's envelope and places the feet; `walk-run` hands over to a
  run cycle that drives the legs (`runCycle`, `WALK_RUN_CYCLE`, fitted to CMU clips 16_35, 16_45 and
  102_05 in `assets/core/run-cycle.json`), asking the assist only to right the pelvis
  (`gaitAssist`); `move` chooses among gaits by rules (`MOVE_RULES`) or by name.
- **The straight punch** (`straight-punch.ts`) drives the arm flat out at a contact pose solved
  each step, on a timed schedule (`TimedPush`). Steered, a network reads it 60 times a second
  (`PUNCH_DECIDE`, `punchFeatures`, `learned-punch.ts`), adds to the trunk's and arm's pushes
  (`steerPushes`), asks the legs (`stanceAsks`) and keeps or halts the walk (`keepsWalk`); its
  inputs and outputs are named in `assets/core/learned-punch.layout.json`. The network (59 inputs,
  two layers of 256, 12 outputs) is its body's record (`PunchRecord`, `PUNCH_BODIES`), trained by
  `research/run-train.py` and exported by `research/punch-export.mjs`.
- **Held blows** strike with what the hand holds (`StrikingFace`, `faceOf`), naming the mechanism
  they meet with (`ExecutorPart.meets`). The thrust (`sword-thrust`, `HELD_BLOWS`) is the punch's
  drive with the blade's point (`FACE_LEVER`). A swing (`cut`, `club-blow`, `SWINGS`) winds up to
  its record's angles (`WOUND_WITHIN`, `WOUND_STILL`), pushes on its `TimedPush` schedule and
  returns to guard. Through either, `faceAligner` servos the wrist onto the face's line.
- **The stomp** (`stomp.ts`) is a strike cycle (`strike-cycle.ts`) down from a high chamber onto
  a body lying ahead. A strike's window (`strikeWindow`) keeps the two bodies clear.
- **The guard** (`GuardPart`) owns the arms' rest: where the body is built, where free hands go,
  where a blow returns. `cover-guard` places a told hand between threat and target; `shield-guard`
  also holds a buckler's face toward the foe's weapon. **Low support** (`support-fold.ts`) folds
  the stance onto a planted base for low blows.

**Stand up** (`src/core/recovery/`). A body down rises by techniques (`TECHNIQUES`), run by the
ground executor (`groundExecutor`), which holds the whole body and asks no stance. The game's
(`STAND_UP`) are edges of a graph of positions (`graph.ts`): the staged roll, down onto hands and
knees, the sit-back and the sit-back from the front (`staged-edges.ts`), each `from` one position
`to` another, begun `moving` or `still`, a part handing the body on at the first cut read slow
enough (`CUTS`, `HAND_OVER`). The route is the least expected time to standing over the edges'
profiles (`choose`, `edgeExpected`, `assets/core/edge-profiles.json`); an edge with no profile
prices nothing. A body no edge takes is rolled over (`REPOSITION`). The staged riser (`stagedRise`)
plays a `Recipe` (`rise/stages.ts`): slack until still, it reads its lie, rolls if it must, then
plays pose stages and bearing stages (limbs set down, the centre of mass carried over them).

## Minds

**The seam.** A `Mind` (`src/core/mind/mind.ts`) is `step(senses, dt)`: from what its body senses
to its muscles' command (`MuscleDriver.activation`, `.velocity`), its assist's ask and its hands'
poses, which is all a mind does to the world. It is made with its own body (`OwnBody`: spec, read
body, muscles, assist, hands, senses, contact labels, `afterPhysics`); its memory is its `state`.
A person gives `Orders` (`src/core/intent/orders.ts`), never muscle commands.

- **The host** (`BodyHost`, `host.ts`) is all a mind's maker gets: the spec, the clock, the parts
  its config may name (`PartLookup`), the seed (the only chance, through `randomStream`), its phase
  (`phaseOf`), the rules, and one way to take the body (`take`). Grants (`HostGrants`) are fixed.
- **Senses** (`Senses`, `senses.ts`): the clock, side, life, when the clock ends the fight, and
  every other body (`BodySense`: side, spec, down, life, motion, each segment still on it), read by
  one layer (`createSenses`) before any mind, others late by `Rulebook.reaction`.
- **What a mind builds**: the command layers (`commandedMind`), sub-minds that take the body in rank
  order (`SubMind`, `hosting`), or a policy on detached observations (`policyMind`).
- **Deciding.** A decider (`Decider`, `decider.ts`) decides an intent from the `Sight` at its pace
  (`Pace`, `driveBy`), every step the body is down, and at once when it is back from another mind,
  its orders change or an action ends; the skills make the command every step from the intent last
  decided.
- **The report** (`MindReport`, `report.ts`): its `Engagement`, its `Prospect` of each foe, heading,
  gait, kit, actions and menu (`MenuEntry`), read without moving its state. Screens and Commanders
  read the report, never a mind's kind or state.

**A mind is its config.** A `MindConfig` is plain data tagged by kind; `createMind` (`minds.ts`)
makes it by the kind's `Controller` found in a `Catalog` (`src/core/parts/catalog.ts`). A mind is a
tree of parts (`Part`, `parts.ts`), each with a role, a stage (`game`, `experimental`), fields,
slots, defaults, keys, `fits` (why a body cannot carry it out) and `faults`. Roles are an open
list (`RoleParts`). `treeFaults` names each fault by path; `tuning` never travels in a link.

**Option Mind** (`src/core/option/`, `OPTION_MIND`) is the reference mind. It chooses among
options, each a skill applied to a target (`Option`): its entry (`Readiness`), the resources it
claims, its model (`Terms`: duration, what it deals and takes, the `Place` it leaves), its step,
and a status (committed, yields, at its exit, over).

- **Kinds** (`OPTION_KINDS`): follow orders, strikes, walk into strike windows, walk out of
  pressure, walk to a place, rise, covers, hold the position, hands at guard, brace.
- **Percepts** (`PERCEPTS`) are read once a step into the `Situation`; **predictions**
  (`PREDICTIONS`) price from profiles (`Profile`, `readProfile`,
  `src/core/skills/framework/profile.ts`), each named by what it was measured on (`Measured`), a
  stale one (`staleness`) unread and a model with none priced by its prior.
- **The objective** (`OBJECTIVES`): `few-terms` values an option in a share of a body's life beside
  its orders at the person's `OBEDIENCE`; `reach-place` values nearing a place, the Walker's.
- **The chooser** (`CHOOSERS`: `valued`, `ranked`) runs the toolkit's set selection (`selectSet`,
  `src/core/mind/choice.ts`): the best option on offer, then the best whose claims are still free,
  rest options last; a running option that does not yield keeps its claims. The set's step is one
  intent (`stepSet`). It decides afresh on a percept's cue (`eventOf`), at an exit, or on its phase.
- **The rise** (`groundOptions`): each technique an option where its entry admits the body as it
  lies, priced by its edge's expected seconds down; repositioning only from a posture no technique
  begins from.

**The Option Reptile** is Option Mind over a frame (`FramePart`), the quadruped's
(`QUADRUPED_FRAME`) over its layers (`quadrupedLayers`: paws under a support motor, the trot and
the crawl, the bite), choosing among `QUADRUPED_OPTIONS`. A new family of bodies is a frame.

**Entrants.** An `Entrant` (`src/core/parts/entrant.ts`) is one AI: its kinds of mind, parts and
presets, each kind scoped `<name>:`. `ENTRANTS` (`src/entrants/index.ts`): `option` (every skill,
deciding at 60 Hz), `walker`, `option-reptile`, and `bare` (`bare:mind`, a network from the body's
channels to its muscles). `GAME` (`src/entrants/game.ts`) is the game's catalog, `MINDS` what a
person picks, `defaultMind` each model's preset, `modelRefusal` why a mind cannot play a body.

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
reads the members' pooled view (`TeamView`, from their reports and senses, and a leader's `Lead`)
and the level as its host answers it (`TeamLevel`), keeps its memory in `state`, and gives each
member orders (`TeamDecision`). A person's `Command` (`commands.ts`) reaches it at once. Its host
asks it once a step, after the senses and before every mind.

`COMMANDERS` registers the kinds (`createCommander`): `mob` and `independent` (Crypt enemies),
`party` (a person's party, and an Arena side a person takes, `teamOfOne`), `clearer`, and the
drills' `drill`, `stand` and `beats`. `tests/core-boundary.test.mjs` keeps `src/core/command/` from
the engine, world, bodies, enlistment, a mind's host and the senses hub, globals and chance;
`tests/command-contract.test.mjs` has each kind lead a bout, fork it and replay it from its orders.

## One world step

`createWorld(engine)` (`src/core/world.ts`) makes a world with one fixed step (`PHYSICS_HZ`). A
step runs, in order: the sensing hooks (`World.sense`); the preparing hooks (`World.prepare`:
hands' and toes' shapes; at a delay each mind decides on its mirror, and minds apart are handed
what they read, `MindsApart.dispatch`); the step hooks (`World.beforeStep`: each body's
`driveMuscles`, the mind's motor part, or at no delay the mind itself, then the motors set);
one solver step and the clock; the post-physics observations (`World.afterPhysics`); the after-step
hooks (`World.afterStep`: blows, readings). A page advances by real time (`World.advance`);
`scene.render()` never steps. What a step writes is plain data in one `state` object a module
(`src/core/state.ts`), so a bout forks by copying its state.

### The command delay

What a mind sends is applied `World.delay` steps later (`COMMAND_DELAY`, one step in the game): its
muscles' command, assist ask and hand poses, each through a ring (`delayLine`,
`src/core/command-delay.ts`) that is state, so a bout forks with commands in flight. A body's time
starts at its first decision carried out (`BodyView.born`).

At a delay each mind reads a mirror of its body (`mirrorBody`), refreshed from numbers the world
writes once a step (`mirrorWriter`). The mind is split: **its step decides** on the body as the
mirror shows it, and **its motor part carries the decision out** a delay later on the body as it
is (`Mind.move`, `motorPart`), reading its own body alone and the senses as last decided on
(`Mirror.seen`). For the command layers that is the driver's (`SplitDriver.carry`); the quadruped
refuses a delay over one. Given a place for minds (`World.minds`, `MindPlace`), minds run on
other threads (`mindThreads`; `mindWorkers` in Node, `browserMindWorkers` in a cross-origin
isolated page) and a bout is the same step for step, but not saved or forked (`MIND_APART`).

### The world in a worker

The Arena's, the crowd fight's and the Crypt's worlds step in a Web Worker each (`src/worker/`),
built headless as Node builds them (`duelStage`, `teamStage`, `cryptStage` through `buildBout`,
`buildTeamBout`, `buildCryptRun`), the same to the bit (`tests/world-worker.test.mjs`). The worker
takes the steps real time owes (at most `CATCH_UP_SECONDS` a pass) and sends each step's frame
(`frame.ts`) and news (`StageNews`); a world that cannot keep up plays slow while the page keeps its
rate. The page's input (`DuelInput`, `CryptInput`) is applied before the next step and taped. The
page (`openWorld`) poses a puppet of each body between the two frames it shows (`posePuppet`).

## Bouts, tapes and replay

A bout (`Duel`, `src/arena/duel.ts`) is built from a recipe (`DuelRecipe`: bodies, gap, cap, level,
minds, loadouts, attributes, reaction time, seed, end rules, starts, a drill's `Rail` or `Shove`),
plain data. A bout is deterministic: a recipe plays the same to the bit in Node and in the page
(`buildBout`, `src/evaluation/bout.ts`).

- **Verdict**: a side is out by the first end rule that puts it out (`END_RULES`); the game's
  (`GAME_ENDS`) are its pool's ending, then the drain (`DRAIN_END`). Both on one step is a draw;
  at the cap the fuller life wins.
- **Tape** (`Duel.tape`): every order with its step; recipe and tape are the whole bout
  (`Duel.play`). **Order sheets** (`SheetLog`) replay a bout with no mind (`replayedBody`).
- **Save** (`Duel.save`, `Duel.load`) loads only into a bout of the same recipe and build
  (`RecordingIdentity`). A case's code (`caseCoder`, `scripts/build-identity.mjs`) is the import
  closure of what it plays, so an edit re-keys only the cases that reach it.

## Evaluations

Every question of how well something does is an evaluation (`src/evaluation/`, `EVALUATIONS`), one
path for Node, its workers and a page; `scripts/evaluate.mjs` runs it.

- **A case module** (`<id>/cases.ts`, `Cases`) gives each protocol's conditions, the world of a case
  (`CaseWorld`: a bout, a fall, a Crypt run, a lone body, techniques in turn; `WORLD_BUILDERS`) and
  its reader; **a description** (`<id>/index.ts`, `Evaluation`) the question, subjects, figures and
  a drill trial's `outcome`.
- **A case's key** is the digest of everything it plays; a row (`Row`) is found again by its key, so
  only changed cases replay. `--write` keeps a record,
  `assets/evaluations/<id>/<date>-<commit8>-<keys8>.jsonl` (`record.ts`), grouped into pools with
  numbered versions (`history.ts`).
- **Contests**: `match` (two minds, each on each side, one digest), `tournament` (Bradley-Terry,
  `rating.ts`), `unseen`. The panel report (`compare.ts`, `settle.ts`) pairs a subject with its
  baseline and stops once settled; `npm run compare` (`record-comparison.ts`) pairs saved records.
- **Batteries and drills**: a battery plays one subject over its conditions (`locomotion`, `court`,
  `crowd`, `crypt-clear`, `rising-target`, `equipped-rise`, `baseline`); a drill's trials pass or
  fail, its rungs its protocols: `strike` (landed against the bar in `strike/read.ts`), `cover`,
  `stand`, `gait`, `rise`. Only the owner accepts a rung (`accepted.json`).
- **The Rise drill** (`src/evaluation/rise/`) plays each edge of Stand up alone (`technique.ts`):
  rung `placed` from its postures at rest, rung `moving` after the edge before it, within
  `TECHNIQUE_LIMITS`.
- **The table** (`src/evaluation/table/`): Option Mind on every body by loadout by skill
  (`tableCells`), each cell judged from the newest records (`verdictOf`).
- **Falls** (`fall.ts`): one body felled on one bed (`buildFall`), its stand verified
  (`STAND_CHECK`); a stand-up is read on the [owner's
  target](reference/rising.md#the-owners-target).

## Rules and wounds

The rules (`src/core/rules/`) are one rulebook for the Arena and the Crypt (`Rulebook`), free of
any page.

- **Down** is the spec's rule (`DownSpec`, `uprightness`, `fallenRule`,
  `src/core/control/ground.ts`): a human is down when a segment but its `bearers` (feet and hands)
  is within `within` of its lowest point; a quadruped when it tips or sinks (`low`).
  `PhysicalBody.down` is read at the step's first look, before physics, so a fight sees every body
  down at one point.
- **A blow has no striker** (`watchBlows`, `blows.ts`): two segments of two sides the solver pushes
  apart while closing have met (a touch, `watchTouches`), its energy half the reduced effective mass
  (`contactMass`) times the closing speed squared (`impactEnergy`). The surfaces share it as springs
  in series (`energyShares`); two rigid items meeting clash (`isClash`). Stiffness tables and the
  fist's threshold: [wounds](reference/wounds.md).
- **Damage**: a side's share times its mechanism's worth over `Rulebook.unit` (`sideDamage`); a bare
  hand or foot on flesh lets the first of its share go (`Rulebook.fist`). A held point breaches
  `Rulebook.layers` and goes in against `resistance` as deep as its energy drives it (`pointWound`).
- **A bite** wounds by pointed load: HP = `pointLoad.rate` × max(0, impulse − `pointLoad.threshold`
  × seconds) (`pointLoadDamage`), the impulse summed over the interval; a held item intercepts it.
- **Life** (`pool.ts`): one bar a body and one a limb. A blow takes its damage times its part's
  group factor (`Rulebook.life`, `lifeFactor`); an empty limb bar cripples it (`crippleLimb`); an
  edge strong enough severs (`cutOff`). A body is out when slain, beheaded or maimed.
- **Levels** (`levelsOf`, `levels.ts`): a body with nothing to do and nobody near is `held`; any
  other is `full` in the fight and `limp` out of it; the fight gives the distances (`LevelRule`).

## The screens

`index.html` is one document (`src/app.ts`, `src/app-route.ts`): the menu and `?play=arena`,
`crowd`, `dungeon`, `lab`, `ratings`, `tools`. The shell mounts one screen at a time, disposes the
last explicitly and keeps setup choices for the tab. Every page is in `vite.config.ts`'s
`rollupOptions.input` (also `character-lab.html` and `physics-bench.html`).

| Screen | Where | What it is |
|---|---|---|
| Arena | `src/arena/` | two bodies under a `Duel`, to a verdict; a person may lead a side |
| Crowd fight | `src/arena/crowd.ts` | five Warriors a side (`crowdFight`, `TeamBout`) |
| Crypt | `src/dungeon/` | a party in a generated dungeon (`DungeonRun`), each side under a Commander |
| Lab | `src/lab/` | one body in a scenario (`scenarios.ts`) |
| Ratings | `src/ratings/` | each evaluation's records; a drill's trials open in the Arena as a reel |

- **Links are recipes.** An Arena address is its bout's recipe (`recipeOf`); an edited mind travels
  whole without `tuning` (`writeMind`, `parseMind`, `src/ui/mind-link.ts`); a reel (`#reel=`) plays
  recorded cases from their recipes and tapes.
- **Cosmetics never carry authority.** The arena's slab, parapets and pedestals are colliders
  (`arenaSolids`), the same on the page and the stand; the visible room is checked against them
  (`validateRoomPlacements`). The Crypt's walls and doors are fixed boxes (`dungeonSolids`).
- **Drawing** (`src/render/`): a skin reads only segment poses and whether each is on its body, else
  the collision shapes are drawn; art comes through the asset pipeline ([assets](art/assets.md)).
- **Sound** (`src/audio/`) is synthesized (`GameAudio`): a body is heard by its touches
  (`hearTouches`, loudness from energy, the softer substance's voice) and its air (`airOf`, the
  fastest point's speed); a blow's debris is its own cue (`debrisCues`).
