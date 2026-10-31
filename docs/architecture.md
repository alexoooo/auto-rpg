# How Auto-RPG is built

Auto-RPG is physically simulated melee in the browser. A fighter is a body of rigid segments and
joints driven by muscles; a blow is whatever one body carries into another, and it wounds by the
energy it brings. There is no attack animation and no hit box: the pages draw what the physics did.

- **Babylon.js 9 draws; Rapier simulates.** The core's Rapier is the SIMD build, built from the
  pinned source and patch in `vendor/rapier` and installed from its committed tarball
  ([engine record](reference/rapier-vendor.md)).
- **Everything that fights is the core's** (`src/core/`). The screens (`src/arena/`,
  `src/dungeon/`, `src/lab/`) build on it and it never imports them:
  `tests/core-boundary.test.mjs` allows the core only itself, `@babylonjs/core`, its engine's
  package and JSON under `assets/`.
- **One world step** (`World.step`, 120 Hz) owns physics, control, combat and the clock. Pages,
  tests and research all call it; rendering never advances it.

## The layers

The table orders the layers by what each is built on. A skill is a part (`src/core/parts/`, its
role's `*-part.ts`), reads the vocabulary a decider writes (`Intent`, `src/core/intent/`; the
action window, conditions and targets) and runs navigation between them. Whatever decides a
body's intent plugs in as a `Decider` (`src/core/mind/decider.ts`), which sees the `Sight` and
reports an `Engagement` (`src/core/mind/engagement.ts`); the seam and the report sit with the
skills, and tactics are one implementation of it above them. The
boundary test (`tests/core-boundary.test.mjs`) holds the order by folder, or by file where a
folder spans two layers (`LAYERS`): a module imports its own layer or one below, the registries
(`parts/lookup.ts`, `parts/catalog.ts`, `mind/kinds.ts`, `toolkit.ts`) exempt. Tactics are a
package, a layer of their own that from outside it only the minds built on it import
(`CORE_PACKAGES`: Option Mind, the drill opponent, whose body is a fighter by default, and the
support-entry task, which boots one). Today's imports up the layers or into the package are
listed (`UP_STACK`), each with the change that removes it, and the list only shrinks.

| Layer | Where | Job |
|---|---|---|
| Spec | `src/core/spec/`, `human/`, `reptile/`, `items/` | a body as data, every number sourced |
| Engine seam | `src/core/engine/` | the one contract the core needs from a physics engine |
| Build | `src/core/build/` | the spec made into engine bodies and joints; dynamics read back |
| Muscles | `src/core/muscle/` | torque bounded by strength and speed; the body's level |
| Mind seam | `src/core/mind/` | a mind made with its body, stepped before the solver, writing the muscles' command and its assist's ask: its host, senses, equipment port, actions and sub-minds |
| Motor control | `src/core/control/` | joint, effector and stance goals turned into muscle commands; the body's readings beside its view's, its ground and how it lies among them (`groundReading`, `lieOf`); the command layers, which any mind may build on its own body (`commandLayers`) |
| Skills | `src/core/skills/`, `src/core/mind/decider.ts`, `engagement.ts`, `report.ts` | an intent turned into the body's command: walk, guard, strike; the executor, locomotion, guard, support and aim parts and their lists; their configs (`skills/config.ts`); the seam a decider plugs into (`Decider`, `driveBy`) and what a mind over them reports (`Engagement`, `MindReport`) |
| Intent | `src/core/intent/` | what a decider asks of the skills: the intent, orders, movement and travel, an action's aim and window, the conditions and targets, and one action asked and kept (`actionProducer`) |
| Navigation | `src/core/navigation/` | a movement request walked round the solids and the body's own side, at the speed it can stop from; the body's clearance |
| Perception | `src/core/perception/` | what a body reads of another: its openings, the threat of its blows, and where to stand by a body down (`downed/`) |
| Tactics | `src/core/tactics/` | what the body should do, from what it senses: tactics (deciders, `TacticalDecider`), planners, behaviours, the fighter and its default config (`BLADE_FIGHTER`); their configs (`tactics/config.ts`); a package |
| Recovery | `src/core/recovery/`, `src/core/mind/kit.ts` | getting up and lying: the ground executor and its techniques (`ground/`), the staged rise (`rise/`), the sub-minds; the kit a mind hands them and its legs, lowered by the rise (`MindKit`, `legsOf`) |
| Minds | `src/core/parts/`, `src/core/toolkit.ts`, `src/core/mind/config.ts`, `kinds.ts`, `minds.ts`, `src/core/option/`, `src/core/reptile/`; `src/entrants/` | a body's mind made from its config by the controller of its kind, found in a catalog; each AI an entrant's presets and parts |
| Command | `src/core/command/` | a team's members given orders by its Commander, from what they sense |

### Spec

A `BodySpec` (`src/core/spec/body.ts`) is a body in its reference pose: metres, +x right, +y up,
+z forward, soles on y = 0. It holds:

