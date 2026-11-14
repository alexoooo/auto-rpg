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
- **One world step** (`World.step`, 120 Hz) owns physics, the clock and the order of its hooks;
  minds, control and blows run as hooks.

## The layers

A module imports its own layer or one below. Evaluation builds on game; application code
composes their concrete implementations. The gate ranks modules by path prefix, the longest a module
starts with deciding (`RANKS`, `scripts/source-boundary.mjs`), so folders inside a layer can be
ranked too, general below specific. Core ranks its root files (state, quantities, sources, physical
constants, refusals), `math/` and `data/` below `physics/`, then `bodies/`, then `world/`: a body
steps in a `StepHost` (`src/core/bodies/step-host.ts`), which the world extends. Skills rank
`framework/` and the root's `config.ts` lowest, then `reach/` (hand and arm geometry), `perception/`,
`locomotion/`, `intent/` (where to stand to act), `guard/`, `strikes/`, `recovery/`, and
`assembly/`, which composes a body's skill set. Minds rank their root (the mind contract, its runtime
and the decision library) lowest, then `catalog/` (configs, controllers, catalogs, entrants), `seat/`
(where a mind takes its body: the host, embodiment, mirror, order sheets, minds apart), `option/` and
`command/`, and the published barrel `src/minds/index.ts` last.

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
input and browser workers. Both bind the same `applicationContext` and `evaluationApplication`.
`GameContext` supplies the catalog, Commander registry, build identity, default mind, body refusal and the exact
registered technique set. Gameplay and evaluations receive it as an argument.

`tests/core-boundary.test.mjs` and `scripts/source-boundary.mjs` check declared import directions,
runtime paths and public entry points across source modules. Shared libraries never import entrants;
application composition imports their public manifests. Entrants import published library APIs
and themselves. A skill's variation (`src/skills/<area>/<skill>/<variation>/`, in the guards, locomotion,
the strikes and recovery) imports its own folder, the areas' shared code (`<area>/shared/`) and code
outside the areas, never another variation or skill; only its own skill's code imports it, and shared
code imports no skill's. Motor, balance, support, locomotion, gait, move-rule,
navigation, guard, aim, executor, recovery technique and leg adapter registrations, the parts of a
body on paws, Option component lists and the Commander registry live in `src/app/registration/`.
Commander lookup receives that registry; reusable implementations live in `src/minds/command/`.

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

Role owners augment `RoleParts` and `RoleConfigs`; each part adds its config to its role's map by kind.
`DataKey` is `keyof DataOf`. An implementation registers its owned loaders beside its components;
an entrant supplies them in its manifest. The application catalog loads the same registered keys
in Node and the browser.
The data store deep-freezes each loaded value before publishing it; loaders supply immutable
records and arrays.

## Spec and provenance

A `BodySpec` (`src/core/bodies/spec/body.ts`) is a body in its reference pose (metres, +y up, +z forward,
soles on y = 0): segments with mass, inertia, shapes and stiffness; a joint tree, each freedom with
its axis, range and muscle; effectors (a named point on a segment and the ancestor `base` whose
chain moves it); bearing ends; wounds; the down rule (`DownSpec`); and anything held. Its `model`
names a body for everything measured on it.

Segments declare named collision `configurations`, their initial configuration and any attachment
retention rule. `BodyControl.configurations` addresses a segment and a configuration in its spec;
the mirror and delayed transport encode those declared names. Human hand configuration meanings
live in `src/core/bodies/human/hand-configurations.ts`. Command views expose named point motion by
effector segment (`BodyView.pointMotion`).

- **Models** (`BODY_MODELS`, `modelSpec`, `src/core/bodies/models.ts`): the humans are built in
  `src/core/bodies/human/spec.ts`, the quadrupeds in `src/core/bodies/quadruped/spec.ts`.
