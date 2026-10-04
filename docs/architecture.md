# How Auto-RPG is built

Auto-RPG is physically simulated melee in the browser. A fighter is a body of rigid segments and
joints, driven by muscles with the strength and speed of their anatomy; a blow is whatever the
body carries into another body, and it wounds by the energy it brings. There is no attack
animation and no hit box: the pages draw what the physics did.

Babylon.js 9 draws; Rapier (its SIMD build, WebAssembly) simulates. The SIMD package is built from
the pinned source and patch in `vendor/rapier` and installed from its committed tarball; ordinary
installs need no Rust toolchain ([engine record](reference/rapier-vendor.md)). Everything that fights is the
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
| Mind seam | `src/core/mind/mind.ts`, `sub-mind.ts` | a mind made with its body, stepped before the solver, writing the muscles' command and its assist's ask; a host hands its body to a sub-mind that wants it |
| Motor control | `src/core/control/` | joint goals, hand goals and the stance turned into muscle commands; a body borne on the ground through its limbs (`bearing.ts`) |
| Skills | `src/core/skills/` | an intent turned into the body's command: walk, face, strike, guard |
| Tactics | `src/core/mind/tactics.ts`, `fighter.ts` | what the body should do, decided from what it sees |
| Minds | `src/core/mind/config.ts`, `minds.ts`, `rise/` | a body's mind made from its config, plain data by kind; a riser that plays a recipe of stages |

`createBody` (`src/core/body.ts`) gives a built body the command layers as its mind
(`commandMind`, hosting the sub-minds it is given, under `embody`): its muscles and motor control. Each step it
reads the body's `BodyView` (time, joint angles, fists, knuckles, head, stance), asks its driver,
and obeys the `BodyCommand` it gets back: a posture, hand goals, timed pushes and a stance goal.

### Spec

A `BodySpec` (`src/core/spec/body.ts`) holds a body in its reference pose, in metres, with +x
right, +y up, +z forward and the soles on y = 0: its segments (mass, centre of mass, principal
inertia, collision shape, and its surface: how stiff it is under a blunt load, which is what a
blow is shared by), its joints (a tree; each freedom with its axis, range and muscle), its
wounds (`hp`, the `vital` parts, the parts that never come off) and anything held. An item
states a surface or is rigid.

