# Many skills, faster

Notes on making a new skill, or a new idea for one, quick to try: hours or days from its start
to its sparring reading. They hold three parts in the order they depend on each other, each taken
up on the owner's request by a brief of its own. A part describes a design under consideration;
nothing in it is built.

## Goal

- **A new idea reaches its sparring reading in hours, a new skill in days.** The measure is the
  time from its start to that reading.
- **A new idea is a variation of its own**: trying it moves nothing installed, and nothing else is
  played again for it.
- **A strike moves the arm and the trunk.** Standing and footwork are the layer under it, so a
  change to the legs, the stance or the footwork leaves every strike as it is.
- **A strike is made by search**, with no training run where a search and a correction do.
- **Nothing is computed again routinely**: what is under work plays, and every other result is
  found ([what a saved result is keyed by](2026-11-14-saved-results.md)).

## Where the time goes

- **A training run takes days.** PPO on the sparring punch steps about 240 decisions a second on
  32 workers (train.log's decisions over its minutes,
  [the training recipe](../recipes/training.md#before-the-first-run)), so the 20 to 50 M decisions
  a skill is trained for ([the approaches](../approaches.md#every-skill)) take one to two and a
  half days a run. A run is one try.
- **The schedule alone carries little of the punch sparring**: the drive's own settings played
  with no network land 20 of the 240 held-out starts, against 105 steered
  (`research/skills/strikes/straight-punch/punch-sparring.mjs --bar` on a candidate of the
  drive's settings). The trained correction does most of the work.
- **A variation is the drive with a check added.** Every variation of the straight punch runs one
  executor, one layout (`PUNCH_LAYOUT`, `assets/skills/strikes/straight-punch/drive.layout.json`)
  and each body's one record and network (`dataOf("straight-punch/drive")`,
  `src/skills/strikes/straight-punch/index.ts`); `from-guard` adds when its drive may begin. A
  profile's digest covers the record its skill reads (`skillDigest`,
  `src/skills/framework/profile.ts`). So a change to any of them moves every variation, its cases
  and its profiles, and an idea that needs inputs or a network of its own cannot be a variation
  beside the drive.
- **Each try plays again what it is compared with.** `punch-sparring.mjs --bar` plays every
  held-out start by the candidate and by the drive. `npm run evaluate` keeps no row while a build
  input is uncommitted, and a commit finds none of the rows made before it.
- **A strike is tied to the legs and the footwork.** The straight punch's network reads 20
  leg-joint angles and speeds among its 59 inputs, and four of its 12 outputs ask the stance for a
  heading turn, the centre of mass ahead and across, and whether the walk goes on (`stanceAsks`
  and `keepsWalk`, `src/skills/strikes/shared/steer.ts`). The bonk steps each foot to a searched
  place before its windup (`Swing.footing`, `src/skills/strikes/shared/swing.ts`). A change under
  a trained actor makes it a seed to retrain
  ([the training recipe](../recipes/training.md#before-the-first-run)).
- **The drill's punch is not the fight's.** In the Strike drill's fights the punch falls from its
  own asks of the stance, misses where the drill's footwork or the foe's step leaves the window,
  and is not begun where the approach and the admission fail
  ([the punch's notes](2026-11-10-warrior-punch.md#why-the-punch-does-not-land-in-fights)). Each
  fight commitment holds an input outside every range the drill plays
  ([the punch's notes](2026-11-10-warrior-punch.md#what-a-fight-asks-that-the-drill-does-not)).

## Part 1: each variation its own implementation

**The design.**

- **A variation declares what it runs**: its executor, its record, its layout and network, and
  what it needs of the body. It calls shared code as it chooses, and naming another's record is
  how it shares one. A skill's part holds what its variations have in common: its label, its
  effectors and its Option.
- **A record is a variation's on each body** (`straight-punch/<variation>`), and the part reads
  the variation's (`reads`), so a variation's profile moves only with its own record. The steer
  already takes a layout a variation (`SteerLayout`, `src/skills/strikes/shared/steer.ts`).
- **The research tools that write a record take the variation they write**
  (`punch-sparring.mjs` already takes `--variation`).
- **A variation under work plays; every other variation's results are found**
  ([what a saved result is keyed by](2026-11-14-saved-results.md#the-design)).

**What it would bring.** A new idea is a new variation: built, read and dropped without moving
anything installed, several of them side by side. The fingerprint shows a change moved only its
own variation's cases (`node scripts/fingerprint.mjs --compare <file> --variation
<skill/variation>`).

**What it would cost.** `from-guard` takes a copy of the drive's record and layout, and plays as
before: nothing is played again, which the fingerprint shows.

**Open.**

- Whether a variation has a row of [the table](../reference/the-table.md) or is read as a subject
  against its skill's row.

## Part 2: a strike apart from standing and footwork

**Where it stands.** The control layer holds the stance (`stance-balance.ts`), the whole-body
solve (`solve.ts`) and the assist (`assist.ts`), a root force and moment metered against the
character's Balance ([motor control](../architecture.md#motor-control)). It carries out what each
skill asks step by step (`LegsGoal`, `StanceGoal`) and reacts to a blow's push only once the body
moves, so each strike's network learns to place the centre of mass before its blow. A strike's
window says where it may begin (`strikeWindow`, `quietToStrike`,
`src/skills/strikes/shared/strike-window.ts`); the drill brings the striker into it
(`straightSpot`, `src/minds/command/drill.ts`).

**The design.**

- **A strike takes the arm and the trunk**: it reads no leg joint and steers no leg.
- **Footwork brings the body into the strike's window**: the window is the strike's, the getting
  there is the layer's and the mind's.
- **Standing is the stance's, by a contract.**
  - Down, from the skill: the limbs it takes; what it wants of the pelvis (a turn, a drive
    forward); and the impulse it expects at contact, with its time, declared before the blow.
    Forces between the body's own parts do not move its centre of mass, so the impulse is what the
    stance has to hold. An impulse J moves the capture point by J / (m ω), with ω = √(g / h): 9 cm
    for an untrained punch's 22.8 N s
    ([the strike reference](../reference/human-strike-reference.md)) on an 80 kg body with its
    centre at 1 m, by arithmetic.
  - Up, to the skill: whether the layer can brace this now and how soon if not, and the
    shoulder's frame and velocity. No leg joint.
  - Inside the layer: whether to lean, widen, step, keep walking or ask the assist.

**The reading that sizes it.** A variation of the punch (Part 1) whose layout holds no leg joint
and no ask of the stance, and whose network is one layer, fitted by least squares to the
installed network's own outputs on sparring's training starts. One layer is a linear map
(`recoveryNetwork`, `src/core/math/learning/recovery-network.ts`). It is read on the held-out
sparring starts beside the drive (`punch-sparring.mjs --bar`).

- **Where it holds**, the punch needs no ask of the stance, and its separation is its layout.
- **Where it falls**, the stance's outputs added back say what is lost, and the contract's down
  half is what carries it.

Two ways carry the contract out, both the stance as registered:

| Way | What it is | Its cost |
| --- | --- | --- |
| Assisted | the stance with the assist's ceiling raised | the least work; a skill made with an assist is read again without it before it is called unassisted |
| Feed-forward | the stance keeps the capture point inside the soles by the declared impulse's shift, along its line, before the blow | a margin and a lean in the stance; untested |

Provenance: forces at the root added to a controller's actions (Yuan & Kitani, "Residual Force
Control for Agile Human Behavior Imitation and Extended Motion Synthesis", NeurIPS 2020);
assisting forces relaxed step by step until the body moves without them (Yu, Turk & Liu,
"Learning Symmetric and Low-Energy Locomotion", SIGGRAPH 2018); bounds on the jump an intended
impact makes, kept so that the contacts and the balance hold (Wang, Tanguy, Gergondet & Kheddar,
"Impact-aware humanoid robot motion generation with a quadratic optimization controller",
Humanoids 2019).

**What the assist does to the punch.** The Warrior's installed punch, searched and trained at a
ceiling of 0, sparred on its 240 held-out starts with the striker's Balance set in the bout's
recipe. Against 0.01 per cent, where the assist gives under 0.1 N:

- **It lands more, in shrinking steps**: 18, 25 and 29 more at 5, 10 and 25 per cent. The first
  step is clear of chance on these starts; the later ones are not.
- **The table's value and the life dealt do not move detectably.**
- **No start is bound to gain**: at each level 22 to 26 starts lose a landing while 44 to 51
  gain one.
- **The assist gives in every punch begun**: a median 20, 27 and 40 N over the blow, against a
  weight of 775 N. The ground misses something of each punch.

**What it would bring.** A strike's network stops reading the legs, so a change to the stance,
the legs or the footwork leaves it valid, and its readings stand. A new strike is braced without
learning to be. A strike that leaves the legs alone runs beside a walk: the mind runs together
Options whose resources do not overlap ([Option Mind](../architecture.md#minds)).

**Where the separation stops.**

- A blow's worth is the mass behind the fist, so a strike still asks for a hip turn and a drive.
- The stomp, a kick and a way up take the legs themselves, as the ground skills do.
- A change to how the stance answers an ask it already takes moves every strike that sends it. A
  new optional ask that no installed variation sends moves none, which the fingerprint shows.

**Open.**

- How much of the more landed with an assist is the blow held up and how much the stance stepping
  later.
- Whether the foe's Balance moves a strike's outcomes as the striker's does.
- Whether a margin for the declared impulse is all the stance needs of a blow.

## Part 3: a strike made by search

**Where it stands.** The punch is a push schedule searched by CMA-ES, then an actor trained by
PPO that adds to its pushes and asks the stance at each decision; the bonk is one searched swing
with no network in its record (`assets/skills/strikes/bonk/swing.json`). A blow that tracks a
declared path is too slow, 4 to 6 m/s against 6.8, and a schedule played open-loop works only
from the start it was searched from ([the approaches](../approaches.md#weapon-strikes)). So a
strike needs a searched schedule and a correction inside the stroke.

**The design: a schedule and a linear correction, searched together.**

- **A variation's layout of a few inputs** (the target from the shoulder, the fist from the
  target, the fist's and the centre's velocity, the arm's angles), no leg joint, and a one-layer
  network: the correction added to the pushes inside the stroke.
- **One search** on sparring's training twin (`sparring-twin`, `src/evaluation/strike/cases.ts`)
  by `punch-sparring.mjs --search`, the correction's weights among the settings it moves, judged
  on the held-out sparring starts with `--bar`. Where an installed network exists, the fit of
  Part 2's reading is the search's start.
- **The correction aims**: it reads where the target is, and sparring's starts span places. A map
  from the target's place to the schedule's settings is for places one schedule and its
  correction miss.
- **Where a linear correction falls short**, an actor over the same few inputs is the next size,
  trained from the search's best.

Provenance: schedules played open-loop with a linear feedback fitted to each (Liu, van de Panne &
Yin, "Guided Learning of Control Graphs for Physics-Based Characters", ACM Transactions on
Graphics 2016); a few global parameters of one movement adjusted to a new target (Kober, Wilhelm,
Oztop & Peters, "Reinforcement learning to adjust parametrized motor primitives to new
situations", Autonomous Robots 2012; Mülling, Kober, Kroemer & Peters, "Learning to select and
generalize striking movements in robot table tennis", International Journal of Robotics Research
2013).

**What it would bring.** A strike on a new body or loadout is a search, with no training run. One
strike covers sparring's range of places. A change to the stance leaves its layout as it is.

**Open.**

- Whether a linear correction holds what the open-loop schedule loses: 1.5 cm of foot took a bonk
  from 96 to 63 J.
- Whether the search reaches a good correction at a search's budget, its weights many more than
  the schedule's settings.
- Whether a correction this small follows a moving target inside the stroke.
- Whether sparring's commitment states cover the fights'. The punch's notes compare the drill's
  with the fights' input by input; the same comparison of sparring's says whether a strike made
  sparring is made for fights.
- Whether one sparring run gives the skill's reading as well as its profile. The claim is a
  still-target cell so that how a body throws a move is read apart from what the move brings in a
  fight ([the claim](../recipes/skill.md#the-claim)).

## Other candidates

Each is an idea, untested here.

- **A learned base**: one actor over the stance, trained once against random pushes on the upper
  body, following pelvis commands (Cheng et al., "Expressive Whole-Body Control for Humanoid
  Robots", RSS 2024). It is a second registered balance, so every schedule, actor, way up and
  envelope made on the stance is unproven on it.
- **A strike as a clip under a learned tracker**, as the run is
  ([the approaches](../approaches.md#travel)) (Peng et al., "DeepMimic: Example-Guided Deep
  Reinforcement Learning of Physics-Based Character Skills", SIGGRAPH 2018): tens of millions of
  decisions a clip.
- **One tracker for every clip**, its commands masked to the parts a skill asks (He et al.,
  "HOVER: Versatile Neural Whole-Body Controller for Humanoid Robots", ICRA 2025), trained on many
  bodies at once on a graphics processor.
- **Weapons before fists**: a fist is a light mass on a short lever, and the club's blows came
  more readily than the punch.
- **More decisions a second**: many bodies simulated at once on a graphics processor. Rapier in
  Node does not do it, and another engine voids every record on every body.

## What reaches what is installed

Each part is built beside what is installed: a new variation, research code, an optional ask, or
a refactor the fingerprint shows. Two choices reach installed skills:

- **A change to how the stance answers an ask it already takes, or to what shared strike code
  does.** Either moves every skill on it.
- **An installed variation replaced by one made here**, once its reading on the game's cases
  shows it does as well.

## How the parts depend

- Part 1 and the played rows found by the question they answer
  ([what a saved result is keyed by](2026-11-14-saved-results.md)) come first: every try after
  them plays only its own variation.
- Part 2's reading is a variation with a layout of its own, so it waits on Part 1.
- Part 3's search moves a variation's own layout and network, so it waits on Part 1, and it is
  made on the layer Part 2 leaves.

## To pick it up

- **Variations**: `src/skills/framework/variations.ts`; a skill's part, as
  `src/skills/strikes/straight-punch/index.ts`; its records `straight-punch/data/`; the boundary
  `scripts/source-boundary.mjs`; a variation read against another,
  `research/skills/strikes/straight-punch/punch-sparring.mjs`.
- **The layer**: `src/control/` (`stance/`, `solve.ts`, `bearing.ts`, `balance-part.ts`,
  `motor-part.ts`); the assist `src/core/bodies/assist.ts`, its ceiling
  `src/combat/rulebook.ts`; what a strike asks of the legs, `LegsGoal` in
  `src/skills/framework/skill.ts` and `shared/steer.ts`; the window `shared/strike-window.ts`;
  the drill's footwork `src/minds/command/drill.ts`.
- **A strike by search**: `punch-sparring.mjs --search` and `--bar` over `research/cma.mjs`; the
  schedule `src/skills/strikes/shared/timed-push.ts`; the steer a correction adds through,
  `src/skills/strikes/shared/steer.ts`; sparring's starts `src/evaluation/strike/cases.ts`.

## Completion

A part that lands puts what worked into the recipe for its kind of work and what it changed into
the architecture. These notes are deleted once every part has landed or been dropped.