- **A character** (`CharacterConfig`, `resolveCharacter`) is a model plus its attributes
  (`CharacterAttributes`) and its skills (`SkillChoices`, carried on its spec as `BodySpec.skills`):
  a list of each variation of a skill it holds, `skill/variation`, several of one skill if it likes,
  its named character's where it names none. The characters (`CHARACTERS`,
  `assets/characters/characters.json`, checked by `registryError`) are each a model, a label and
  skills, as many on one model as the file lists; each model has its own (`modelCharacter`: the
  Warrior, the Rogue, the Skeleton, the rat and the reptile), the one a model alone stands for and
  whose label names the model on a page (`modelLabel`). Each variation held is a skill of
  its own to its mind: its executor runs that variation (`Varied.variation`), named by the
  variation too where the body holds several of the skill, and is measured as it is held alone
  (`skillDigest`). A bout's recipe carries each side's model, its character where it is not the model's own
  (`DuelRecipe.characters`) and its skills (`DuelRecipe.skills`); the Arena's matchup names
  characters (`matchup=warrior,rogue`, a model's name standing for its own), and the Arena sets the skills by its panel and its link
  (`left.skills=straight-punch/drive,straight-punch/from-guard,stomp/stomp`, `src/game/skill-link.ts`). The physical keys and validation live in the body domain; editor labels,
  increments and help live in `src/app/browser/ui/character-attribute-info.ts`.
  A physique (`physiqueFigure`, `src/core/bodies/human/physique.ts`) scales one
  thing a factor: size every length at the same density, weight the mass alone, strength every peak
  torque, speed every muscle's unloaded speed; a combination whose nonadjacent segments meet is
  refused. Checked character and equipment admission returns a named refusal for invalid attributes,
  unrepresentable derived values, unsupported equipment or invalid geometry before a world is built.
  Haste raises only the legs' unloaded muscle speed.
- **Items** (`src/core/bodies/items/`): `HELD` is what a hand may hold; `armedWith` and `withLoadout` arm
  a body. Game defaults live in `src/game/model-loadouts.ts`; the representative evaluation roster
  lives in `src/evaluation/loadouts.ts`. An item's frame is y along the
  grip or blade, x across, z out. Families share code, never values.

**Every number in a spec is a `Quantity`** (`src/core/quantity.ts`): a value, a unit and its
origin. A leaf is `sourced` from an entry of `SOURCES` (`src/core/sources.ts`): a citation, an
asset file or one line on what it is tuned for. Anything else is `derive`d by a named rule whose
code writes no factor. Tuning is immutable: an experiment passes an override in.

## Arithmetic

A bout is the same double for double in every JavaScript engine. An engine's own `Math.sin` and
kin differ between engines in the last bit, so the core, and whatever builds a case's world,
computes with `+ - * /`, `Math.sqrt` and its own functions (`src/core/math/real.ts`, fdlibm's kept
operation for operation; `turn.ts`). A power is written as products. `EXACT_MATH` in
`tests/core-boundary.test.mjs` names the members of `Math` allowed.

The step's dear solves work in arrays made once with the body, which carry nothing between calls.
What a step allocates is held under ceilings (`tests/core-step-cost.test.mjs`); time, allocation
sites and heavy work are read with the [step-cost diagnostics](reference/step-cost.md).

## Build and engine

**The engine contract** (`src/core/physics/engine.ts`) names no engine's types: a fixed step that
writes every body's `Pose`; bodies that never sleep, with the spec's mass and the centre of mass's
velocity; friction `CONTACT_FRICTION` unless a material names its own, no bounce; freedom k as
angular axis k of the joint's frame, limited as `jointAngles` reads it; a motor as a velocity
constraint with a torque ceiling each way (`setMotorBounds`), its whole-step impulse read back
(`motorStepImpulse`); contacts with the solver's impulse (`contactsOf`, `tellContacts`); a joint
that comes apart (`EngineJoint.release`); grips (`addGrip`); a whole-world save and in-place load
(`PhysicsWorld.save`, `load`), refused by a world built otherwise.

- `engines.ts` lists the engines (`ENGINES`, the game's `DEFAULT_ENGINE`) and is the only module
  that imports one. A new engine passes the physics bench (`src/app/browser/physics-bench/`), then
  `CORE_ENGINE=<name> npm test`.
- `rapier.ts` implements it, its wasm loaded once a realm (`rapierModule`), its solver
  conditioning named `SOLVER`.

**Build** (`buildBody`, `src/core/bodies/build/build-body.ts`) makes an engine body a segment and a joint a
spec joint, a held item's mass folded into its segment, the body in the pose its joints demand (a
fighter's guard, `builtAngles`). Readings back: `jointAngles`, `bodyDynamics` (mass matrix, gravity
and bias), `contactMass` and `contactGive`.
Construction owns completed allocations until the body takes their lifetime. Equipped specs are
deep-frozen before caching. Joint frames require mutually orthogonal axes; reference clearance
uses capsule-to-hull closest distance and hull separating axes, including pairs of edges.
Physics snapshots require the same gravity and configured rate as well as the same constructed
topology and recipe; an incompatible load leaves pending commands and solver state unchanged.

- **Toes** (`src/core/bodies/build/toes.ts`): a massless slab hinged at the ball, bending as the heel
  lifts; the stance reads the sole from the box and the toes (`src/control/support.ts`).
- **Separate items** (`createEquipment`, `src/core/bodies/equipment.ts`): an item as its own body,
  gripped by joints after geometric capture. Trusted world code owns its lifecycle and supplies
  equipment observations where an inspector needs them.

## Muscles

`driveMuscles` (`src/core/bodies/muscle/driver.ts`) turns each freedom's activation and speed into a motor
target and torque ceilings: activation times the peak torque that way times the joint's strength
times Hill's force-velocity factor (`force-velocity.ts`). A speed beyond reach is a torque at the
ceiling; zero holds.

- **Strength** is state on the body (`BuiltBody.strength`), read wherever a peak torque is
  (`strengthAt`), lowered by a crippled limb (`crippleLimb`). A side may have a tendon in series
  (`MuscleSpec`), a spring while its muscles push.
- **A body runs at a level** (`BodyLevel`, `MuscleDriver.setLevel`): `full` (mind stepped, motors
  driven), `limp` (motors released, no mind), `held` (released, every segment fixed). Leaving
  `full` the mind is told (`Mind.interrupt`); back, it goes on from the body as it is. The level is the
  rules' ([Rules and wounds](#rules-and-wounds)).

## Motor control

Motor control (`src/control/`) turns a `BodyCommand` (a posture, effector goals, timed pushes,
driven points, a stance goal) into muscle commands.

- **The command layers** (`commandLayers`) are what a mind builds on its own body: a `LayersMind`
  over its motor, read each step through a `BodyView` (`src/control/body.ts`); they are independent of
  skills and deciders. Their options supply the motor and its calibration. The application's
  standalone body builder (`src/app/stock-body.ts`) supplies the stock whole-body motor when
  a study names none.
  A selected motor declares its support reference; `BodyView.standing` is null when it supplies
  none. Skills declare the support reference, stance or support goals they consume as open
  `Requirement`s; admission checks them against the configured motor before construction.
  The application supplies the stock balance and its calibrated envelope (`src/app/registration/stock-motor.ts`).
  Its immutable per-body stance settings live in [the calibration record](../assets/skills/locomotion/stance/stance-calibration.json);
  staged recovery profile identities include the selected calibration. Neutral envelope interpolation
  stays in control, and locomotion owns its measured asset readers.
- **The motor** is a part of role `motor` (`MOTORS`); the game's is the whole-body solve
  (`motorControl`, `solve.ts`): the bearing solve and the servo in one weighted least-squares
  problem, a torque past strength pinned and solved again. A body on paws has the paw support
  (`pawMotor`, `src/control/quadruped/paw-motor.ts`), which carries a support over its paws
  (`SupportGoal`). A motor says what goals it carries and what it left undone
  (`MotorControl.carries`, `unmet`). Both motors carry explicit joint angle, rate and acceleration
  paths through the servo; an explicit path takes precedence over an effector's coordinate on
  the same freedom, while the support solve retains its owned channels.
- **Effector goals** (`EffectorGoal`, `kinematics.ts`): named points of an effector follow
  minimum-jerk paths to places in the root's frame, `through` a place or `follows` a moving end; a
  `firm` goal braces the limb through what it strikes. Only the channels between an effector's base
  and its segment are its reach. Goal equality belongs to the endpoint tracker and compares every
  path and tracking field before the command layers suppress a repeated goal.
- **The bearing solve** (`bearing.ts`) asks the wrench the aim needs, shares it among the ground
  patches within friction and centre of pressure, and gives each limb its inverse dynamics; what the
  patches miss is asked of the assist.
- **Balance** is a part of role `balance` (`BALANCES`); the game's is the stance
  (`stance-balance.ts`): the centre of mass kept inside the support by forces the ground can give,
  steps placed from the capture point, a body without box soles refused. What a body was measured
  to hold is its envelope, read by model from its implementation in `assets/skills/locomotion/`.
  Each balance supplies its calibration through its motor; command-layer wiring reads that result.
- **The assist** (`Assist`, `assist.ts`) is a force at the root and a moment that no muscle gives:
  asked by the mind, shortened to the body's ceiling, applied through the solver step, metered. The
  ceiling is the character's balance, a per cent of its weight (`Rulebook.balance`,
  `balanceCeiling`); with none it gives nothing.

## Skills

A skill set (`skillSet`, `src/skills/framework/arbiter.ts`) turns an `Intent`
(`src/skills/framework/intent.ts`) into a `BodyCommand` each step: locomotion, guard and low support
beneath, executors running discrete actions over them. Every skill answers `Skill.resume`; the
arbiter releases every action when another mind takes the body.

What a mind holds is one object (`Skills`, `skills.ts`): `command` and `release`, its `state`, and
what the mind reads and asks of each skill under that skill's name (`legs`, `navigation`,
`actions`). How each is going is under the same name in its `report` (`SkillReport`). A decider is
given the same groups in what it sees (`Sight`, `sightOf`).

- **An action** (`ActionRequest`, `action.ts`) has an id, a name, an effector and a sensed target
  region. Admission reads readiness and reserves resources (joints, effectors, segment configurations, support limbs and whole-body assist);
  actions overlap where reservations allow. An executor runs `prepare`, `commit` and `release` and
  ends once (`Ended`). It never closes distance; the decider does.
  Resources distinguish physical segments, pose channels and services. Support reservations read
  the body's declared bearing chains independently of optional effector actuators. Each control a
  resource holds is a slot compiled once to an integer (`ResourceMap.slots`, `action-resources.ts`);
  a step's ownership, reservations and default owners are arrays by slot in the arbiter's state,
  named for a report only when read (`SkillReport.holders`, `defaultOwners`).
- **Parts.** Each kind is a line of its role's list (`EXECUTORS`, `GUARDS` and the like), its
  module owning its config's keys, defaults, faults, fit and maker. A body builds only the skills
  it fits (`Slot.skills`). What lies under every skill (the motor,
  the legs, the guard) is the one game part of its role that fits the body (`PartLookup.fitting`,
  `filledOf`); two fitting is a fault of the build, and an experiment passes another in
  (`OptionMindConfig.tuning`).
  Admission resolves stock settings plus overrides through the implementation's execution
  predicate. Skill assembly constructs configured aims once and roots their memory in `Skills.state`.
- **Tuned per body**: a skill that reads a record (`Part.reads`: the blows, step up's and the
  sit-back's poses and timings, the righting's recipe) has its settings as its body's record (`SkillRecord`),
  read as mind data by model from its implementation in `assets/skills/` (`dataOf`). A body with no record
  does not use the skill. Logic of a character's own is never a branch on its body in shared code but
  a variation it chooses (**Strikes**, below). Step up's record may adjust the recovery poses and timings by loadout.
  Implementations register loaders in `data/registration.ts`; an entrant adds its loaders to its
  manifest's `data`. The catalog supplies those loaders to the store (`DataKey`, `keyof DataOf`)
  through `Catalog.loadData`, with the same registrations in Node and the page. A loader declares
  whether its identity is the whole dataset or the actual subject record used by its consumer.
  Parts declare data their compatibility checks read in `Part.fitReads`; the browser shell loads
  it through `Catalog.loadFitData` before opening a game screen's setup.
