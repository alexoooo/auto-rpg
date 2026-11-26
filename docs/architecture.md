# How Auto-RPG is built

A fighter is a body of rigid segments and joints driven by muscles; a mind writes the muscles'
command, a blow is whatever one body carries into another, and it wounds by the energy it brings.
The pages draw what the physics did.

- **Babylon.js draws; Rapier simulates.** Rapier is vendored
  ([vendor/rapier](../vendor/rapier/README.md)).
- **The core** (`src/core/`) holds physical foundations, exact arithmetic, bodies, the fixed
  world step and data storage. Combat, control, skills and minds build on those foundations.
  Drawing uses Babylon and poses a puppet from the simulated poses (`followBody`,
  `src/app/browser/render/puppet.ts`).

This page is the map: what each layer is, the contracts between layers, and where each lives.
What a module does is in its own comments.

## The layers

A module imports its own layer or one below. Evaluation builds on game; application code
composes their concrete implementations. The gate ranks modules by path prefix (`RANKS`,
`scripts/source-boundary.mjs`, held by `tests/core-boundary.test.mjs`), so folders inside a layer
are ranked too, general below specific.

| Layer | Where | Owns |
| --- | --- | --- |
| Core | `src/core/`, `math/`, `data/`, `physics/`, `bodies/`, `world/` | arithmetic, physics, body descriptions and muscles, clock, state and data store |
| Parts | `src/parts/` | component contracts, scoped configurations, role lookup, the walk over a tree of parts (`eachPart`) and what is read of one (`tree.ts`) |
| Combat | `src/combat/` | blows, wounds, life and rulebooks |
| Control | `src/control/` | motion and support goals turned into muscle commands |
| Skills | `src/skills/framework/`, `reach/`, `perception/`, `locomotion/`, `intent/`, `guard/`, `strikes/`, `recovery/`, `assembly/` | capability contracts, implementations and owned records |
| Minds | `src/minds/`, `catalog/`, `seat/`, `option/`, `command/` | Mind execution, catalogs, decision frameworks and reusable Options |
| Game | `src/game/` | gameplay and world builders receiving an immutable context |
| Evaluation | `src/evaluation/` | cases and readings of the game's worlds |
| Entrants | `src/entrants/<name>/` | a public manifest and private fighter assembly, components, presets and data |
| Application | `src/app/` | the concrete catalogs, registrations, composition and runtime adapters |

Every module outside `node/` or `browser/` is runtime-neutral, including what it imports.
`src/app/node/` reads build identity and hosts Node workers; `src/app/browser/` owns DOM, rendering,
input and browser workers. Gameplay and evaluations receive the `GameContext` (catalog, Commander
registry, build identity, default mind) as an argument. Registrations of motors, balances, gaits,
guards, executors, techniques and Commanders live in `src/app/registration/`.

Shared libraries never import entrants; application composition imports their public manifests.
A skill's variation
(`src/skills/<area>/<skill>/<variation>/`) imports its own folder, the area's shared code
(`<area>/shared/`) and code outside the areas, never another variation or skill; only its own
skill's code imports it, and shared code imports no skill's.

The public APIs for entrant authors are:

| Entry point | Contract |
| --- | --- |
| `src/core/bodies/index.ts` | body facts, readings, control and kinematic helpers |
| `src/core/math/index.ts` | exact arithmetic, vectors, randomness and numeric learners |
| `src/core/state.ts` | plain memory and freezing |
| `src/core/data/store.ts` | `DataOf` augmentation, typed keys, loaders and reads |
| `src/parts/index.ts`, `src/parts/lookup.ts` | parts, fields, slots and role augmentation |
| `src/minds/index.ts` | Mind construction, controllers and entrant manifests |
| `src/minds/option/index.ts` | Option/chooser contracts and reusable components |
| `src/skills/config.ts` | component-owned configuration maps |
| `src/skills/framework/navigation.ts`, `src/skills/locomotion/move/move-rule-part.ts` | navigation and movement-rule extension contracts |

## Bodies

