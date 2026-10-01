# How Auto-RPG is built

Auto-RPG is physically simulated melee in the browser. A fighter is a body of rigid segments and
joints, driven by muscles with the strength and speed of their anatomy; a blow is whatever the
body carries into another body, and it wounds by the energy it brings. There is no attack
animation and no hit box: the pages draw what the physics did.

Babylon.js 9 draws; Rapier (its SIMD build, WebAssembly) simulates. Everything that fights is the
core's (`src/core/`). The screens (`src/arena/`, `src/dungeon/`, `src/lab/`) build on the core
and the core never imports them: `tests/core-boundary.test.mjs` walks the core's imports and allows
only the core itself, `@babylonjs/core`, the engine's package and JSON under `assets/`.

## The layers

Each layer imports only the layers listed before it, except that skills and tactics share a
vocabulary: the `Intent` tactics return (`src/core/mind/intent.ts`) and the `SkillReport` they
read (`src/core/skills/skills.ts`).

| Layer | Where | What it does |
|---|---|---|
| Spec | `src/core/spec/`, `src/core/human/` | a body as data: segments, joints, muscles, wounds, every number sourced |
| Engine seam | `src/core/engine/` | the one contract the core needs from a physics engine |
| Build | `src/core/build/` | the spec made into engine bodies and joints, and the dynamics read back from them |
| Muscles | `src/core/muscle/` | torque bounded by strength and by speed |
| Mind seam | `src/core/mind/mind.ts` | a mind made with its body, stepped before the solver, writing the muscles' command and its assist's ask |
| Motor control | `src/core/control/` | joint goals, hand goals and the stance turned into muscle commands |
| Skills | `src/core/skills/` | an intent turned into the body's command: walk, face, strike, guard |
| Tactics | `src/core/mind/tactics.ts`, `fighter.ts` | what the body should do, decided from what it sees |

`createBody` (`src/core/body.ts`) gives a built body the command layers as its mind
(`commandMind`, under `embody`): its muscles and motor control. Each step it
reads the body's `BodyView` (time, joint angles, fists, knuckles, head, stance), asks its driver,
and obeys the `BodyCommand` it gets back: a posture, hand goals, timed pushes and a stance goal.

### Spec

A `BodySpec` (`src/core/spec/body.ts`) holds a body in its reference pose, in metres, with +x
right, +y up, +z forward and the soles on y = 0: its segments (mass, centre of mass, principal
inertia, collision shape), its joints (a tree; each freedom with its axis, range and muscle), its
wounds (`hp`, the `vital` parts, the parts that never come off) and anything held.

The human body plan builds every current body. `figureSpec` (`src/core/human/spec.ts`) takes a
`HumanFigure` (the sex whose tables apply, the landmarks, the trunk's hulls, the feet, the hands,
the mass, the stature and the hit points) and lays out 16 segments and 15 joints from published
tables: de Leva for segment parameters, Dempster via Winter for densities, measured joint ranges
and torques, Abe for regional muscle, and Anderson, Frey-Law and Thelen for force and speed.

| Model | Figure | Hit points |
|---|---|---|
| `workshop-fighter`, the Warrior | `workshopFigure`: the workshop model's rig and clothed envelope | 6 |
| `workshop-rogue`, the Rogue | `workshopFigure` | 4 |
| `crypt-skeleton` | `skeletonFigure`: its art's bind (`assets/skeleton/bind.json`); mass, strength and hit points are placeholders | 6 |

`BODY_MODELS` lists them and `modelSpec` builds one; `armed(spec, side, woodenClub())`
(`src/core/human/grip.ts`, `src/core/items/club.ts`) puts the club, the only weapon so far, in a
hand. Families share code, never values: a spec does not spread another family's spec.

### Provenance

Every number in a spec is a `Quantity` (`src/core/spec/quantity.ts`): a value, a unit and where it
came from. A leaf is `sourced` from an entry of `SOURCES` (`src/core/sources.ts`), which is one of
four kinds: literature, the owner's decision, an asset (with a JSON pointer into the file) or a
measurement (with how it was taken and its record). Anything else is `derive`d from other quantities
by a named rule, whose code does only its formula's arithmetic; a factor is an input with a source,
and unit conversions live in one table in `quantity.ts`. `specProvenanceFaults`
(`tests/fixtures/spec.mjs`) holds every spec to this: no bare number, every derivation re-run to its
stored value, no stray literal in a rule, every source key known, every asset pointer matching its
file, and every decision's record present (a record in a file since deleted is named `path@commit`).
Tuning is immutable: an experiment passes an override in (a `RulebookOverride`, a stance tuning) and
nothing mutates a global.