- **Locomotion** (`Locomotion`): legs take one goal (`LegsGoal`) and say what they left undone
  (`LegsUnmet`), their envelope and how fast they stop. Each declares the bearing ends
  it controls (`supports`) and its default lowering (`lower`). `stance-walk` walks within the stance's
  envelope; `walk-run` hands over to a run cycle fitted to motion capture
  (`assets/skills/locomotion/cycle-run/run-cycle.json`) that drives the legs, asking the assist only to right the pelvis,
  its settings its body's record (`assets/skills/locomotion/walk-run/walk-run.json`) where it has one, else the defaults
  scaled to its leg (`scaledGait`); each is a gait part (role `gait`).
  A walk/run record can supply one travel actor beside a frozen reference
  (`src/skills/locomotion/walk-run/walk-run/learned-run.ts`). The actor reads mirrored gait observations, requested
  velocity and facing every recorded `interval` seconds. It corrects running joint velocities
  and native stance height and heading within its record's bounds. A changed pace restarts
  its decision schedule; an answer acts from the next control step. Travel control continues
  through stopping; braced movement retains its native stance. Observations, actions, reference
  offsets and the learner live in the gait's saved state.
  A record can supply its travel envelope independently of the braced limits, with eight
  directional operating speeds interpolated between adjacent headings. The game's network and
  the trainer answer the same learner. The actor trains on its drill's twin
  (`research/skills/locomotion/environments/run.json`: Travel's `confirmation-twin` played by the
  case environment on `option-drill`, the run gait steered, `gaitLearningMind`), each episode
  valued as the cell values its trial (`Evaluation.terms`, `ordersValue`, a fall at `FALL_PRICE`).
  A gait's settings reach a drill case as its research `tuning` (`withGaitTuning`), a stance's as
  its balance's (`withStanceTuning`, `stanceBalance`); the walk's and the run's searches and screens
  play their rows' twins so (`research/skills/locomotion/move-drill.mjs`), checkpoints among them
  (`travel-screen.mjs`), ranked by the time they lose. The earlier
  `research/skills/locomotion/travel-environment.mjs` trains
  scripted orders of its own through Option Mind from quiet rest and reached moving starts. Training can
  vary the settled rest time and rotate the body and its order scripts together. The weighted
  scripts in `research/skills/locomotion/travel-curriculum.mjs` retain the seed's forward entry
  alongside moving holds as pace changes and stops are added. The lone-body world saves physics, perception, orders,
  wind and controller state so its reached running starts can be restored.
  `move`, the legs (role `locomotion`), goes by the gait its goal names, else by its rules. It
  shares gait instances only for identical complete configurations. Each stock gait is its own
  controller with its own settings: braced is the stance walk, the run the walk and run by its
  body's record. While another gait is wanted, Move asks the current one for the walk no faster
  than the wanted gait's envelope holds, and changes gait between steps once the legs are back
  with the stance and the body's speed fits the wanted gait's envelope. The new gait takes the
  body up as it moves. Walking steps read their gait's envelope inside the stance controller as
  well as in order planning.
  Idle foot placement waits until the body has stood still `IDLE_SETTLE`, steps as a walk
  does, and approaches the new support centre gradually after landing. The placement remains
  active through the final centering motion.
  A body on paws has `paw-move` (`src/skills/locomotion/paw-move/index.ts`): the trot and the crawl, the support goal
  each step for its motor.
- **Learned decisions** (`Learner`, `src/core/math/learning/learner.ts`): a learned controller
  calls `act` before its step's commands, taking the answer in force, and `ask` after them; `ask`
  is true every decision interval (seconds, rounded to whole control steps, at least one), when
  the controller reads itself into `inputs`. A native policy answers the pending request in
  `act`; a trainer answers between world steps (`answer`). Either way an answer acts from the
  control step after its request until the next answer, so native play and training step alike.
  The learned run, the punch and the bare entrant decide this way; every training environment
  steps from one request to the next through `research/learner-adapter.mjs`.
- **Skills** live in an area of `src/skills/` (`guard/`, `locomotion/`, `strikes/`, `recovery/`), a
  folder a skill: the skill's part (`straight-punch/index.ts`, `walk-run/index.ts`) names its
  variations, and a variation with code of its own keeps it in its own folder (`stomp/stomp/`,
  `walk-run/walk-run/`). What two skills or variations do alike is one implementation in the area's
  `shared/`, which imports no skill's code, each calling it with its own settings and options
  (`locomotion/shared/locomotion.ts`, the stance walk's and the walk and run's legs). A strike
  variation's settings are
  `assets/skills/strikes/<skill>/<variation>.json`, by model, its data `dataOf("<skill>/<variation>")`.
  A skill's part fits only a body whose character has the skill and runs the variation it chose
  (`variationFault`, `heldVariation`, `src/skills/framework/variations.ts`), so the Option Mind
  offers only the character's skills; a strike's digest names its variation (`skillDigest`).
  Every skill part is a skill a character chooses so, whatever its role (`Part.variations`): the
  guards, Move and the paw gaits, the gaits, low support, the recovery techniques and the
  navigations as the strikes. Each but a strike has one variation, named as its skill
  (`walk-run/walk-run`), made by its part's `index.ts` (`variedMake`, a guard's `guardVariations`, a
  technique's `technique`); a body built without a character (`humanoidSpec`) holds none, so
  whatever runs skills is built from its model's character (`modelSpec`).
- **The straight punch** (`straight-punch/index.ts`, its drive `shared/straight-drive.ts`) drives the arm flat out at a contact pose solved
  each step, on a timed schedule (`TimedPush`). Steered, a network (`shared/steer.ts`), deciding every
  interval its layout names, adds to the trunk's and arm's pushes, asks the legs and keeps or halts the walk; it is its body's record
  (`PunchRecord`), trained by `research/run-train.py` and exported by `research/skills/strikes/straight-punch/punch-export.mjs`.
  Its `drive` variation begins once the stance is quiet and settled; `from-guard` (`straight-punch/from-guard/`)
  also waits for the striking arm at its guard and still (`StraightDriveOptions.ready`), with the same record.
- **Held blows** strike with what the hand holds (`StrikingFace`), naming the mechanism they meet
  with (`ExecutorPart.meets`). The sword thrust (`sword-thrust/index.ts`) is the same straight drive with
  the blade's point, through which `faceAligner` servos the wrist onto the line to the target; the
  club blow and the bonk (`club-blow/index.ts`, `bonk/index.ts`) are one swing (`shared/swing.ts`), each winding up to its record's angles,
  pushing on its `TimedPush` schedule and returning to guard.
- **The stomp** (`stomp/stomp/`) is a strike cycle down from a high chamber onto a body lying ahead. A
  strike's window (`strikeWindow`) keeps the two bodies clear.
- **The bite** (`bite`, `src/skills/strikes/bite/bite/`) is a strike cycle of the jaw on a crawl:
  the head driven to the mouth's goal, the jaw opened and closed on its path, aimed by the first
  exposed surface along the jaw's arc (`first-exposed`, `jaw-aim.ts`), its tooth carried with the
  aim (`Aimed.with`).
- **The guard** (`GuardPart`) supplies a reference posture and declares its covered effector
  segments. Stock guards own the arms' rest: where the body is built, where free hands go,
  where a blow returns; it may set a told hand between threat and target, or a buckler's face toward
  the foe's weapon; a body with no hands has the guard at rest (`rest`), which holds nothing.
  **Low support** (`support-fold.ts`) folds the stance onto a planted base for low blows.

