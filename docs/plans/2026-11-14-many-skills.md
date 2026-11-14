# Many skills, faster

Notes on making a skill cheap enough that dozens of them are practical, and a new idea quick to
try. They hold three parts, each of which stands alone and is taken up on the owner's request by
a brief of its own; two short readings say which pays. A part describes a design under
consideration; nothing in it is built.

## Goal

- **A new variation of a skill reaches its sparring reading in days**, where one good strike on
  one body takes weeks. The measure is the time from a variation's start to that reading.
- **The cheapest method that works makes a skill**: a search and a fit before a training run.
- **A skill learns no balance.** The layer under it holds the body up, so a change to the legs
  leaves the skill as it is.
- **A change plays again only what depends on it**
  ([what a saved result is keyed by](2026-11-14-saved-results.md)).
- **A variation declares what it uses**: its record, its layout, what it needs of the body.
  Sharing with another is its author's choice.

## Why a skill is slow

- **A strike solves three problems together**: staying up, making the motion and landing it. The
  straight punch never drives a leg muscle and is still tied to the stance: its network reads 20
  leg-joint angles and speeds among its 59 inputs, and four of its 12 outputs ask the stance for
  a heading turn, the centre of mass ahead and across, and whether the walk goes on
  (`assets/skills/strikes/straight-punch/drive.layout.json`, `stanceAsks` and `keepsWalk` in
  `src/skills/strikes/shared/steer.ts`). The bonk steps each foot to a searched place before its
  windup, and those steps are most of its time (`Swing.footing`, `shared/swing.ts`).