### Build

`buildBody` (`src/core/build/build-body.ts`) makes one engine body per segment, with the spec's
mass and inertia (a held item's are folded in by `rigidOf`), and one joint per spec joint, whose
free axes are the spec's freedoms. The body is built in the pose its joints demand.

- `jointAngles` and `jointTracker` (`joint-state.ts`) read each freedom's angle as the engine's
  limit reads it: about axes fixed in the parent.
- `bodyDynamics` (`dynamics.ts`) gives the floating-base mass matrix, gravity and bias (the
  velocity-product terms, gyroscopic torque included) in the joints' speeds, and the root's rows
  that say what wrench the ground must supply.
- `contactMass` (`contact-mass.ts`) gives the effective mass a contact meets at a point along a
  normal, which is what prices a blow.

### Engine seam

`src/core/engine/engine.ts` is the contract, and has no engine's types in it: a fixed step that
writes each node's `position` and `rotationQuaternion`; bodies that never sleep; the spec's mass,
whole; velocities of the centre of mass; one friction (`CONTACT_FRICTION`, 0.5) and no bounce on
every contact; freedom k as axis k of the joint's frame; a motor as a velocity constraint bounded
by a torque; a force and a moment on a body through one step, integrated as gravity is, beside
the impulse that is whole before it; and the contacts the solver pushed on in the last step. `rapier.ts` implements it,
with the solver's own settings in `SOLVER`, which are conditioning and not anatomy. `engines.ts`
lists the engines and is the only module in `src/core/` or the lab that imports one. A candidate
is tried on the physics bench (`src/physics-bench/engines/`) first, then added to `ENGINES` and run
under the core's tests with `CORE_ENGINE=<name> npm test`.

### Muscles

`driveMuscles` (`src/core/muscle/driver.ts`) turns each freedom's command, an activation and a
velocity, into a motor target and a torque ceiling: activation times the peak torque of the side
pushed toward, times the force-velocity factor at the joint's speed (`force-velocity.ts`: Hill's
curve shortening, and an eccentric branch lengthening that rises toward 1.4 times isometric, for
braking and blocking). A muscle can never exceed its source's strength at its speed.

### Motor control

- **The servo** (`src/core/control/servo.ts`) asks each joint for a critically damped approach to
  its goal and computes the torques that produce it through the body's own dynamics (mass matrix,
  bias and gravity), solved around the freedoms that are being pushed and clipped at strength.
- **Hand goals** (`motor.ts`, `kinematics.ts`): the knuckles follow a minimum-jerk path to a place
  at a time, solved for shoulder and elbow and fed forward to the servo.
- **The stance** (`stance.ts`; its records in `stance-state.ts`, its inverse dynamics in
  `stance-dynamics.ts`, its steps in `gait.ts`, its soles in `support.ts`, its constants in
  `stance-tuning.ts`) keeps the body up by the forces the ground can really give. It plans
  the centre of mass inside the support, asks the root's rows for the wrench that needs, shares it
  among the bearing soles within friction, no pull and the centre of pressure on the sole
  (`shareGroundWrench`, `contact-wrench.ts`), asks the root for less where the soles fall short,
  and gives each stance leg its inverse dynamics minus the ground's force at its foot. What the
  soles miss is published (`StanceReading.shortfall`), and it is what the stance asks its assist
  for: the root is asked for what the soles and the assist give together. The swing
  leg is solved within its strength (`boundedLeastSquares`). Steps (to recover, to walk, to shift
  weight) are placed from the capture point. `stanceEnvelope` (`stance-envelope.ts`) reads what
  each body was measured to hold (`assets/core/stance-envelope.json`).
- **The assist** (`assist.ts`) is a force and a moment on the root that no muscle gives: an ask
  shortened to a ceiling in the body's own weight, given through the solver step, and metered. Its
  ceiling is the fight's to set from the character's balance, and none unless given
  ([reference/assist.md](reference/assist.md)).

### Skills

`createSkills` (`src/core/skills/skills.ts`) is the only place an `Intent` becomes a
`BodyCommand`, and it reports back (`SkillReport`: heading, pace, whether the body has fallen,
where a strike is).