A `BodySpec` (`src/core/bodies/spec/body.ts`) is a body in its reference pose (metres, +y up, +z forward,
soles on y = 0): segments with mass, inertia, shapes and stiffness; a joint tree, each freedom with
its axis, range and muscle; effectors (a named point on a segment and the ancestor `base` whose
chain moves it); bearing ends; wounds; the down rule (`DownSpec`); and anything held. Its `model`
names a body for everything measured on it.

- **Models** (`BODY_MODELS`, `modelSpec`, `src/core/bodies/models.ts`): the humans are built in
  `src/core/bodies/human/spec.ts`, the quadrupeds in `src/core/bodies/quadruped/spec.ts`.
- **A character** (`CharacterConfig`, `resolveCharacter`) is a model plus its attributes and its
  skills: a list of each variation of a skill it holds, `skill/variation`, several of one skill
  if it likes. The characters are `assets/characters/characters.json`; each model has its own.
  Each variation held is a skill of its own to its mind.
- **Items** (`src/core/bodies/items/`): `HELD` is what a hand may hold; `armedWith` and
  `withLoadout` arm a body. An item's frame is y along the grip or blade, x across, z out.
- **Every number in a spec is a `Quantity`** (`src/core/quantity.ts`): a value, a unit and its
  origin, a leaf `sourced` from an entry of `SOURCES` (`src/core/sources.ts`), anything else
  `derive`d by a named rule.
- **Build** (`buildBody`, `src/core/bodies/build/build-body.ts`) makes an engine body a segment
  and a joint a spec joint, a held item's mass folded into its segment, the body in the pose its
  joints demand.
- **Muscles** (`driveMuscles`, `src/core/bodies/muscle/driver.ts`) turn each freedom's activation
  and speed into a motor target and torque ceilings: activation times the peak torque that way
  times the joint's strength times Hill's force-velocity factor.