- **Each skill is searched and trained on each body**: a CMA-ES search, then 20 to 50 M decisions
  of PPO ([the approaches](../approaches.md#every-skill)).
- **A change under a trained actor makes it a seed to retrain**: the body, the stance, the
  observation layout ([the training recipe](../recipes/training.md#before-the-first-run)). An
  actor that reads the legs is under every change to the legs.
- **The fight is read last**, and it holds the facts that shape a skill: the states a blow is
  committed from, how often the mind begins it, where fighters stand. The punch's fight
  commitments each hold an input outside every range its drill plays
  ([the punch's notes](2026-11-10-warrior-punch.md#what-a-fight-asks-that-the-drill-does-not)).

## Two readings that say which part pays

- **How much of the punch's learning is in its stance outputs.** The installed network on the
  Strike drill (`npm run evaluate -- strike option/straight-punch`) with its four stance outputs
  held at zero. A punch that lands about as well says its tie to the legs is not what makes it
  dear, and Part 2 is at most a margin in the stance.
- **Whether a small correction holds what an open-loop schedule loses.** A linear correction
  fitted to the punch's schedule (Part 1), read on held-out places beside the trained actor
  (`research/skills/strikes/straight-punch/punch-policy-check.mjs`). Near the actor, Part 1
  replaces the training run.

## Part 1: a strike made by search

**Where it stands.** The game holds two ways of making a strike.

- **The punch**: a push schedule searched by CMA-ES, then an actor trained by PPO that adds to its
  pushes and asks the stance at each decision. The schedule alone lands within about 2 cm of the
  distance it was searched at ([the approaches](../approaches.md#unarmed-strikes)).
- **The bonk**: one searched swing with no network in its record
  (`assets/skills/strikes/bonk/swing.json`).

A blow that tracks a declared path is too slow, 4 to 6 m/s against 6.8; and a schedule played
open-loop works only from the start it was searched from
([the approaches](../approaches.md#weapon-strikes)). So a strike needs a searched schedule and a
correction inside the stroke.

**The design: a schedule, an aim and a small correction.**

- **A schedule**, searched as now (`punch-drill.mjs`, `swing-drill.mjs`).
- **An aim**: a map from the target's place (distance, height, side) to the schedule's settings,
  fitted from searches at several places. The strike's Option is unchanged.
- **A correction**: a linear function of a few inputs (the target from the fist, the shoulder's
  velocity, the arm's angles), added to the pushes inside the stroke and fitted by regression
  from plays of the schedule from perturbed starts. It reads no leg joint.

**A variation holds its own record.** The correction is a record and a layout of the variation's
own. A skill's part declares them once for all its variations (`PUNCH_PART`,
`src/skills/strikes/straight-punch/index.ts`): the record, the layout, the settings' shape, the
bodies that fit it and what it needs of the body. `from-guard` runs the drive's executor on the
drive's record and network, so any change to the drive moves it. Each variation declares these
itself, and naming another's record is how it shares it. The research tools that write a record
take the variation they write (`punch-sparring.mjs` already takes `--variation`).

Provenance: schedules played open-loop with a linear feedback fitted to each by regression (Liu,
van de Panne & Yin, "Guided Learning of Control Graphs for Physics-Based Characters", ACM
Transactions on Graphics 2016); a few global parameters of one movement adjusted to a new target
(Kober, Wilhelm, Oztop & Peters, "Reinforcement learning to adjust parametrized motor primitives
to new situations", Autonomous Robots 2012; Mülling, Kober, Kroemer & Peters, "Learning to select
and generalize striking movements in robot table tennis", International Journal of Robotics
Research 2013).

**What it would bring.** A strike on a new body or loadout is a search and a fit, with no
training run. One strike covers a range of places. A change to the stance leaves its layout as it
is.

**Open.**

- Whether a linear correction holds what the open-loop schedule loses: 1.5 cm of foot took a bonk
  from 96 to 63 J. Where it falls short, an actor over the same few inputs is the next size.
- Whether a correction this small follows a moving target inside the stroke.
- How many searched places the aim's fit needs, and whether it reaches the 0.6 m fighters stand
  at.
- Whether a variation has a row of [the table](../reference/the-table.md) or is read as a subject
  against its skill's row.

## Part 2: a layer under the skills

**Where it stands.** The control layer holds the stance (`stance-balance.ts`), the whole-body
solve (`solve.ts`) and the assist (`assist.ts`), a root force and moment metered against the
character's Balance ([motor control](../architecture.md#motor-control)). The stance is the one
registered balance (`BALANCES`, `src/app/registration/balances.ts`); Balance the attribute is the
assist's ceiling, 0 for the Warrior and the Rogue (`src/core/bodies/human/attributes.ts`), and a
bout's recipe may set each side's (`DuelRecipe.balance`).

The layer carries out what each skill asks step by step (`LegsGoal`, `StanceGoal`) and reacts to
a blow's push only once the body moves, so each strike's network learns to place the centre of
mass before its blow. The assist is taken up with no skill asking: the solve asks it for what the
ground cannot give (`shortfall`, `solve.ts`), and the stance counts its reach before it steps
(`assistReach`, `stance/gait.ts`).

**The design: a contract the stance keeps.**

- **Down, from the skill**: the limbs it takes; what it wants of the pelvis (a turn, a drive
  forward); and the impulse it expects at contact, with its time, declared before the blow.
  Forces between the body's own parts do not move its centre of mass, so the impulse is what the
  stance has to hold. An impulse J moves the capture point by J / (m ω), with ω = √(g / h): 9 cm
  for an untrained punch's 22.8 N s
  ([the strike reference](../reference/human-strike-reference.md)) on an 80 kg body with its
  centre at 1 m, by arithmetic.
- **Up, to the skill**: whether the layer can brace this now and how soon if not, and the
  shoulder's frame and velocity. No leg joint.
- **Inside the layer**: whether to lean, widen, step, keep walking or ask the assist.

Two ways carry it out, both the stance as registered:

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

**What it would bring.** A strike's network stops reading the legs, so a change to the stance or
the legs leaves it valid. A new strike is braced without learning to be. A strike that leaves the
legs alone runs beside a walk: the mind runs together Options whose resources do not overlap
([Option Mind](../architecture.md#minds)).

**Where the separation stops.**

- A blow's worth is the mass behind the fist, so a strike still asks for a hip turn and a drive.
- The stomp, a kick and a way up take the legs themselves, as the ground skills do.
- A change to how the stance answers an ask it already takes moves every trained actor on it. A
  new optional ask that no installed variation sends moves none, which the fingerprint shows.

**Open.**

- Whether a strike is cheaper to make when it need not stay up. Read by the same search at the
  same budget, once at a raised ceiling and once at 0, compared on how soon each lands.
- What the punch's stance outputs are for. The impulse's shift is small beside the 0.15 m of
  centre the punch may ask (`drive.layout.json`), so they are suspected of serving its reach and
  its hip turn more than its bracing.
- How much of the more landed with an assist is the blow held up and how much the stance stepping
  later.
- Whether the foe's Balance moves a strike's outcomes as the striker's does.
- Whether a margin for the declared impulse is all the stance needs of a blow.

## Part 3: the pipeline

**Where it stands.** A skill is searched and trained on its drill's twin, its profile is measured
sparring, and it is read in fights last ([the steps](../recipes/skill.md#the-steps)).

- **Sparring forces the blow** from drawn starts at a foe that fights back, so a profile does not
  wait on the mind choosing the strike. Its starts are drawn from set ranges of gap, offset,
  approach, speed and time (`SPARRING`, `src/evaluation/strike/cases.ts`), not from states a fight
  reaches. A subject's 720 trials play in a few minutes:
  `npm run evaluate -- strike option/straight-punch --protocol sparring --workers 30`.
- **The `fights` rung** plays a bout from its start for each trial, until the mind begins its
  `moment`th action aimed at a body (`FIGHTS`).
- **Steps 2 to 4 of the skill recipe describe one way of making a skill**: a push schedule, a
  CMA-ES search, a learned actor correcting it.

**The design.**

- **A stand-in first.** A crude variation, made by hand or assisted, plays in fights before any
  training. Its fights say where and in what state the mind commits it and how often: what the
  skill is to be built for.
- **A library of fight states.** A set of bouts is played once and saved at intervals wherever
  the foe is within reach and a margin, whatever the mind is doing. A trial loads a state, forces
  the strike and plays two or three seconds: a drill's cost, starting where fights are. A profile
  is a table of outcomes by start, so it needs the starts fights visit covered, not their
  frequencies.
- **Physics saved, memory rebuilt.** A load restores the bodies and starts the minds and skills
  fresh, as when a body comes back from another mind. States are saved with both feet bearing and
  no action under way, since a stance loaded mid-step loses its plan.
- **The library is built again when what it holds changes**: the bodies, the engine, the rate or
  the bout's recipe. Its key is a saved result's
  ([what a saved result is keyed by](2026-11-14-saved-results.md#the-design)), and a strike's
  code, settings and network and the minds' pricing are outside it.
- **Readings with no physics.** Each state loaded and the strike's entry asked gives the share of
  fight moments the strike can begin from. The chooser asked there gives whether the mind would
  pick it under a new profile.
- **The recipe names the gates, and a variation its method.** A variation runs as an executor and
  has a sparring reading; how it was made is its own.

**Open.**

- How long the library takes to build. Where it is minutes, it is built again rather than kept.
- How much a physics-only load disturbs the first moments after it.
- Whether one sparring run gives the skill's reading as well as its profile. The claim is a
  still-target cell so that how a body throws a move is read apart from what the move brings in a
  fight ([the claim](../recipes/skill.md#the-claim)).

## Other candidates

Each is an idea, untested here.

- **A learned base**: one actor over the stance, trained once against random pushes on the upper
  body, following pelvis commands (Cheng et al., "Expressive Whole-Body Control for Humanoid
  Robots", RSS 2024; the legs and arms of one body learned apart, Liu & Hodgins, "Learning
  Basketball Dribbling Skills Using Trajectory Optimization and Deep Reinforcement Learning",
  SIGGRAPH 2018). It is a second registered balance, a slot of the mind that carries everything
  the legs are asked, so every schedule, actor, way up and envelope made on the stance is unproven
  on it.
- **A strike as a clip under a learned tracker**, as the run is
  ([the approaches](../approaches.md#travel)). A network rewarded for matching a clip leads it,
  where a tracking controller lags (Peng et al., "DeepMimic: Example-Guided Deep Reinforcement
  Learning of Physics-Based Character Skills", SIGGRAPH 2018). Its cost is still tens of millions
  of decisions a clip.
- **One tracker for every clip**, its commands masked to the parts a skill asks (He et al.,
  "HOVER: Versatile Neural Whole-Body Controller for Humanoid Robots", ICRA 2025). Boxing and
  fencing were learned on such a base (Won, Gopinath & Hodgins, "Control Strategies for Physically
  Simulated Characters Performing Two-player Competitive Sports", SIGGRAPH 2021). It is trained on
  many bodies at once on a graphics processor.
- **Weapons before fists**: a fist is a light mass on a short lever, and the club's blows came
  more readily than the punch.
- **More decisions a second**: many bodies simulated at once on a graphics processor. Rapier in
  Node does not do it, and another engine voids every record on every body.

## What reaches what is installed

Each part is built beside what is installed: a new variation, research code, an optional ask, or
a refactor the fingerprint shows
(`node scripts/fingerprint.mjs --compare <file> --variation <skill/variation>`). Two choices reach
installed skills:

- **A change to how the stance answers an ask it already takes, or to what shared strike code
  does.** Either moves every skill on it.
- **A character given Balance in the game.** It lands more and deals no more, as sparring reads
  the punch. While a profile is keyed by the spec, both minds lose that character's profiles;
  read as a condition of a trial, they keep them
  ([what a saved result is keyed by](2026-11-14-saved-results.md#the-design)).

A strike profile's key covers its action, its variation, the records it reads and the body's
spec (`skillDigest`), so a variation that names the record it names now keeps its profile.

## How the parts depend

- The two readings come first, and say which part is taken up.
- Part 1's search and aim stand on the search tools as they are. Its correction waits on a
  variation holding its own record.
- Part 2's contract comes before its ways are compared, and the assisted way tests the contract at
  the least cost.
- Part 3's stand-in needs nothing. Its library waits on the key of
  [what a saved result is keyed by](2026-11-14-saved-results.md).

## To pick it up

- **A strike by search**: the searches `research/skills/strikes/straight-punch/punch-drill.mjs`
  and `research/skills/strikes/swing/swing-drill.mjs` over `research/cma.mjs`; the schedule
  `src/skills/strikes/shared/timed-push.ts`; the steer a correction adds through,
  `src/skills/strikes/shared/steer.ts`; a strike read on held-out places,
  `research/skills/strikes/straight-punch/punch-policy-check.mjs`.
- **Variations**: `src/skills/framework/variations.ts`; a skill's part, as
  `src/skills/strikes/straight-punch/index.ts`; its records `straight-punch/data/`; the boundary
  `scripts/source-boundary.mjs`; a variation read against another,
  `research/skills/strikes/straight-punch/punch-sparring.mjs`.
- **The layer**: `src/control/` (`stance/`, `solve.ts`, `bearing.ts`, `balance-part.ts`,
  `motor-part.ts`); the assist `src/core/bodies/assist.ts`, its ceiling
  `src/combat/rulebook.ts`, and its meter read over a bout, `research/bout.mjs`; what a strike
  asks of the legs, `LegsGoal` in `src/skills/framework/skill.ts` and `shared/steer.ts`.
- **The pipeline**: the Strike drill's rungs `src/evaluation/strike/cases.ts`; saving and loading
  `src/game/arena/duel.ts` and `src/core/world/recording.ts`; the profiles
  `research/skills/strikes/strike-profiles.mjs`.

## Completion

A part that lands puts what worked into the recipe for its kind of work and what it changed into
the architecture. These notes are deleted once every part has landed or been dropped.