- **segments**: mass, centre of mass, principal inertia, collision shape and surface (stiffness
  under a blunt load, which shares a blow's energy);
- **joints**: a tree, each freedom with its axis, range and muscle;
- **effectors** (`BodySpec.effectors`): each hand, foot or paw and its free chain; no two effectors
  share a freedom;
- **wounds**: `hp`, the `vital` parts, the parts that never come off;
- **down**: the rule that reads the body as down (`BodySpec.down`);
- anything held. An item states a surface or is rigid.

**Models.** `BODY_MODELS`, `modelSpec` and `modelInfo` (`src/core/models.ts`) own the registry and
what each model's right hand holds; the mind each plays by default is the game's (`defaultMind`,
`src/entrants/game.ts`).

| Model | Built from |
|---|---|
| `workshop-fighter` (the Warrior), `workshop-rogue` (the Rogue) | `figureSpec(workshopFigure(...))`, `src/core/human/spec.ts` |
| `crypt-skeleton` | `skeletonFigure`: its art's bind (`assets/skeleton/bind.json`) for its joints, its bones (`assets/skeleton/bones.json`, [record](art/skeleton.md#the-body-fitted-to-the-bones)) for its masses and colliders, 15 kg |
| `reptile` | an independently authored quadruped (`assets/reptile/body.json`, [record](reference/reptile.md)) |

`figureSpec` takes a `HumanFigure` and lays out 16 segments and 15 joints from published tables
(de Leva, Dempster via Winter, Abe, Anderson, Frey-Law, Thelen) and each part's contact stiffness
(`CONTACT_STIFFNESS`, [wounds](reference/wounds.md#stiffness)); a fitted figure's segments
(`HumanFigure.fitted`, the skeleton's) take their mass, inertia and colliders from its measured
solids instead of de Leva's rows. A humanoid's feet may wear a shoe's
sole (`withSoles`, `src/core/human/sole.ts`); only the Lab's `sole` loadout uses it. They have
toes (`toedFigure`, `src/core/human/toes.ts`): a slab ahead of the foot's box, cut short by it,
and a toed ankle's stop at 0.8 rad ([toes](reference/toes.md)).

**Characters.** A game character is a `CharacterConfig` (`src/core/models.ts`): a model plus
overrides of Size, Weight, Strength, Speed, HP, Balance and Haste, each a number
(`CHARACTER_ATTRIBUTES`, `src/core/character-attributes.ts`). `resolveCharacter` validates them,
fills defaults (multipliers 1, the model's HP, Balance and Haste 0) and returns an immutable resolved config and sourced spec; geometric overrides are checked for nonadjacent intersection
before a world is built. The humanoid adapter is `physiqueFigure`; the reptile adapts its own
anatomy with the same meanings. One URL codec reads and writes attributes per scope (`left.*`,
`right.*` in the Arena, `body.*` in the Lab, `hero.*`, `ally-0.*` to `ally-2.*`, `enemy.<model>.*` in the Crypt).
What is measured on a body (a walk's envelope, a technique's profile, a learned skill's settings,
the searched strikes) is read under its key (`bodyKey`, `src/core/spec/body.ts`): its model, and
`+toes` where its feet have toes. A mind's preset may choose its bodies' character
(`MindPreset.character`): the Arena puts a person's attributes over it
(`controlCharacter`, `src/arena/matchup.ts`, the attribute panel showing it as the base), and an
evaluation plays a preset's subject on it (`Subject.character`, a part of its own, each case's
world given its seated subjects' characters). The Crypt plays its minds on its participants' own
attributes.

**Items and loadouts.** What a hand may hold is one list (`HELD`, `src/core/items/held.ts`: empty,
the club, the buckler, the short sword). `armedWith` puts an item in a hand and refuses a hand that
cannot close on it; `Loadout` names both hands, `withLoadout` assigns them and `modelHolding` reads
the equipped spec. Item numbers are in [Arena items](reference/arena-items.md).

**What a body can do is read from its spec.** Fit is whether the body, as armed, can carry out
what every part of a mind commands (`treeRefusal`). What a scenario asks beyond fit is its entry
rules (`EntryRule`, `entryRefusal`, `src/core/parts/catalog.ts`): `attacks`, some part strikes with
something the body has (`Part.strikes`; executors declare the effectors they strike with,
`ExecutorPart.strikesWith`), and `uses-held`, every held item has a use (`Part.strikes`,
`Part.supportedEquipment`). A fight asks both (`FIGHT_ENTRY`): an Arena bout unless its recipe
says otherwise (`DuelRecipe.entry`), a match, the tournament, the Crypt. The Lab's Attack asks an
attack; a stand or a course asks neither, so a mind may carry what it never uses there.
`modelRefusal` (`src/entrants/game.ts`) gives the reason a mind cannot play a model with a loadout
under a scenario's rules; `mindFaults` (`src/ui/mind-link.ts`) a screen's.

To add a family, write its spec and its adapter in its own folder. **Families share code, never
values**: a spec never spreads another family's spec. How a model is shown is the screens'
(`MODEL_DISPLAY`, `src/render/models.ts`).

### Provenance

Every number in a spec is a `Quantity` (`src/core/spec/quantity.ts`): a value, a unit and its
origin.

- A leaf is `sourced` from an entry of `SOURCES` (`src/core/sources.ts`): literature, the owner's
  decision, an asset (with a JSON pointer) or a measurement (with its record).
- Anything else is `derive`d by a named rule whose code does only its formula's arithmetic; a
  factor is an input with a source. Unit conversions live in one table in `quantity.ts`.
- So a spec has no bare number, every derivation re-runs to its value, every source key is known,
  every asset pointer matches and every decision's record is present (a deleted file's record is `path@commit`).

Tuning is immutable: an experiment passes an override in (`RulebookOverride`, a stance tuning) and
nothing mutates a global.

### Arithmetic

The core's arithmetic gives the same doubles in every JavaScript engine.

- It uses only IEEE operations (`+`, `-`, `*`, `/`, `Math.sqrt`) and its own functions
  (`src/core/math/real.ts`: trigonometric, inverse, exponential, hyperbolic, cube root, length, each
  fdlibm's kept operation for operation). No power: a square is a product.
- Babylon's two turns built on `Math.sin` are replaced (`turnAboutToRef`, `turnBetweenToRef`,
  `src/core/math/turn.ts`).
- `tests/core-boundary.test.mjs` holds the core and the arena's world builders to the exact members
  of `Math` and Babylon's arithmetic-only math; each function's values are
  [its record](reference/real-functions.md).

**Work arrays.** The step's dear solves (`linalg.ts`'s, written into flat arrays by
`src/core/math/flat.ts`; the whole-body solve, `bodyDynamics`, the joint trackers, each hand's
reach) work in arrays made once with the body, sized from its spec. A work array is written before
it is read, carries nothing between calls, is not state and is never shared by two bodies.
Each flat solve does its twin's operations in order; `tests/core-step-cost.test.mjs` holds a
step's allocation under a ceiling ([step cost](reference/step-cost.md#control-written-into-arrays-made-once)).

### Build

`buildBody` (`src/core/build/build-body.ts`) makes one engine body per segment and one joint per
spec joint, whose free axes are the spec's freedoms.

- A held item's mass is folded into its segment by `rigidOf`, which names the owner of each shape:
  the segment, an anatomical region, an item or an item's region.
- **A body is built in the pose its joints demand**: a fighter in the posture its mind holds from
  its first step (`builtAngles`, `Controller.builtIn`; for a fighter, its guard's posture, `GuardPart.posture`). Optional
  initial angles and a root quaternion place a task's body; a policy may not reposition a live one.
- Rapier uses impulse joints; its multibody form cannot hold the same anatomy
  ([solver contract](reference/solver-contract.md#anatomical-joint-shape-compatibility)).

Readings back from the built body:

| Function | File | Gives |
|---|---|---|
| `jointAngles`, `jointTracker` | `joint-state.ts` | each freedom's angle as its limit reads it, about axes fixed in the parent |
| `bodyDynamics` | `dynamics.ts` | floating-base mass matrix, gravity and bias (gyroscopic torque included), and the root's rows |
| `contactMass` | `contact-mass.ts` | effective mass a contact meets along a normal, all joints free or held by their muscles (`contactGive`) |

### Engine seam

`src/core/engine/engine.ts` is the contract and names no engine's types. It guarantees:

- a fixed step that writes each node's `position` and `rotationQuaternion`;
- bodies that never sleep, with the spec's mass, and the centre of mass's velocity;
- one friction (`CONTACT_FRICTION`, `src/core/spec/constants.ts`, which the controllers bounding a contact's force read too) and no bounce on every contact; a sole (`ContactMaterial.sole`)
  gives as a spring and damper against fixed ground;
- freedom k as axis k of the joint's frame; a motor as a velocity constraint bounded by separate
  negative and positive torque ceilings (`setMotorBounds`), with its signed whole-step impulse on
  the child (`motorStepImpulse`);
- a force and moment through one step, and an instantaneous impulse;
- contacts as the last step left them (`contactsOf`), with the solver's impulse and the shape pairs
  it pushed on (`Contact.pairs`); a reader may skip a body or the fixed world before reading
  ([play](reference/play.md#hearing-in-the-step));
- a point's distance from a body's shapes (`SegmentBody.gapTo`);
- a whole-world save and in-place load (`PhysicsWorld.save`, `load`). Every object survives a load
  as itself; a save is identified by a digest of how each body, joint and collider was made, and a
  world built otherwise refuses it.

`rapier.ts` implements it, with solver conditioning in `SOLVER` (not anatomy). Engine profiles
(`rapier-coordinate`, the gameplay default, and `rapier`, the reference batteries' parent-axis
form) share one WASM module and are fixed per engine instance
([joint limits](reference/joint-limits.md)). `engines.ts` lists the engines (`ENGINES`) and is the
only module that imports one. A new engine is tried on the physics bench (`src/physics-bench/`)
first, then added to `ENGINES` and run with `CORE_ENGINE=<name> npm test`.

### Muscles

`driveMuscles` (`src/core/muscle/driver.ts`) turns each freedom's command, an activation and a
velocity, into a motor target and torque ceilings: activation times the peak torque of the side
pushed toward, times the force-velocity factor at the joint's speed (`force-velocity.ts`: Hill's
curve shortening, an eccentric branch to 1.4 times isometric lengthening).

- `World.actuation`, fixed per world, selects the symmetric gameplay law or the directional
  research law, which bounds each side independently.
- A side may have a tendon in series (`MuscleSpec.tendonPositive`, `tendonNegative`): while its
  muscles push, the motor is that spring (`EngineJoint.setSpring`), so a lengthening joint stores
  energy and returns it.
- `pulled` is the mean torque delivered over the last step, a saved diagnostic, not a work
  measurement ([effort precision](reference/effort-precision.md)).

**A body runs at a level** (`BodyLevel`, `MuscleDriver.level`), data in its muscles' state:

| Level | Joints read | Mind stepped | Motors |
|---|---|---|---|
| `full` | yes | yes | driven |
| `limp` | no | no | released |
| `held` | no | no | released, every segment fixed |

`setLevel` changes it. Leaving `full`, the mind is told (`Mind.idle`) and the command and motors are
zeroed; back at `full`, the joints are read before the mind steps and the mind goes on from the
body as it is. Which level a body is at is set by one rule (`levelsOf`, [Rules and
wounds](#rules-and-wounds)) from where the bodies are, never from the machine; a body is never
disposed and rebuilt to save a step.

### Motor control

Motor control turns a `BodyCommand` (a posture, named effector goals, timed pushes, point tasks and
a stance goal) into muscle commands.

- **The servo** (`src/core/control/servo.ts`) asks each joint for a critically damped approach to
  its goal and solves the torques through the body's dynamics, clipped at strength.
- **Effector goals** (`motor.ts`, `kinematics.ts`): named points of an effector's rigid body
  (knuckles, a point of what it holds: `rigidPoints`, `src/core/build/rigid.ts`) follow
  minimum-jerk paths to places in the body frame (`EffectorGoal`). One place puts a point there; two
  lay a line (`solveReach`); `EffectorGoal.orientation` aims a face. A path may
  run past its place (`through`) or be the same path with its end moved (`follows`). A goal driven
  `firm` gives its freedoms their muscles' full strength toward the speed the servo asks, so a limb
  is braced through what it strikes; one that may `unbend` lets the solve take a chain straight at a
  stop off it where its place is nearer (`ReachWays`). The body frame
  is the root's (`BodyView.root`; `intoFrameToRef` turns a world point into it).
- **The bearing solve** (`bearing.ts`) carries a body on the ground through limbs (`Limb`: a chain
  from the root to a segment, bearing on a `Patch` or free). `carryRoot` asks the wrench the
  caller's aim needs, `shareGroundWrench` (`contact-wrench.ts`) shares it among the patches within
  friction and centre of pressure, `bearLimbs` gives each limb its inverse dynamics, and what the
  patches miss is asked of the assist. Limbs may share a stem (`Limb.stem`).
- **The whole-body solve** (`solve.ts`) is the bearing solve and the servo in one weighted
  least-squares problem: root aims and pushed torques exact, feet beneath, posture last; a torque
  past strength is pinned and the body solved again. A command may drive an effector point at an
  acceleration or spin (`PointTask`, `BodyCommand.points`); `holdUp` (`src/core/skills/framework/hold.ts`)
  is such a spin.
- **The motor is a part** of role `motor` (`MOTORS`, `src/core/control/motors.ts`, a role list),
  named by a fighter's `motor` slot; the game's is the whole-body solve (`motorControl`, registered
  as `WHOLE_BODY_MOTOR`, `whole-body-motor.ts`; `GAME_MOTOR`, `mind/kit.ts`). A kind is a
  registered implementation (`MotorPart`, `motor-part.ts`) whose maker gives, for its config, what
  makes a motor control (`MotorMaker`, made as `motorControl` is). A mind resolves it through its
  host's lookup (`motorOf`) and hands it to its command layers (`LayerOptions.motor`, the whole-body solve where
  none is given) and to its sub-minds; one that needs goals a `BodyCommand` does not name brings
  their vocabulary with it. A motor control asks of every motor a posture, pushes and a reset; the
  goals beyond them it says it carries (`MotorControl.carries`, `MotorGoal`: effectors' places,
  driven points, a stance), and what drives it asks for those it needs where it is made
  (`carrying`): the command layers for all three, each recovery technique for a stance, so a
  motor without one is refused there with the reason. The whole-body solve reports, in its state,
  what of its last command it did not carry out (`MotorControl.unmet`, `MotorUnmet`): each push on
  a channel its stance's legs drove, and the driven points no stance's solve drove; the body's view
  shows it to whatever drives the body (`BodyView.unmet`).
- **The command layers** (`commandLayers`, `command-layers.ts`) are a toolkit layer any mind
  builds on its own body (`OwnBody`): a `HostMind` (look, act, release, resume) of motor control
  from the mind's motor part under a driver that hands it goals, seen through a view (`BodyView`,
  `src/core/body.ts`) read each step, with the body its drivers have (`Body`). They read their
  effectors' touch after each physics interval (`OwnBody.afterPhysics`), labelled by the body's own
  contact labels (`OwnBody.contactIdentity`), and know nothing of the skills, a decider or sub-minds.
- **Balance is a part** of role `balance` (`BALANCES`, `src/core/control/balances.ts`, a role list,
  `BalancePart`, `balance-part.ts`), named by the whole-body solve's `balance` slot; the game's is
  the stance (`STANCE_BALANCE`, `stance-balance.ts`), which fits a body with a box sole under each
  foot (`standsOnSoles`). A motor that carries a stance stands the body with the balance its config
  names, and the command layers' view reads the stance from it.
- **The stance** (`stance.ts`; records `stance-state.ts`, steps `gait.ts`, soles `support.ts`,
  constants `stance-tuning.ts`) is the standing plan and the solve's first user
  (`StanceControl.ask`). It keeps the centre of mass inside the support by forces the ground can
  give, plans each leg (`aimLimb`), publishes what the soles missed (`StanceReading.shortfall`),
  limits each ankle's load to what it holds lengthening (`ankleStrength`), places steps from the capture point (`catchStep`,
  `landingHeading`).
- **Envelopes** (`stance-envelope.ts`: `stanceEnvelope`, `walkRunEnvelope`) read what each body (`bodyKey`) was measured to hold, per held
  item, from `assets/core/*-envelope.json`: each way's fastest is the fastest speed at which every
  trial held (`fastestEvery`), and `paceToward` picks the fastest pace that held a share of its
  trials.
- **The assist** (`assist.ts`) is a force and moment on the root that no muscle gives: asked by the
  mind (`Assist.ask`), shortened to a ceiling in the body's own weight, applied through the solver
  step and metered. It gives nothing unless given a ceiling ([assist](reference/assist.md)).

### Skills

A skill set turns an `Intent` into a `BodyCommand` (`skillSet`, `src/core/skills/framework/arbiter.ts`). The
continuous base is locomotion, guard and optional low support; named executors run discrete
actions over it.

**The action contract.**

- A request has a stable id, an action name, an effector and a sensed body/region target (or an
  explicit research point). Changing or withdrawing an order ends the request; a later attempt gets
  a fresh id.
- Admission reads the executor's readiness and reserves its declared resources (joints, effectors,
  hand pose, legs, support) before preparation. Actions overlap where their reservations allow.
- An executor moves through prepare, commit and release, and ends once with a reason in a bounded
  ledger (`Ended`: the request, ending, commitment and contact summary; omitted history counted).
- An executor never closes distance: tactics approach its entry window; preparation may place the
  feet locally.
- A mind may end a live action at once (`Intent.interrupt`, `Executor.interrupt`).
- An action writes only the controls it holds, and a held control it leaves unwritten is the
  defaults' (`skillSet`): the guard's posture, covers, holds and hand poses, the walk's arm swing,
  the fold's trunk. Writing any channel of an effector's chain writes the effector, so no default
  goal takes a chain an action drives; a legs goal writes the legs. An action that wants a
  control neutral writes its reference. One holding the legs may ask no stance at all (`legs`
  null, the ground executor's): the legs' muscles are its own, and the legs, guard, support and
  navigation resume once no action asks so. A push's speed may be unbounded (directional, as the
  servo's own torques).
- Contacts are observed after physics from each action's admitted surfaces. Intended hits, blocks
  and incidental contacts are labels for tactics, never damage.
- Every skill answers `Skill.resume` (`src/core/skills/framework/skill.ts`) and is in the one list its skill
  set resumes; the arbiter releases every instance on host takeover or idling.

**Locomotion skills** (`Locomotion`): every legs give their state, a resume, the completion of a
legs goal (`goal`: a stance goal, or a gait's own drive of the legs), their heading and how fast
they stop. An action holding the legs asks them in one legs goal (`LegsGoal`, its `legs`): a walk,
and the stance goal's fields it sets; nothing edits the stance goal after the legs complete it.
The ends it bears on, swings, places and anchors are named as the body's spec names its bearing
ends (`BearingEnd`, `BodySpec.ends`: a human's `foot.<side>`, `hand.<side>`, `shin.<side>`); the
stance walk turns its foot ends into the stance's feet (`onStanceFeet`, `stanceFeetOf`) and reports
a field that names an end it does not stand on unmet.
The low support fold (`SupportSkill`, `src/core/skills/locomotion/support-fold.ts`) carries a goal that leaves
the stance's shape to the legs (`foldCarries`) down to the height it asks, before the legs complete
it, and asks its trunk flexion of whatever holds the trunk (`SupportReport.posture`): the defaults
on a free trunk, a low action on its own. The stance walk holds a carriage, a fighting pose as
data (`Carriage`, `CARRIAGES`, the square stance the body is built in its one entry; a stance
walk's configuration may give another): stopped, its feet are set where it stands them; walking,
its width is the steps' (`StanceGoal.gait`, the step pattern the gait asks of the stance). What a walk
under the stance says besides (`StanceWalk`: its pace, standing height, envelope and placed
feet) is its own; its readers ask whether the legs say it, and a footing asked of legs that place
no feet finds them standing. Legs say what of their last goal they did not carry out
(`Locomotion.unmet`, `LegsUnmet`): the fields they left undone (a gait by name the stance walk has
none of, a heading asked beside a walk, the stance's fields while the run drives the legs), and
how far the stance held the centre of mass and its plan's height from those asked; the skills'
report carries it (`SkillReport.legs`). Legs that walk by gaits by name say which (`Locomotion.gait`)
and each one's envelope (`Locomotion.envelopeOf`; the walk-run's own while it may run and the run
pays, `envelopeRunning`), which a mind reads as `Sight.envelopeOf`. An intent may name a gait
(`Intent.gait`), which the arbiter puts in the legs goal where the action holding the legs asks none.
**The probes** (`tests/harness/probes.mjs`, run by `tests/probes.test.mjs`) ask each legs-goal
field and claim term of a standing Warrior, through each gait, the stance walk, Move, each balance
and motor and the swap stubs, and ask the legs to bear kneeling and on hands and knees: each does
it within its limit or reports it undone, and legs or a motor that ignore a term and say nothing
fail its probe.

| Skill | File | What it is |
|---|---|---|
| Locomotion | `locomotion.ts` | the stance's own walk within its envelope; places feet (`LegsGoal.footing`) |
| Walk and run | `walk-run.ts` | the stance's walk, handing over to a run cycle that drives the legs itself (`runCycle`, `cycle-run.ts`, `WALK_RUN_CYCLE`, CMU clips in `assets/core/run-cycle.json`; `LegsDrive`) when asked past its walk and allowed (`Locomotion.runs`) |
| Move | `move.ts` | chooses among its gaits (`MoveConfig.gaits`, each a name, a label and any other walk's config as its legs; the stock `STOCK_GAITS`, `gaits.ts`, where it names none) by rules (`MoveRuleConfig`) on standing and the distance to the nearest standing foe, the nearest standing body of its own side, or its destination, the gait a legs goal names first (Option Mind names one and has no rules); Classic's is `MOVE` |

Each kind is a registered implementation (`LocomotionPart`, `src/core/skills/framework/locomotion-part.ts`):
its own module beside its skill (`skills/<kind>-part.ts`) owns its config's type, keys, defaults,
faults, fit and maker, and is a line in `LOCOMOTIONS` (`skills/framework/locomotions.ts`, a role list), from
which the slot's config type (`LocomotionConfig`) follows. `legsOf` (`mind/kit.ts`) makes the
legs a config names as the lookup finds them, wrapped so that a goal asking the ends a lowering
bears on (`LegsGoal.feet`, `LOWERINGS`, `rise/stages.ts`) sets the feet at its footing and plays
its stages on the body held whole (`lowering`, `rise/lowering.ts`; `heldBody`, `mind/held-body.ts`),
the body held at its height (`LegsDrive.held`, read by the down rule); asked ends no lowering bears
on, the legs report them unmet. Move makes its gaits' legs and its rules
(`MoveRulePart`, `skills/locomotion/move-rule-part.ts`, a line in `MOVE_RULES`) through the lookup the legs
carry (`Legs`). The legs state their limits to the speed rule: what they hold
(`Locomotion.envelope`) and how fast they stop (`Locomotion.stopping`).

A gait that drives the legs asks the assist only to right the pelvis (`gaitAssist`,
`skills/locomotion/gait-assist.ts`). A push whose level or speed is not a number is refused (`obey`, `body.ts`).
The gaits' measured speeds are in [locomotion](reference/locomotion.md).

**Combat skills:**

- **Arm reach** (`arm-reach.ts`): where a hand meets a target with its arm laid straight from the
  shoulder (`placedReach`, `placedHeightFits`), from the spec's reference pose and the point the
  hand strikes with (`aimOf`, `held-strike.ts`), read once a spec; the openings, threats, the edge and
  the executors' admission ask it. `held-strike.ts` holds what a hand strikes with (`FIST`, `heldIn`,
  `closesToStrike`, `strikesWithBlunt`).
- **Effector strikes** (`strike-cycle.ts`, `effector-strike.ts`): one measured cycle (prepare,
  stroke, bounded contact, verified return) for each hand of the path executor (`pathExecutor`)
  and each foot of the kick (`kick.ts`, which adds support transfer). A bare
  hand closes for its blow and strikes with the fist's point (`closesToStrike`, `aimOf`).
- **Straight punch** (`straight-punch.ts`, `punch-part.ts`): from a
  stand-off a share of the arm, the trunk turned and leaned and the arm driven flat out at a
  contact pose its IK solves each step. With `timed`, the drive pushes each channel the schedule
  names on a schedule of its own (`TimedPush`: a level, a start and a length into the drive; a
  control step it covers in part pushes for that part, so a schedule means the same at every rate)
  and every other channel at the contact pose as before, the stance beneath; with `driven` beside it,
  the striking point is driven along the line too. With `fire`, the arm's drive begins once the
  fist comes within that share of the arm's length of the target, so it opens at one distance
  whatever the range. With `ease`, a channel pushed at the contact pose eases off in proportion
  near its goal instead of pushing past it each step, so the fist keeps its line. With `steered`,
  60 times a second through the drive it reads itself (`punchFeatures`,
  `src/core/skills/strikes/learned-punch.ts`: the target from the shoulder and its velocity, the fist, the
  trunk's, legs' and arm's angles and speeds, the gait's phase, the left hand mirrored), adds a
  learned steer to the trunk's and the arm's pushes (`steerPushes`), asks the legs goal with it
  (`stanceAsks`) and keeps the walk under way or halts it (`keepsWalk`). Its
  inputs and outputs are a layout file (`PUNCH_LAYOUT`, `assets/core/learned-punch.layout.json`):
  each input a named reading of the drive or a channel's `angle` or `speed`, each output a push on
  a named channel or an ask of the legs goal (`heading`, `centre` ahead or across) at a full scale,
  a distance's in proportion to the body's leg (`legOf`), or the walk's keep (`walk`). Its
  window may be narrower across the line it faces than along it (`aside`), centred with
  `squared` on the line the punching shoulder faces along at contact rather than the head's, and
  refuse a target higher than `above` over the shoulder. Its settings and the steer's network are
  its body's record (`PunchRecord`, `src/core/skills/strikes/punch-records.ts`; `dataOf("straight-punch")`,
  `assets/core/straight-punch.json` by `bodyKey`, written by `research/punch-export.mjs`; the
  bodies with one, `PUNCH_BODIES`, before it loads): the schedule searched for that body
  (`research/punch-drill.mjs`), the network trained over it (the case environment on
  `research/environments/punch.json`, [Research environments](#research-environments))
  and admitted where it lands (`research/punch-policy-check.mjs`). A body with no record does not
  throw it (`punch-part.ts`); a mind carries no punch settings, and an experiment's research
  `tuning` sets them over the record's, with no network steering.
- **Blade actions** (`blade.ts`, `blade-part.ts`): `blade-cut` and `blade-thrust` aim a held item's
  directed edge or point region on the same cycle. `shortSword` (`src/core/items/sword.ts`) is the
  first such item.
- **Guard** (`guard.ts`) has the hands no action holds. A guard is a part (`GuardPart`,
  `skills/guard/guard-part.ts`, a line in `GUARDS`, `skills/guard/guards.ts`) whose posture is the one source of
  the arms' rest: where the body is built, where the arbiter puts the arms no skill holds, and where
  a blow returns (`ExecutorMaking.guard`). It guards with the body's hands, by segment
  (`GuardSkill.hands`; the stock guards' are `handsOf`, the effectors that can cover), and asks a
  free hand's pose (`GuardSkill.handPose`); `Intent.guard`, a command's hand poses and the pose
  resources (`pose:<segment>`) name a hand by its segment, and only the hand-pose port
  (`hand-poses.ts`) names it by side. The game's pose is `GUARD` (`guardPosture`); a
  hand told what to cover (`Cover`) places its knuckles, or an item's two cover points
  (`ItemSpec.cover`), between the threat and the place guarded (`GUARD_COVER`). `shield-guard`
  also orients a buckler's face; `cover-guard` is the line-cover alternative. There is no block or
  parry: a cover is a placement, and what it costs is the blow rule's.
- **Low support** folds the stance onto a planted base for low blows; a kick or fold waits for a
  gait that drives the legs to give them back. It is a part (`SupportPart`, `skills/locomotion/support-part.ts`,
  a line in `SUPPORTS`, `skills/locomotion/supports.ts`) that says whether the legs may walk under it (`walks`).

Each executor kind is a registered implementation (`ExecutorPart`, `skills/framework/executor-part.ts`): its
module (`skills/<kind>-part.ts`) owns its config's type, keys, defaults, faults, fit, the effectors
it strikes with and its maker, and is a line in `EXECUTORS` (`skills/framework/executors.ts`, a role list), from
which `ExecutorConfig` follows; `configuredExecutors` (`action-config.ts`) makes a fighter's named
executors once each, each by the part the host's lookup finds for its kind, a mind's own included,
handed what it is made with (`ExecutorMaking`: the body, the clock, the guard's posture and each
action's aim). Action selection belongs to tactics, not to an executor.

An action (`ActionConfig`) is a name, its executor and the effectors it may strike with; where its
executor aims (`ExecutorPart.aims`), also the regions it strikes and its aim, and neither where not.
Any other key is its executor's (`ExecutorPart.actionKeys`, `actionFields`): the path strike's
path and arm extension (`PathActionConfig`, `skills/strikes/path-part.ts`), and `lower`, the support height
a low blow is thrown from. An aim is a part of role `aim` (`AimPart`, `skills/framework/aim-part.ts`; the
stock ones in `AIMS`, `skills/framework/aims.ts`) made for the blow its executor names (`ExecutorPart.blow`);
it is held in an action, not a slot, so its code is keyed with the toolkit's. Every resource an
action may hold is checked as the skill set is built (`actionInstances`).

### Minds

**The seam.** A `Mind` (`src/core/mind/mind.ts`) is `step(senses, dt)`: a stateful function from
what its body senses to what its muscles are asked. `embody(built, world, make)` makes it with its
own body (`OwnBody`: spec, segments, joints, muscles, assist, hands, its senses, its contact labels
and the completed physics intervals, `afterPhysics`) and steps it before every solver step, after
the muscles read the joints.

- It writes each freedom's activation and speed (`MuscleDriver.activation`, `.velocity`): a speed
  beyond reach is a torque at the ceiling; zero holds.
- It may ask its assist for a force and moment (`Assist.ask`), and request grips only through an
  explicitly granted port (`mind/equipment-port.ts`), which changes no pose and must pass
  geometric capture.
- That is all a mind does to the world. Camera state never reaches it; nothing else under `src/`
  drives muscles. Its memory is its `state` (`Mind.state`), saved with its body ([State](#state)).

**Senses** (`Senses`, `senses.ts`): the clock, the body's side, whether it is out, its life (a
fraction of its full life, `Pool.bar`, at once), when the fight's clock gives its verdict at the
latest (`ends`: a bout's cap or its drain's end, `EndRule.drainedBy`; absent where no clock ends
it), and every other body (`BodySense`): side, spec
with what it holds, out, down by its spec's rule, its life, centre of mass and its velocity, each
segment's pose and motion. Never a part's hit points or another mind. A fight's one
sensing layer (`createSenses`) reads every body in the step's sensing phase, before any mind, so
all minds see one moment, every other body shown late by the reaction time (`Rulebook.reaction`,
0.15 s, [play](reference/play.md#reaction-time)) and a mind's own at once. A lone body senses
the clock (`clockSenses`).

**Down.** When a body is down is its spec's rule (`BodySpec.down`, read by `uprightness`; a human
when a part but its feet and hands is within 3 cm of its lowest point, `src/core/control/ground.ts`).
`Body.down` is that rule at the step's first look, before physics, so a fight sees every body down
at one point in its step ([down timing](reference/down-timing.md)); no mind's report decides it.

**Sub-minds** (`src/core/mind/sub-mind.ts`). A `SubMind` is a mind that says each step whether it
wants the body (`wants`), and is told when it has it and no longer (`begin`, `end`); `holds` keeps
a wanted body through a phase that cannot yield. `hosting(host, subs)` makes one mind of a
`HostMind` and its sub-minds in rank order:

1. The host reads its body every step (`HostMind.look`), whoever drives; sub-minds read that view.
2. The first sub-mind that wants the body steps in the host's place; otherwise the host acts (`act`).
3. When a sub-mind takes it, the host gives up what it had asked (`HostMind.release`: goals,
   pushes, stance, the step under way).
4. When the body is its own again the host is told (`resume`) and the view says so
   (`BodyView.resumed`): every skill resumes before the decider decides (`driveBy`).

A sub-mind reads whether its body is down from its host's view (`BodyView.down`), never by a bar
of its own. Who has the body is one number in state, named by the mind (`Mind.has`, `"nobody"`
while idle). A hand-over changes only state, so a load mid-hand-over calls none of these.
Sub-minds are no part of a body: a mind that hands its body over builds `hosting` itself, a
fighter over its command layers (`commandedMind`, `sub-mind.ts`: the layers, then each sub-mind
made over their view, `SubMindMaker`, then their first look), the quadruped (`quadrupedMind`) over
its own crawl; a test or a study hands its own to a body it builds (`commandedBody`). Released, the
command layers read the ground whatever the stance (`BodyView.ground`).

**A mind is its config.** What a mind is made of is plain data tagged by kind (`MindConfig`,
`config.ts`), sub-minds nested in it (`SubMindConfig`). `createMind(built, world, config, wiring)`
(`minds.ts`) makes the mind and returns a `Minded`: the body and the mind's memory, which is all a
fight reads. A fight passes the config through and reads nothing in it.

- The maker never has the world or the built body: it gets a host (`BodyHost`, `host.ts`) with the
  body's description, the clock (`Clock`), the parts its config may name (`PartLookup`, `lookup.ts`,
  `treeLookup`: the registry's `partLookup`, refusing a part the config's tree does not name), which
  it hands every assembly that builds a part, the rules the fight is played by (`rules`, the
  arena's unless the fight gives its own),
  and one way to take the body, once (`BodyHost.take`): the mind it makes of its own body
  (`OwnBody`), with whatever it builds on it: the command layers (`commandLayers`), which a fighter
  hands over to its sub-minds (`commandedMind`); a host and sub-minds of its own (`hosting`); or a
  policy (`policyMind`, detached observations and actions). The host builds the fight's body
  (`PhysicalBody`) the same way for every mind (`hostBody`): who has it is the mind's (`Mind.has`),
  read by asking `commandsBody`, and where the mind drives through the command layers
  (`Mind.body`) the fight's body shows their view (`HostedBody`). A body built outside a fight (a
  test, a study, a task) is built the same way under the command layers (`commandedBody`). The
  command layers are the humanoid's: their view's fists, head and stance
  (`BodyView`) and the intent's guarding hands belong to them, beside the general body (segments,
  joints, effectors, contacts, muscles). `commandLayers` refuses a body they cannot read with what it
  lacks (`commandRefusal`); a mind built on them fits only such a body (`takesCommands`). The host applies the fight's grants (senses, assist ceiling, contact labels, seed, rules; `HostGrants`); no maker
  can widen them.
- **Chance comes from the host's seed** (`BodyHost.seed`): a bout's seed (`DuelRecipe.seed`, 0
  unless given, `&seed=` on the page; written into each evaluation case's recipe and named by the
  report) and the body's side make each mind's (`seedOf`, `src/core/math/random.ts`), the crypt's
  from its level's seed and the body's id, so the two sides draw apart and a case replays to the
  bit. A mind draws from a `randomStream` whose word is in its `state`, so a fork copies it;
  `Math.random`, `crypto.getRandomValues` and the clocks are refused in its folders
  (`tests/core-boundary.test.mjs`). The valued chooser's `margin` draws among the options worth
  within it of the best, in proportion to their worth above that floor; 0, the default, draws
  nothing. A mind that draws is read over repeated trials.
- A mind publishes what it is doing (`MindMade.report`, `MindReport`): what its planner reports
  (`Engagement`: its phase, focus, candidates or offers, and details of its own), its heading,
  its gait's limits and its navigation's report, and what its body can do: its kit (each action,
  its executor's kind, its limbs and regions), the actions under way and ended, and its menu
  (`MenuEntry`, `src/core/skills/framework/menu.ts`: each action, limb, foe and region, and whether it
  could start from where the body stands), read when asked and changing nothing, which the mind
  contract holds. A mind that runs the game's skills and gives
  them (`MindMade.skills`) publishes theirs with its planner's (`skillsReport`,
  `src/core/mind/report.ts`; `driveBy` returns the skills, the memory and the report together,
  `Driven`); the skills report none of the layer above. One that runs its own, as the
  quadruped does, gives its own. A screen and a Commander read the report, never the mind's kind
  or state; a scene that
  drives a mind by a script of its own (the Lab's modes, a fall on the stand bed) asks its
  controller how (`Controller.scripted`, `takesScript`: the body it builds and the drive under the
  script, by the mind's own config), whatever its kind; the Lab's Stand-up,
  which asks its body only what orders say, also hosts a mind that takes no script but carries
  them out, made as a fight makes it (`labDrives`, `labActor`). A part names the
  phases it reports and how a person is shown each (`Part.phases`, `phaseLabels`), and whether
  it carries out a person's orders (`Part.obeys`, `treeObeys`): an Arena side a person takes
  under a mind whose tree holds none says that it fights on its own.
- A fight enlists every body one way (`enlist`, `src/core/combatant.ts`): built with what it holds,
  its pool, the fight's senses and fixed geometry, and the mind its config makes.
- The mind's folders (`mind`, `intent`, `navigation`, `perception`, `tactics`, `recovery`,
  `skills`, `control`, `reptile`, `option` in `src/core/`, and `src/entrants/`) import no engine,
  world, builder or read-view maker, beside the adapters `tests/core-boundary.test.mjs` names.
- Controllers run synchronously inside `World.step`; frame timing never schedules them.

**Controllers.** A kind of mind is a `Controller` (`controller.ts`) written in a module of its own
(`fighter-kind.ts`, `src/core/reptile/kind.ts`, `src/core/option/mind.ts`, an entrant's `mind.ts`):
the toolkit's are listed in `MIND_KINDS` (`src/core/mind/kinds.ts`), an entrant's in its manifest
(`Entrant.minds`), and each manifest is one line of `ENTRANTS` (`src/entrants/index.ts`). Each list
holds its imports and the list and nothing else, so a case's code can begin each kind's own code there.

**The catalog is a value** (`Catalog`, `catalogOf`, `src/core/parts/catalog.ts`): made from lists of
minds and role lists of parts, it answers every lookup of kinds, parts and trees. The core holds no
list of entrants: it takes a catalog as an argument (`createMind`, `builtAngles`, `hostedMind`,
`src/core/mind/minds.ts`; `Enlistment.catalog`, `src/core/combatant.ts`), and its own tasks use the
toolkit's (`TOOLKIT_CATALOG`, `src/core/toolkit.ts`). The game's is `GAME` (`src/entrants/game.ts`):
the toolkit's minds and parts, then each entrant's; that module re-exports its lookups by name.
`CONTROLLERS` keys the kinds by kind: its config keys (`keys`), the bodies it fits (`fits`) and its
maker (`create`). `MINDS` is what a person may pick: every entrant's presets, by an id no two share; a
toolkit controller alone is no pick.

**An entrant** (`Entrant`, `src/core/parts/entrant.ts`) is one AI: its name (its folder's), its own
kinds of mind (`minds`), its own parts of any role (`parts`) and its presets. Every kind it registers
is scoped by its name (`vanguard:plan`, `scopeOf`); the toolkit's kinds are not. A tree names the
toolkit's kinds and one entrant's at most (`treeScope`), so an entrant builds on the toolkit and
never on another entrant; a part two entrants want belongs in the toolkit. The catalog refuses, as a
value in `Catalog.faults` with the entry left out, an unscoped or misscoped kind, a kind twice, a
preset id twice, a preset whose tree is not formed and a preset naming another entrant's kinds. A preset may name the body models it is calibrated for (`MindPreset.models`,
`presetFitsModel`) and the character it plays them on (`MindPreset.character`, above). Arena, Lab and named evaluation entries use that availability as well as
physical fit; a custom configuration still fits by its parts. The Lab discovers script-compatible
presets from this registry, with its Script and Guard scenario defaults added.

| Kind | Maker | What it composes |
|---|---|---|
| fighter | `createFighter`, `fighter.ts` | tactics and skills as parts in slots (`FighterConfig`); its presets the `classic` entrant's (`src/entrants/classic/`) |
| quadruped | `src/core/reptile/` | crawl, trot, bite, righting; its preset `crawl` the `crawl` entrant's (`src/entrants/crawl/`) |
| option | `src/core/option/` (the toolkit's); its presets `option` in `src/entrants/option/` and `option-skeleton` in `src/entrants/option-skeleton/` | a chooser over its options (below), on its situation and percepts, over the toolkit's body layer, the support fold its low support (`kitSkills`); its rise the ground options over the ground executor of its techniques (`ground`), no sub-mind; what the legs and the motor did not carry out shown as its `Unmet` detail; the smallest working config by default (`OPTION_DEFAULTS`: no blow, no low support); `option` adds the learned punch and the stomp, on the Warrior; `option-skeleton` the low front kick and the support fold, on the Skeleton |
| bare:mind | `src/entrants/bare/` | a network from the body to its muscles and nothing of the toolkit's control (`host.policy`): every `every` control steps it reads its layout (`bareLayout`: each channel's angle and rate, its root's up, velocity and spin and its centre's height, the nearest other body, its orders' direction and pace, each in its heading's frame) and pulls each channel, -1 to 1, from the next step; with no network (its one preset, `bare`, on no menu) its pulls are its learner's outputs (`Learner`), which a trainer writes |
| drill-opponent | `src/core/mind/drill-opponent.ts` | a drill's opponent: its body's mind (`body`, a mind whose tactics follow orders) given its script's orders (`beats`: stand, hold a range of the foe, strike it, or its own tactics, each for some seconds, round again); its scripts are the evaluation's, on no menu (`DRILL_OPPONENTS`, `opponentOf`, `src/evaluation/drill-opponents.ts`: `drill-stand`, `drill-step`, `drill-guard`, `drill-punch`, `drill-press`) |
| vanguard:mind | `src/entrants/vanguard/` | the shared fighter and Lab driver, with its own layered planner, contact-score attack selection, committed predicting punch that checks its aim before the arm drive, configurable conservative stance walk and extra obstacle room for Warrior navigation; shared blade cuts and thrusts; explicit `vanguard-warrior`, `vanguard-rogue` and `vanguard-skeleton` calibrations, each offered for its own body |

**A mind is a tree of parts** (`Part`, `src/core/parts/parts.ts`). A part has a role (`Role`: one
the part lookup knows, `RoleParts`, `lookup.ts`), a label, a stage (`game` or `experimental`), the `fields` a
person may change (`fields.ts`: trade-off choices, never a controller's searched constants), its
slots (`slotOne`, `slotList`, `slotsOf`), `defaults`, `fits`, `faults` and `needs` (a `Provision` a
screen must give). A catalog's `allParts` is every part by kind: the parts below a mind, each
mind, and each entrant's parts (`Entrant.parts`), read once on first use so that any module may
load first. A role whose parts make themselves has a list of them that holds its imports and its
list and nothing else (`NAVIGATIONS` in `src/core/navigation/`; `EXECUTORS`, `GUARDS`, `SUPPORTS`, `LOCOMOTIONS`,
`AIMS` and `MOVE_RULES` in `src/core/skills/`; `PLANNERS` and `BEHAVIOURS` in `src/core/tactics/`;
`SUB_MINDS` and `TECHNIQUES` (`ground/`) in `src/core/recovery/`; `MOTORS` and `BALANCES` in
`src/core/control/`; `CHOOSERS`, `OPTION_KINDS`, `OBJECTIVES` and `PREDICTIONS` in `src/core/option/`), so a case's code begins each part's own
code there; its parts make what they are (`NavigatorPart.make`), and an assembly makes the one a
config names as the host's lookup finds it. A part whose checks read the parts it names is handed
the lookup (`Part.fits`, `faults`, `strikes`), so no part's module reads the registry.

**The roles are an open list.** `RoleParts` names the toolkit's roles and the interface each is
looked up as (`mind`, `sub-mind`, `technique`, `tactics`, `behaviour`, `move-rule`, `navigation`,
`motor`, `balance`, `aim`, and a skill's: `locomotion`, `guard`, `executor`, `support`). A package with
roles of its own adds them where it declares their interfaces, by augmenting `RoleParts`: the option
framework's `chooser`, `option`, `objective`, `percept`, `prediction` and `predictions`
(`src/core/option/parts.ts`), the
quadruped's `support-motor`, `gait`, `bite` and `quadruped-tactics` (`src/core/reptile/parts.ts`).
A role is a string at run time; the list is the compiler's, so a new role edits no toolkit file.

Over the tree:

- `treeFaults` names each fault by path (`subs.0: ...`); `createMind` refuses a tree with any, and
  `partOf` refuses an unknown kind. A tree naming two entrants' kinds is a fault, an aim its actions name (`ActionConfig.aim`) as a slot's part.
  `Part.faults` runs only when every descendant slot holds parts of its role and owner;
  malformed nested slots return their faults without invoking ancestor hooks that traverse them.
- A part's `fits` answers why a body cannot carry out what it commands, or null where it can: the one
  source of compatibility. It names what the part uses beyond what its mind gives it: legs and the
  sub-minds that stand need soles (`fitsSoles`), an executor one of its effectors
  (`strikesWithOneOf`), a guard a hand that covers; a planner uses only its mind's view. `treeRefusal` gives the first refusal in a tree by path;
  `kindsFor` lists every part of a role a tree's slot may hold, the toolkit's and the
  tree's own entrant's, with the reason it cannot go somewhere.
- A part's experiment settings live under `tuning`, are named by `Part.tuning`, and never travel in
  a link (`withoutTuning`). A key a part does not read is a fault, never silently dropped;
  every part states its keys (`Part.keys`, `KeysOf`), checked at compile time; a part from plain
  JavaScript that states none is a fault in every tree that holds it, never a crash.

**Presets.** `BLADE_FIGHTER` (`src/core/tactics/config.ts`) is shared action tactics over a blade's cut and thrust, striking with
nothing empty-handed or holding a blunt item; the `classic` entrant's `CLASSIC`
(`src/entrants/classic/presets.ts`) adds `MOVE` and the game's Stand up
(`STAND_UP`, the toed rise). Puncher (the straight punch as its body's record has it),
Counter-puncher and Behaviours vary the actions and spacing. The Duellist (`DUELLIST`), the blade
thrust and a ward, holding a short sword, is every humanoid's default (`defaultMind`). A preset
marked `offered: false` (Classic, Counter-puncher, Behaviours) is kept off the Arena's and the Crypt's menus (`offered`, `controller.ts`), while a link, an evaluation
or a test may still name it. An arena recipe may name each side's mind (`DuelRecipe.minds`); the Crypt
chooses by participant, side and model (`DungeonRunOptions.mind`); the Lab's actor by
`ActorOptions.mind`.

**Option Mind's options** (`src/core/option/`). An `Option` (`option.ts`) is a
skill applied to a target in one shape: its entry (`Readiness`: ready, else waiting or blocked and
why), its claims, its model (`Terms`, with where it leaves the body, `Place`, and, where it may be
let go now, what letting it go leaves), its step (`Step`: what it asks and what its asks hold, the
asks' `Sight.needs`) and one status (`Status`): committed, yielding, at its exit (a strike's
stroke's end, its blow's `release`: kept there, it throws its next blow), or over. A strike yields
before its blow's `commit`, its point of no return; a goal, a cover, the orders and a rest option
always yield; a ground option where its run says it may. An option's entry is its skill's
readiness: a strike's its limbs' (its executor refuses a body down and a target out of its band); a
walk's, holding the position's, following orders' and the guard's the legs'
(`legsReadiness`, `src/core/skills/locomotion/locomotion.ts`: a body down cannot walk), and brace's the
reverse; the cover is on offer down or standing where no action holds the hand it covers with.
Each claims resources while it runs (`claims`: a strike what its blow needs with the limb it
strikes with, `Sight.needs`; the cover the hand on the blow's side; a gait's walk the legs; a
ground option the whole body, `WHOLE`). An option may have targets to run at (`Option.targets`, a
gait's destinations), which the chooser prices it at, aiming it at the best (`Option.aim`). A
strike never walks: a walk into its window is a gait's, to a place (`windowPlace`, below), and the
strike is priced there as at any place (`Option.at`), its window tested at the place's spot
(`windowHolds`, the ready limb's window carried by its readiness, `Readiness.window`). The rest
options (`rest.ts`), worth nothing, take what nothing else is worth more on: hold the position
facing the focus (`hold`, the legs), the hands at their guard (`guard`, over the body's hands,
`guardOf`), and down, brace (`brace`, the whole body, priced as the rise that never stands from
where the body lies, `downTerms`, asking the ground's brace, `Ground.rest`).
A ground option (`groundOptions`, `ground.ts`) is carried out through the skills as an action of
the ground executor (`groundExecutor`, `ground/held.ts`): each technique of a list, the
repositions, flatten, and brace, land and steady (brace and the steady with its climb in
`ground/steady.ts`, shared with Stand up), each run on the body held whole, holding every
resource, asking no stance and pushing every muscle as its run drives it. No supervisor offers
them: a technique is on offer where its own entry admits the body as it lies
(`TechniqueRun.admits`) once its position is read, on a body tumbling only once braced its second
(`BY_HAND.braced`); brace while the body tumbles off its feet short of that, the steady on its
feet, land while its position is unread. A technique begun runs to its end, yielding where its run
says it may; the others yield. Each is priced where it leaves the body (`downTerms` with its
`Place.posture`): an edge its expected seconds and, in its share done, the posture it reaches, the
rest down where its failures come to rest; a lying posture is worth the rise from it
(`Ground.riseFrom`, the prediction `downCostAt`), the least expected seconds to standing over the
edges from it and the steady's. A way's share done is its profile's, by hand where none is
measured (`BY_HAND`), moved by the rise's record of its attempts from that posture (`recorded`),
so a way that fails is priced the dearer and another is taken. A rise runs from the step the body
goes down until it stands ready with nothing under way and the steady not climbing. On its feet
while the rise runs, the body is counted down until the steady braces it (`Ground.unbraced`: the
steady's seconds left, the percept `unbraced`; `here`), and a standing option leaves it counted
down (`fromHere`), so only the rise stands it. What happened since the last step (`since`: an
attempt ended, the rise begun or over) is read before the percept is. Once down,
the body reads the ground while no stance is asked (`BodyView.ground`).

- **Percepts** (`PERCEPTS`, `percepts.ts`), the registry of what Option Mind perceives with fixed
  geometry and kinematics: each step `situationReader` (`situation.ts`) reads every named percept
  once into the `Situation` (down, the seconds until the body is braced, orders, focus, distance,
  the blow coming, how late the senses show the focus, the lead and the time left before the
  clock's verdict; the gait's phase, bearing feet and speed; what the legs and the motor did not
  carry out; the focus's phase, striking, down, rising or clear, `foePhase` in
  `src/core/perception/threat.ts`, its posture, standing or how it lies, `sensedPosture`, and its blow's
  time to contact); a percept's cue is what a chooser watches (`eventOf`). Reach is read head to
  head: the focus's and this body's. The focus is the foe the orders name, else the one the chooser
  last ran its set at while it is in the fight, else the nearest; the reader reads the situation at
  each other foe the orders leave open as the chooser asks (`others`).
- **Percept and prediction parts** (`PerceptPart`, `PredictionPart`, `src/core/option/parts.ts`):
  what a situation reads beyond its own, each a part of role `percept` or `prediction` read from
  the step's `Seen` by its config (`Situation.perceive`, `Situation.predict`), once a step and only
  where asked, through the predictor (`predictor`). The option kind or objective that reads one
  names it in its `uses`, so its tree names it. They have no cue, and a place leaves them as now.
- **Predictions** (`PREDICTIONS`, `percepts.ts`): what data a drill, a training run or the rules
  make says of the situation, stale with that data, read through one object
  (`Situation.predictions`, `predictor`) the first time it is asked in a step: the blow coming's
  cost (`danger`), the focus's pressure and this body's on it, what a fall costs, how far the focus
  closes while the senses show it late, each hand's blow at a segment of the focus. The pressure
  (`Pressure`) is what the focus is expected to deal the body a second, over the range, read at how
  the two stand (the focus at its posture, the body standing): measured from the strike profiles on
  the focus's body where there are any (`profilesOn`), else this body's own, and says how it is
  priced (`Pressure.priced`); an option is charged it for its time near the focus (`threatened`).
  The body's own strikes press the focus the same way (`pressing`), standing at the focus's
  posture. A model no drill measured is its prior, read as a measured one is: the pressure's and
  the danger's a profile of one cell (`prior`) between two standing bodies, none where either lies;
  the strike's its cell's expectation at the segment it aims (`StrikeOption`'s `priorOf`), a gait's
  braced at once and up, the rise's `BY_HAND`.
- **Profiles** (`src/core/skills/framework/profile.ts`): what a skill's drill measured it to bring, in one type
  for every skill: cells over the range and the foe's phase as the striker sensed it where the
  trial began (`sensedPhase`), each the share done, the hit points dealt and lost, the seconds and
  the share ending down, where those not done came to rest, what letting it go before its
  point of no return cost by the progress of the motion it was let go at (`letGo`, where a drill
  let it go: the seconds until the hand was back at its guard, and what was lost meanwhile), and
  the percepts its trials ended in, by name (`exit`: a strike's range head to head, which the
  strike's exit takes), and how the two bodies stood as its trials began (`Postures`, both standing
  unless named) (`ProfileCell`). Each names what it
  was measured on (`Measured`: the body's key and spec digest, the skill's digest, the rate and the
  reaction time), and one read on another is stale (`staleness`) and not read; and the body it was
  measured against (`Target`, none for a skill with no foe). A profile is read one way,
  `readProfile` (`ProfileReading`), at a pair of postures, its cells measured there alone: its reach in a phase, what it expects from a place (`ProfilePlace`:
  the range, the foe's phase and the motion's progress) against the body struck now (`Expected`, in
  life: hit points over that body's), its peak a second, and why it is scaled where that body is not
  its target. The strike's model (a blow under way priced from where it is: the time its motion has
  left, its payoff unless it has met the target, letting it go at its progress), the pressure, the danger of a
  blow coming and the rise's edges (`edgeExpected`) read it. Scripts write them from drill
  records: the strikes' from the Strike drill (`research/strike-profiles.mjs`,
  `assets/core/strike-profiles.json`), the ground edges' from the Rise drill
  (`research/edge-profiles.mjs`, `assets/core/edge-profiles.json`). A mind reaches them as mind
  data (`dataOf("strike-profiles")`, `dataOf("edge-profiles")`, `src/core/data/store.ts`), which the
  parts that read them declare (`Part.reads`); an entrant's own profiles would be a key of their
  own. Each reader says how it is priced: a strike (`StrikeOption.priced`), the pressure, the rise
  (`Ground.priced`); Option Mind reports them (`Profiles`).
- **Footwork** (`places.ts`): an option a gait (`walkBy`), run at whichever place
  (`Destination`) it is worth most to walk to, each derived from a skill or the foe, each source
  of places a kind of option: into each strike's window where its readiness gives one
  (`walk-into-windows`, `windowPlace`, `windowSpot`, `src/core/intent/action-window.ts`), and out of
  the foe's pressure (`walk-out-of-pressure`, `outOfPressure`: past its modelled strikes' reach,
  `edgeOf`, by `closes`, how far it walks at its measured fastest walk in the reaction time), on
  the line from the focus. A place names its spot on the ground (`Spot`);
  the walk there (`walkTerms`) is priced by the route's length at the gait's pace in each direction
  to the focus, the foe's pressure while within its reach on the way, and where it leaves the body:
  the range and the bearing around the focus, turned by what the focus turns while the walk lasts
  (`Predictions.turns`, its measured turn, `turnAt`). A gait (`goings`, a `Going`) goes at its pace,
  asking it (`Intent.gait`), and leaves the body unbraced for the seconds the Gait drill measured it
  stopping to throw each strike (`ready`, by the action), at its share fallen
  (`dataOf("gait-profiles")`; unmeasured, braced at once). Another strike adds a place; another
  gait, an option of each kind; another source of places, a kind. What a walk's place is worth
  beyond the position is the chooser's to look past (below).
- **The objective** (`Objective`, `objective.ts`), a part of role `objective` (`ObjectivePart`)
  in the valued chooser's `objective` slot, each a line in `OBJECTIVES`: what an option's model
  (`Terms`: its duration, payoff and exit) is worth to the body in life beside its defaults holding
  the position, its orders at its obedience (`Objective.worth`); its memory, where it keeps one,
  in its chooser's state (`Objective.state`). Its exit is a `Place` (`position.ts`): a prediction
  of the percepts an option leaves, each by its name (the range head to head to the focus,
  `range`, the chance the body is down there, the seconds until it is braced there, `unbraced`,
  and any other percept it names, `posture` or `around`; one it does not name is as now,
  `atExit`). Combat's objective is a few terms (`FEW_TERMS`): what a place is worth
  (`placeWorth`), the lead expected at the verdict from there, and the rate of play
  (`rateOfPlay`), what a second of the fight is worth with the defaults holding the position; the
  place's terms are the lead, a fall's cost at the chance of being down, the range against how far each
  side's modelled strikes reach (`edgeOf`; the body's own pressure on the focus there over a held place's time once braced, less the
  focus's on it once it has turned to face the body, `turning`),
  and late in the bout the lead at stake within the focus's reach, or a lead behind out of the
  body's own; its rate of play, what holding the place costs (the focus's pressure there, and in a
  clinch its falls).
- **The chooser** (`chooser.ts`), a part of role `chooser` (`ChooserPart`,
  `src/core/option/parts.ts`) in Option Mind's `chooser` slot, each a line in `CHOOSERS` (`valued`, `ranked`;
  `depth`, `chooserOf`), takes the option on offer of highest
  worth: at depth 2 a walk is worth also what the best option at its spot gains over the best on
  offer now (`lookingPast`), each priced there from the percepts the place predicts (`Option.at`,
  `placed`), never the world forked, keeping the running one by what letting it go costs (`Offer.letGo`, `src/core/mind/engagement.ts`),
  deciding afresh on a cue's change, when the running option reaches its exit, or every
  `rethink` s. It selects a set (`Chooser.decide`): a running option that does not yield keeps
  its claims; with none, the target, the foe whose situation's best option is worth most, the one
  it ran at where none is worth more (`Chosen.at`); then the best on offer, then the best of the rest whose claims are still free, until
  none is left, a rest option before its equals (`Option.rest`), so that an option takes a resource
  from rest only worth more; the rest options are last by rank, so `rest` is the option's own mark.
  A rest option is chosen with whichever of its claims are still free, any other with all of its
  claims or not at all. An option with targets is priced at each and aimed at the best.
  The set's step is its members' made one intent by the toolkit (`stepSet`, `intentOfSet` and
  `SelectedAsk`, `src/core/intent/intent.ts`): the walk and facing of the one claiming the legs,
  every member's actions and covers (`Asked.guard`), less a cover of a hand a member's ask holds. Valued worth (`Objective.worth`; the few terms', `fewTermsWorth`, `objective.ts`), in life, a share of a body's full life, the
  verdict's unit, beside the position held: each option's `Terms`, the focus's life its blows take
  less its own the blows it takes take beyond the blow coming, measured where a profile prices the
  blow (the rules' damage of each contact the drill recorded) and its prior from the fight's
  rules where none does (`blowLife`: the blow's energy, the struck face's share of it and the
  rules' `sideDamage`, over the struck body's hit points; the rules reach the mind as
  `BodyHost.rules`); the orders at the person's `OBEDIENCE`, the one weight: a metre walked as
  ordered, and a named foe's life worth more; the position where it leaves the body less the
  position now (`placeWorth`), a fall's chance there at what lying there costs (`downCostAt` of the posture the place names, else `downCost`, a fall onto the back: the blows of
  a foe standing over the body, the focus's, down or not, and with none one of its own kind, over
  its rise's price, at most the life the senses say it has); its time at the rate of play; and, running, what letting it go costs: the life the body
  loses while it comes back beyond what holding the position as long costs. Ranked worth is the
  options' order.
- **The walk's limit**: each option that asks the legs keeps its walk out of a solid's clearance and
  every fallen body's reach but the one it means to be near, the focus where it walks to strike
  (`Walker.kept`, by navigation's `keepOut`, `clear-step.ts`); the strike's exit prices the clinch
  it walks into (`clinched`).
- **The cover** (`covers`, `cover.ts`): one option, its target a blow predicted to reach the head
  (`incoming`, `READINGS.predicted`), on offer while the hand on the side the blow comes from has
  no action under way holding it, at most a second a run of blows; it claims that hand, asks it
  between the blow and the head, and is worth the share of the blow's life it keeps off (`STOPS`
  of `danger`, that blow's life), so it outbids the guard on that hand while a blow comes.
- Its defaults are `OPTION_DEFAULTS` (`mind.ts`). A drill leads it by orders, as it leads any mind
  (the `drill` and `stand` Commanders); firm orders to move or stand that name no foe keep its
  follow-orders option running (`followOrders`, `options/orders.ts`), whose blows are those the
  orders allow and whose ordered way round a body lying is not kept off it.

**The quadruped** uses the same `OwnBody`, muscle driver and `PhysicalBody` lifecycle. It is
built of parts (`src/core/reptile/parts.ts`), each slot of its config holding one of its role or,
where it names none, the stock one (`QUADRUPED_PARTS`): a `support-motor` over the paws
(`SUPPORT_MOTORS`: `supportedMotor` on the bearing solve, no assist), a `gait` to travel and
one to crawl (`GAITS`: the trot and the crawl), a `bite` (`BITES`) and `quadruped-tactics`
(`QUADRUPED_PLANNERS`) that give approach, facing and bite. Each fits a body by what it uses
(`fitsPaws`, `fitsJaw`); its skills answer the same `Skill` resume contract over its own view. Its bite wounds by pointed load ([bites](reference/reptile-bites.md)).

**Policies** (`policyMind`, `mind/direct.ts`) receive a frozen actuator description and
detached, frozen `BodyObservation` snapshots (`src/core/observation.ts`) and return a `BodyAction`
(`mind/actions.ts`): whole arrays in channel order (activation and velocity, or signed torque
within the same envelope), an assist ask (`AssistAsk`), grips and hand poses. The host validates
and copies the whole action before applying any of it. A policy receives no engine handle.

**Recovery sub-minds.** Each reads its host's down state and the world's clock, and may observe the
completed physics through its own body (`SubMindMaker`, `OwnBody.afterPhysics`).
Each kind is a registered implementation (`SubMindPart`, `recovery/sub-mind-part.ts`): its own module
beside the sub-mind (`<file>-part.ts`) owns its config's type, keys, defaults, faults, fit, the
data it reads and its maker, and is a line in `SUB_MINDS` (`sub-minds.ts`, a role list), from which
`SubMindConfig` follows. Its maker is handed the mind's kit (`MindKit`, `mind/kit.ts`: its motor,
its guard and the guard's posture, and the lookup), which it and its techniques drive the body
with, so a motor or guard swapped into the mind is the one recovery uses (`subMindsOf`, `kitOf`):

| Sub-mind | File | What it does |
|---|---|---|
| `lie` | `lie.ts` (`lying`) | asks nothing |
| `support-recovery` | `supportRecovery` | the staged rise (`stagedRise`), then verified quiet standing (`recoveryReady`) before handing back ([recovery](reference/recovery-cycle.md)) |
| Stand up | `ground/` | its list of techniques (`TechniquePart`, `ground/technique.ts`, each in its own module and a line in `TECHNIQUES`, a role list), with physical admission and completion, routed by least expected time where its edges have fresh profiles (`edgeExpected`, `profile.ts`; `choose` in `ground/graph.ts`) and in rank order where not, rolling to reposition (`techniquesOf`); a technique whose entry reads motion and the raw position (`TechniquePart.moving`) is begun on a body still moving, and only a body none admits is braced; the game's (`STAND_UP`) is the staged roll and down, the sit-back and the front sit-back, on toes; `step-up` (`ground/step-up.ts`) and its route in five parts, each an edge (`ground/staged-edges.ts`, `STAGED_ROUTE`), are flat-footed and kept for comparison |

**Mind data loads per use** (`src/core/data/store.ts`). The straight punch's records
(`assets/core/straight-punch.json`) are a module of its own in `src/core/data/`, imported only by `loadData`, so it is a chunk of its own that a page
fetches only when a mind it builds reads it. What a key's data is, its reader declares
(`DataOf`, added to by `skills/framework/profile.ts` and `skills/strikes/punch-records.ts`), so the
store names no skill. A mind reads its data when built (`dataOf`), and
throws, naming the key, where it is not loaded. A part says what it reads (`Part.reads`), and
`treeData(config)` (a catalog's) collects a tree's: the Arena loads both sides' before the
bout, the Crypt every participant's before the run, the Lab its mind's before the body. In Node,
`tests/harness/preload-data.mjs` loads every key, imported by each module that builds a
data-reading mind (the stand and the bout among them).

`BodyView.ground` (`groundReading`, `control/ground-reading.ts`) reads each segment's fixed-contact load, sole support
and trunk motion while the body is down; `standReady` requires quiet flat two-foot support with the
centre of mass inside it. **The riser plays a recipe** (`RISE`, `rise/stages.ts`): plain data of
pose stages (`PoseStage`, postures from each freedom's own zero, `DofSpec.bind`; timed, or ended by
what the body has done, `Until`, and paced by the balls of the feet, `Pace`) and bearing stages
(`BearStage`, its limbs the body's bearing ends, `BodySpec.ends`, made by `riseLimbs`), after reading how the body lies (`lieOf`, `control/ground-reading.ts`). `stageFaults` says
what a body cannot play, and a riser refuses such a recipe. How far it stands each body:
[rising](reference/rising.md#where-the-rise-stops).

**Tactics** (`src/core/tactics/`) are deciders (`Decider`, `src/core/mind/decider.ts`): they read
`Sight` (the view, senses, reports, readiness, what an action holds, envelope) and
return walking, facing, lowering, cover and discrete action requests; they never write a joint,
posture or push. A kind of tactics is a part (`TacticsPart`, `tactics-part.ts`) that makes itself
(`tacticsOf`), a line in `PLANNERS` (`planners.ts`, a role list): the screen's script, standing in
guard, or behaviours. Behaviour tactics (`actionTactics`, `action-tactics.ts`) hold one focus and
one choice of candidate action, ranked, rotating, scored, by estimate or by rules, and hand each
behaviour of their list its `Turn` in rank order; a behaviour (`BehaviourPart`,
`behaviour-part.ts`, a line in `BEHAVIOURS`, its module in `tactics/behaviours/`) fills what an
earlier one left unset and keeps its own memory, held in the tactics' state. The helpers they share
(`walking`, `SPACE`, `footRadius`) are `behaviour-part.ts`'s. A planner names what it needs of the
mind's actions (`TacticsPart.actionFaults`) and dependencies on its skills
(`TacticsPart.kitFaults`), read by the fighter's faults. A planner holding another delegates both
checks, preserving the child's path. Its optional `TacticsPart.prepareSkills` adapts the shared
kit once during fighter construction; nested parts compose preparation from the innermost out.
Preparation reads the composed planner's operational context live through the seam
(`Decider.decision`). Adaptive policies retain separate decision memories over that one prepared
kit. A supplied scenario script takes the fighter's tactics slot as the script tactics
(`SCRIPT_TACTICS`), whose own part makes it and prepares the kit, so it replaces the configured
planner and its preparation.

Planner layers read operational facts through the seam's decision (`Decider.decision`, a
`TacticalDecision` for tactics, `TacticalDecider`): selected focus, evasive
footwork and the action-entry window being approached. A screen's script publishes none
(`Script`). A part declares
the fields it supplies (`TacticsPart.decisionCapabilities`); composite parts forward them and
reject enabled layers whose inputs are unavailable. Behaviour tactics publish those facts
from their selection and footwork, independently of display phases, with changing values in
their saved state. A layer forwards changing decision contexts live, including policy switches.

A layer appends inspection details with `engagementWithDetails`: the inner report stays live,
and labels and values are formatted only when read. Reports never carry decision authority;
removing one or changing its labels does not change what a planner decides.

**Orders** (`Orders`) name a movement objective, an independent facing, and a sensed foe id and
region, and may cap the speed (`pace`) or ask a walk (`walk`, Shift in the Arena); never a camera
point. A person gives orders; the body's own mind carries them out (`orderedIntent`, `ordered.ts`).
**Movement requests** (`src/core/intent/movement.ts`) are Direct directions, Place waypoints or Range
bands about a sensed body; null asks a controlled stop. Tactics and orders give a movement request,
a facing and at most a ceiling (`Intent.pace`, `Intent.walk`); none writes a velocity.
Navigation is a part between tactics and locomotion (a fighter's and the quadruped's `navigation`
slot), a `Navigator` (`navigator.ts`) that the skills (`SkillParts.navigation`) and the
quadruped's tactics are handed; a skill set given none refuses a movement request. Both of the
game's are a walker (`routeWalker`, `navigation.ts`) that differs in how it finds a route to a
place (`PlaceSearch`): Visibility routes (`visibility-navigation.ts`) by the shortest route round
inflated fixed footprints (`createRouter`, `route-search.ts`), Local clearance
(`local-navigation.ts`) only straight. A navigator is also its body's clearance (`Clearance`,
`clear-step.ts`): how a step keeps clear of the solids sensed (`keepClear`) and where a body
inside a clearance steps out (`exit`), which a planner reads from its sight
(`Sight.clearance`) and a skill set given no navigation takes from its body
(`stockClearance`). A planner's walk is kept out of a solid's clearance and a fallen body's reach
by `keepOut` (`clear-step.ts`), which Option Mind's walk applies to what it asks (`Walker.kept`). The walker reports its route, distance, arrival and stalls; how far an order has left is read from the order (`remainingOf`). It keeps
its route and searches again only where the route breaks: the solids sensed change, its own side's
fallen bodies come to lie across it, its clearance grows or shrinks by `NAV.margin`, it has stalled,
or a goal that moves is
neither straight ahead nor seen from the route's last corner and has gone `NAV.moved` from the
route's end. A range goes to the nearest spot in its band where that is open and straight ahead;
else to the spot it chose last, carried with the body it ranges about while that spot is open and
its route reaches it; else to the cheapest of `NAV.rangeSamples` spots round that body. A place
may name the body it is by (`MovementRequest`'s `by`): that body is not kept off as a fallen one,
and the place's points are the way round it. A walk into an action's window on a body lying
(`Window.on`, `approachActionWindow`, `src/core/intent/action-window.ts`) stands beside that body:
of the places about the window's target at `LYING.bearings` turns from along the body
(`lyingAxis`), those where each foot keeps `LYING.footRadius` clear of its colliders up to the knee
(`sensedFootClearance`), the one whose way round it (`groundRoute`, clear over the same column)
and turn to its facing cost least, reckoned `LYING.lead` s along the body's motion, so the place
it set off for stays its choice.
**The bodies about it** (`src/core/navigation/crowd.ts`): a fallen body, of either side but the one it
ranges about or goes to a place by, is a fixed footprint it routes round (`fallenSolids`), kept from step to step and grown to take in where the body's parts
lie, and taken afresh once its centre has moved `CROWD.settled`, so a body twitching where it lies
changes no route; and every walk it gives is kept clear of its side's standing
bodies (`crowdWalk`): of the ways its route asks or turned from it by up to six sixteenths of a
turn either side, or none, the one nearest the walk asked whose sweep keeps `CROWD.margin` clear of
each over the next `CROWD.horizon` s or the time it takes to stop, judged from its velocity now
changing at most at its gait's stopping rate (`Locomotion.stopping`), each way as fast as its
envelope holds it from its heading and as it stops from before a body ahead. It reads one sensed
moment and no other body's choice: a body behind it on the way it is asked gives way to it, and
turning right costs less than left, so two bodies that meet decide alike in either order and pass
on their right. It faces the way it goes. A body held back that
way by another body (not by its gait's own cap), or going against the way it is sent, is not
stalled; one stalled `NAV.stalled` s searches afresh from where it is. A walk whose sweep meets a
solid turns from its own way, right then left, to a quarter turn (`clearMove`). A body that faces
its travel (`Intent.travelFacing`) walks the way its route goes while it turns to face it. A place whose point does not fit its
clearance is aimed at the nearest point about it that does, within its `near`.
**The speed rule** (`travelSpeed`, `src/core/intent/travel.ts`) sets how fast the navigator goes: the
least of the gait's top speed the way it goes (`paceToward` on its envelope), the speed it stops
from in the distance left at its stopping rate (`Locomotion.stopping`), the speed it slows to for
each corner ahead (`cornerSpeed`, from its turn rate at speed), and the goal's ceiling. A direct
goal has no end and no corner, so it goes at the gait's top speed.

#### Adding an entrant

An AI is an entrant: a folder `src/entrants/<name>/` whose `index.ts` exports its manifest
(`Entrant`), and that manifest's line in `ENTRANTS` (`src/entrants/index.ts`). Its data goes under
`assets/entrants/<name>/` and its tests in `tests/entrant-<name>.test.mjs`. It imports the core, its
own folder and its own data, and nothing else (`tests/core-boundary.test.mjs`), so a change to it is
its own (`node scripts/entrant-check.mjs`).

1. **Most entrants are presets**: configs of the toolkit's kinds of mind (`fighter`, `option`,
   `quadruped`) holding the toolkit's parts and its own (`classic`, `crawl`, `option`).
2. **A part of its own**, of any role (any slot's, an action's aim, the quadruped's motor, gaits,
   bite and planner), is a module in its folder and a line of its manifest's `parts`, its kind
   `<name>:<kind>` (Vanguard's punch, `vanguard:punch`, layered planner, `vanguard:plan`, contact
   selector, `vanguard:exchange`, walk, `vanguard:walk`, and navigator, `vanguard:navigation`).
   Its config chooses it, an ablation (`--ablate`) replaces it alone, and its maker finds it with
   the host's lookup (`BodyHost.parts`). Only its own entrant's trees offer it.
3. **A kind of mind of its own** (`minds`, `vanguard:mind`, `bare:mind`) is a config type (`{ kind,
   ... }`), its defaults, its faults and its maker, written as one controller
   (`controller<C>({ ... })`). The maker takes its body once through the host (`host.take`), as a
   mind made of its `OwnBody`: a policy (`policyMind`) reads `BodyObservation` and returns
   `BodyAction`; the game's command layers (`commandedMind`) are built on it only where a body they
   can read has it (a humanoid's, `commandRefusal`): the game's humanoid parts, sub-minds included,
   read their view, and a mind on them fits only such a body (`takesCommands`); a host and
   sub-minds of its own (`hosting`), as the quadruped's are. It returns its memory (`state`), which a fight saves and loads with the body, and its
   skills if it runs the game's. It may use any of the toolkit and imports no engine, world or
   builder.
4. **What is not a role is the toolkit's**: an entrant that needs a new extension point opens it in
   the core, in a change of its own read on the fingerprint across every entrant.

The Option framework (`src/core/option/`) is the toolkit's example of a kind of mind with roles of
its own: its choosers, kinds of option, objectives and predictions each a role list
(`CHOOSERS`, `OPTION_KINDS`, `OBJECTIVES`, `PREDICTIONS`), and percepts and predictions of an
entrant's own read by config (`PerceptPart`, `PredictionPart`). A kind of option makes its options
from what the mind gives it (`OptionsGiven`: the body, its legs, executors, actions and profile
tables, the walk, the strikes and the rise) and builds what else it needs, as footwork builds its
gaits and the cover its hands' covers. `tests/swap.test.mjs` registers a fixture
entrant from outside `src/` (`tests/fixtures/swap/`, `swap`: a fighter, an Option Mind and a
quadruped of its own) and holds a stub of each role to it: chosen by config, run, forked, replayed
and linked.

Once registered it is offered by its presets in `MINDS`, and
`tests/mind-contract.test.mjs` runs it against itself on the first body its calibration allows and
it fits, forks it and replays it from its order sheets. How well it fights is a measurement:

- `npm run match -- <a> <b>` plays two minds over fixed bodies, levels, gaps and loadouts, each on
  each side, and names the result by a digest that is the same on every machine;
  `--protocol sword-and-buckler` plays that loadout on both stages. It is an evaluation
  ([Evaluations](#evaluations)), `match`. A condition a subject cannot play is dropped, and the
  result says which and why (`Dropped`, `casesOf`).
  A named preset keeps its body calibration in each complete pair: both minds must be allowed on
  both bodies. The standard protocol contains the Warrior and Rogue. An independent
  configuration uses its physical fit.
- The tournament (`tournament`) rates every game mind (`Part.stage`; an experimental one when named) on every character and representative loadout
  (`REPRESENTATIVE`, `src/core/items/held.ts`) within a pool by Bradley-Terry (`rating.ts`); the
  unseen report (`unseen`) plays each mind on the loadouts none is rated on. `npm run evaluate --
  tournament --notes` writes the newest record's ratings into the notes (`ratedNotes`,
  `src/ui/mind-notes.ts`), which the Arena's pickers show beside each mind; the Ratings screen
  ([The screens](#the-screens)) shows every record.
  `--subjects` and `--against` each take one complete subject per flag; repeat the flag for
  several subjects. Commas inside identifiers or JSON are part of that subject.
- The fingerprint (`scripts/fingerprint.mjs`) has a case for every pickable game mind (every one
  with `--experimental`) and for every
  part that reads mind data (`DATA_CASES`: the learned punch);
  `scripts/entrant-check.mjs` tells an entrant's change from the toolkit's.

### Command

A **Commander** (`src/core/command/team.ts`) stands to a team as a Mind stands to a body: it knows
what its members sense, pooled, and its own memory, and acts only by giving them orders (`Orders`),
which their Minds carry out while they defend themselves. Every kind passes over a foe that has lain
down longer than a stand-up's cap on the owner's target (`worthFighting`, `goals.ts`).

| Aspect | Contract |
|---|---|
| Kinds | `COMMANDERS` (`commanders.ts`), a list of imported entries by config kind (`CommanderEntry`, `kind.ts`: a label, the sides it may lead, defaults, faults and a maker), each its own module's; `createCommander(host, config)`. A line registers one: the Crypt's pickers offer it on the sides it leads, a case's code holds its module as a part's (`caseCoder`), and `entrant-check` counts an entrant's line as the entrant's |
| Its maker gets | a `TeamHost`: the level as its adapter answers it (`TeamLevel`: sight, room to stand and pass, routes, the explored edge, doors), never the world |
| It reads (`TeamView`) | the clock; each built member's place, whether it is in the fight or held, what is left of its pool, its footprint, reach, home, navigation report, the limits its legs state (`gait`, `Skills.gait`), the way they face, and its kit, actions under way and ended, and menu, from its Mind's report; every other body the members sense, where it is, whether it is in the fight and whether it lies down; whether its host has it look this step; a leader's live input (`Lead`: the keys, a walk, the pointer's point and the part it strikes, exploring) |
| It keeps | its memory in `state`, plain data |
| It gives | each member's orders (`TeamDecision`), whether it looked, and on asking, whom each fights, what it does and whether it is selected (`MemberReport`), whether it leaves a member idle, and a notice for its leader |
| It hears | a leader's command (`Command`, `commands.ts`) at once |

Its host asks it once a step, after the senses and before every Mind. **A person's commands**
(`Command`) are plain data: select, go (a point, or a route drawn with its points growing), attack a
sensed foe (with an action, a limb and a region where it names them, `StrikeChoice`), face (a point, or turned by an angle), hold, stop, regroup, follow a member. Each goes to
the members selected, and the keys and pointer steer one of them: the one selected, or the leader.
The Crypt's host is `DungeonRun` (its mouse and keys, `src/dungeon/commands.ts`, `main.ts`), each
side's Commander its options' config (`party`, `enemies`: the person's party and a mob, `RUN_COMMANDERS`, unless the page's
Options or the address, `&party=`, `&enemies=`, name another, and a kind no Commander of that side has is said); an
Arena side a person takes is a team of one (`teamOfOne`, `src/arena/team.ts`) under the party
Commander with `picks: false`, asked in the step's sensing phase, its orders taped by the bout
(`Duel.order`). Both hosts release a range approach to the ordered foe once it reaches the far
boundary (`releaseCombatApproach`, `src/core/command/delivery.ts`), leaving combat footwork to
the Mind. Explicit stops, direct movement and routes retain authority. The raw order remains
available to resume the approach if the foe moves away, even when the Commander emits no new
order. Arena's team keeps this order with its Commander's memory in `TeamOfOne.state`, saved
together when forked; its tape records delivered orders and replays without a Commander. The kinds:

| Kind | File | Leads |
|---|---|---|
| `mob` | `mob.ts` | the members that see a foe spread over the foes they see and, several on one, about it (`spread`, `bearings`, `spread.ts`): each makes for its place at its reach on the bearing it is given, by a waypoint halfway round where that is far round, and closes in from there; one that sees none goes on to where it last saw one, else home: the Crypt's enemies |
| `independent` | `independent.ts` | each member at the nearest foe it sees, on to where it last saw one, else home: the Crypt's enemies where chosen |
| `party` | `party.ts` | a person's party: the member the keys steer where they steer it, the leader otherwise exploring, the others after it or where they were sent, each at the foe its order locks or (unless `picks: false`) the nearest it sees; several sent together take slots about the destination at the slowest one's top speed (`travelSpeed`), the one nearest it the slot farthest from them all, so that none comes in through a slot stood in, and one held short of its slot by a companion standing near it stands where it is (`CROWDED`); doors on the way: the Crypt's party, and an Arena side a person takes. Its members keep clear of each other by their own navigation (`crowdWalk`), each from the step's one `TeamView` |
| `drill` | `drill.ts` | a drill's subject, the team's first member (`DrillCommanderConfig`): one action with one limb at one region of the nearest foe, each named or the first of its member's menu that fits the rest (`MenuEntry`), ordered once its member stands settled in the action's window, walked there by the menu's spot (`MenuEntry.spot`, round a body lying) no faster than `pace`, or gone at from afar at a gait; with `letGo`, a stand ordered that long into the action; with `moment`, its member fights by itself until it begins that action and the drill's is ordered in its place. Its orders are firm (`Orders.firm`); it says its phase as its member's task (`drillTask`). It leads no side of a Crypt run |
| `stand` | `stand.ts` | each member standing where it is, facing the nearest foe fighting, firmly and naming none, so its hands are held from blows and how it guards is its mind's: the Cover drill's subject. It leads no side of a Crypt run |
| `clearer` | `clearer.ts` | a party by itself: its leader (the first standing on its feet) explores the edge of what is seen, then makes for the exit (`TeamLevel.frontier`), waiting for the others, who follow it; foes seen near are the fight, taken on while the party's pools add up to the odds it asks (`POLICY`) and foes keep falling, its members spread over the foes and a hurt one pulling back; from one it cannot win it draws back the way it came, a few times; otherwise it pushes on past its foes, striking what is upon it |

`tests/core-boundary.test.mjs` holds `src/core/command/` to no engine, world, body, enlistment,
mind host or senses hub; `tests/command-contract.test.mjs` has each kind lead an Arena bout as a
team of one (`teamOfOne`), fork it with its memory copied and play it again from its orders alone.

## Experimental separate equipment

An item may be simulated as its own body, gripped by joints, beside the game's compound held items
(which are folded into their segment). This path is research; the game's fighters do not use it.

- `src/core/equipment.ts` builds one item with named rigid grip frames. Capture checks pose error
  against explicit tolerances and joins the current pose; release preserves motion. The engine's
  grip slots save and load with physics snapshots ([grips](reference/equipment-grips.md)).
- `human/equipment.ts` places initial equipment in the hand's anatomical frame; later grips need
  physical reach.
- A policy controls it through the granted port (`mind/equipment-port.ts`): immutable item and grip
  descriptions, detached observations, grip requests inside `BodyAction`. An unknown or ungranted
  grip refuses the whole action.
- Models: `build/coupled-dynamics.ts` (tree dynamics with item coordinates and constraint rows),
  `build/contact-step.ts` (a diagnostic per-point impulse predictor), `build/planar-support.ts`
  (support features of a shape).
- `control/whole-body/tasks.ts` describes joint, point, orientation and centre objectives; `mind/motion.ts`
  validates a policy's request and, with `wholeBodyTracking`, tracks them by bounded acceleration
  solves with optional sticking contacts, stop prediction and lift-off.
- Reference policies and fixtures: support transition (`control/whole-body/support-transition.ts`,
  `tasks/support.ts`), shared bar, point strike, shared strike and interception, each with its
  record under `docs/reference/`. `createObjectSenses` gives policies plain delayed measurements of
  objects.
- `/control-tasks.html` (`src/control-foundation/tasks.ts`) exposes the same builders as the Node
  runner, drawing items with `drawEquipment`.

## Research environments

`createEnvironment` (`src/core/tasks/environment.ts`) wraps a `WorldTask` factory over the core
world for learning and search.

- Its config is copied, frozen finite JSON. `reset(seed)` builds an episode from an explicit
  Mulberry32 word; `observe()` returns measurements and task metrics; `act(action)` accepts a
  validated action at a policy boundary; `step()` advances to the next one. Physics stays 120 Hz.
  Rewards belong to consumers.
- Termination, time-limit truncation and invalid simulation are separate results; an ended episode
  refuses actions but still observes, saves, resets and disposes.
- A snapshot holds the task, controller, clock, RNG, held action and physics bytes. Load builds a
  candidate, checks its complete identity (anatomy, settings, rate, actuation, gravity, solver,
  build fingerprint from `Options.buildIdentity`), and only then replaces the live episode.
- `createReachTask` (`tasks/reach.ts`) is the pinned-reach task shared by
  `research/control-foundation.mjs` and `/control-foundation.html`
  ([record](reference/control-foundation.md#shared-environment-and-browser-parity)).
- **A learnable part** keeps a learner in its state (`Learner`, `src/core/learning/learner.ts`): with
  a network it decides by it; with none, each time it decides it publishes its inputs and counts
  the decision, and acts on the outputs its learner holds, which a trainer writes. It runs while it
  decides at all (a steered punch's drive, the bare mind always). The straight punch's `steered`
  and the bare entrant take it.
- **One case environment trains any part** (`research/case-learning-environment.mjs`, served to
  the trainer by `research/run-learning-server.mjs`): an environment file
  (`research/environments/`) names an evaluation, the subject's mind with the part in learning mode
  and its path, the part's layout file, the places its trials are drawn from or picked among, split
  train and held out by their condition's digest, and the reward. It finds the one learner in the
  hosted minds of the subject's kind (`WorldKind.hosted`), plays from its first decision to its
  next, and ends with the case's reader or the part no longer running. Its reward is the outputs'
  effort, the evaluation's percepts summed over each decision (`Evaluation.percepts`: Locomotion's
  progress, halt and upright; the Strike drill's legs left undone, `unmet`) and, at the end, its terms and readings (`Evaluation.terms`: the
  Strike drill's bar score, whether it met it, how short of its aim the fist stayed). Where the
  world kind saves (`WorldKind.save`, a bout's) it keeps a pool of saved starts, refreshed while the
  trainer updates; a bout builds at the rate a trial draws (`WorldKind.build`).

## One world step

`createWorld(scene, engine)` (`src/core/world.ts`) makes the world: one fixed step at 120 Hz
(`PHYSICS_HZ`). A step runs, in order:

1. the sensing hooks (a fight's senses, `createSenses`; a tape's orders);
2. the before-step hooks in the order added: each body's `driveMuscles` (muscles read the joints,
   the mind steps, the assist gives, the motors are set), and a page's own (the Crypt's
   `DungeonRun.plan`, added first, which asks its Commanders; the Lab's shove);
3. one solver step, which writes every node; the clock advances;
4. the post-physics observations (`afterPhysics`: effector feedback, contacts);
5. the after-step hooks (readings, blows, pointed loads). Observations finish before any event can
   end or remove a fighter.

A page advances by real time with `World.advance`, which caps the steps a frame may take;
`scene.render()` draws and never steps. In Node, `tests/harness/core-stand.mjs` stands one spec on
a ground (`coreStand`, `freshEngine`); most of `research/` measures on the stand ([research/README.md](../research/README.md)).

## State

What a step writes and a later step reads is **state**, plain data (`src/core/state.ts`). Physics
keeps its own as bytes (`PhysicsWorld.save`, `load`); every other module keeps its memory in one
`state` object.

- **State is** numbers, strings, booleans, null, plain objects, arrays, typed arrays, a `Map` or
  `Set` keyed by strings or numbers, a `Vector3` and a `Quaternion`. A body, node, function or
  getter is not, and `saveState` refuses one by its path.
- **`saveState(root)`** copies it (the copy crosses a thread); **`loadState(root, saved)`** puts it
  back in place, so whoever holds a state object holds it still and no module is told of a load.
  Shared objects stay shared.
- **A constant a state points at is frozen** (`deepFreeze`): a load puts a copy in its slot. Blows
  and verdicts are frozen as made.
- **The states hang on one root.** A body's is its mind's (`Body.state`), a mind driven over the
  skills holds its skills' and its planner's side by side (`Driven.state`: `skills`, `decider`), and
  a bout's (`Duel.state`) holds its own (start, verdict, orders, tape) with the world's, senses',
  blow watch's and each side's.

`Duel.save()` is a bout at a step: its identity, recipe, physics bytes and state. `Duel.load(saved)`
restores it into any bout of the same recipe, and the next step is the one after the save; another
build, protocol, physical configuration or recipe is refused before physics loads.
A bout or a body forks by copying its state. A Crypt run does not save.

## Bouts, tapes and replay

A bout is built from a recipe (`DuelRecipe`, `src/arena/duel.ts`): bodies, gap, cap, level, each
side's mind (`minds`), loadouts, attributes, reaction time (`senseDelay`), seed (`seed`), end
rules (`ends`) with the down rule's allowance (`recoverySeconds`) and, where a scenario arranges it, each side's place and heading (`start`) in place of
the level's spawn, as plain data. What a page hears (`DuelHooks`) is beside it. Nothing in a bout is random, so a recipe plays
the same to the bit in Node and in the page (`playBout`, `research/bout.mjs`; `traceOf`,
`src/evaluation/trace.ts`; [real functions](reference/real-functions.md)). The page resets its
world before each bout (`boutStart`) and a body's time starts at its first view (`BodyView.born`).

- **Verdict** (`Duel.judge`): a side is out by the first of the recipe's end rules that puts it out
  (`EndRule`, `src/arena/end-rule.ts`; each a part of the list `END_RULES`, `ends.ts`), which
  names the ending a person is told (`endingText`); the game's (`GAME_ENDS`, the owner's verdict)
  are its pool's ending, then the drain (`DRAIN_END`, [play](reference/play.md#the-bout)). A
  side's life (`Duel.life`) is its bar less what the drain has taken: the page's bar, the senses'
  and the verdict's. Both on one step is a draw; at the cap the fuller life wins. The page plays three seconds of aftermath
  (`arenaPlayback`, `src/arena/playback.ts`).
- **Tape** (`Duel.tape`): every order with the step it was given before. Recipe and tape are the
  whole of a bout on one build; `Duel.play` feeds the tape in the sensing phase. A case's world
  carries it, and the Arena plays it from its record (`#reel=`, `src/arena/case-link.ts`).
- **Order sheets** (`DuelHooks.record`; `Sheet`, `SheetLog`, `src/core/mind/sheets.ts`): each
  side's muscle commands, assist asks and hand poses at the mind's seam. A bout given them
  (`DuelHooks.replay`) makes no mind (`replayedBody`) and plays the same. Each log names its build,
  protocol, recipe, body, placement, grants, engine, rate, gravity and actuation, and another
  identity is refused.
- **Recordings** (`Duel.recording`, `src/core/recording.ts`) are versioned
  envelopes checked for exact identity.
- **Build fingerprint** (`scripts/build-identity.mjs`): a content SHA-256 of sources, templates,
  assets, lockfile, build config and installed Rapier, LF-normalised; Node and Vite share it.
  What runs write (`OUTPUTS`: the minds' notes, `assets/evaluations/`, generated art delivery files) is not in
  it. Evaluation records and research bout pools carry it and refuse a mismatch.
- **The file table** (`fileTable`, `scripts/build-identity.mjs`): each build input's hash, and each
  module's imports read with TypeScript's parser (`importsOf`). **A case's code** (`caseCoder`) is
  drawn from it: the environment, the static import closure (`closureOf`) of `src/evaluation/play.ts` and
  the case module with the lockfile and the solvers, cut at the kinds list, the world kinds list
  (`WORLD_BUILDERS`, `src/evaluation/worlds.ts`), each role's list of parts, the Commanders and the end rules (`CUTS.roles`), the
  build's identity and the mind data store (`CUTS`); then the kind of world the case plays adds its
  builder's own code (its module's closure beyond the environment), each kind of mind it plays its
  own (likewise, and `assets/entrants/<kind>/`), each part a role's list holds that its minds'
  trees name (`treeKinds`: the parts their slots hold, an empty slot's `Slot.fallback` and what a
  part runs beside its slots, `Part.uses`) or its world kind names beside them (`WorldKind.parts`: Commanders, end rules) its module's, and each mind data key its minds read (`treeData`) its
  module's. So
  a Crypt edit keys no bout case anew, nor a bout builder's edit a Crypt run. A kinds list or world
  kinds list of more than its imports and its list, and a module in a closure that imports by no
  literal, are refused. A research run's
  implementation (`implementationOf`, `research/rising-provenance.mjs`) is the uncut closure.
- **Evaluation records** (`assets/evaluations/<id>/`): kept results ([Evaluations](#evaluations)).
  `imports/tournament-1bacac44.jsonl`
  is the 10-hour tournament's rows (11,342 bouts and the unseen report's 384) as played, with their
  provenance beside them in `tournament-1bacac44.json`; `--import` makes them the first
  `tournament` and `unseen` records (`scripts/evaluation-import.mjs`), a pool of their own whose
  cases have no world: history, never opened or replayed.
- **Forks** (`rollout`, `research/rollouts.mjs`): by load or by replay of the tape, which agree.
  The oracle (`research/oracle.mjs`) searches orders over forks; it holds the true world and is an
  instrument, not a mind ([oracle](reference/oracle.md)).

## Evaluations

Every question of how well something does is an evaluation (`src/evaluation/`, browser-safe), one
path for Node, its workers and a page; `EVALUATIONS` (`evaluations.ts`) lists them.

- **A case module** (`<id>/cases.ts`, `Cases` in `evaluation.ts`) gives each protocol's
  conditions, the world of a case for its subjects (`CaseWorld`: a bout's recipe and tape, a
  fall, a Crypt run, a lone body, `lone.ts`, given orders and shoves at set times by its script
  (`LoneCue`), or techniques in turn, `technique.ts`; each kind built, stepped and traced by one loop,
  `playCase`, from its `WorldKind`) and its reader, and the engine where the protocol fixes one (`Cases.engine`); A worker plays it as its description's `protocols` (`EVALUATIONS`), the one list. **A description** (`<id>/index.ts`)
  gives the question, subjects, figures and summary; nothing a case plays imports it.
- **A case's key** is the digest of everything it plays: evaluation, protocol, engine, world (every
  subject's value whole), seconds and code (`caseCoder`: the environment with the own code of the
  kind of world and the kinds of mind it plays, `caseNames`, `code.ts`). A row (`Row`, `play.ts`) is found again by its
  key, so a description, script, screen or document edit replays nothing, and an entrant's edit
  replays only its own cases; a case's error or non-finite reading is a fault row, kept like any
  other. A row says how long its case played (`Row.played`, its world kind's clock when the reader
  ended), where a watcher stops it. A summary reads the complete units with no fault and names how many it left out.
- **A schedule** (`schedule.ts`) pairs a contest's subjects: `all` with each other, `versus` each
  subject with a panel's members only (`--against`), `pairs` the pairs named.
- **The runner** (`run.ts`): units of evidence (a contest's one condition with each side on the
  left), run in the order of their keys on lanes (`lanes.ts`: a worker each, behind `spawn`, a
  lost worker or one past its minutes replaced and its case left without a row), until the budget
  (`--budget`, 10 min unless told) is spent; a table reads the complete units in their definition's order. Figures are a rate (Wilson) or a mean or median over units, a
  pair resampled whole (`stats.ts`).
- **The baseline** (`baseline`): one mind's configuration on the Warrior, its preset's character
  its body's, a protocol a competence and one command playing each in turn (`Evaluation.every`), a
  record each: `walk`, the Locomotion drill; `punch`, the Strike drill's still and walk rungs by its
  first action; `stand-up`, the owner's target's falls risen by the whole mind on the fall bed;
  `fight`, the standard match's bouts against other minds' presets (`OPPONENTS`) on each
  side. A reading carries its competence (`part`) and each figure reads its own. A mind given whole
  takes a character and bodies as a preset names them (`{ mind, character, models }`).
- **Records** (`record.ts`): `npm run evaluate -- <id> --write` writes
  `assets/evaluations/<id>/<date>-<commit8>-<keys8>.jsonl`, a header (build, harness, engine,
  commit, pool, each subject and part with its version and parent) and a line per case. A version is
  the digest of its own content, protocol, environment and its minds' own code (`code`, absent for
  a subject with no `mind:` part and in records written before it), kept apart so a change from its
  parent is named by kind; `--previous` names the parent. A pool is a protocol and an environment. Working rows are kept in
  `research/runs/evaluations/<id>/`. A record holds the run's complete units.
- **Historical comparisons** (`record-comparison.ts`): `npm run compare -- before.jsonl after.jsonl
  --subject <id>` pairs saved evidence for that subject or its body/loadout entrants;
  `--previous <id>` selects a differently named baseline and `--json` prints a structured report.
  Entrant suffixes, fixed parts, opponent configurations and code, conditions and sides must match.
  Contests contribute complete mirrored pairs, batteries individual cases; faults and incomplete
  or unmatched units are named. Cases between two selected entrants are counted separately:
  both change, so neither is a fixed opponent. The current evaluation's figure readers give paired differences
  and intervals, overall and by opponent; their build identity is printed. Changed protocols,
  engines, environments or physical recipes qualify the differences as descriptive. Git changes
  outside the selected entrants' source and data, or missing provenance, also qualify them.
  Records and source trees are never written or executed. Missing results are obtained only when
  a concrete decision needs them, using a temporary checkout of their source. Git holds obsolete
  implementations; saved records hold their evidence.
- **The panel report** (`compare.ts`, `settle.ts`): `--against default --previous <mind>` pairs
  each of the subject's entrants with its baseline's on the same kit, each against the same panel
  member at the same condition (a slot), and plays the two directly. The baseline is another mind,
  a mind given whole, or, named by the subject's own id, its newest recorded value that differs.
  These configurations run on current code; implementation changes are read from historical records.
  The verdict reads the slots in a fixed order up to the first with a row missing: two one-sided
  sequential tests on the mean paired difference (`settle`), better or worse by the rule's
  `delta`, or within it; `--until settled` stops giving out cases once it is reached, or every slot is read. Beside it,
  every figure's difference, by member and condition, the worst pairs, stalemates (at the cap,
  both bars full) and the head-to-head. The tournament's panel and rule are its `analysis`.
- **Batteries** (arity 1): a skill's task, one subject at a time over its conditions. `blade` (the
  striker's executor tuning: a sword's cuts and thrusts at a standing body), `buckler` (the
  defender's cover: whether the buckler meets a sword first) and `court` (the approaching mind:
  round the obstacle court's column into its window), `crowd` (a party's mind among its own side's
  bodies: a party reversed, a lone body and a following pair turned back, paths crossing, a gap that
  passes one at a time and a fallen companion, each on several seeds: falls, legs done, members pushed
  apart), `locomotion` (a mind's body told to walk four ways at two paces, to run, to turn and to
  stop, and shoved standing and after a walk: held, on pace, stopped, top speed, shoves held) and
  `crypt-clear` (a party Commander leading the hero alone, under Option Mind: through generated
  Crypt levels against each enemy Commander, in trials that move the start a little
  (`trialLayout`): the score (`scoreOf`), the life at the end less a price on the time taken and on
  the route left at the hero's pace, the price such that a walk of the level's route with no foes
  costs half the life; a case stops at the exit, at the hero's death, or once the life less the
  time's price is spent; beside it the life at the end, the share cleared and the time). A **drill** is a battery whose trials each pass or fail (`Evaluation.outcome`),
  its rungs its protocols: `strike` (a mind and one of its strike actions, `puncher/strike` and
  `vanguard-warrior/strike` drilled, led by the drill Commander: rung `still`, thrown once at a still Warrior standing in guard, by body, mark,
  hand, offset and range; rungs `stepping`, `guarding` and `punching`, the same on the Warrior at
  0.8 to 1.2 m, against a drill opponent (each rung's opponent a mind's preset, `drill-stand` for
  `still`), with the hit points the striker lost in its contacts (`taken`); rungs `letgo` and
  `letgo-punched`, the opponent rungs' trials at `drill-stand` and `drill-punch` with the strike
  let go at each point of its wind-up, 0 to 0.15 s after it began, where still before its point of
  no return (`DrillCommanderConfig.letGo`, the condition's `letGo`), read for when the hand was back
  at its guard (`BACK`) and what the striker lost meanwhile (`StrikeReading.letGo`); rung `walk`, the still target walked to from 1.6 to 3 m, asked settled or still
  walking, read from the first step the drill is ready; rung `fight`, thrown in place of the subject's own `moment`th action in
  its bout against a game mind on the Warrior's body, which fights on; rung `stomping`, thrown with
  each foot (the condition's `foot` in place of `hand`) at the middle of a Warrior or a Skeleton
  (the condition's `target`) lying limp on its back under the bare mind with no network, walked
  round to from 0.8 to 1.2 m; each trial's reading records the target's posture and the range
  centre to centre where it began (`StrikeReading.foeAt`), which the strikes' profiles are cut by;
  landed (a hand on the mark at the untrained fist's bar: speed over the last 0.1 m, the mass behind
  it, straight, soon, and a punch's form: more along the arm than across it, the elbow near
  straight, the chest upright; `BAR`, `strike/read.ts`; a foot, which the bar sets no test for, on
  the mark at all, its fastest touch read), weak (on the mark, short of it), guarded
  (on the target's arms alone), on the target elsewhere, missed, abandoned, out of its window,
  refused or waiting, fell, or a fight that never came to its moment); `gait` (a mind going at a
  still Warrior by each gait at each speed led by the drill Commander (`going`, `gait`), stopping where
  its first standing strike's window would admit it and striking: rung `stopped`, read for the
  speed it stopped from, the seconds from the stop to its strike admitted and whether it fell,
  `gait/read.ts`; the gaits' profiles regenerate from its records, `research/gait-profiles.mjs`,
  `assets/core/gait-profiles.json`); and `cover` (a mind standing
  and covering under the stand Commander's orders, against a drill opponent striking on its
  script: rung `punched`, punches, `drill-punch`; a Warrior empty-handed, by offset and range:
  each touch read by where it met the subject, its head, its guard or the rest of it, the hit points it took and
  whether the subject fell; covered, the guard alone met, `cover/read.ts`). `--previous` reads a battery's subject
  against another, each figure's paired difference over the conditions both played
  (`batteryComparison`, `compare.ts`).
- **Ablations**: `--previous <mind> --ablate <slot>=<JSON>` makes the subject that mind with one slot
  of its skills (`SkillKit`: locomotion, navigation, guard, support, motor, the executors and
  actions, or one of these by name, `actions.<name>=null` removing it) replaced, read against the
  mind as it is: by the panel report in fights, by a battery's comparison at its task. An ablation
  inherits its source's entrants: the same bodies and loadouts, restricted by the changed config's
  fit, before scheduling. A whole config evaluated independently keeps its ordinary expansion.
- **Ratings** (`rating.ts`): Bradley-Terry strengths on the Elo scale over a pool's distinct keys,
  computed with the core's `exp` and `log`, a draw half a win, each entrant given half a game drawn
  against the field; intervals from refits to the pairs resampled whole. No strength is carried
  across pools.
- **Falls** (`fall.ts`): one body of any model under any mind, on Rapier; not bit-equal between
  JavaScript engines, as a bout is. Every evaluated fall is played on one bed (`buildFall`), every
  mind felled the same way: built standing and enlisted as a fight enlists it, shoved at the middle
  trunk by the target's impulse (`targetImpulse`), again while it holds the shove (`SHOVED`), taken
  over when first down by the fight's rule, and its stand verified as the Lab verifies one
  (`standCheck`, `STAND_CHECK`, `src/lab/ground-mode.ts`). A fall not made did not reach its case:
  the figures give the falls made and read the stand over them. A condition the bed cannot play is
  refused with why. The research rising bed (`rising.ts`) plays a fighter on the Lab's Stand-up
  mode itself (`buildStandFall`), its sub-minds replaceable. `rising-target` plays the owner's 64
  falls and reports the target's gates; `equipped-rise` the same shoves with sword and buckler and
  with the club. A subject is a riser: a mind's recovery on
  the bed's host (`risingMind`, `rising.ts`, which also holds the bed's jobs and report).
- **Techniques in turn** (`technique.ts`): one body on the arena's solids, placed in a posture or
  shoved from standing, its stand-up techniques played one after another with no Stand up to route
  them, each begun once its entry admits the body; not bit-equal between JavaScript engines, as a
  fall is. The Rise drill (`rise/`) plays each edge of the staged route from its posture placed and
  after the edges before it ([the Rise drill](reference/rising.md#the-rise-drill)).
- **Crypt runs** (`crypt.ts`): a laid-out level, the party under one mind or each member under its
  model's own, each side's Commander (the party's and a mob unless named), and a script of the
  person's orders, a leg at a time, or none (`CryptCase`), a leg that brings the case about ending it
  unreached where it is not done in time (`CryptLeg.fixture`); the game's run (`DungeonRun`) on a
  scene with no canvas. Bit-equal between JavaScript engines, as a bout is; the Ratings screen
  does not open one.
- **History** (`history.ts`): an evaluation's records grouped into pools (`poolsOf`), each case
  once by its key, and each subject's versions numbered by first appearance (`versionsOf`). The
  notes and the Ratings screen read pools through it.
- `scripts/evaluate.mjs` and `evaluate-worker.mjs` run it in Node.

## Rules and wounds

The rules of a fight are `src/core/rules/`, free of any page. The Arena and the Crypt share one rulebook (`rulebook.ts`).

- **A touch** (`watchTouches`, `src/core/touches.ts`) is a watched segment the solver pushed on
  another, or on something fixed, while closing. Its energy is `impactEnergy` (`impact.ts`): half
  the reduced mass of the two effective masses (`contactMass`) times the closing speed squared.
- **A blow has no striker** (`watchBlows`, `blows.ts`). Any two segments of two sides that meet
  closing have met in a blow. Each fighter's muscles hold through it up to the ceilings they were
  last given (`MuscleDriver.bounds`) over the contact's time (`contactGive`), so a braced arm meets
  a blow with the trunk behind it. A shape belongs to its segment, a natural contact region
  (`ContactRegionSpec`), a held item or an item region (`ItemSpec.contacts`); a touch is classified
  by its strongest loaded shape pair and paid once.
- **The two surfaces share the energy by their compliance** (`energyShares`, `share.ts`): springs in
  series, the softer takes more. An item with no stated surface is rigid and takes none; two rigid
  items meeting are a clash (`isClash`). A part's tolerance is the pool's rule, but a bare hand or
  foot on flesh lets the first of its share go (`Rulebook.fist`). Values: [wounds](reference/wounds.md).
- **Damage** (`rulebook.ts`): impact energy times the mechanism's worth, 100 J of blunt blow per HP.
  A surface's `directed` edge or point, met square, is priced as a cut or thrust; otherwise blunt.
  Anatomical points wound by sustained load (`pointLoad`, `pointsInto`).
- **Wounds** (`pool.ts`): one pool of hit points per body, split over its parts by cross-section.
  Excess spreads to neighbours; an emptied part may come off (never the trunk). A body is out when
  its pool is empty or a vital part is emptied or off (`BodySpec.wounds`).
- **Balance** (`AttributeSpec.balance`): a per cent of the body's weight, the most force its assist
  gives, with the moment `Rulebook.balance` gives each per cent (`balanceCeiling`). A fight sets each
  ceiling from the character and withdraws it when the body is out. The stance steps for a push only
  past what the assist holds (`assistReach`, `gait.ts`).
- **Haste** (`AttributeSpec.haste`): a per cent increase in leg muscle speed; no peak torque change.
- **Levels** (`levelsOf`, `levels.ts`): which bodies run themselves. A body with nothing to do and
  nobody near is `held`; any other is `full` in the fight and `limp` out of it. The fight gives the
  distances (`LevelRule`); `stirs` wakes a body not yet built. There is no cap on bodies at `full`.

## The screens

`index.html` is one document (`src/app.ts`, routed by `src/app-route.ts`): the main menu, and the
arena, crypt, lab, ratings and tools at `?play=arena`, `?play=dungeon`, `?play=lab`, `?play=ratings`
and `?play=tools`.

- **The shell** mounts one screen `<template>` at a time. Changing screen disposes the previous one
  explicitly (pending loads, worlds, scenes, previews, listeners, audio); setup choices stay for the
  tab; styles belong to the screen root.
- **Loading** covers scene preparation with physics suspended: textures, materials, shadows and
  post-processing must give two complete frames before play. Its deadline counts visible-tab time
  and navigation cancels it. A failed launch returns to setup with its error and Retry. Model bytes
  are shared; each scene owns its decoded resources.

| Screen | Where | What it is |
|---|---|---|
| Arena | `src/arena/` | two bodies under a `Duel`, to a verdict |
| Crypt | `src/dungeon/` | a party in a generated dungeon (`DungeonRun`) |
| Lab | `src/lab/` | one body in a scenario (`scenarios.ts`), stepped by hand |
| Ratings | `src/ratings/` | each evaluation's records, derived in the page (`analysis.ts`); nothing played |
| Tools | `?play=tools`, `src/app.ts` | a directory of the development viewers, each with a return link |
| Character workshop | `/character-lab.html`, `src/character-lab/` | workshop models with preview motion; no core ([characters](art/characters.md)) |
| Physics bench | `/physics-bench.html`, `src/physics-bench/` | the bake-off's cases on MuJoCo and Rapier |
| Control tasks | `/control-foundation.html`, `/control-tasks.html` | research tasks with replay ([equipment](#experimental-separate-equipment)) |

**The Arena.** A person may take a side (`&you=left`), which they lead as a team of one
([Command](#command)): keys become a walking direction as the camera sees the ground, the pointer a
facing and a sensed foe and segment (`src/arena/orders-input.ts`), and a click on the floor a go
there; the Commander's orders reach the side as `Duel.order`. Each side lists its choices, its
menu (`choicePanel`, `src/ui/choices.ts`, any screen's); a person picks one of their side's, an attack with
its action, limb and region, and with pause on choice the bout pauses where their side has a new
one (`choiceWatch`: an entry an order can name turned ready, an action ended, a foe newly sensed,
the body down or up), so a bout plays turn by turn and again from its tape. The room's solids (`arenaSolids(level)`)
are what bodies meet; `LEVELS` (`src/arena/levels.ts`) selects the open stage or obstacle court,
whose furniture comes from `src/environment/furniture.ts`. Every Mind gets the stage's fixed
geometry. The visible room is dressed from the forge kit (`forge-style.ts`, `forge-room.ts`), and
`validateRoomPlacements` refuses a piece naming a collider the arena lacks, or a solid-looking one
within reach naming none. `camera.ts` and `view.ts` own the camera and view settings. Cases from
the Ratings open as a reel (`#reel=<evaluation>&cases=<keys>&at=&auto=&back=`, `case-link.ts`): the
Arena reads the evaluation's records once (`reelTrials`, `reel.ts`; one engine and level a reel)
and plays each trial's recipe and tape in the same screen, stopping it where it was scored
(`Row.played`), the camera as the person left it; with auto-play, the default, the next begins a
second later. The HUD names the trial, its conditions and recorded outcome. The trial shown gives
the pickers its choices (`caseSearch`), and Setup leaves the reel for them; a bout is otherwise
assembled from the address (`recipeOf`, `matchup.ts`). Back returns to the Ratings address the reel
was opened from.

**The Crypt.** Walls, doors and obstacles are fixed boxes (`buildDungeonWorld`); enemies are built
as the party comes near. Each side is a team under a Commander ([Command](#command)), the run its host
(`DungeonRun`: the map as `TeamLevel`, who is built, levels, doors, status); a person's mouse
orders and keys (`DungeonCommands`) reach the party only as its Commander's commands and lead,
and its orders as movement requests each member's own navigation carries out; a blocked goal
may route through a door first (`door-approach.ts`). Sight is the map's (`canSee`, `reveal`,
`SightIndex`, `src/dungeon/map.ts`). Minds are chosen per model (`runMinds`,
`src/dungeon/run-minds.ts`). Art: [crypt](art/crypt.md).

**The Lab.** Stance, Stand-up, Attack and Locomotion scenarios at 120 or 480 Hz.
An actor (`actor.ts`) gives the body its balance, mind (`labMind`, `&mind=`) and strikes. Attack
(`attack-mode.ts`) issues `Orders.foe` against seeded targets (`targets.ts`). Its explicit target
part travels in `targetPart` in the address; the default is the body's head. `dummy-spec.ts`
constructs that part's ball and preserves its middle and leg membership. The setup's anatomical
compatibility feedback (`attack-target.ts`) reads armed actions, their declared regions and barred
effectors using the same region and permission rules as execution. It changes no mind settings
and predicts no physical outcome. Locomotion runs tracks
(`track.ts`) or random destinations under seeded wind (`wind.ts`). Stand-up (`ground-scenario.ts`,
`ground-mode.ts`) plays seeded and target falls and verifies every stand (`STAND_CHECK`);
the falls (`src/evaluation/fall.ts`) play the same mode, through `npm run evaluate` and
`research/rising-bed.mjs`. The HUD is sections
(`hud/sections.ts`) filled with controls built from data (`src/ui/controls.ts`).

**The Ratings.** Evaluations by group, each with its question (`EVALUATIONS`). Records are fetched
when an evaluation opens (`src/ratings/records.ts`, `import.meta.glob` of the files' URLs; an
import's source rows are not records) and read once a tab. A contest's newest pool shows each
version's rating with its interval, minds on common ground (each pair's rating difference over the
kits both have, with how many) and the matchup grid; a battery shows each figure by subject and by
a condition field (`&by=`). A subject shows each version's parent, what changed and its standing in
each pool, and its cases by opponent (worst first) and condition; a case shows its record line,
and a bout case with its world opens in the Arena as a reel of one; an imported case has none. A
drill's subject also shows its trials as a strip, a square a trial coloured by its outcome that
plays the strip in the Arena from its trial; a reel of each outcome's trials from its legend; the
reel: every failed trial, the rarest outcome's first, then five passed ones chosen by their keys'
digests; and whether the owner has accepted its version on a rung
(`assets/evaluations/<id>/accepted.json`, written only for the owner).
An older pool is listed with what differs from the newest.

**Shared rendering** (`src/render/`, `src/audio/`):

- Art uses the [asset pipeline](art/assets.md): LFS masters, lossless environment inputs and original images
  compile into hashed geometry, KTX2 textures and workshop animation buffers. `art-assets.ts`
  resolves the generated manifest and self-hosted decoders; `asset-cache.ts` decodes scene-owned
  containers. The core reads exact versioned metadata independently of web compression.
- `dress.ts` and `dresserFor` draw a body as its skin, or its collision shapes if the skin does not
  load; skins (`skin.ts`, `skeleton-skin.ts`, `reptile-skin.ts`, the robot shells via
  `robot-skin.ts`) read only segment transforms and own no collision. `skinSlot` swaps a view
  without touching physics. Appearance is a link setting outside recipes and tapes.
- `strike-hands.ts` gives skins finger closure from the body's applied hand poses (`fighterHands`).
- `post.ts`, `surface.ts`, `materials.ts` are the shared post pipeline and surfaces.
- Sound: `cues.ts` makes a cue from an energy and two materials, `game-audio.ts` mixes,
  `body-sounds.ts` hears a body's touches (`hearTouches`) and air (`airOf`)
  ([look](reference/look.md#sound)).
- `src/render/view.ts`, `camera-math.ts` and `src/ui/view-controls.ts` are the shared view types and
  controls; each screen owns its camera rig, input and URL.
- `mindEditor` (`src/ui/mind-editor.ts`) draws a mind tree's fields, slots and faults for a body;
  a link carries a preset id or the whole tree without `tuning` (`writeMind`, `parseMind`,
  `src/ui/mind-link.ts`). The Arena plays no mind with a fault, nor another in its place: begin
  says the faults; a link whose side names no mind this build has shows its preset and says so
  (`unreadMinds`). `mindInspector` shows who has
  the body, live actions, reservations and the ledger, a row for each holder it is shown; the
  Arena's `fighter-hud.ts` and `fighter-readout.ts` read a mind's report (`MindReport`; the
  planner's lines, `engagementLines`) and write nothing back.

## What the seams are for

Tactics choose a named action, an effector and a target body and region; the action names its
executor and aim; the guard places a hand or what it holds; a blow is whatever two surfaces of two
sides met with. These seams keep control separate from the contact and damage rules
([roadmap](roadmap.md#blows-and-wounds)). Where a later addition goes:

| Added | Where it goes | What it leaves alone |
|---|---|---|
| **A sword, a spear** | Item regions state directed edge or point surfaces, priced on impact; `blade-cut` and `blade-thrust` execute them. A spear needs its own item. | The shares, the pool, the targets. |
| **The face and the vault** | Natural contact regions (`SegmentSpec.contacts`) give separate colliders and surfaces; teeth use this path. | The pool: one head. |
| **Armour** | A worn item, rigid with its segment: it adds mass and one more surface in series (`energyShares` over the layers). A glove protects the puncher by the same rule. | The rule's shape. |
| **A shield** | A held item with a face: the guard places its points (`ItemSpec.cover`) and orients its face; a bash is a blow. | The guard skill, the rule. |
| **A staff, a spear in two hands** | An item held by two segments: a joint at the second hand, both arms solved to its points (see [separate equipment](#experimental-separate-equipment)). | The executors, the rule. |
| **A bow** | A shooting skill in the one list; an arrow is a body, and what it touches is a blow. | Every contact rule. |
| **A knee** | A shank point struck by `effectorStrike` over the leg's chain. | The rule, the cycle. |
| **A crouch, a low target** | The stance lowers past `STANCE_LOWER`; a mark under the middle one (`BodySpec.marks`). | The executors, the choice of action. |
| **Another body** | Its spec with effectors and down rule; the controllers that fit it (`Controller.fits`); its own tuning of each skill it uses (a straight punch's record, `PunchRecord`). | Everything else. |
| **A learned or planning mind** | An entrant ([Adding an entrant](#adding-an-entrant)). | The rule, the targets. |

## Standing decisions

The owner's decisions the code is built on:

- **Physically based, humans first.** Muscles, real ground forces, emergent falls, damage in
  joules. The human is the reference body; every other body is balanced against it.
- **Locomotion is force-bounded stepping**: ground forces at the real feet within friction and the
  legs' strength.
- **Rapier is the engine**; MuJoCo stays on the bench; another engine is tried on the bench first.
- **120 Hz**, and the controllers are made to work there.
- **Torque sources with the body's real inertia**, and an eccentric ceiling of 1.4 times isometric.
- **A person never commands muscles.** A person gives orders (`Orders`); the body's own mind
  carries them out while it defends itself.
- **A skill is tuned for each body that uses it.** A body without its own tuning of a skill does
  not use it: no skill tuned in one context is used in another, and no stand-in is thrown in its
  place. Nothing is built that the next step throws away.
- **Sizes and hit points.** x1 is a typical adult, about 1.77 m and 79 kg; the Rogue keeps her own
  proportions. The Warrior has 6 hit points and the Rogue 4.
- **The skeleton is a family of its own, not a reskin.** Thin colliders though harder to hit; blunt
  blows beat bone while cuts and thrusts do less; weak joints; ribcage and pelvis fatal, skull not;
  its bar chips down with every weapon; rigid art shaded by vertex colour.
- **Cosmetics never carry authority.** Nothing decorative collides or decides a hit.
- **Several implementations stay selectable.** A new controller is added beside the old as a part
  or a gait, not in its place.