**Stand up** (`src/skills/recovery/`). A body down rises by techniques (`TECHNIQUES`): the ways up,
each with edges (`isWayUp`), and the modes of the ground, with none (brace, land, steady, flatten).
Each is a ground skill (`groundSkills`, `skills.ts`), an executor holding the whole body and
asking no stance; a ground action is prepared while its run yields and committed once it does
not. A way up stuck against an object is let go, ended `obstructed` (`STUCK`): no stage it has not
been in this try (`TechniqueRun.stage`) and the body no higher for 3 s, while it or what it holds
has touched a solid that does not bear it from below (`GroundReading.against`); the Option notes a
failed try, and the staged roll's next try rolls over its other side. A posture (`Position`) names what bears the body, read each step by the ground reading
(`groundReading`) from its spec's ends (`BodySpec.ends`), so any body has one: on the ends its
stance stands on it stands, on its trunk it lies (named by the side up), and between it is named by
the ends that bear it. A way up names the postures it begins from and reaches (its `edges`), begun
`moving` or `still`, handing the body on at the first cut read slow enough (`CUTS`, `HAND_OVER`);
the Lab's ways up (`STAND_UP`, `src/app/browser/lab/ground-scenario.ts`) reach standing from the back and
the front (`standUpFaults`). The
Option Mind prices each way up, flatten and a brace that waits for one by their profiles from
where each was begun (`assets/skills/recovery/edge-profiles.json`, `research/skills/recovery/edge-profiles.mjs`: its own tries
in falls the stand-up target does not play, each until its next choice), as every Option is
priced. The staged riser (`stagedRise`) plays a `Recipe` of pose and bearing stages
(`shared/staged/stages.ts`); its bearing policy (`Recipe.takes`, `bearing-policy.ts`)
selects the channels that prioritize a contact task over the posture. A pose's selected channels can follow other joints folding across an angle
span (`PoseStage.follow`), keeping their entry pose until every leading joint enters that span.
A body on paws rights itself by its recipe of poses from lying (`righting-recipe/`, its record
`assets/skills/recovery/righting/righting.json`) and by routes that roll it, place each paw and rise on
its motor (`righting-routes/`). Each technique declares its physical segment bindings and opaque start
tokens; bilateral techniques own their side adapter.

## Minds

**The seam.** A `Mind` (`src/minds/mind.ts`) requires `state`, `act(control)`, `think(senses)` and
`interrupt()`. Each step its fast action sends commands before its next decision. It is made with
its own body (`OwnBody`), fixed step duration and first senses; subsequent senses arrive only in
`think`. Its memory is plain saved data in `state`. A person gives `Orders`
(`src/minds/orders.ts`), never muscle commands.

**A body is a different type to each holder.** Where they meet (`seat/host.ts`) each value is
named by its type's word: `built`, `own`, `commanded`, `physical`.

| Type | Where | Who holds it | What it is |
| --- | --- | --- | --- |
| `BuiltBody` | `src/core/bodies/build/build-body.ts` | the world's side | the body in the engine, with what acts on it |
| `ReadBody` | `src/core/bodies/read-body.ts` | a mind and its skills | the built body's readings alone; nothing in it moves a body |
| `OwnBody` | `src/core/bodies/own-body.ts` | a mind's maker | what a mind is made with: the spec, the readings (`ReadBody`), the muscles' and assist's reading side, the first senses |
| `Body` | `src/control/body.ts` | whatever drives the command layers | the body under motor control: a view to read and a command to hand back (`Body.drive`) |
| `PhysicalBody` | `src/minds/seat/physical-body.ts` | a fight | the body whatever its mind: the built body, whether it is down, who has it, its level, its saved state, its disposal |

A `HostedBody` (`src/minds/seat/hosted-body.ts`) is a `PhysicalBody` that also carries the `Body`
under its command layers (`commanded`): what a Lab mode, a drill or a test builds outside a fight
(`commandedBody`).

**What goes into a build and comes out of it**, in the order the calls are made:

1. A fight calls `createMind` (`seat/create-mind.ts`) with a body, a config and a `MindWiring`
   (`catalog/controller.ts`): the mind's name, what the fight grants the body (its senses, its
   assist's ceiling, its contact labels) and what the maker reads (the seed, the phase, the rules,
   its orders, an experiment's settings).
2. `createMind` makes the `BodyHost` (the type in `mind.ts`, made by `bodyHost` in
   `seat/host.ts`) and calls the kind's `Controller.create(host, config)`, which the catalog finds
   by the config's kind. The host is all a maker is given.
3. The maker takes the body once (`BodyHost.take`), handing over a `MindConstruction`: the `Mind`
   (the object with `act` and `think`), its name, who has the body (`has`) and its disposal. A
   `CommandedMind` (`sub-mind.ts`) is a construction whose `Mind` hosts the command layers, with
   the `Body` their drivers command. Taking the body hooks the `Mind` to the world's step
   (`embody`, `seat/embodiment.ts`): the fight holds no reference to it.
4. `create` returns a `MindMade`: the mind's memory above its body's, and its skills and report
   where it has them. `createMind` returns a `Minded`: what `create` made as it is, with the
   mind's kind and the body as the fight holds it (`mindHere`). Where the mind reports, the report
   reads what it last said (`saidReport`) and the memory holds that beside the mind's own
   (`SaidState`). Where the world runs its minds apart, the mind is made there instead
   (`mindApart`): the fight holds its body and what it last said, never its skills or memory.

**How a mind is stepped.** On each world step that simulates its body in full (a control step),
the body's hook on the world (`embody`) calls `answer` and then `think` (`execution.ts`): `answer`
calls `Mind.act`, which writes the command decided on the step before; `think` reads the senses
and calls `Mind.think`, which decides the next.

`OwnBody` holds fixed facts, body and actuator readings, and first senses. `BodyControl` views the
saved mirror command directly: muscle arrays, assist vectors and ordered segment/configuration pairs. Only
`act` receives it. A configuration request updates its requested value immediately and refuses a duplicate
before the answer; the answer clears the pairs. The body-side rings carry commands into physics.
`embodiment.ts` wires the world and mirror, `execution.ts` defines the shared `answer` and `think`
phases, and `src/core/bodies/command-pipeline.ts` owns delayed physical actuation. Command-layer
research settings belong to `LayerOptions` in `src/control/body.ts`.

- **The host** (`BodyHost`, `mind.ts`) is all a mind's maker gets: the spec, the clock, the parts
  its config may name (`PartLookup`), the seed (its only chance, through `randomStream`), its phase,
  the rules, its orders, an experiment's settings, and one way to take the body (`take`).
- **Senses** (`Senses`, `senses.ts`): the clock, its side and life, and every other body
  (`BodySense`), read once before any mind (`createSenses`), others late by `Rulebook.reaction`.
- **What a mind builds**: the command layers (`commandedMind`), sub-minds that take the body in rank
  order (`SubMind`, `hosting`), or its own computation. The bare entrant reads network inputs
  directly and saves pending pulls for its next `act`; `observeBody` supplies detached inspection.
  A stateful driver supplies `SplitDriver.state`, retained under the command-layer Mind's saved
  state; `driveBy` includes its supplied skills, decider, pace and aim memory there.
  Stock standalone probes compose their skills in `src/app/standing-skills.ts`.
- **Deciding.** A decider (`Decider`, `decider.ts`) decides an intent at its pace (`Pace`), and at
  once when the body is back from another mind, its orders change or an action ends; the skills
  make the command every step from the intent last decided.
- **The report** (`MindReport`, `report.ts`) says what a mind is engaged in, weighing and doing,
  read without moving its state. Screens and Commanders read the report, never a mind's kind or
  state. Each field's owner gives it a new value when it changes and never writes into one: the
  prospects, the gaits' limits, navigation's report, the actions' statuses and the ledger. Each
  answer takes the fields whose values are new by identity and deep-freezes them (`saidNow`,
  `apart.ts`), so what a mind said stays what it said, and a write into a said value throws where
  it is made; a mind apart sends only those fields. What it said belongs to the saved Mind state.
  The profile provider saves its completed-decision engagement details; the menu reads current
  skills, and its aims answer as the mind's own ask would, keeping nothing they find
  (`keepingNothing`, `AimAsking`), so a Commander or a screen reading it every step moves nothing.