- **A body runs at a level** (`BodyLevel`): `full` (mind stepped, motors driven), `limp` (motors
  released, no mind), `held` (released, every segment fixed). The level is the rules'
  ([Rules and wounds](#rules-and-wounds)).

## Arithmetic

A bout is the same double for double in every JavaScript engine. An engine's own `Math.sin` and
kin differ between engines in the last bit, so the core, and whatever builds a case's world,
computes with `+ - * /`, `Math.sqrt` and its own functions (`src/core/math/real.ts`, fdlibm's kept
operation for operation; `turn.ts`). A power is written as products. `EXACT_MATH` in
`tests/core-boundary.test.mjs` names the members of `Math` allowed. What a step takes in time
and memory: [step cost](reference/step-cost.md).

## The engine

The engine contract (`src/core/physics/engine.ts`) names no engine's types: a fixed step that
writes every body's `Pose`; bodies that never sleep; a motor as a velocity constraint with a
torque ceiling each way; contacts with the solver's impulse; a joint that comes apart; grips; a
whole-world save and in-place load, refused by a world built otherwise.

- `engines.ts` lists the engines (`ENGINES`, the game's `DEFAULT_ENGINE`) and is the only module
  that imports one. A new engine runs the core's tests by `CORE_ENGINE=<name> npm test`; how
  Rapier was chosen: [the bake-off's report](../research/physics-bakeoff/REPORT.md).
- `rapier.ts` implements it, its wasm loaded once a realm (`rapierModule`), its solver
  conditioning named `SOLVER`.

## Motor control

Motor control (`src/control/`) turns a `BodyCommand` (a posture, effector goals, timed pushes,
driven points, a stance goal) into muscle commands.

- **The command layers** (`commandLayers`) are what a mind builds on its own body, read each step
  through a `BodyView` (`src/control/body.ts`); they are independent of skills and of whatever decides.
- **The motor** is a part of role `motor` (`MOTORS`); the game's is the whole-body solve
  (`motorControl`, `solve.ts`): the bearing solve and the servo in one weighted least-squares
  problem. A body on paws has the paw support (`pawMotor`, `src/control/quadruped/paw-motor.ts`).
- **Effector goals** (`EffectorGoal`, `kinematics.ts`): named points of an effector follow
  minimum-jerk paths to places in the root's frame.
- **Balance** is a part of role `balance` (`BALANCES`); the game's is the stance
  (`STANCE_BALANCE`, `src/skills/locomotion/stance/`): the centre of mass kept inside the support
  by forces the ground can give, steps placed from the capture point. It is a skill a character
  holds in a variation (`stance`). How its walk steps is a gait's (`GaitTuning`): each way of
  moving the legs is a gait (`src/skills/locomotion/move/gaits.ts`: braced, footwork, run), a
  body walks by those whose variation its character holds, and Option Mind has one walk Option
  for each.
- **The assist** (`Assist`, `src/core/bodies/assist.ts`) is a force at the root and a moment that no muscle gives:
  asked by the mind, shortened to the body's ceiling, metered. The ceiling is the character's
  steadiness (`Rulebook.steadiness`); with none it gives nothing.

## Skills

A skill set (`skillSet`, `src/skills/framework/arbiter.ts`) turns an `Intent`
(`src/skills/framework/intent.ts`) into a `BodyCommand` each step: locomotion, guard and low support
beneath, executors running discrete actions over them. What a mind holds is one object (`Skills`,
`skills.ts`): `command` and `release`, its `state`, and what the mind reads and asks of each skill.

- **An action** (`ActionRequest`, `action.ts`) has an id, a name, an effector and a sensed target
  region. Admission reads readiness and reserves resources; actions overlap where reservations
  allow. An executor runs `prepare`, `commit` and `release` and ends once (`Ended`). It never
  closes distance; the mind does.
- **Skills live in an area** of `src/skills/` (`guard/`, `locomotion/`, `strikes/`, `recovery/`),
  a folder a skill: the skill's part (`straight-punch/index.ts`) names its variations, and a
  variation with code of its own keeps it in its own folder (`stomp/stomp/`). Code that skills
  share is in the area's `shared/`. A skill's part fits only a body whose character has the skill
  and runs the variation it chose.
- **Tuned per body**: a skill that reads a record has its settings as its body's record
  (`SkillRecord`), read as mind data by model from `assets/skills/` (`dataOf`). A body with no
  record does not use the skill. A strike variation's settings are
  `assets/skills/strikes/<skill>/<variation>.json`.
- **Locomotion** (`Locomotion`): legs take one goal (`LegsGoal`) and say what they left undone
  (`LegsUnmet`). `move` goes by the gait its goal names, else by its rules; `stance-walk` walks
  within the stance's envelope; `walk-run` hands over to a run cycle fitted to motion capture,
  steered by a learned actor where its record has one. A body on paws has `paw-move`.
- **Learned decisions** (`Learner`, `src/core/math/learning/learner.ts`): a learned controller
  calls `act` before its step's commands and `ask` after them. An answer acts from the control
  step after its request until the next answer, so native play and training step alike; every
  training environment steps through `research/learner-adapter.mjs`.
- **Strikes** (`src/skills/strikes/`): the straight punch drives the arm at a contact pose on a
  timed schedule (`TimedPush`), steered by its body's network where its record has one; the sword
  thrust is the same drive with the blade's point; the club blow and the bonk are one swing
  (`shared/swing.ts`); the stomp and the bite are strike cycles of their own.
- **Stand up** (`src/skills/recovery/`): a body down rises by techniques (`TECHNIQUES`): the ways
  up, each with the postures it begins from and reaches (its `edges`), and the modes of the ground
  (brace, land, regain, flatten). A posture (`Position`) names what bears the body, read each step
  by the ground reading (`groundReading`).

## Minds

A `Mind` (`src/minds/mind.ts`) requires `state`, `act(control)`, `think(senses)` and
`interrupt()`. Its memory is plain saved data in `state`. A person gives `Orders`
(`src/minds/orders.ts`), never muscle commands.

A body is a different type to each holder:

| Type | Where | Who holds it | What it is |
| --- | --- | --- | --- |
| `BuiltBody` | `src/core/bodies/build/build-body.ts` | the world's side | the body in the engine, with what acts on it |
| `ReadBody` | `src/core/bodies/read-body.ts` | a mind and its skills | the built body's readings alone; nothing in it moves a body |
| `OwnBody` | `src/core/bodies/own-body.ts` | a mind's maker | what a mind is made with: the spec, the readings, the muscles' and assist's reading side, the first senses |
| `Body` | `src/control/body.ts` | a mind's skills, a skill or a script | the body under motor control: a view to read; the Mind that owns its command layers hands them each command (`CommandingMind`, `src/minds/commanding-mind.ts`) |
| `PhysicalBody` | `src/minds/seat/physical-body.ts` | a fight | the body whatever its mind: the built body, whether it is down, who has it, its level, its saved state, its disposal |

- **Made by its config.** A `MindConfig` is plain data tagged by kind; `createMind`
  (`src/minds/seat/create-mind.ts`) makes it by the kind's `Controller` found in a `Catalog`
  (`src/minds/catalog/catalog.ts`). The maker is given only a `BodyHost` and takes the body once
  (`BodyHost.take`).
- **Stepped in two phases.** On each control step the body's hook calls `answer` and then `think`
  (`execution.ts`): `answer` calls `Mind.act`, which writes the command decided on the step
  before; `think` reads the senses and calls `Mind.think`, which decides the next.
- **Senses** (`Senses`, `src/core/bodies/senses.ts`): the clock, its side and life, and every other body, read
  once before any mind, others late by `Rulebook.reaction`. They are all a mind knows of another
  body: never its mind, nor the skills its character holds (a sensed spec has none,
  `sensedSpec`). A mind's source reaches neither the world nor the characters' registry
  (`tests/core-boundary.test.mjs`).
- **The report** (`MindReport`, `report.ts`) says what a mind is engaged in, weighing and doing,
  and the skills always on that run now (`Running`: its gait, its guard).
  Screens and Commanders read the report, never a mind's kind or state, and reading it moves
  nothing.
- **A mind is a tree of parts** (`Part`, `src/parts/`), each with a role, slots and defaults,
  saying why a body cannot carry it out (`fits`) and what is wrong with its config (`faults`).
  A slot's config is typed by its role (`ConfigFor`, `lookup.ts`).

**Option Mind** (`src/minds/option/`) is the game's decision framework, for the humanoids and
the bodies on paws alike. It is two classes and five ideas.

**Two classes.** `CommandingMind` (`src/minds/commanding-mind.ts`) is a Mind that runs its body
through the command layers: each step it reads the senses into the layers and queues what it
decides, and when a decision comes due, after the body's reaction time, it turns the decision into
a body command and has the motor carry it out. A subclass says what it decides (`decide`), how a
decision becomes a command (`carry`) and what it lets go of when its body is taken from it
(`released`). `OptionMind` (`option-mind.ts`) is one subclass: each decision it reads its
situation, chooses among its Options by what they are predicted to bring, and asks its skills to
carry out what the chosen Options ask. The scripted Mind (`src/minds/scripted-mind.ts`) is the
other.

**Five ideas**, the first four interfaces in `contract/`, which imports nothing from the rest of
the folder, and the fifth the skills' own:

| Idea | Interface | Says |
| --- | --- | --- |
| What I know | `Situation` (`situation.ts`) | the body's knowledge at one moment, real or imagined |
| What I can do | `Option` (`option.ts`) | a skill applied to a target: whether it can be played here (`Readiness`), the resources it claims, what it is predicted to bring (its model, `Terms`: duration, what it deals and takes, the ways it ends), and what it asks of the skills each step |
| What I cannot see from my own Options | `ExchangePredictor`, `ValuePredictor` (`predictors.ts`) | what the foe and the body do to each other; what a state is worth where a line stops |
| How I pick | `Chooser` (`chooser.ts`) | picks Options, reading the future only through the two rows above |
| How I act | `Skills` (`src/skills/framework/skills.ts`) | turns what the chosen Options ask into a body command |

**Six folders** beside `option-mind.ts` and `index.ts` (what the folder publishes):

| Folder | Holds |
| --- | --- |
| `contract/` | the interfaces above, and the roles a Mind's parts have (`parts.ts`) |
| `situation/` | what reads the body's situation each decision (`reader.ts`, `percepts.ts`), the state an Option is imagined to leave (`imagined.ts`), and what the reader remembers of reach and of rising |
| `predictions/` | the kinds of predictions (`part.ts`), the numbers set by hand (`by-hand.ts`), the exchange predictor read from measured profiles (`exchange/`), the fitted value (`value/`), what a blow is predicted to cost (`damage.ts`), the kept data both read (`data/`) |
| `options/` | each kind of Option (`kinds.ts`, `strike-kinds.ts`), and what Options share: readiness, outcomes, limbs |
| `choosers/` | the three chooser parts (`parts.ts`), the one policy over a search's prices (`chooser.ts`), the searches, the leaves, the objectives |
| `assembly/` | what makes a Mind from a config: `controller.ts` (`optionController`), `config.ts`, `description.ts` (what a config builds), `build.ts` (what makes the running Mind) |

Each folder imports from those above it in the table, and `contract/` from none. Three imports
run the other way: `options/kinds.ts` reads `assembly/config.ts` (`optionApplies`),
`predictions/part.ts` reads `options/walk.ts` (`WALK_STARTS`), and
`predictions/exchange/pressure.ts` reads `choosers/select-set.ts` (`RETHINK`).

**Its memory is one tree.** A part that remembers has a `state`, one plain object it makes and
owns; the Option Mind's constructor points its own `state` at its parts' (`OptionMindState`), and
nothing else adds to the tree. [The code recipe](recipes/code.md#code) says the three kinds of
memory and what checks them.

- **Predictions** (a part of role `predictions`, `predictions/part.ts`) price an Option from
  measured profiles (`Profile`, `src/skills/framework/profile/profile.ts`): a sample of trials, a
  strike's thrown sparring and a ground Option's tried in falls. A profile is found by its skill
  and variation, its limb and the body's model; what each body held is on each trial as numbers
  (`Start.held`: an item's mass and reach), read by the trials nearest it. Where nothing measured
  reads, the kind `measured` answers by a number set by hand (`Guesses`, `BY_HAND`), all of them
  in `predictions/by-hand.ts`; the kind `measured-only` guesses nothing, so what no drill
  measured is not priced; the kind `prior` reads no profile. Every reading says where it comes
  from (`Source`, `src/skills/framework/profile/source.ts`), and so does each answer of a price
  (`Terms.from`, a line's `foe` and `end`; an offer's six in the Mind's report,
  `OfferTerms.from`). A measured asset names what it was measured from (`Origin`: its body's and
  its skill's digests, and each Mind that played its trials with what that Mind read, `Played`).
- **The chooser** (`CHOOSERS`): the tree chooser prices each Option by a Monte Carlo tree search
  over the models (`treeSearch`) and is the application's default; the valued chooser searches one
  or two deep; the ranked chooser (`RANKED_CHOOSER`) prices nothing and takes firm orders first,
  then the first Option on offer. Every drill and skill search runs `option-drill`, on the ranked
  chooser.
- **Its config is Options** (`OptionMindConfig`) in rank order: each strike its own kind
  (`strike-<skill>`), one Option a limb; each way up and mode of the ground an Option naming its
  technique (`options/rise.ts`); a walk an Option a gait, to the sites the other Options name.

**Entrants.** An `Entrant` (`src/minds/catalog/entrant.ts`) is one AI: its kinds of mind, parts and
presets, each kind scoped `<name>:`, listed in `ENTRANTS` (`src/app/entrants.ts`).

### Adding an entrant

1. A folder `src/entrants/<name>/` whose `index.ts` exports its manifest, a line in `ENTRANTS`,
   and any data it owns under `assets/entrants/<name>/`, under
   [the code recipe](recipes/code.md#simulation-and-source-boundaries)'s import rule.
2. Most entrants are presets: configs of the `option` kind over the toolkit's parts and their own.
3. A part of its own, of any role, is a module and a line of its manifest's `parts`, kind
   `<name>:<kind>`.
4. A kind of mind of its own is one `controller({ ... })`: a config type, defaults, faults and a
   maker that takes the body once (`host.take`) and returns its `state`.
5. Declare owned data in `DataOf` and provide its loader in the manifest.

## Command

A **Commander** (`Commander`, `src/minds/command/team.ts`) stands to a team as a mind to a body: it
reads the members' pooled view (`TeamView`) and the level as its host answers it (`TeamLevel`),
keeps its memory in `state`, and gives each member orders (`TeamDecision`). A person's `Command`
(`commands.ts`) reaches it at once. `COMMANDERS` registers the kinds; `party` leads a person's
side.

## One world step

`createWorld(engine)` (`src/core/world/world.ts`) makes a world with one fixed step (`PHYSICS_HZ`). A
step runs, in order: the sensing hooks (`World.sense`); the preparing hooks (`World.prepare`:
hands' and toes' shapes, each mind's mirror answer and decision); dispatch to minds apart; the step
hooks (`World.beforeStep`: carry the answer into each body's `driveMuscles` and set the motors);
one solver step and the clock; the post-physics observations
(`World.afterPhysics`); the after-step hooks (`World.afterStep`: blows, readings). A page advances
by real time (`World.advance`).

- **State.** Bouts serialize their registered state roots through `saveState` and restore them
  through `loadState` (`src/core/state.ts`). Durable simulation values must be reachable from
  those roots; runtime links and derived caches are rebuilt from the restored values.
- **The command delay.** What a mind sends is applied `World.delay` steps later (`COMMAND_DELAY`,
  one step in the game), through a ring that is state, so a bout forks with commands in flight.
  Each mind reads a mirror of its body (`mirrorBody`).
- **Minds apart.** Given a place for minds (`World.minds`), minds run on other threads and a bout
  is the same step for step, but not saved or forked.
- **The world in a worker.** The Arena's, the crowd fight's and the Crypt's worlds step in a Web
  Worker each (`src/app/worker/`), built headless as Node builds them. The worker sends each
  step's frame; the page poses a puppet of each body between the two frames it shows.

## Bouts, tapes and replay

A bout (`Duel`, `src/game/arena/duel.ts`) is built from a recipe (`DuelRecipe`), plain data: bodies,
minds, loadouts, seed, end rules and the rest. A bout is deterministic: a recipe plays the same to
the bit in Node and in the page (`buildBout`, `src/evaluation/bout.ts`).

- **Verdict**: a side is out by the first end rule that puts it out (`END_RULES`, the game's
  `GAME_ENDS`). Both on one step is a draw; at the cap the fuller life wins.
- **Tape** (`Duel.tape`): every order with its step; recipe and tape are the whole bout
  (`Duel.play`). **Order sheets** (`SheetLog`) replay a bout with no mind (`replayedBody`).
- **Save** (`Duel.save`, `Duel.load`) loads into a bout of the same recipe less its minds and the
  same physical conditions (`RecordingIdentity`), on whatever build made it. A mind is the loading
  bout's own: its settings are that bout's, and its memory is the save's where it is built as the
  save's was; otherwise the mind starts fresh from the saved bodies and `load` returns the sides
  it did so for.
- **A recording keeps the build it was made on** and is played by the code that loads it
  (`requireRecordingIdentity`): its protocol, its recipe and its physical conditions are what
  refuse it.

## Evaluations

Every question of how well something does is an evaluation (`src/evaluation/`, `EVALUATIONS`), one
path for Node, its workers and a page; `scripts/evaluate.mjs` runs it.

- **A case module** (`<id>/cases.ts`, `Cases`) gives each protocol's conditions, the world of a case
  (`CaseWorld`, `WORLD_BUILDERS`) and its reader; **a description** (`<id>/index.ts`, `Evaluation`)
  the question, subjects, figures and a drill trial's `outcome`.
- **A case's key** is the digest of the question it answers: everything it plays but its code,
  and what its world's bodies load of mind data. A row (`Row`) is kept with where it came from
  (`RowOrigin`) in `.cache/evaluations/<id>/` (`rows.ts`), outside Git and outside what
  `npm run clean` deletes, and is found again by its key whatever commit it was played on. So a
  record or a profile changed under a subject plays its cases, and a change to the code plays
  none. `--fresh` plays a named subject's cases again. `--write` keeps the run's results in
  `assets/evaluations/<id>.json` (`results.ts`), from rows of the commit it names alone.
- **A subject's variations**: a subject name may end in one or more `+<skill>/<variation>`
  (`option+straight-punch/moving`); its bodies' characters then hold those variations in place
  of their own. Two variations of one skill are read against each other as two subjects on the
  same cases, one the other's `--previous`.
- **Drills**: a drill's trials pass or fail, its rungs its protocols. A drill's struck target
  stands with its arms lowered, so a failed trial is the striker's. A strike against a foe
  fighting back is read on the `sparring` protocols, from starts drawn at random, from which
  alone the strikes' profiles are built; in a fight, on the `fights` protocols. Each has a `-twin`
  drawn on another stream, a larger `-drawn` for a search or a trainer to draw from and a `-judge`
  held out.
- **Contests**: `match` (two minds, each on each side, one digest), `tournament` (Bradley-Terry,
  `rating.ts`), `unseen`.
- **The table** (`src/evaluation/table/`): the drills' Option Mind (`option-drill`) on every body
  by loadout by skill, each trial valued in the game's terms (`trialValue`), a fall at a fixed
  price (`FALL_PRICE`), a cell compared with its baseline paired by condition
  ([the table](reference/the-table.md)).
- **Falls** (`fall.ts`): one body felled on one bed (`buildFall`); each way up is read on the
  [way-up drill](reference/rising.md#the-way-up-drill), a mind's whole rise on the [owner's
  target](reference/rising.md#the-owners-target).

## Rules and wounds

The rules (`src/combat/`) are one rulebook for the Arena and the Crypt (`Rulebook`), free of
any page.

- **Down** is the spec's rule (`DownSpec`, `src/control/ground.ts`): a human is down when a
  segment but its `bearers` is near its lowest point; a quadruped when it tips or sinks.
- **A blow has no striker** (`watchBlows`, `blows.ts`): two segments of two sides the solver pushes
  apart while closing have met (`watchTouches`), its energy half the reduced effective mass
  (`contactMass`) times the closing speed squared (`impactEnergy`). The surfaces share it as springs
  in series (`energyShares`); two rigid items meeting clash. Stiffness tables and the fist's
  threshold: [wounds](reference/wounds.md).
- **Damage**: a side's share times its mechanism's worth over `Rulebook.unit` (`sideDamage`). A
  held point breaches `Rulebook.layers` and goes in against `resistance` as deep as its energy
  drives it (`pointWound`). A bite wounds by the impulse it brings beyond a threshold load
  (`pointLoadDamage`).
- **Life** (`pool.ts`): one bar a body and one a limb. An empty limb bar cripples it
  (`crippleLimb`); an edge strong enough severs (`cutOff`). A body is out when slain, beheaded or
  maimed.
- **Levels** (`levelsOf`, `src/game/levels.ts`): a body with nothing to do and nobody near is `held`; any
  other is `full` in the fight and `limp` out of it.

## The screens

`src/app/browser/` is Vite's browser root. Its `index.html` holds the app shell; `app.ts` mounts each
screen's HTML from beside its UI code, selected by `?play=` (`src/game/route.ts`). The Character
Lab has its own `index.html`.

| Screen | Where | What it is |
|---|---|---|
| Arena | `src/game/arena/` | two bodies under a `Duel`, to a verdict; a person may lead a side |
| Crowd fight | `src/app/browser/arena/crowd.ts` | two teams (`crowdFight`, `TeamBout`) |
| Crypt | `src/game/dungeon/` | a party in a generated dungeon (`DungeonRun`), each side under a Commander |
| Lab | `src/game/lab/` | one body in a scenario (`scenarios.ts`) |
| Ratings | `src/app/browser/ratings/` | each evaluation's results; a drill's trials open in the Arena as a reel |

- **Links are recipes.** An Arena address is its bout's recipe (`recipeOf`); a reel (`#reel=`)
  plays a result's trials again from their subject and conditions.
- **The arena's solids are colliders** (`arenaSolids`), the same on the page and the stand; the
  visible room is checked against them (`validateRoomPlacements`).
- **Drawing** (`src/app/browser/render/`): a skin reads only segment poses; art comes through the
  asset pipeline ([assets](art/assets.md)).
- **Input, view and sound** are shared by the screens: `src/app/browser/ui/player-controls.ts`
  (orders: the left button or a lone finger), `ui/camera-controls.ts` (orbit and zoom: the middle
  or right button and the wheel, or two fingers), `ui/view-controls.ts` and `src/app/browser/audio/`.