The human body plan builds every current body. `figureSpec` (`src/core/human/spec.ts`) takes a
`HumanFigure` (the sex whose tables apply, the landmarks, the trunk's hulls, the feet, the hands,
the mass, the stature and the hit points) and lays out 16 segments and 15 joints from published
tables: de Leva for segment parameters, Dempster via Winter for densities, measured joint ranges
and torques, Abe for regional muscle, Anderson, Frey-Law and Thelen for force and speed, and
the impact literature for each part's stiffness under a blunt load (`CONTACT_STIFFNESS`,
[reference/wounds.md](reference/wounds.md#stiffness)).

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

### Arithmetic

The core computes with the operations IEEE 754 fixes (`+`, `-`, `*`, `/`, `Math.sqrt`) and with
functions of its own (`src/core/math/real.ts`): sine, cosine, tangent, their inverses, the
exponential, the hyperbolics and the cube root, each fdlibm's kept operation for operation, and a
vector's length. A JavaScript engine's `Math.sin` and its kin are right only to about the last
bit and differ from one engine to the next, which a bout amplifies into another bout within
seconds; the core's own return the same double everywhere. It takes no power: a square is a
product. The two turns Babylon builds on the engine's sine and cosine are the core's as well
(`turnAboutToRef`, `turnBetweenToRef`, `src/core/math/turn.ts`). `tests/core-boundary.test.mjs`
holds the core, and the arena's modules that build a bout's world, to the exact members of `Math`
and to the members of Babylon's math that are arithmetic alone; `tests/core-math.test.mjs` holds
each function's values to a record ([reference/real-functions.md](reference/real-functions.md)).

The solves a step works are `linalg.ts`'s written into flat arrays made once
(`src/core/math/flat.ts`): a matrix its rows end to end, the same operations in the same order,
so the same doubles; `tests/core-flat.test.mjs` holds each to its twin. The step's dear functions
work so: the arrays a body's control works in (a **work**) are made with it, in the closure of
what uses them (the stance's bearing solve, `bodyDynamics`, the joint trackers, each hand's
reach), sized from the body's spec, and a function writes every entry of one before it reads it.
A work carries nothing from one call to the next, so it is not state and no two bodies share one;
what a step allocates is held under a ceiling (`tests/core-step-cost.test.mjs`,
[reference/step-cost.md](reference/step-cost.md#control-written-into-arrays-made-once)).

### Build

`buildBody` (`src/core/build/build-body.ts`) makes one engine body per segment, with the spec's
mass and inertia (a held item's are folded in by `rigidOf`, which says whose each of the rigid
body's shapes is: the segment's own, or an item it holds), and one joint per spec joint, whose
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
the impulse that is whole before it; every body and every fixed collider a body is in contact
with as the last step left it (`contactsOf`), each with the impulse the solver pushed the two apart
with, which is 0 for two in contact that it did not push on, and naming the pairs of shapes it
pushed on by their places in their bodies (`Contact.pairs`); and how far a point is from a body's
shapes (`SegmentBody.gapTo`). In contact is the engine's narrow
phase giving the solver a contact point: touching, or within the distance Rapier predicts a contact
over, 2 cm. A reader may refuse a body, or everything fixed, before the contact between them is
read: most of what is near a segment is its own body's neighbouring segments, and reading a pair
is what costs ([reference/play.md](reference/play.md#hearing-in-the-step)). A
world saves its whole physical state and loads it in place (`PhysicsWorld.save`, `load`); a body,
joint or collider the core holds survives a load as the object it was, and a save of a world with
other bodies, joints or colliders is refused. `rapier.ts` implements it,
with the solver's own settings in `SOLVER`, which are conditioning and not anatomy; it keeps a
body's velocities as read until the next step, or an impulse, new mass or a hold, since control
reads each a few times a step and every read through Rapier's binding makes an object. `engines.ts`
lists the engines and is the only module in `src/core/` or the lab that imports one. A candidate
is tried on the physics bench (`src/physics-bench/engines/`) first, then added to `ENGINES` and run
under the core's tests with `CORE_ENGINE=<name> npm test`.

### Muscles

`driveMuscles` (`src/core/muscle/driver.ts`) turns each freedom's command, an activation and a
velocity, into a motor target and a torque ceiling: activation times the peak torque of the side
pushed toward, times the force-velocity factor at the joint's speed (`force-velocity.ts`: Hill's
curve shortening, and an eccentric branch lengthening that rises toward 1.4 times isometric, for
braking and blocking). A muscle can never exceed its source's strength at its speed.

**A body runs at a level** (`BodyLevel`, `MuscleDriver.level`), data in its muscles' state:
`full`, its joints read, its mind stepped and its motors driven; `limp`, none of the three, its
motors released, so the solver alone moves it; `held`, limp and every segment fixed where it is.
`setLevel` changes it: leaving `full` the mind is told its body is nobody's (`Mind.idle`), and
the command and every motor are zeroed; back at `full` its first step reads the joints before its
mind steps. A save holds the level and the engine's save which bodies are fixed. Which level each
body is at is the levels' rule's ([Rules and wounds](#rules-and-wounds)); a body is never disposed
and driven afresh to change what it costs.

### Motor control

- **The servo** (`src/core/control/servo.ts`) asks each joint for a critically damped approach to
  its goal and computes the torques that produce it through the body's own dynamics (mass matrix,
  bias and gravity), solved around the freedoms that are being pushed and clipped at strength.
- **Hand goals** (`motor.ts`, `kinematics.ts`): named points of a hand's rigid body (its
  knuckles, a point of what it holds: `rigidPoints`, `src/core/build/rigid.ts`) follow
  minimum-jerk paths to places in the body frame at a time (`HandGoal`), solved for the
  shoulder, the elbow and the wrist and fed forward to the servo. One place puts a point there;
  two put two points of the one body, which lays the line between them (`solveReach`: three
  rows, or five). A path may run on past its place (`through`), and a goal given again with
  other places may be the same path, its end moved (`follows`). The body frame is the root's
  (`BodyView.root`), which a skill turns a world point into (`intoFrameToRef`).
- **The bearing solve** (`bearing.ts`) is a body borne on the ground through limbs, and knows no
  foot. A limb (`Limb`) is the chain of freedoms from the root to a segment, with a task at a
  point of that segment: to bear there on a patch of the ground, or to move free. `carryRoot`
  asks the root's rows for the wrench its caller's aim needs (the centre of mass's acceleration
  and the root's spin's), shares it among the bearing patches within friction, no pull and the
  centre of pressure on the patch (`shareGroundWrench`, `contact-wrench.ts`), and asks the root
  for less where the patches fall short; the servo solves the rest of the body around that root;
  `bearLimbs` gives each driven limb its inverse dynamics minus the ground's force at its point,
  a free limb solved within its strength (`boundedLeastSquares`). What the patches miss it
  leaves in its caller's record and asks the assist for: the root is asked for what the patches
  and the assist give together. A task may ask only some rows of its point's motion, and a
  freedom may be asked ahead of the task or toward a posture beneath it (`Limb.work`). A patch
  is a sole or a point (`Patch`), and may be given a part of the load (`LimbWork.share`). A
  limb may hang from a stem (`Limb.stem`): the freedoms between the root and its chain, which
  limbs may share and the servo moves (the trunk's, under both arms). The limb's task takes
  their motion as known, and their torques are the solve's, less each bearing limb's share of
  the ground's wrench.
- **The stance** (`stance.ts`; its records in `stance-state.ts`, its steps in `gait.ts`, its
  soles in `support.ts`, its constants in `stance-tuning.ts`) is the standing plan, and the
  solve's first user: it keeps the body up by the forces the ground can really give. It plans
  the centre of mass inside the support and each foot's task, and says each leg's part of the
  solve (`aimLimb`): the point of its sole, the sole as a patch, a knee past straight asked back
  to its bend, a rolled foot left free to turn about its front edge. The solve's limbs are the
  stance's legs and its records the stance's own state; what the soles miss is published
  (`StanceReading.shortfall`). Steps (to recover, to walk, to shift weight) are placed from the
  capture point. `stanceEnvelope` (`stance-envelope.ts`) reads what each body was measured to
  hold (`assets/core/stance-envelope.json`).
- **The assist** (`assist.ts`) is a force and a moment on the root that no muscle gives: an ask
  shortened to a ceiling in the body's own weight, given through the solver step, and metered. Its
  ceiling is given with the body from the character's balance, and none unless given
  ([reference/assist.md](reference/assist.md)).

### Skills

`createSkills` (`src/core/skills/skills.ts`) is the only place an `Intent` becomes a
`BodyCommand`, and it reports back (`SkillReport`: heading, pace, where a strike is).

- **Locomotion** (`locomotion.ts`) walks at no more than the body's measured fastest walk, turns
  only while walking and no faster than its envelope allows, and can set the feet at a chosen
  place (`Locomotion.place`).
- **Strike** (`strike.ts`, `strikes.ts`) carries out a hand's attack by one of two blows. A
  searched recipe is a chamber pose and timed muscle pushes (`Strike`) for a body, a thing held
  and a height band (`BANDS`: high, where a foe of its own build has its head; middle, its
  upper trunk), for the right hand, in `assets/core/strikes.json` (`REPERTOIRE`, written by
  `research/core-strike-repertoire.mjs` from the searches). A search scores a blow by the rule a
  fight wounds by: the hit points it takes from a target body of the band's part, less those it
  costs the body that throws it, standing afterwards whether it lands or misses
  (`research/core-blow.mjs`). A recipe is thrown from guard at its place (`Recipe.place`:
  ahead of the head, and above it), lands over a measured window about it (`Recipe.window`:
  along the heading, across it, and up; `research/core-strike-window.mjs`), and says what it
  nets there (`Recipe.net`). A cell's recipe is the one of its searches' that nets most among
  those that net more than a placed blow at the same target and have a window the feet can be
  set to; a cell with none has no recipe
  ([reference/human-and-strikes.md](reference/human-and-strikes.md#windows)). A placed blow
  (`PLACED`) is a hand goal: the point the hand strikes with (`aimOf`: its knuckles, or what
  its item says, the club's swell) carried through the target, which it follows in the body
  frame each step. A recipe is its body's own, and no other body throws it
  ([reference/blows.md](reference/blows.md#another-bodys-recipe)). Of its body's recipes for
  what the hand holds (`recipesFor`: the left hand's mirrored) the skill chooses the one whose
  window holds the target's height over the head, the nearest its place where two do
  (`recipeAt`), and a placed blow where none does; walks the body to where the target sits in
  the blow's window, sets the feet, stands `STAND` seconds, chooses again by the head as it
  stands, once for a point attacked, and throws. From the commit to the end of its pushes a
  recipe turns the stance's heading by as much as its target's bearing has turned, read from
  where the feet stood at the commit, up to `STEER`, so a target that moves across under the
  blow stays where its window had it ([reference/blows.md](reference/blows.md#steered)). It
  reports what each hand's recipes net by band (`StrikeReport.nets`).
  While a strike runs it owns the legs and trunk, and the other hand guards.
- **Guard** (`guard.ts`) is a skill in the one list, and has the hands the strike has not. Its
  pose (`GUARD`) is the arms' posture when nothing else owns them. A guarding hand told what to
  cover (`Cover`: where the threat is, and the place of its own body kept from it) is given a
  hand goal that follows the two (`GUARD_COVER`): an empty hand's knuckles go between them,
  `out` from the place guarded; an item that names two points to cover with (`ItemSpec.cover`,
  the club's swell) has their middle there and their line square to the threat's, the way
  nearest how it lies. There is no block and no parry: a club across a blow's line, a hand before
  the face and a shield raised are this one skill placing different points, and what a cover
  costs is the blows' rule's.

### Minds

A `Mind` (`src/core/mind/mind.ts`) is `step(senses, dt)`: a stateful function from what its body
senses to what its muscles are asked. `embody(built, world, make)` makes it with its own body
(`OwnBody`: the spec, the built segments and joints, the muscles, the assist) and steps it before every solver
step, after the muscles have read the joints. It reads its `Senses` (`senses.ts`) and
that body, and writes each freedom's activation and the speed asked of it
(`MuscleDriver.activation`, `.velocity`): a speed beyond the muscles' reach is a torque at the
ceiling the activation sets, and a speed of zero holds. It may also ask its assist for a force
and a moment on the root (`Assist.ask`), which gives none unless it was given a ceiling. That
command and that ask are the whole of what a mind does to the world; camera state never reaches one. The seam names no hand and no foot, so a body of
another shape takes a mind through the same call. `tests/core-boundary.test.mjs` holds that
nothing else under `src/` drives muscles. What a mind remembers from step to step is its `state`
(`Mind.state`; a tactics', `Tactics.state`), saved and loaded with its body's ([State](#state)).

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

**A mind may hand its body to a sub-mind** (`sub-mind.ts`). A `SubMind` is a mind that also says
each step whether it wants the body (`wants`), and is told when it has it and when it has it no
longer (`begin`, `end`). `hosting(host, subs)` makes one mind of a host and its sub-minds, in
rank order. Each step the host reads its body (`HostMind.look`), so its view is of this step
whoever drives, and a sub-mind reads that view too; then the first sub-mind that wants the body
steps in the host's place, or the host acts (`act`). When a sub-mind takes the body the host
gives up what it had asked (`release`: the command mind forgets its hand goals, its pushes and
its stance, the step under way with it, so nothing it began goes on under another mind's hands
and the view shows no stance asked). When the body is its own again it is told (`resume`), and
the view says so for that step (`BodyView.resumed`): `driveBy` resumes every skill before the
tactics decide (`Skills.resume`, each a `Skill`, told from one list), and the fighter's tactics
aim afresh, so the body goes on from where it is and not from what it was in the middle of. Who
has the body is one number in the mind's state, and `Body.has` names it.

A mind whose body leaves `full` is told (`Mind.idle`), and is not stepped until its body is at
`full` again; it then goes on from the body as it is. Under `hosting` this is the hand-over to a
sub-mind, made to nobody: the one that had the body ends, or the host is released, and `Body.has`
reads `"nobody"`; the first step back is the one a sub-mind's end makes, the host resumed or the
sub-mind that wants the body begun.

What a mind is made of is its config, plain data tagged by kind (`MindConfig`, `config.ts`), its
sub-minds nested configs in it (`SubMindConfig`), so a sub-mind is configured where it is chosen.
`createMind(built, world, config, wiring)` (`minds.ts`) makes a body's mind from one, wired to
its fight (its orders, its senses, its assist's ceiling), and gives back a `Minded`: the body and
the mind's memory, which is all a fight reads; a reader that knows the kind narrows on it (a
fighter's skills and their report). The switches that make a mind and a sub-mind of a config
have a `never` default. There is one kind of mind, the fighter, and two sub-minds, each of
which wants the body while it is down (`BodyView.down`): `lie` (`lying`, `lie.ts`), which
asks its muscles for nothing, and `staged-rise` (`stagedRise`, `rise/staged.ts`), the riser.
`FIGHTER` is the fighter with `lie`: the mind every body has unless its fight says otherwise,
so a body that falls lies still ([reference/rising.md](reference/rising.md#lying)). An arena
recipe may name each side's mind (`DuelRecipe.minds`); the crypt gives every body `FIGHTER`;
the lab's actor, whose tactics are its scenario's, takes the sub-minds its page chose
(`ActorOptions.subs`, made by `subMindsOf`), and `FIGHTER`'s unless it is given others.

**The riser plays a recipe** (`Recipe`, `RISE`, `rise/stages.ts`): plain data that names
freedoms and limbs, and no body. It lies slack until its centre of mass is still, reads how it
lies (`lieOf`: on its front, its back or a side), and plays stages. A stage is a pose
(`PoseStage`: every freedom turned toward a posture for a time, the posture written from each
freedom's own zero, `DofSpec.bind`, so one posture is one shape on every body) or a bearing
(`BearStage`: the body borne on limbs the recipe names, `riseLimbs`, `rise/limbs.ts`, its
centre of mass held over them by their shares; a step of motor control's shape on the bearing
solve). On its back or a side it plays that lie's roll, which turns it onto its front, lies
slack and reads again; on its front it plays the rise. A bearing stage is done when the body is
where the stage asks and slow, and is given up at its limit, which ends the attempt, as does the
trunk back on the ground once the rise has raised it: the riser lies slack and begins again. `stageFaults` says what of a recipe a body's spec cannot play, and
a riser refuses such a recipe as it is made. What a riser remembers (its phase, how it lies, its
stage, its attempts and the furthest it got) is its state under its mind's. The game's recipe
goes from the front to the feet: onto knees and hands, a kneel-up, a step to a half kneel and a
lunge onto both feet, where its host's stance has the body and the locomotion skill, resumed,
stands it at the stance's height and squares its feet. It stands the Warrior from seven falls of
eight with nothing in its hands and more than three of four with the club, the Rogue from one
fall of five and the skeleton from almost none
([reference/rising.md](reference/rising.md#where-the-rise-stops)).

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
left guards: it holds the point while the strike skill walks and sets the feet for it, and aims
at the ordered point itself once a blow is committed. The stance turns only while it walks or
follows a blow's target, so a standing body ordered to face does not turn.

A hand that does not attack guards as the mind's config says (`FighterMindConfig.guard`): in the
pose, or by a cover of what threatens its head. The threat is read from the senses (`threatOf`,
`threat.ts`): of the other sides' bodies still in the fight, the point each hand strikes with
(its knuckles, or its club's swell) that closes fastest on the head, within `THREAT`'s distance
and over its speed. What is sensed is as old as the senses' delay, and nothing corrects for it.
Every body's fighter guards in the pose (`FIGHTER`); an arena link's `&guard=cover` gives both
sides the cover ([reference/blows.md](reference/blows.md#covering-searched)).

Orders come from three places. An arena side nobody has taken makes its own (`seekFoe`): from
its senses it picks the nearest body of another side still in the fight, walks at it, and attacks
it once their centres are within `ATTACK_METRES` (1.8 m): at its head, or, where its config says
to aim at what pays (`FighterMindConfig.aim`, `bandAimed`), at the part of the band its hand's
recipe nets most on (`StrikeReport.nets`, `BANDS`). Every body's fighter aims at the head
(`FIGHTER`; [reference/blows.md](reference/blows.md#aim)). Where its config says to hold at the
edge (`FighterMindConfig.range`, `EDGE`), it reads the foe's reach from what it sees of the foe
(`rangeOf`, by `BodySense.spec`, the rule its own strike skill throws by, `StrikeReport.rangeAt`):
it stands just outside it, backing out from inside it, and attacks when the part it aims at
stands in its own blow's window from where it stands, or when it has stood there its patience.
Every body's fighter walks in (`FIGHTER.range`). A side a person has taken is
given the person's (`Duel.order`) and does only what it is ordered, until it is handed back or is
out of the fight. In the crypt the run plans for its fighters with the map (`DungeonRun`) and
hands each its plan as orders, with its target's head; its bodies sense the clock alone. Each
body's level is the levels' rule's (`levelsOf`, the run's `LEVELS`): one out of the fight goes
limp, its assist withdrawn; an enemy waiting at its home with the party far off is held, fixed
where it stands with nothing driving it, until the party nears; and the dead are held where they
lie once their fall is over and nobody walks near.
The lab
has tactics of its own:
`stanceTactics` (the keys), `trackTactics` (the Run), `routineTactics` and `attackOnce`.

## One world step

`createWorld(scene, engine)` (`src/core/world.ts`) makes the world: one fixed step at 120 Hz
(`PHYSICS_HZ`) that owns physics, control, combat and the clock. A step runs the sensing hooks (a fight's senses, `createSenses`), the before-step hooks
in the order they were added, one solver step, which writes every node, and the after-step hooks
(readings, blows); the clock is the count of steps. Each body adds one before-step hook
(`driveMuscles`), in which the muscles read the joints, the body's mind steps (`embody`), its
assist gives what the mind asked of it and the motors are set; for a game body the mind is `commandMind` with its sub-minds (`hosting`): it reads the view (`look`), and then a sub-mind that wants the
body drives it, or the tactics, the skills and motor control do; a page may add its own (the crypt's
`DungeonRun.plan`, the lab's shove). The pages, the Node stand and the research all call
`World.step`; a page advances by real time with `World.advance`, which caps the steps a frame may
take. `scene.render()` draws what the steps produced and never advances them.

Node imports `src/` directly. `tests/harness/core-stand.mjs` stands one spec on a ground in a world
of its own (`coreStand`, `freshEngine`), `tests/harness/scene.mjs` gives a `NullEngine` scene for
tests that need meshes and no physics, `tests/harness/workshop-model.mjs` stands a workshop model
at a frame of a clip, and most of `research/` measures on the core's stand
([research/README.md](../research/README.md)).

## State

What a step writes and a later step reads is **state**, and it is plain data
(`src/core/state.ts`). The physics keeps its own, as bytes (`PhysicsWorld.save`, `load`). Every
module that remembers anything else keeps it in one object, its `state`: the world its count of
steps; the muscle driver, the assist, motor control with the stance, and the body's view; the
skills with the command they write, the legs and the strike; the tactics; the senses, the pool
and the blow watch.

- **State is** numbers, strings, booleans, null, plain objects, arrays, typed arrays, a `Map` or
  `Set` keyed by strings or numbers, a `Vector3` and a `Quaternion`. A body, a node, a function or
  an object with a getter is not, and `saveState` refuses one by its path.
- **`saveState(root)`** copies what is under a root, and the copy crosses a thread.
  **`loadState(root, saved)`** puts it back in place: whoever holds an object of the state holds
  it still, with the saved values in it, so no module is told of a load. Two slots that held one
  object at the save hold one after the load, and two that held two hold two.
- **A constant a state points at is frozen** (`deepFreeze`: the strike recipes, the guard, the
  orders to stand). A load never writes into a frozen object; it puts a copy in the slot. A blow
  and a verdict are frozen as they are made, so one a page was handed is a record no load changes.
- **The states hang on one root.** A body's is its memory under its mind (`Body.state`: who has
  the body, the command layers' and each sub-mind's), its
  skills' is theirs with their tactics' (`Skills.state`), and a bout's (`Duel.state`) is its own
  (when it began, its verdict, what each side is ordered, its tape and what is still queued of one
  played) with the world's, the senses', the blow watch's and each side's body's, skills' and
  pool's.

`Duel.save()` is a bout at a step: its recipe, the physics' bytes and a copy of its state.
`Duel.load(saved)` puts a bout of the same recipe there, the bout it was saved from or another
built in any world: the physics, the state, and each body shown the others again from the
senses' frames (`SensesHub.show`). The next step is the one that followed the save. A save of
another recipe is refused.

`tests/arena-fork.test.mjs` forks a bout at every second of its course and at every step about a
blow, and holds every field of the bout's state to be one a fork needs: loaded with the field
left as another step had it, the bout goes another way. `tests/core-fork.test.mjs` does the same
for a body under its mind and its skills. A crypt run does not save: its bodies are built as
they wake.

## Rules and wounds

The rules of a fight are `src/core/rules/`, free of any page so they can be argued with in tests
(`tests/core-rules.test.mjs`, `tests/core-blows.test.mjs`).

- **A touch** (`watchTouches`, `src/core/touches.ts`) is a watched segment that the solver pushed
  on another watched segment, or on something fixed, while closing on it, from the step it is
  first pushed until, as its reader asks, the solver stops pushing or the two part. A body's own
  segments touch too, read from each of the two, unless the reader refuses them. It names the
  pairs of shapes the solver pushed on. Its energy is `impactEnergy` (`impact.ts`): half the
  reduced mass of the two effective masses (`contactMass`; something fixed is a mass nothing
  moves) times the closing speed squared.
- **A blow** (`watchBlows`, `blows.ts`) is a touch between any two segments of two sides'
  bodies, lasting while the solver pushes: it has no striker. Its energy is the touch's. Its
  record is two sides (`BlowSide`), the surfaces that met: of the pairs of shapes the solver
  pushed on, the one it pushed on hardest, each shape its segment's own or an item it holds. Each
  side has the share of the energy it took, its damage and its wound.
- **The two surfaces share the energy by their compliance** (`energyShares`, `share.ts`): springs
  in series under one force, so the softer takes the more. A segment's surface is its spec's; an
  item that states none is rigid and takes none. So a fist takes five eighths of its own punch to
  a head and an eighth of one to a chest, what a club strikes takes the whole blow, a bare hand
  that meets a club takes all of it, and two clubs meeting are a clash, in which neither side
  takes any (`isClash`). The values, their gaps and what a part holds beside the literature:
  [reference/wounds.md](reference/wounds.md).
- **Damage** (`rulebook.ts`) is energy times the mechanism's worth over the unit. The unit is
  100 J of blunt blow a hit point, the owner's round number (`owner-damage-unit`,
  [reference/wounds.md](reference/wounds.md#unit)), and every mechanism (blunt, edge, axe, point)
  keeps its ratio to blunt. The Warrior's strongest one-handed blow with the wooden club is a
  measurement beside it (`CLUB_BEST`, `research/core-club-unit.json`): 138.26 J, 1.38 hit points.
  The arena's rulebook and the dungeon's are the same rules.
- **Wounds** (`pool.ts`): one pool of hit points per body, split over its parts by cross-section
  (mass to the two-thirds, as the square of its cube root). A part's excess damage spreads to its neighbours, nearest first and
  inward first. A part emptied by a clean blow, or hit far enough past empty, comes off, except the
  trunk's; no blow is clean today. A body's pool ends when it is empty, or when a vital part (the
  head, for every body today) is emptied or comes off; which parts are vital is the spec's `wounds`.
- **Balance**: a character has a balance beside its hit points (`AttributeSpec.balance`): a per
  cent of its own weight, the most force its assist gives it, with the moment the rulebook gives
  each per cent (`Rulebook.balance`: 0.0026 of its weight times a metre; `balanceCeiling`). A
  fight sets each body's ceiling from its character's balance,
  or a recipe's (`DuelRecipe.balance`, `&balance=left,right` in an arena link), and withdraws the
  assist when the body is out of the fight; the lab sets its body's from the character's balance or
  its address's (`&balance=`). Every character's balance is 0, and at 0 there is no
  assist.
- **Levels** (`levelsOf`, `levels.ts`): which bodies run themselves, for any fight with more
  bodies than fight at once. A body with nothing to do and nobody near is `held`; any other is
  `full` in the fight and `limp` out of it. A body in the fight has nothing to do when the fight
  says it waits; one out of it, once it has lain `settle` seconds. Somebody is near when a body
  going somewhere (in the fight, at `full`, not waiting) is within `company`, or for a body in
  the fight a foe is within `wake`; once it is loose, the farther `clear` and `rest` keep it so.
  `stirs` is the rule's letting go for a body not yet built. A level is read from the game alone,
  never from the machine, so there is no cap on the bodies at `full`; the fight gives the
  distances (`LevelRule`). The crypt is its one caller today.

A body that is down (`BodyView.down`: its centre of mass a quarter metre under the height it is
asked to hold, over its lowest point, `src/core/control/ground.ts`) is out of the fight, and lies still (`lie`): the
riser is the lab's alone, and no fight gives its bodies one. The arena's verdict (`Duel.judge`, `src/arena/duel.ts`): a side is out when its
pool ends or its body is down; both out on one step is a draw; at 120 s the fuller bar wins.

A bout is built from a recipe (`DuelRecipe`): the two bodies, how far apart they start, the
cap, and a side's mind where it names one (`minds`, each a `MindConfig`), as plain data, so the same bout can be built again in another world or on another thread;
what a page hears of it (`DuelHooks`) is beside the recipe, not in it. Nothing in a bout is
random, so a recipe played twice is the same bout to the bit (`playBout`, `research/bout.mjs`;
`traceOf`, `tests/harness/trace.mjs`), in Node and on the page alike
([reference/real-functions.md](reference/real-functions.md), In Chrome). How the bouts end today
is `docs/reference/bouts.md`.

Every order a side is given is kept with the step it was given before (`Duel.tape`), an order
that repeats the last left out. The recipe and the tape are the whole of what made a bout:
`Duel.play` gives a tape again as the bout steps, each order in the sensing phase of the step it
names, before any mind, so a bout a person fought plays again to the bit
(`playBout(recipe, seconds, tape)`). A facing is the way from the body to the pointer's point,
which changes as the body moves, so a side fought with the pointer over the arena tapes an
order a frame. A side is given its orders as JSON carries them, so a tape that has been through a
file or a link gives the orders the bout gave.

A tape rides in a link's fragment, which no server is sent (`#tape=`, `readTape` and `tapeHash`
in `src/arena/matchup.ts`), with the rest of its recipe in the link's query (`&gap=`, `&cap=`,
`&balance=`, `&guard=`). The arena plays a bout whose link carries a tape with nobody at the keys, and a
tape made in Node plays its bout in a browser.

**A bout forks** (`rollout`, `research/rollouts.mjs`) by a load: a bout of the recipe, which the
thread keeps, is loaded with a save of the fork's step (`Duel.save`) and played on under a branch
of other orders, at the cost of the steps played out. It forks by replay too, which needs the
recipe and the tape alone: a second bout is built, played under the tape to the fork's step, and
on under the branch. The two are one fork (`tests/research-rollouts.test.mjs`). Every fork tells
the digest of its poses at the fork, so two forks of one bout at one step agree in it or one of
them is not that bout. **The oracle** (`research/oracle.mjs`) is built on forks, and is an
instrument outside the core, not a mind: it holds the true world, which no mind may. At every
half second of a bout it tries a handful of orders for one side, each in a fork, and gives the
bout the best. What it reports is the ceiling of what it searched and of nothing wider
([reference/oracle.md](reference/oracle.md)).

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
  Enemies are built when the party comes near; its art is in [art/crypt.md](art/crypt.md). Sight
  is the map's (`canSee`, `reveal`, `src/dungeon/map.ts`), read through an index of the cells
  where nothing need be read (`SightIndex`), made again when a door opens. The
  page hears every built body where the party sees (`hearRun`, `hearing.ts`), its listener made
  again when a body is built.
- **The lab** (`src/lab/`): one body at a time in the Stance, Routine, Run and Blow
  scenarios (`scenarios.ts`), at 120 or 480 Hz, with a transport that steps the world by hand.
  Every scenario drives its body through an actor (`actor.ts`), which gives the body what the
  page chose: its balance, its mind, what it does once it is down (to lie, or to rise by
  stages: `LAB_MINDS`, `LAB_DOWN`, `minds.ts`) and the strikes it may throw. The Routine's
  targets are bodies (`targets.ts`): a ball of the attacker's head, hung where a seed drew it as
  the strike at it begins and read by the rule a fight wounds by (`watchBlows`), one at a time
  ([reference/blows.md](reference/blows.md#targets)). The page logs what
  the mind decides, and who has the body when it changes hands (`mind-log.ts`), and what the body
  sounds of (`sound-log.ts`): its touches, its air, the touches of a target that hangs beside it,
  and the cue of the instrument that is no contact, the shove, each at the
  mind's time, so the page plays what the frame it shows sounded of, live or replayed. Its HUD is sections (`hud/sections.ts`) that the shell and the scenario fill with controls
  built from data (`hud/controls.ts`).
- **The character workshop** (`/character-lab.html`, `src/character-lab/`): the workshop models
  with their authored preview motion. It uses no core. See [art/characters.md](art/characters.md).
- **The physics bench** (`/physics-bench.html`, `src/physics-bench/`): the bake-off's cases on
  MuJoCo and Rapier, which chose Rapier (`research/physics-bakeoff/REPORT.md`).

The screens share the core and `src/render/`: `dress.ts`, which draws each body as its skin, or as
its collision shapes if the skin does not load; the skins (`skin.ts` for the humans,
`skeleton-skin.ts` for the skeleton, see [art/skeleton.md](art/skeleton.md)), which read only the
segments' achieved transforms and own no collision, and the collision shapes drawn
(`body-shapes.ts`). The arena and the crypt also share the post pipeline (`post.ts`), textured
surfaces (`surface.ts`, `materials.ts`, `textures.json`) and sound (`src/audio/`): `cues.ts`
makes a cue of an energy and what the two that met are made of, `game-audio.ts` synthesizes and mixes
what a page plays, and `body-sounds.ts` reads what a body sounds of from the world: its touches
(`hearTouches`) and its air (`airOf`). Every screen plays both: the lab from its log, the arena
of its two sides until the verdict, the crypt of every body the party sees. A blow is a touch,
and is heard as one; what it takes off a side is a cue of its own (`debrisCues`)
([reference/look.md](reference/look.md#sound)).

## What the seams are for

An attack is a function of its target: the tactics say what to attack (`HandAction`: a point,
with whatever the hand holds) and never how, and the strike skill chooses how, a searched recipe
or a placed blow. No technique is a kind in the code: a recipe is data a search found. Defence
is the guard placing what a hand holds, or the hand. A blow is whatever two surfaces of two
sides met with. Each seam is where one kind of addition goes; none of these is built
([roadmap](roadmap.md#strikes)).

| Added | Where it goes | What it leaves alone |
|---|---|---|
| **A sword, a spear**: an edge, a point | An item's shape states its mechanism where it cuts or pierces; a blow whose surface is that shape is priced by it (`MECHANISM_PRICE`), after a breach cost under which it is a blunt blow. The item states its `aim` and its points; a search finds its recipes; the guard places its two ends. | The shares, the pool, the skill, the targets. |
| **The face and the vault** | A segment takes several shapes, each with its own surface; a blow reads the surface of the shape that was touched, which a contact already names. | The pool: one head, one share of hit points. |
| **Armour**: boots, greaves, a cuirass, vambraces, gloves, a helmet | A worn item, rigid with its segments as a held one is: it adds its mass, and its surface is one more layer in series (`energyShares` over the layers), taking its share and wounding nobody; it raises the breach cost of an edge or a point. A glove protects the puncher by the same rule. | The rule's shape; a rigid body's shapes gain a kind of owner. |
| **A shield** | A held item with a face: its points are what the guard places (`ItemSpec.cover`); a bash is a blow like any other. A third place on one rigid body fixes its roll (`HandGoal.places`). | The guard skill, the rule. |
| **A staff, a spear in two hands** | An item held by two segments: the builder closes the loop with a joint at the second hand, and a placement solves both arms to the item's points. | Recipes, which are per thing held; the rule. |
| **A bow** | Shooting is a skill beside the strike in the one list (`createSkills`); an arrow is a body, and what it touches is a blow by the same rule, its point's mechanism priced. The draw is a placement. | Every contact rule. |
| **A kick, a knee** | A recipe whose pushes are a leg's, once the stance can give a leg up; the rule already wounds by any segment. | The rule, the targets. |
| **A crouch, a low target** | The stance lowers the body beyond `STANCE_LOWER`, and a band under the middle one (`BANDS`) names it. The targets' low stratum is the row that turns from missed to hit. | The search, the skill's choice by window. |
| **Another body**: four legs, a tail | A search on it: recipes are per model. Its surfaces are its spec's. | Everything else. |
| **A learned or a planning mind** | It asks the same `HandAction`s; or, at the muscles, it is a `MindConfig` kind and the targets score it as a row. | The rule, the targets. |

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
- **Strikes are searched recipes where one lands, and hand goals where none does**: a placed
  blow is a place and a time for the hand, met by the arm alone. Next it is met by arm, trunk and
  legs together, with a speed, and the tactics' intent, attack that, does not change. Nothing is
  built that the next step throws away, or searched on a path the game will not use.
- **Sizes and hit points.** x1 is a typical adult, about 1.77 m and 79 kg; the Rogue keeps her own
  proportions. The Warrior has 6 hit points and the Rogue 4.
- **The skeleton is a family of its own, not a reskin.** It keeps thin colliders though they make it
  harder to hit; blunt blows beat bone while cuts and thrusts do less; its joints are weak; its
  ribcage and pelvis are fatal and its skull is not; chipping its bar down works with every weapon.
  Its art is rigid, shaded by vertex colour. Today it runs on the human's placeholders and wounds;
  building this intent is on the [roadmap](roadmap.md).
- **Cosmetics never carry authority.** Nothing decorative collides or decides a hit.