**A mind is its config.** A `MindConfig` is plain data tagged by kind; `createMind` (`create-mind.ts`)
makes it by the kind's `Controller` found in a `Catalog` (`src/minds/catalog/catalog.ts`). A mind is a
tree of parts (`Part`, `parts.ts`), each with a role, a stage, slots and defaults, saying
why a body cannot carry it out (`fits`) and what is wrong with its config (`faults`). `Part` holds
only what every part has; what the mind editor shows of one is beside it (`Edited`, `fields.ts`),
and what one role does more is in that role's type. Roles are an open list (`RoleParts`),
augmented beside each role's contract. `treeFaults` names each fault by path. `tuning` never
travels in a link.

**A part holds other parts in three ways, each declared once.** What its config says: in a slot
(`Part.slots`), or outside one at a path it declares (`Part.children`). What its config does not
say: `Part.supplies`, the one place a part names what an empty slot runs (`whenEmpty`), a default
where the config names none, and the parts it picks among by the body. One walk (`eachPart`,
`tree.ts`) visits all three; what a part supplies is visited with a null path. A read of what the
config says skips a null path (`fitRefusal`, `treeValidation`, a description's paths): the part
answers for what it supplies in its own `fits` and `faults`. A read of what a case runs keeps
them (`treeKinds`, `treeData`, `partRequirements`).

**What is read of a tree is a plain function given the lookup** (`PartLookup`). In
`src/parts/tree.ts`: what is wrong with a tree (`treeValidation`), why a body cannot carry it out
(`fitRefusal`), what it requires of the motor (`partRequirements`), and its copies without tuning
or with one place replaced (`withoutTuning`, `replacedAt`). In `catalog.ts`, those that ask a mind
or an entrant: the kinds and the data a case of it holds (`treeKinds`, `treeData`), the entrants
it names (`scopesOf`), and a scenario's entry rules (`entryRefusal`). `catalogOf` registers the
lists (`registryOf`), makes the lookup over them (`lookupOf`) and hands these out as the
`Catalog`'s members.

**A slot's config is typed by its role** (`ConfigFor<"chooser">`, `lookup.ts`): one of the kinds
the role's parts register, each adding its config to the role's map beside the part
(`RoleConfigs`: `OptionConfigs`, `ExecutorConfigs`, `TechniqueConfigs` and the rest), or a kind an
entrant registers, scoped `<name>:<kind>`. A config field that holds a part says its role
(`OptionMindConfig.chooser`, `StrikeConfig.skill`), so a kind no part registers fails to compile
where a preset names it. Code that only reads a config of any role takes a `PartConfig`. The
toolkit's lists hold a part for every registered kind (`Covered`, `toolkit.ts`).

**A lookup by kind is followed in two steps.** `parts.of("gait", config).make(...)` picks its part
when it runs, so go-to-definition on `make` lands on the role's interface (`GaitPart.make`). From
there the editor's "go to implementations" lists every part of the role. A part is found because
its object names its role's type where it is written: `deepFreeze<GaitPart<C>>({ ... })`, a
factory's `controller<C>({ ... })`, or a literal typed by the role. Most techniques are one step
further: `technique` (`bilateral.ts`) builds the part around the `make` each is written with, so
its `make` there leads to the callers (`FLATTEN`, `BRACE_MODE`) that hand theirs in.

**What a fight asks of a mind, the mind answers** (`Controller`): what it strikes with
(`strikes`), what it holds that it has a use for (`supportedEquipment`), whether it obeys orders
(`obeys`) and what its phases are called (`phases`). The catalog asks the controller and walks no
tree for these (`stageRefusal`, `treeObeys`, `phaseLabels`). Option Mind answers from its Options
(`OptionPart.strikes`, `obeys`, `phases`) and its guard (`GuardPart.supportedEquipment`).

**Option Mind** (`src/minds/option/`, `optionMind`) is a reusable decision framework. Its entrant
(`src/entrants/option/`) owns the ordered assembly and presets; the application registers the
shared root kind `option` with its defaults (`src/app/option-controller.ts`). Every Option but a
blow is one list (`BASE_OPTIONS`, `standard.ts`, the Options a body gets up by `RISE_OPTIONS`
among them): the application's defaults are that list, and an entrant adds its blows to it. It chooses among
options of the kinds in `OPTION_KINDS`, each a skill applied to a target (`Option`): its entry
(`Readiness`), the resources it claims, its model at the state now or one an Option leaves the
body in (`Option.model`, `placed`; `Terms`: duration, what it deals and takes, and the ways it ends,
each a state with its chance, `Outcome`), its step, and a status.

**How an Option Mind is built** is four files in `src/minds/option/`. `mind.ts` is the controller
the catalog registers (`optionMind`): its slots, whether a body fits it, the posture its body is
built in. `config.ts` is the config (`OptionMindConfig`), its defaults (`resolveConfig`) and what
is wrong with it (`optionMindFaults`). `description.ts` says what a config builds, for a screen
(`describeOptionMind`). `build.ts` declares the running mind (`OptionMind`: its skills, state and
report) and builds it (`buildOptionMind`) in six steps:

1. the parts under its skills, its motor, legs and guard (`filledOf`);
2. what its Options name of the body's skills (`skillsOf`), which with those parts is what its
   skills are made from (`SkillParts`);
3. the body, taken from the host under command layers (`commandedMind`);
4. its skills on that body (`groundSkills`, `configuredAims`, `makeSkills`);
5. its decider, the session its predictions part builds (`OptionEvaluation.build`);
6. the decider made the body's driver (`driveBy`, `Body.drive`).

Under the command layers, `Mind.think` asks the decider what to do, at its pace, and `Mind.act`,
on the next step, has the skills turn that answer into the body's command.

The selected evaluation provider constructs a complete decision session through `OptionEvaluation.build`,
with its compatible Options, chooser protocol, situation reader and saved memory. Admission checks
the protocol identifiers before construction. The stock profile model owns its tables and
`ProfileOptionContext`; an independent provider supplies its own model without the profile schema.
Components declare their data, phases and order-taking capability. Profile recovery Options
declare whether they offer ascent or fallback transitions; route admission and brace readiness
read the same declaration. The public Option entry point
publishes the evaluation contract and the profile model's `Seen`-typed percept and prediction
contracts. Controller descriptions expose
configured components, command owners and their actual configuration paths to editors, inspection
and evaluation adapters.

The profile model supplies these components:

- **Percepts** (`PERCEPTS`) and **predictions** (`PREDICTIONS`) are read into the `Situation`
  the first time a step asks for each and kept for the step (`perceiver`); predictions price from
  measured profiles (`Profile`, `src/skills/framework/profile.ts`),
  a stale one unread and a model with none priced by its prior. A measured predictor may receive
  immutable ground profiles (`edges`) for the skill settings an experiment runs. A profile is a sample of
  trials, a strike's thrown in fights (the Strike drill's `fights`) and a ground Option's tried
  in falls, each keeping what it brought and where it began (the range, the foe's phase,
  both postures, the velocity in its target's frame, `startVelocity`, and, for a skill begun from
  a window, where in it the body stood, `placeInWindow`); a reading takes the trials nearest the
  start asked at, its velocity and place read within the spans its trials began at, and a
  rate of blows reads each trial's run and its limb's way back to its guard. A blow the foe has not
  begun reaches the body only after the foe's latency (`Pressure.latency`: its rethink, its
  command's delay and its fastest blow), spent as the body stays within its reach and restored as
  it stays out (`reachMemory`).
- **The objective** (`OBJECTIVES`): `few-terms` values a path in a share of a body's life: its
  orders at the person's `OBEDIENCE`, and the life it trades, valued as itself at the bout's start
  and by the lead it leaves at the clock's verdict at its end (`lateness`).