- **Locomotion** (`locomotion.ts`) walks at no more than the body's measured fastest walk, turns
  only while walking and no faster than its envelope allows, and can set the feet at a chosen
  place (`Locomotion.place`).
- **Strike** (`strike.ts`, `strikes.ts`) throws a searched recipe: a chamber pose and timed muscle
  pushes (`Strike`), one per body and held item, for the right hand, in `assets/core/strikes.json`
  (`REPERTOIRE`, written by `research/core-strike-repertoire.mjs` from the searches), thrown from
  guard and landing over a measured window (`Recipe.window`). The skill chooses the recipe for what
  the hand holds (`recipeFor`; the left hand's is mirrored, and a body with none of its own
  borrows one), walks the body to where the target sits in the window, sets the feet, stands
  `STAND` seconds, and throws. While a strike runs it owns the legs and trunk, and the other hand
  guards.
- **Guard** (`guard.ts`, `GUARD`) is the arms' posture when nothing else owns them.

### Minds

A `Mind` (`src/core/mind/mind.ts`) is `step(senses, dt)`: a stateful function from what its body
senses to what its muscles are asked. `embody(built, world, make)` makes it with its own body
(`OwnBody`: the spec, the built segments and joints, the muscles, the assist) and steps it before every solver
step, after the muscles have read the joints. It reads its `Senses` (`senses.ts`) and
that body, and writes each freedom's activation and the speed asked of it
(`MuscleDriver.activation`, `.velocity`): a speed beyond the muscles' reach is a torque at the
ceiling the activation sets, and a speed of zero holds. It may also ask its assist for a force
and a moment on the root (`Assist.ask`), which gives none unless the fight gave it a ceiling. That
command and that ask are the whole of what a mind does to the world; camera state never reaches one. The seam names no hand and no foot, so a body of
another shape takes a mind through the same call. `tests/core-boundary.test.mjs` holds that
nothing else under `src/` drives muscles.

`Senses` are the clock, the body's side, whether it is out of the fight, and every other body the
senses carry (`BodySense`): its side, its spec with what it holds, whether it is out, its centre
of mass and that centre's velocity, and each segment's pose, centre, velocity and spin. Not its hit
points, and nothing of its mind. A fight owns one sensing layer (`createSenses`), which reads every
body it carries in the step's sensing phase (`World.sense`), before any mind steps, so every mind
in a step sees the same moment; it shows each body to the others a whole number of steps late,
none unless given (`DuelRecipe.senseDelay`). A body alone senses the clock (`clockSenses`). Under
the command layers the senses are in the view (`BodyView.senses`).

Every body the game has runs one mind, written with the layers above: `commandMind`
(`src/core/body.ts`) is motor control under a driver that hands it goals, and the driver is the
skills carrying out what the tactics decide.

`Tactics` (`tactics.ts`) are `decide(sight, dt)`: from their `Sight` (the body's view, the
skills' report and the body's envelope) they return an `Intent` (`intent.ts`): a velocity forward
and to the right of the body's heading, or none; a way to face; how low to stand; and for each hand
guard or attack a point. It names no joint, pose or push. `driveBy(body, tactics)` hands the body
to them through the skills.

The core has one set of tactics, `fighterTactics` (`fighter.ts`), which carry out `Orders`
(`orders.ts`): a direction to walk, a direction to face and a point to attack, each or none, in
the world's frame, as plain data naming no joint, pace or camera. Each step the tactics ask for
the orders, with what the body sees. Ordered to walk, the body walks that way at its fastest
walk, turning to it. Ordered to face another way as it walks, it walks at half that pace until
it has turned to its facing, and from then at half plus the other half times the cosine of the
angle between its heading and its walk (`STRAFE`, [reference/orders.md](reference/orders.md)).
Given a point it attacks it with its right hand, the strike skill closing the distance, while the
left guards. The stance turns only while it walks, so a standing body ordered to face does not
turn.

Orders come from three places. An arena side nobody has taken makes its own (`seekFoe`): from
its senses it picks the nearest body of another side still in the fight, walks at it, and attacks
its head once their centres are within `ATTACK_METRES` (1.8 m). A side a person has taken is
given the person's (`Duel.order`) and does only what it is ordered, until it is handed back or is
out of the fight. In the crypt the run plans for its fighters with the map (`DungeonRun`) and
hands each its plan as orders, with its target's head; its bodies sense the clock alone. The lab
has tactics of its own:
`stanceTactics` (the keys), `trackTactics` (the Run), `routineTactics` and `attackOnce`.