- **The chooser** (`CHOOSERS`) runs the toolkit's set selection (`selectSet`,
  `src/minds/choice.ts`): the best option on offer, then the best whose claims are still free,
  rest options last; a running option that does not yield keeps its claims. The set's step is one
  intent (`stepSet`). It decides afresh on the cue of a percept its last decision read (`Cues`),
  at an exit, or on its phase. The valued chooser prices each option by a search over the models,
  one or two deep, over its horizon (`ValuedConfig.horizon`): a line runs its option, then at each
  way it ends the best single option from there, and ends in the best of holding there, an option
  that leaves the body where it began run again (its life each try, its orders once), and a walk
  to any Option's site (`Option.sites`), then the best held or run again there;
  each path is priced whole and a line's worth is its outcomes' worths by their chances. The tree
  chooser prices each option by a Monte Carlo tree search over the same models and leaf
  (`treeSearch`): a fixed count of runs a decision, each going down by upper bounds scaled to the
  spread of its siblings' worths, drawing each option's way of ending by its chance from a stream
  kept in its state; an option is worth the states its drawn ways of ending lead to, by their
  chances, and a state the more of its leaf and its best option run, so a search is never worth
  less than its leaf. It goes deep where few options are on offer. The application's default
  config names the tree (`src/app/option-controller.ts`). The ranked chooser
  (`RANKED_CHOOSER`), the drills', prices nothing: firm orders first, then the first option on
  offer in its mind's order, then the first of the rest whose claims are still free. Profiles and
  the tree are for fights and for measuring profiles; every drill and skill search runs
  `option-drill`, on its priors with the ranked chooser, so it drives its skills by a fixed order. `research/lying.mjs` reads a mind's time down in the
  match's bouts and the cost of its steps.
- **The search's storage** keeps its arithmetic and call order. A search gives each Option and
  target a slot (`space`, `Pair`) and the frozen ask its model is put (`Pair.ask`); each situation
  owns one row of model results (`undefined` unasked, `null` a refusal), its own offers
  (`pairsAt`) and those a held or an arrived leaf reads (`readsAt`). The states made from a
  situation are told apart by the fields their leaves name, compared as a string key would (`Made`,
  `madeFrom`: -0 as 0, NaN as NaN, absent apart from present). Predicted situations share
  read-only overlays of sight, report and prediction (`placing`), their fields defined through one
  reused descriptor (`placedWith`). A line's step is written into a frame for its depth
  (`stepInto`), released when its deeper lines are priced; a tree edge keeps a step of its own, and
  a cut edge's ways of ending share one empty store (`NO_ENDS`). A tree decision reads pressure
  through an exact cache of range and velocity starts (`cachedPressure`), and a limb's prior is
  made once for its numbers (`prior`). A profile query reuses the distances its nearest search
  computed, in frames by call depth. Once a search's runs finish, its root edges are copied into
  result records (`pricedLines`), releasing the tree.
- **Where to walk**: an Option names its sites (`Option.sites`, `Site`), the spots it would begin
  from if not where the body stands: a strike whose readiness gives a window to be brought to
  (`Readiness`'s `position`) names a spot in it on each side of a body lying (`windowSpot`, `Side`),
  holding the nearest spot out of the foe's reach, holding at a place (`hold-at-place`) the place.
  A body down reads no window: a strike's site there is the spot last read with the body up, moved
  as its focus has moved since (`Stood`), so a state predicted standing finds its sites.
  The walk (`walk`, `walkBy`) is one Option a gait of the body's legs, meaning go to a place by that gait; its targets
  are the sites its mind's Options name (`Sites`), which it reads as spots (`Spot`) and knows
  nothing else of, and the search prices a walk to one by what it finds where the walk ends.
  No attainable pace gives no walk model; pressure sampling is bounded by the chooser's horizon.
  Without a measured envelope, an explicit numeric order supplies the pace used to price obedience.
- **Its config is Options** (`OptionMindConfig`): its chooser, what it predicts from, its rate and
  its Options in rank order. Each Option names the skill it uses and how: a strike its executor
  (`skill`), its limbs by role (`LimbRole`: either hand, a free hand, the holding hand, either foot,
  the jaw), its regions, its aim and its low support; a way up or a mode of the ground its
  technique; a walk its gait and its navigation. A body builds the skills its Options name that it
  fits (`skillsOf`). Construction and editing share static applicability (`optionApplies`):
  admitted skills, the selected locomotion's gaits and each Option's declared capability check.
  The editor retains inactive entries in the configuration when the body or equipment changes.
  A config names a limb's role (`limbsOf`).
- **The strikes**: each blow is its own kind of option naming its skill (`StrikeKindPart`,
  `strike-<skill>`: `strike-straight-punch`, `strike-club-blow`, `strike-bonk`,
  `strike-sword-thrust`, `strike-stomp`, `strike-bite`), a strike (`strike`) of the action it asks of its
  executor on its body (`strikeAction`), one Option a limb (`limbAction`): a punch on empty hands
  is two Options, each priced by its limb's profile. An action is named as its skill; where a mind
  uses one skill in two ways (a club's bonk at the head and its swipe at the trunk), each is its
  own strike, named by the skill and what tells its use apart (`strikeName`: `club-blow (high)`).
  Two strikes alike in skill, limbs, regions and aim, or by one kind of skill set two ways, are a
  fault of the config. A person's order, and a drill's, names a skill the body has, its limb and
  its target (`Orders`: `skill`, `limb`, `region`; no limb, any that fits), which every strike of
  that skill with that limb keeps to (`orderAllows`). A drill's orders are firm (`Orders.firm`):
  the strike they name is begun as soon as its skill admits it and kept while they stand, taken
  before anything is priced (`Choice.bound`, `selectSet`), so a drill reads the skill and no
  profile decides whether it is used. A person's orders and a mind fighting by itself are weighed as before. A strike is on offer at its own sites, though
  the window they were read in moves with each stride (`atSite`). What strikes share is
  `src/minds/option/strike.ts`, which the kinds call.
- **The rise** (`src/minds/option/rise.ts`): each way up, reposition and mode of
  the ground an Option naming its technique (`way-up`, `reposition`, `flattening`, `steadying`,
  `landing`, `brace-tumbling`, `brace-down`), on offer where its skill admits the body as it lies.
  A way up is priced by its profile from where it is begun (seconds, chance, where its failures
  rest), and where it ends by the search; lying is priced by the brace and the ways up that begin
  there; a brace while tumbling is also on offer where a way up begins but none admits the body yet,
  priced as the wait until one does; a reposition is on offer only from a posture none of its
  mind's ways up that fit the body begins from. Every Option's tries in the bout are kept in one
  record (`OptionRecord`), each priced by its profile, else by hand (`Prior`), until its tries move
  it (`recorded`). The
  reader keeps what the rise needs of them (`riseMemory`: whether it runs, the seconds braced
  tumbling, the steady's try). A config whose ways up leave no route to standing from the back or
  from the front is a fault (`standUpFaults`).

**The game's default presets use the Option Mind.** They serve the humanoids and the bodies on
paws alike: what lies under the skills is the part of its role that fits the body, and a body
builds the Options whose skills it fits. The parts of a body on paws are `REPTILE_PARTS`
(`src/app/registration/quadruped-parts.ts`). A new family of bodies is parts that fit it.

**Entrants.** An `Entrant` (`src/minds/catalog/entrant.ts`) is one AI: its kinds of mind, parts and
presets, each kind scoped `<name>:`, listed in `ENTRANTS` (`src/app/entrants.ts`). `GAME`
(`src/app/catalog.ts`) is the game's catalog, `MINDS` what a person picks, `defaultMind` each
model's preset, `modelRefusal` why a mind cannot play a body.

### Adding an entrant

1. A folder `src/entrants/<name>/` whose `index.ts` exports its manifest, a line in `ENTRANTS`,
   and any data it owns under `assets/entrants/<name>/`. It imports the published APIs and itself only
   (`tests/core-boundary.test.mjs`); `node scripts/entrant-check.mjs` names a change as its own.
2. Most entrants are presets: configs of the `option` kind over the toolkit's parts and their own.
3. A part of its own, of any role, is a module and a line of its manifest's `parts`, kind
   `<name>:<kind>`.
4. A kind of mind of its own is one `controller({ ... })`: a config type, defaults, faults and a
   maker that takes the body once (`host.take`) and returns its `state`.
5. Declare owned data in `DataOf` and provide its loader in the manifest; shared code needs no
   entrant-specific registration. New component roles add their contract to `RoleParts` and their
   configs' map to `RoleConfigs`.

`tests/minds/contract.test.mjs` checks delayed command delivery, queue clearing on suspension and
restoration with commands in flight. Broader execution equivalence is read with the fingerprint
and `research/minds-apart.mjs`. How well a mind fights is a match ([Evaluations](#evaluations)).

## Command

A **Commander** (`Commander`, `src/minds/command/team.ts`) stands to a team as a mind to a body: it
reads the members' pooled view (`TeamView`) and the level as its host answers it (`TeamLevel`),
keeps its memory in `state`, and gives each member orders (`TeamDecision`). A person's `Command`
(`commands.ts`) reaches it at once. Its host asks it once a step, after the senses and before every
mind.

The level answers the exit once the team has seen its cell (`TeamLevel.exit`) and a route's
length for a body's radius, doors opened (`TeamLevel.route`). A sensed foe carries its share of
life (`SensedBody.life`); a member carries its Mind's prospects (`MemberView.prospects`,
`Prospect`: the share of a foe's life it expects to deal and to take a second, at reach), which
Option Mind writes each time its chooser decides afresh. `crypt-clear`'s `alone` protocol scores a
run by the life left at the exit less a price on time (`scoreOf`).

`COMMANDERS` registers the kinds (`createCommander`); `party` leads a person's side, in the Arena
through `teamOfOne`. `tests/core-boundary.test.mjs` keeps `src/minds/command/` from the engine,
world, bodies, enlistment, a mind's seat (`src/minds/seat/`) and the senses hub, globals and chance.

## One world step

`createWorld(engine)` (`src/core/world/world.ts`) makes a world with one fixed step (`PHYSICS_HZ`). A
step runs, in order: the sensing hooks (`World.sense`); the preparing hooks (`World.prepare`:
hands' and toes' shapes, each mind's mirror answer and decision); dispatch to minds apart; the step
hooks (`World.beforeStep`: carry the answer into each body's `driveMuscles` and set the motors);
one solver step and the clock; the post-physics observations
(`World.afterPhysics`); the after-step hooks (`World.afterStep`: blows, readings). A page advances
by real time (`World.advance`); `scene.render()` never steps. Local bouts serialize their registered
state roots through `saveState` and restore them through `loadState` (`src/core/state.ts`).
Durable simulation values must be reachable from those roots to survive a fresh load; runtime
links and derived caches must be rebuilt from the restored values. `DungeonRun.state` includes
its map, commands, exploration, actors and world state; its facade retains runtime handles, and
world load hooks invalidate derived routes and geometry. Lab actors retain script memory and
order-cache values in `Actor.state`; session roots include their actor, course, meter, wind and
queued control state.
The state codec escapes plain records carrying internal discriminators and preserves shared
references. Mutable maps, sets and typed arrays belong to state; deeply frozen constants use
records and arrays.
The senses retain opaque body identifiers in a `Map`. A decider keeps a detached copy of the
orders it read, and gait transport compares published values. Fallen navigation footprints retain
the height of their observed colliders.

### The command delay

What a mind sends is applied `World.delay` steps later (`COMMAND_DELAY`, one step in the game): its
muscles' command, assist ask and segment configurations, each through a ring (`src/core/bodies/command-delay.ts`) that
is state, so a bout forks with commands in flight. A body's time starts at its first decision
carried out (`BodyView.born`).

Each mind reads a mirror of its body (`mirrorBody`), at a command delay of at least one step.
`answer` refreshes the body, runs `act` and sends its command; `think` reads the senses and runs the
next decision. The command layers observe the completed physics before any holder acts, feedback
first and listeners in registration order, at full level only. Sub-mind and recovery technique
factories receive that same listener callback. The quadruped refuses a delay over
one. Given a place for minds (`World.minds`), minds run on other threads
(`mindThreads`, in Node or a cross-origin isolated page) and a bout is the same step for step, but
not saved or forked (`MIND_APART`).

### The world in a worker

The Arena's, the crowd fight's and the Crypt's worlds step in a Web Worker each (`src/app/worker/`),
built headless as Node builds them (`buildBout`, `buildTeamBout`, `buildCryptRun`). The worker
takes the steps real time owes, a bounded number a pass, and sends each step's frame and news;
a world that cannot keep up plays slow while the page keeps its rate. The page's input is applied
before the next step and taped. The page (`openWorld`) poses a puppet of each body between the two
frames it shows (`posePuppet`).
Step and tape requests carry identifiers, and each reply completes its matching request. Faults,
abort and disposal reject pending requests. The browser drains the shared reply ring while waiting
for completion, so reply backpressure cannot prevent that completion. World construction awaits
each nested mind worker's initialization before using shared-memory waits. Mind workers load the
data declared by the requested recipes. Construction lifetimes dispose partial resources before an
unsuccessful build returns control to its reporting boundary.
Host disposal attempts every worker stop. Evaluation lanes cancel pending siblings and stop their
workers before reporting a fatal error. Research and tooling use `workerJobs` and its persistent
pool to settle queued and active work on failure or close; closed pools refuse new work.

## Bouts, tapes and replay

A bout (`Duel`, `src/game/arena/duel.ts`) is built from a recipe (`DuelRecipe`), plain data: bodies,
minds, loadouts, seed, end rules and the rest. A bout is deterministic: a recipe plays the same to
the bit in Node and in the page (`buildBout`, `src/evaluation/bout.ts`).

- **Verdict**: a side is out by the first end rule that puts it out (`END_RULES`, the game's
  `GAME_ENDS`). Both on one step is a draw; at the cap the fuller life wins.
- **Tape** (`Duel.tape`): every order with its step; recipe and tape are the whole bout
  (`Duel.play`). **Order sheets** (`SheetLog`) replay a bout with no mind (`replayedBody`).
- **Save** (`Duel.save`, `Duel.load`) loads only into a bout of the same recipe and build
  (`RecordingIdentity`). A build is the commit it was built from (`BUILD_IDENTITY_FORM`); with a
  build input not committed, a mark no other build shares, made once a process and handed to its
  workers.

## Evaluations

Every question of how well something does is an evaluation (`src/evaluation/`, `EVALUATIONS`), one
path for Node, its workers and a page; `scripts/evaluate.mjs` runs it.

The Strike drill's `swing-motion` protocol observes one right-hand club swing on the Warrior
without assistance. Its reader (`src/evaluation/strike/motion.ts`) partitions native-step hand,
swell, chest and wrist travel by executor phase and watches the entry guard's position,
orientation and stillness through a continuous return hold after ownership ends. It reports
unobstructed wrist chatter separately from contact and leaves course, clearance and physical
stroke-end coverage explicitly incomplete.

The `bonk` protocol reads a club's blow at the head against its own tests (`Bar.overhead`,
`Overhead` in `src/evaluation/strike/read.ts`): the chamber over the head, one descending stroke,
the swell's collider first on the head, the arm straight, its energy, and the return to guard.

A drill's struck target stands with its arms lowered (`drill-stand`, `STANDS` in
`src/evaluation/drill-opponents.ts`), so its marks are open and a failed trial is the striker's;
a target guards only on the rung that tests the guard (`guarding`, `drill-guard`). Those rungs
read how well a body throws a strike. What the strike brings in a fight is read in fights, a bout
of Option Mind against Option Mind in which the drill throws the strike in place of the blow the
Mind was about to begin, and only what follows that moment is the trial's: `fight` (the
Warrior's first four such moments) and `fights` (every striker's body, starting gaps of 3, 4 and
5 m, the first eight), from which alone the strikes' profiles are built
(`research/skills/strikes/strike-profiles.mjs`). No table cell reads a fight: a cell is its skill
on its own merit, and a profile prices the skill where the Mind uses it.

- **A case module** (`<id>/cases.ts`, `Cases`) gives each protocol's conditions, the world of a case
  (`CaseWorld`, `WORLD_BUILDERS`) and its reader; **a description** (`<id>/index.ts`, `Evaluation`)
  the question, subjects, figures and a drill trial's `outcome`.
- **A case's key** is the digest of everything it plays but its code; a row (`Row`) is found again
  by its key while runs work on one commit (`.tmp/evaluations/<id>/<commit>/`, `rows.ts`). A run on
  another commit, or with a build input not committed, plays every case. `--write`
  keeps the run's results in `assets/evaluations/<id>.json` (`results.ts`): each subject's newest
  reading on a protocol (its figures and, for a drill, a short row of numbers a trial, by its
  condition's name), each earlier reading a table cell's baseline names, and a contest's standings
  (`standings.ts`). Nothing a trial played is kept: the Arena plays a trial again from its subject
  and condition as the build makes them.
  A reading is named by the commit it was read at; a table cell's baseline names its reading so.
  Subjects retain their body restrictions and character attributes through normalization and
  scheduling.
  A run's rows are admitted whole, and two that read one case differently stop the run (`indexRows`).
- **Contests**: `match` (two minds, each on each side, one digest), `tournament` (Bradley-Terry,
  `rating.ts`), `unseen`. The panel report (`compare.ts`, `settle.ts`) pairs a subject with its
  baseline and stops once settled.
- **Batteries and drills**: a battery plays one subject over its conditions; a drill's trials pass
  or fail, its rungs its protocols (the strike's bar in `strike/read.ts`).
- **The table** (`src/evaluation/table/`): the drills' Option Mind (`option-drill`, so no profile
  and no tree search decides anything in a cell; its drill opponents are made from it too) on every body by loadout by skill (`tableCells`), a blow where the Mind offers it there (`strikesBy`) and asked only at the marks
  and with the limbs it is offered at (`caseFaults`), valued from the drills' results: each trial's value in the game's
  terms (`trialValue`: a way up's seconds an attempt, a move's seconds lost against its orders, `orderTime`, a
  blow's life traded a second, a cover's life lost), a fall at a fixed price (`FALL_PRICE`, 10 s);
  each protocol a cell reads naming its training twin (`Cases.twin`, `src/evaluation/twin.ts`),
  the same situations drawn halfway between, which research plays (`research/drill-trials.mjs`);
  a reading's value the mean over its whole protocol (`valueOf`); a cell against its baseline
  (`baselineOf`, a pointer at the result it was read as), paired by condition with a bootstrap
  interval (`compareValues`), the person's figure beside a strike's (`personOf`).
- **Falls** (`fall.ts`): one body felled on one bed (`buildFall`), on the open floor or beside an
  obstacle (`GROUND_LEVELS`), its stand verified (`STAND_CHECK`); each way up is read on its own attempts on the [way-up
  drill](reference/rising.md#the-way-up-drill) (`way-up/`: shoved falls on the fall bed, and
  falls from bouts of a riser against its copy), a mind's whole rise on the [owner's
  target](reference/rising.md#the-owners-target).
  Lone, fall and Crypt evaluation scripts expose cue indices, orders and progress through their
  state objects; their builders publish no save/load interface.

## Rules and wounds

The rules (`src/combat/`) are one rulebook for the Arena and the Crypt (`Rulebook`), free of
any page.

- **Down** is the spec's rule (`DownSpec`, `src/control/ground.ts`): a human is down when a
  segment but its `bearers` is near its lowest point; a quadruped when it tips or sinks.
  `PhysicalBody.down` is read at the step's first look, before physics, so a fight sees every body
  down at one point.
- **A blow has no striker** (`watchBlows`, `blows.ts`): two segments of two sides the solver pushes
  apart while closing have met (`watchTouches`), its energy half the reduced effective mass
  (`contactMass`) times the closing speed squared (`impactEnergy`). The surfaces share it as springs
  in series (`energyShares`); two rigid items meeting clash. Stiffness tables and the fist's
  threshold: [wounds](reference/wounds.md).
- **Damage**: a side's share times its mechanism's worth over `Rulebook.unit` (`sideDamage`); a bare
  extremity declared in `WoundSpec.bareExtremities` on flesh lets the first of its share go
  (`Rulebook.fist`). The contact mass follows the currently attached component. A held point breaches
  `Rulebook.layers` and goes in against `resistance` as deep as its energy drives it (`pointWound`).
- **A bite** wounds by the impulse it brings beyond a threshold load over the interval, at a rate
  (`pointLoadDamage`, `pointLoad`); a held item intercepts it.
- **Life** (`pool.ts`): one bar a body and one a limb. A blow takes its damage times its part's
  group factor (`Rulebook.life`); an empty limb bar cripples it (`crippleLimb`); an edge strong
  enough severs (`cutOff`). A body is out when slain, beheaded or maimed.
- **Levels** (`levelsOf`, `levels.ts`): a body with nothing to do and nobody near is `held`; any
  other is `full` in the fight and `limp` out of it; the fight gives the distances (`LevelRule`).

## The screens

`src/app/browser/` is Vite's browser root. Its `index.html` holds the app shell; `app.ts` mounts each
screen's HTML from beside its UI code, selected by `?play=` (`src/game/route.ts`). The shell disposes
the last screen explicitly and keeps setup choices for the tab. The Character Lab and Physics
Bench have their own `index.html` beside their modules. Every entry document is in `vite.config.ts`'s
`rollupOptions.input`.

| Screen | Where | What it is |
|---|---|---|
| Arena | `src/game/arena/` | two bodies under a `Duel`, to a verdict; a person may lead a side |
| Crowd fight | `src/app/browser/arena/crowd.ts` | two teams (`crowdFight`, `TeamBout`) |
| Crypt | `src/game/dungeon/` | a party in a generated dungeon (`DungeonRun`), each side under a Commander |
| Lab | `src/game/lab/` | one body in a scenario (`scenarios.ts`) |
| Ratings | `src/app/browser/ratings/` | each evaluation's results; a drill's trials open in the Arena as a reel |

- **Links are recipes.** An Arena address is its bout's recipe (`recipeOf`); an edited mind travels
  whole without `tuning` (`src/minds/catalog/config-link.ts`); a reel (`#reel=`) plays a result's trials again from their
  subject and conditions.
- **Cosmetics never carry authority.** The arena's solids are colliders (`arenaSolids`), the same
  on the page and the stand; the visible room is checked against them (`validateRoomPlacements`).
  The Crypt's walls and doors are fixed boxes (`dungeonSolids`).
- **Drawing** (`src/app/browser/render/`): a skin reads only segment poses and whether each is on its body, else
  the collision shapes are drawn; art comes through the asset pipeline ([assets](art/assets.md)).
  Arena and Dungeon share flame volumes (`fire.ts`), navigation paths (`movement-routes.ts`) and
  pointer-coordinate conversion (`picking.ts`).
  While the Arena's end rules drain life, red screen edges pulse on the bout's clock, both health
  bars glow; the cue clears at the verdict or when leaving the bout.
- **Player input** (`src/app/browser/ui/player-controls.ts`): Arena and Dungeon share click and held-pointer
  orders, cancellation, camera-relative movement keys and Shift to walk. Screens supply world picking
  and command transport; workers receive movement in world coordinates (`PlayerLead`).
- **View** (`src/app/browser/ui/view-controls.ts`): Arena, Dungeon and Lab share presentation settings,
  address fields and camera-mode calculations. Arena and Dungeon use one orbit camera and pointer controls;
  each supplies the body or point to follow and its opening frame. Dungeon panels scroll separately in
  the space above its footer.
- **Sound** (`src/app/browser/audio/`) is synthesized (`GameAudio`): a body is heard by its touches and its
  motion through the air (`hearTouches`, `airOf`); a blow's debris is its own cue.