## One world step

`createWorld(scene, engine)` (`src/core/world.ts`) makes the world: one fixed step at 120 Hz
(`PHYSICS_HZ`) that owns physics, control, combat and the clock. A step runs the sensing hooks (a fight's senses, `createSenses`), the before-step hooks
in the order they were added, one solver step, which writes every node, and the after-step hooks
(readings, blows); the clock is the count of steps. Each body adds one before-step hook
(`driveMuscles`), in which the muscles read the joints, the body's mind steps (`embody`), its
assist gives what the mind asked of it and the motors are set; for a game body the mind is `commandMind`, which reads the view (`look`), runs the
tactics and the skills, and runs motor control; a page may add its own (the crypt's
`DungeonRun.plan`, the lab's shove). The pages, the Node stand and the research all call
`World.step`; a page advances by real time with `World.advance`, which caps the steps a frame may
take. `scene.render()` draws what the steps produced and never advances them.

Node imports `src/` directly. `tests/harness/core-stand.mjs` stands one spec on a ground in a world
of its own (`coreStand`, `freshEngine`), `tests/harness/scene.mjs` gives a `NullEngine` scene for
tests that need meshes and no physics, and most of `research/` measures on the same stand
([research/README.md](../research/README.md)).

## Rules and wounds

The rules of a fight are `src/core/rules/`, free of any page so they can be argued with in tests
(`tests/core-rules.test.mjs`, `tests/core-blows.test.mjs`).

- **A blow** (`watchBlows`, `blows.ts`) is a new contact between a striker (a hand, or anything it
  holds) and another side's body, closing. Its energy is `impactEnergy` (`impact.ts`): half the
  reduced mass of the two effective masses (`contactMass`) times the closing speed squared. Hand
  against hand is a clash and does nothing.
- **Damage** (`rulebook.ts`) is energy times the mechanism's worth over the unit. The unit is the
  Warrior's strongest one-handed blow with the wooden club (`core-club-unit`,
  `research/core-club-unit.json`), and every mechanism (blunt, edge, axe, point) keeps its ratio to
  the club. The arena's rulebook and the dungeon's are the same rules.
- **Wounds** (`pool.ts`): one pool of hit points per body, split over its parts by cross-section
  (mass to the two-thirds). A part's excess damage spreads to its neighbours, nearest first and
  inward first. A part emptied by a clean blow, or hit far enough past empty, comes off, except the
  trunk's; no blow is clean today. A body's pool ends when it is empty, or when a vital part (the
  head, for every body today) is emptied or comes off; which parts are vital is the spec's `wounds`.
- **Balance**: a character has a number of points of balance beside its hit points
  (`AttributeSpec.balance`), and the rulebook says what a point is worth (`Rulebook.balance`):
  0.05 of the body's weight of force and 0.013 of its weight times a metre of moment, the most its
  assist gives it (`balanceCeiling`). A fight sets each body's ceiling from its character's points,
  or a recipe's (`DuelRecipe.balance`, `&balance=left,right` in an arena link), and withdraws the
  assist when the body is out of the fight. Every character's balance is 0, and at 0 there is no
  assist.

A body that falls (`SkillReport.fallen`) is out of the fight: rising is not built yet. The arena's
verdict (`Duel.judge`, `src/arena/duel.ts`): a side is out when its pool ends or its body falls;
both out on one step is a draw; at 120 s the fuller bar wins.

A bout is built from a recipe (`DuelRecipe`): the two bodies, how far apart they start and the
cap, as plain data, so the same bout can be built again in another world or on another thread;
what a page hears of it (`DuelHooks`) is beside the recipe, not in it. Nothing in a bout is
random, so a recipe played twice is the same bout to the bit (`playBout`, `research/bout.mjs`;
`traceOf`, `tests/harness/trace.mjs`). How the bouts end today is `docs/reference/bouts.md`.

Every order a side is given is kept with the step it was given before (`Duel.tape`), an order
that repeats the last left out. The recipe and the tape are the whole of what made a bout:
`Duel.play` gives a tape again as the bout steps, each order in the sensing phase of the step it
names, before any mind, so a bout a person fought plays again to the bit
(`playBout(recipe, seconds, tape)`). A facing is the way from the body to the pointer's point,
which changes as the body moves, so a side fought with the pointer over the arena tapes an
order a frame.

## The screens

`index.html` is one document (`src/app.ts`, routed by `src/app-route.ts`): the main menu, and the
arena, crypt and lab screens at `?play=arena`, `?play=dungeon` and `?play=lab`, each a
`<template>` mounted once per page load. Changing screen is a navigation.

- **The Arena** (`src/arena/`): two clubbed bodies in the Forge (`src/arena/scene.ts`,
  `src/arena/room.ts`), each driven by `fighterTactics` under a `Duel`, to a verdict. A person
  may take a side (`&you=left`): each frame the page turns the walking keys, as the camera sees
  the ground, and the pointer's ray, where it crosses the level of the body's centre of mass,
  into world directions (`src/arena/orders-input.ts`) and gives them as orders (`Duel.order`),
  so nothing of the camera reaches a mind. The room's
  solids (`arenaSolids`) are what bodies meet; the visible room is dressed from the forge kit
  (`src/arena/forge-style.ts`, `src/arena/forge-room.ts`). `validateRoomPlacements` refuses a
  piece that names a collider the arena lacks, or one of the wrong role, and a solid-looking piece
  within reach (below `ROOM.maxReachHeight`) that names none.
- **The Crypt** (`src/dungeon/`): a party in a generated dungeon (`DungeonRun`, `run.ts`). The
  map's walls, doors and obstacles are fixed boxes in the world (`buildDungeonWorld`); every
  body is driven by a mind; a person's orders reach the party only through the run's
  plan (`DungeonCommands`), and each member's mind carries them out while it defends itself.
  Enemies are built when the party comes near; its art is in [art/crypt.md](art/crypt.md).
- **The lab** (`src/lab/`): one body at a time in the Stance, Routine, Run and Blow
  scenarios (`scenarios.ts`), at 120 or 480 Hz, with a transport that steps the world by hand.
- **The character workshop** (`/character-lab.html`, `src/character-lab/`): the workshop models
  with their authored preview motion. It uses no core. See [art/characters.md](art/characters.md).
- **The physics bench** (`/physics-bench.html`, `src/physics-bench/`): the bake-off's cases on
  MuJoCo and Rapier, which chose Rapier (`research/physics-bakeoff/REPORT.md`).

The screens share the core and `src/render/`: `dress.ts`, which draws each body as its skin, or as
its collision shapes if the skin does not load; the skins (`skin.ts` for the humans,
`skeleton-skin.ts` for the skeleton, see [art/skeleton.md](art/skeleton.md)), which read only the
segments' achieved transforms and own no collision, and the collision shapes drawn
(`body-shapes.ts`). The arena and the crypt also share the post pipeline (`post.ts`), textured
surfaces (`surface.ts`, `materials.ts`, `textures.json`) and sound (`src/audio/game-audio.ts`,
`src/audio/cues.ts`, which voices each landed blow).

## Standing decisions

These are the owner's, and the code is built on them.

- **Physically based, humans first.** Muscles, standing on real ground forces, emergent falls,
  damage in joules. The human is the reference body, and every other body is balanced against it.
- **Locomotion is force-bounded stepping**: the torque stance, with ground forces at the real feet
  within friction and the legs' strength.
- **Rapier is the engine**; MuJoCo stays on the bench; another engine is tried on the bench first.
- **120 Hz**, and the controllers are made to work there.
- **Torque sources with the body's real inertia**, and an eccentric ceiling of 1.4 times isometric.
- **A person never commands muscles.** A person's input is orders (`Orders`): walk this way, face
  that way, attack that point. The body's own tactics and skills carry them out.
- **Strikes are searched recipes now, hand goals next**: a strike becomes a place, a speed and a
  time for the hand, met by arm, trunk and legs together, and the tactics' intent, attack that, does
  not change. Nothing is built that the next step throws away, or searched on a path the game will
  not use.
- **Sizes and hit points.** x1 is a typical adult, about 1.77 m and 79 kg; the Rogue keeps her own
  proportions. The Warrior has 6 hit points and the Rogue 4.
- **The skeleton is a family of its own, not a reskin.** It keeps thin colliders though they make it
  harder to hit; blunt blows beat bone while cuts and thrusts do less; its joints are weak; its
  ribcage and pelvis are fatal and its skull is not; chipping its bar down works with every weapon.
  Its art is rigid, shaded by vertex colour. Today it runs on the human's placeholders and wounds;
  building this intent is on the [roadmap](roadmap.md).
- **Cosmetics never carry authority.** Nothing decorative collides or decides a hit.
