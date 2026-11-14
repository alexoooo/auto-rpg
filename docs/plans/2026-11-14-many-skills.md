# Many skills, faster

Notes on making a skill cheap enough that dozens of them are practical. They hold four parts,
each of which stands alone and is taken up on the owner's request by a brief of its own. A part
describes a design under consideration; nothing in it is built.

## Goal

- **A new variation of a skill takes days.** A fight needs dozens of skills, and one good strike
  on one body takes weeks.
- **Footwork and balance are a concern of their own.** A skill uses them and does not learn them
  again.
- **A variation shares as much or as little as it chooses.** Sharing code is a matter of style.
  The structure never decides it: a variation's code, record, network and what it needs of the
  body are its own to declare.
- **Approaches are developed side by side** and read against each other on the same cases.
- **The cheapest method that works makes a skill**: a search and a fit before a training run.
- **A change rebuilds only what depends on it.**

## Why a skill is slow

- **A strike solves three problems together**: staying up, making the motion and landing it.
  - The straight punch never drives a leg muscle, and it is still tied to the stance. Its network
    reads 20 leg-joint angles and speeds among its 59 inputs, and four of its 12 outputs ask the
    stance: a heading turn, the centre of mass ahead and across, and whether the walk goes on
    (`assets/skills/strikes/straight-punch/drive.layout.json`, `stanceAsks` and `keepsWalk` in
    `src/skills/strikes/shared/steer.ts`).
  - It sets the legs goal from its stand to its return, and begins only once the stance has
    stood quiet (`straightDriveExecutor`, `quietToStrike` in `shared/strike-window.ts`).
  - The bonk steps each foot to a searched place before its windup (`Swing.footing`,
    `shared/swing.ts`); those steps are most of its time
    ([the approaches](../approaches.md#weapon-strikes)).
- **Each skill is searched and trained on each body**: a CMA-ES search, then 20 to 50 M decisions
  of PPO ([the approaches](../approaches.md#every-skill)).
- **A change under a trained actor makes it a seed to retrain**: the body, the stance, the
  observation layout ([the training recipe](../recipes/training.md#before-the-first-run)). An
  actor that reads the legs is under every change to the legs.
- **The fight is read last**, and it holds the facts that shape a skill: the states a blow is
  committed from, how often the mind begins it, where fighters stand. The punch's fight
  commitments each hold an input outside every range its drill plays
  ([the punch's notes](2026-11-10-warrior-punch.md#what-a-fight-asks-that-the-drill-does-not)),
  and the mind begins few punches in `fights`
  ([the same notes](2026-11-10-warrior-punch.md#why-the-punch-does-not-land-in-fights)).

## Part 1: variations that stand alone

**Where it stands.** A variation's maker returns any executor (`ExecutorVariations`,
`src/skills/framework/variations.ts`), and a variation imports only its own folder and the area's
shared code (`scripts/source-boundary.mjs`). A character holds several variations of one skill,
each an Option of its own, and an evaluation's subject names them
(`option/straight-punch+straight-punch/from-guard`).

What ties variations together is on the skill's part, declared once for all of them
(`PUNCH_PART`, `src/skills/strikes/straight-punch/index.ts`):

| Declared per skill | Where | What it ties |
| --- | --- | --- |
| The record | `reads`, `dataOf("straight-punch/drive")` | one file of settings and one network |
| The layout | `PUNCH_LAYOUT` | one set of network inputs and outputs |
| The settings' shape | `tuning`, `STRAIGHT_DRIVE_KEYS` | one shape a search can vary |
| The fit | `recordFault` over `PUNCH_BODIES` | a body holds a variation only with the drive's record |
| What it needs of the body | `requires`, `effectors`, `strikesWith` | one support reference, one set of limbs |

`from-guard` shows it. Its own code is one readiness rule (`from-guard/from-guard.ts`); it runs
the drive's executor on the drive's record and network. Adding it moves no case of `drive`, and
any change to the drive's record, network or executor moves `from-guard`.

Whether a variation calls shared code or keeps its own is its author's choice
([the skill recipe](../recipes/skill.md#an-options-code)). The five rows above are shared
whatever a variation chooses.

**The design.** Each of the five rows is declared by the variation. A variation may name
another's record or layout, and then it shares it by choice. The research tools that write a
record take the variation they write (`punch-export.mjs` writes the drive's;
`punch-sparring.mjs` takes `--variation`).

**Open.**

- Whether a variation has a row of [the table](../reference/the-table.md) or is read as a subject
  against its skill's row.

## Part 2: a strike made by search

**Where it stands.** The game holds two ways of making a strike.

- **The punch**: a push schedule searched by CMA-ES, then an actor trained by PPO that adds to its
  pushes and asks the stance at each decision. The schedule alone lands within about 2 cm of the
  distance it was searched at. The actor reads 59 inputs and took 20 to 50 M decisions
  ([the approaches](../approaches.md#unarmed-strikes)).
- **The bonk**: one searched swing with no network in its record
  (`assets/skills/strikes/bonk/swing.json`). Its footing steps the body to the place the swing was
  searched for (`Swing.footing`, `reach`), and those steps are most of its time
  ([the approaches](../approaches.md#weapon-strikes)).

The approaches record what the alternatives cannot do:

- **A blow that tracks a declared path is too slow**: 4 to 6 m/s against 6.8, and a tenth of a
  swing's energy. The whole-body solve already is a solve of tasks in the body's accelerations,
  so that route is spent.
- **A schedule played open-loop works only from the start it was searched from**, and a moving
  target needs a steer inside the stroke.

So a strike needs a searched schedule and a correction inside the stroke. How large the
correction has to be is open: the punch's is a network over 59 inputs, and nothing smaller has
been read.

**The design: a schedule, an aim and a small correction.**

- **A schedule**, searched as now (`punch-drill.mjs`, `swing-drill.mjs`).
- **An aim**: a map from the target's place (distance, height, side) to the schedule's settings,
  fitted from searches at several places. The strike's Option is unchanged and its profile gains
  those dimensions.
- **A correction**: a linear function of a few inputs (the target from the fist, the shoulder's
  velocity, the arm's angles), added to the pushes inside the stroke and fitted by regression
  from plays of the schedule from perturbed starts.

It reads no leg joint. Its cost is searches and a fit, so what a change to the body voids is made
again with no training run.

Provenance: schedules played open-loop with a linear feedback fitted to each by regression (Liu,
van de Panne & Yin, "Guided Learning of Control Graphs for Physics-Based Characters", ACM
Transactions on Graphics 2016); a few global parameters of one movement adjusted to a new target
(Kober, Wilhelm, Oztop & Peters, "Reinforcement learning to adjust parametrized motor primitives
to new situations", Autonomous Robots 2012; Mülling, Kober, Kroemer & Peters, "Learning to select
and generalize striking movements in robot table tennis", International Journal of Robotics
Research 2013); muscle-driven bipeds whose control parameters are optimised under a neural delay
(Geijtenbeek, van de Panne & van der Stappen, "Flexible Muscle-Based Locomotion for Bipedal
Creatures", SIGGRAPH Asia 2013).

**What it would bring.** A strike on a new body or loadout is a search and a fit. One strike
covers a range of places, where the learned punch's window is suspected of lying off where
fighters stand ([the approaches](../approaches.md#unarmed-strikes)). The correction's inputs are
few and none is a leg's, so a change to the stance leaves its layout as it is.

**Open.**

- Whether a linear correction over a few inputs holds what the open-loop schedule loses: 1.5 cm
  of foot took a bonk from 96 to 63 J. Untested. Where it falls short, an actor over the same few
  inputs is the next size.
- Whether a correction this small follows a moving target inside the stroke.
- How many searched places the aim's fit needs, and whether it reaches the 0.6 m fighters stand
  at.

## Part 3: a layer under the skills

**Where it stands.** The control layer holds the pieces ([motor
control](../architecture.md#motor-control)): the stance (`stance-balance.ts`), the whole-body
solve (`solve.ts`) and the assist (`assist.ts`), a root force and moment metered against the
character's Balance. The Warrior's and the Rogue's Balance is 0
(`src/core/bodies/human/attributes.ts`), and a bout's recipe sets each side's
(`DuelRecipe.balance`).

The layer carries out what each skill asks step by step (`LegsGoal`, `StanceGoal`) and reacts to
a blow's push only once the body moves. So a strike's network learns to place the centre of mass
before the blow, and each strike learns it again.

The assist is taken up with no skill asking for it. The whole-body solve asks it for what the
ground cannot give of the root's aim (`shortfall`, `solve.ts`), and the stance counts its reach
before it steps (`assistReach`, `stance/gait.ts`). The installed punch was searched and trained
at a ceiling of 0, and it lands more with an assist on all the same (sparring at levels of Balance,
below).

Three things carry the name. The stance is the one registered balance (`BALANCES`), and every
standing and walking body runs it. Balance the attribute is the assist's ceiling, and it is what
stands unused. The ways below are ways for the layer to hold a blow.

Balance and motor each have one registered kind (`BALANCES`, `MOTORS`,
`src/app/registration/`). They are slots of a mind's config, so a skill's variation chooses
neither.

**The design: a contract with more than one implementation.**

- **Down, from the skill**: the limbs it takes; what it wants of the pelvis (a turn, a drive
  forward); and the impulse it expects at contact, with its time, declared before the blow.
  - Forces between the body's own parts do not move its centre of mass; the ground and the
    contact do. So the impulse is what the stance has to hold, whatever the pushes that made it.
  - An impulse J moves the capture point by J / (m ω), with ω = √(g / h) for a centre of mass at
    height h. That is 9 cm for an untrained punch's 22.8 N s
    ([the strike reference](../reference/human-strike-reference.md)) on an 80 kg body with its
    centre at 1 m: arithmetic, not a reading.
- **Up, to the skill**: whether the layer can brace this now and how soon if not, and the
  shoulder's frame and velocity. No leg joint.
- **Inside the layer**: whether to lean, widen, step, keep walking or ask the assist.

Three ways to carry it out behind the same contract, in the order of their cost. The first two
are the stance as it is registered; only the third is a second registered balance.

| Way | What it is | Its cost |
| --- | --- | --- |
| Assisted | the stance with the assist's ceiling raised | the least work; a skill tuned with an assist is read again without it before it is called unassisted |
| Feed-forward | the stance keeps the capture point inside the soles by the declared impulse's shift, along its line, before the blow | a margin and a lean in the stance; untested |
| Learned base | one actor over the stance, trained once against random pushes on the upper body, following pelvis commands | the dearest: a training run of the learned run's size, on an engine whose scarce thing is decisions |

A registered balance is a slot of the mind, so a second one carries everything the legs are asked
(`LegsGoal`): the walk, the turn, the footing, the stomp's support. On it every schedule, actor,
way up and envelope made on the stance is unproven. It comes after the first two are read and
found short.

Provenance: forces at the root added to a controller's actions (Yuan & Kitani, "Residual Force
Control for Agile Human Behavior Imitation and Extended Motion Synthesis", NeurIPS 2020);
assisting forces relaxed step by step until the body moves without them (Yu, Turk & Liu,
"Learning Symmetric and Low-Energy Locomotion", SIGGRAPH 2018); bounds on the jump an intended
impact makes, kept so that the contacts and the balance hold (Wang, Tanguy, Gergondet & Kheddar,
"Impact-aware humanoid robot motion generation with a quadratic optimization controller",
Humanoids 2019); the legs and the arms of one body learned apart (Liu & Hodgins, "Learning
Basketball Dribbling Skills Using Trajectory Optimization and Deep Reinforcement Learning",
SIGGRAPH 2018); legs that follow a commanded velocity under whatever the upper body does (Cheng
et al., "Expressive Whole-Body Control for Humanoid Robots", RSS 2024).

**What it would bring.** A strike's network stops reading the legs, so a change to the stance or
the legs leaves it valid. A new strike is braced without learning to be. A strike that leaves the
legs alone runs beside a walk: the mind runs together Options whose resources do not overlap
([Option Mind](../architecture.md#minds)).

**Where the separation stops.**

- A blow's worth is the mass behind the fist, so a strike still asks for a hip turn and a drive.
  That is why the pelvis stays in the contract.
- The stomp, a kick and a way up take the legs themselves, as the ground skills do.
- A change to how the stance answers an existing ask moves every trained actor on it. A new
  optional ask that no installed variation sends moves none, which the fingerprint shows.

**Balance is a number, and a profile is keyed by it.** A profile's key holds a digest of the
whole spec (`specDigest`, `measuredOn`, `src/skills/framework/profile.ts`), and the spec holds
Balance, haste and the physique's scales as numbers. So a profile measured at one Balance is
stale at any other, on the body it was measured on and on the body it was measured against.

Balance acts in two places, and each grows smoothly with the number:

- The solve fills what the ground cannot give, up to the ceiling.
- The stance lets the capture point travel further before it steps: 1.3 cm for each per cent
  with the centre of mass at 1 m (`assistReach`, `Rulebook.balance`). The 9 cm of a punch's
  impulse is about 7 per cent, by the same arithmetic.

Three ways to hold a number in a key:

| Way | What it is | Its cost |
| --- | --- | --- |
| Tiers | the game offers a few levels, each measured; keys stay exact | a sparring run a level |
| A measured level | Balance leaves the spec's digest and is the level a profile was measured at; a profile is read between its levels and is stale only outside their range | the same runs, and a reader between levels |
| A one-way bound | a profile measured at less is trusted at more | none, if an assist never makes a skill worse; sparring shows it of the landed total and of no single start |

The stance's envelope is a table of the second form for what a body is asked: a speed and a
heading, read between its measured points (`heldPace`, `src/control/stance/stance-envelope.ts`),
which the mind's walk plans by. It is measured at one Balance, the character's, so reading
between an attribute's levels is untried.

A skill made with an assist is read again without it.

**What sparring at levels of Balance reads.** The Warrior's installed punch on the 240 held-out
sparring starts it is admitted to, the striker's Balance set in the bout's recipe
(`DuelRecipe.balance`) at 0, at 0.01 and at 5, 10 and 25 per cent. At 0.01 the assist gives under
0.1 N, so that level changes the spec's digest and next to nothing of the body.

| Balance | Landed of 240 | Fell | Life taken a trial | The table's value a trial |
| --- | --- | --- | --- | --- |
| 0 | 105 | 3 | 0.029 | 0.162 |
| 0.01 | 119 | 3 | 0.105 | 0.074 |
| 5 | 137 | 0 | 0.113 | 0.098 |
| 10 | 144 | 1 | 0.105 | 0.100 |
| 25 | 148 | 1 | 0.104 | 0.072 |

- **A changed spec moves the fight more than the assist does.** From 0 to 0.01 the Warrior takes
  3.6 times the life and the value falls by more than half, and every level above takes that
  life. A profile is keyed by the spec, so on a spec with another Balance the Warrior's mind
  prices its punch by a prior and the foe's mind models the punch another way
  ([what a saved result is keyed by](2026-11-14-saved-results.md#where-it-stands)). That cause is
  read in the code, and no run plays it apart from the assist.
- **Against 0.01, the landed total rises one way with shrinking steps**: 18, 25 and 29 more.
  The first step is clear of chance on these starts; the steps from 5 to 10 and from 10 to 25
  are not.
- **The table's value and the life dealt do not move detectably** with the level.
- **No bound holds a start.** At each level 22 to 26 starts lose a landing that 0.01 had while
  44 to 51 gain one. No trial at any level plays to the bit as at 0.
- **The assist gives in every punch begun.** Over the blow its median is 20 N at 5 per cent, 27 N
  at 10 and 40 N at 25, against a weight of 775 N: half its ceiling at 5 and a fifth at 25.

So a profile keyed by the spec costs a character both minds' reading of its strikes at the first
hundredth of a per cent of Balance. Of the three ways, the one-way bound holds for the landed
total and for no single start; the steps between measured levels are small enough that the
nearest level may serve in place of a reading between two.

**Open.**

- Whether the foe's Balance moves a strike's outcomes as the striker's does, and whether another
  skill or body reads as the punch on the Warrior does.
- How much of the fall from 0 to 0.01 is the two minds' pricing and how much is any small change
  to a trial. Read by the same starts with each profile read as at 0.
- Whether haste and the physique's scales take the same form. A controller tuned at one strength
  or speed does not use more ([the approaches](../approaches.md#every-skill)).
- Whether skills are built with an assist first, the unassisted skill a later tier. The roadmap's
  order is competencies first, without assistance
  ([where the project is going](../roadmap.md#where-the-project-is-going)).
- How much of the punch's learning is in its stance outputs. Unmeasured; read by zeroing those
  four outputs of the installed network on the Strike drill.
- What those outputs are for. The impulse's shift is small beside the 0.15 m of centre the punch
  may ask (`drive.layout.json`), so they are suspected of serving its reach and its hip turn more than
  its bracing.
- How much balance a punch costs. The assist's meter over the blow (`Assist.meter`, as
  `research/bout.mjs` reads a bout's) gives a median 20 to 40 N, 3 to 5 per cent of the body's
  weight, in every punch begun: the ground misses something of each. How much of the 18 to 29
  more landed is the blow held up and how much is the stance stepping later is not read.
- Whether a strike is cheaper to make when it need not stay up. Read by the same search at the
  same budget, once at a raised ceiling and once at 0, compared on how soon each lands. The
  search tools play at their cell's balance; a ceiling is a recipe's (`DuelRecipe.balance`).
- Whether a margin for the declared impulse is all the stance needs of a blow, and the learned
  base's commands.

## Part 4: the pipeline

**Where it stands.** A skill is searched and trained on its drill's twin, its profile is measured
sparring, and it is read in fights last ([the steps](../recipes/skill.md#the-steps)).

- **Sparring forces the blow** from drawn starts at a foe that fights back, so a profile does not
  wait on the mind choosing the strike. Its starts are drawn from set ranges of gap, offset,
  approach, speed and time (`SPARRING`, `src/evaluation/strike/cases.ts`), not from states a fight
  reaches. A subject's 720 trials play in a few minutes:
  `npm run evaluate -- strike option/straight-punch --protocol sparring --workers 30`.
- **The `fights` rung** plays a bout from its start for each trial, until the mind begins its
  `moment`th action aimed at a body (`FIGHTS`). A moment is one the mind chose to act at.
- **A save loads on its own commit alone.** `Duel.load` requires the save's build
  (`requireRecordingIdentity`, `src/core/world/recording.ts`), which is the commit checked out,
  and a mark made anew each run where a build input is uncommitted (`currentBuildIdentity`,
  `scripts/build-identity.mjs`). A tape replayed step for step needs that; a state to start a
  trial from does not.
- **Steps 2 to 4 of the skill recipe describe one way of making a skill**: a push schedule, a
  CMA-ES search, a learned actor correcting it.

**The design.**

- **A stand-in first.** A crude variation, made by hand or assisted, plays in fights before any
  training. Its fights say where and in what state the mind commits it and how often: what the
  skill is to be built for.
- **A library of fight states.** A set of bouts is played once and saved at intervals wherever
  the foe is within reach and a margin, whatever the mind is doing. A trial loads a state, forces
  the strike and plays two or three seconds. It costs a drill's trial and starts where fights
  are. A profile is a table of outcomes by start, so it needs the starts fights visit covered,
  not their frequencies.
- **Readings with no physics.** Each state loaded and the strike's entry asked gives the share of
  fight moments the strike can begin from. The chooser asked there gives whether the mind would
  pick it under a new profile.
- **A library valid while what it read is the same.** A state is unusable after a change to the
  body, the engine, the rate or command delay, or the bout's recipe: the changes that void a
  trained actor as well. It survives a change to a strike's code, settings or network, the mind's
  pricing and an evaluation's code. A state is told valid by a short tape of its own, played on
  load ([what a saved result is keyed by](2026-11-14-saved-results.md#the-design)).
- **Physics saved, memory rebuilt.** A load restores the bodies and starts the minds and skills
  fresh, as when a body comes back from another mind. A change to a field of saved memory then
  costs nothing. States are saved with both feet bearing and no action under way, since a stance
  loaded mid-step loses its plan.
- **The recipe names the gates, and a variation its method.** A variation runs as an executor and
  has a sparring reading; how it was made is its own.

**The same keying elsewhere.** Played rows, profiles, saved readings and records are each keyed
wider or narrower than what they read, and a key drawn from source text does not mend it
([what a saved result is keyed by](2026-11-14-saved-results.md)).

**Open.**

- How much a physics-only load disturbs the first moments after it. Unmeasured.
- Whether one sparring run gives the skill's reading as well as its profile. The claim is a
  still-target cell so that how a body throws a move is read apart from what the move brings in a
  fight ([the claim](../recipes/skill.md#the-claim)).

## Other candidates

Each is an idea, untested here.

- **A strike as a clip under a learned tracker**, as the run is
  ([the approaches](../approaches.md#travel)). A network rewarded for matching a clip leads it,
  where a tracking controller lags (Peng et al., "DeepMimic: Example-Guided Deep Reinforcement
  Learning of Physics-Based Character Skills", SIGGRAPH 2018). Its cost is still tens of millions
  of decisions a clip.
- **One tracker for every clip**, its commands masked to the parts a skill asks (He et al.,
  "HOVER: Versatile Neural Whole-Body Controller for Humanoid Robots", ICRA 2025). Boxing and
  fencing were learned on such a base, the skills by imitation and then the bout (Won, Gopinath &
  Hodgins, "Control Strategies for Physically Simulated Characters Performing Two-player
  Competitive Sports", SIGGRAPH 2021). It is trained on many bodies at once on a graphics
  processor, as the last candidate here is.
- **Weapons before fists**: a fist is a light mass on a short lever, and the club's blows came
  more readily than the punch.
- **More decisions a second**: many bodies simulated at once on a graphics processor. Rapier in
  Node does not do it, and another engine voids every record on every body.

## What reaches what is installed

Each part is built beside what is installed: a refactor the fingerprint shows
(`node scripts/fingerprint.mjs --compare <file> --variation <skill/variation>`), a new variation,
research code or an optional ask. Three choices reach installed skills:

- **A character given Balance in the game.** While a profile is keyed by the spec, that body's
  profiles are read by neither mind: sparring, the Warrior takes 3.6 times the life at any
  Balance above 0. Every installed skill on it is read again, and a trained actor that reads
  worse is a seed to retrain.
- **A second registered balance in the game**, as Part 3 says.
- **A change to how the stance answers an ask it already takes, or to what shared strike code
  does.** Either moves every skill on it.

A strike profile's key covers its action, its variation, the records it reads and the body's
spec, and no code (`skillDigest`). So Part 1 leaves every key as it is while each variation names
the record it names now. What another key costs what is saved is in
[its own notes](2026-11-14-saved-results.md#what-it-would-cost-what-is-saved).

## How the parts depend

- Part 1 stands alone. A variation with a network of its own waits on it.
- Part 2's search and aim stand on the search tools as they are. Its correction is a record and a
  layout of a variation's own, and waits on Part 1.
- Part 3's readings come before its contract: the zeroed outputs and the paired search, beside
  the assist's meter as read, say whether balance is what a strike's making is spent on. The
  contract comes
  before its ways are compared with each other, and the assisted way tests its form at the least
  cost. Balance as a level of a profile's key is part of
  [what a saved result is keyed by](2026-11-14-saved-results.md), and comes before a character
  is given Balance in the game.
- Part 4's library stands alone and waits on a save told valid by a tape of its own
  ([what a saved result is keyed by](2026-11-14-saved-results.md)).

## To pick it up

- **Variations**: `src/skills/framework/variations.ts`; a skill's part, as
  `src/skills/strikes/straight-punch/index.ts`; its records `straight-punch/data/`; the boundary
  `scripts/source-boundary.mjs`; a variation read against another,
  `research/skills/strikes/straight-punch/punch-sparring.mjs`.
- **A strike by search**: the searches `research/skills/strikes/straight-punch/punch-drill.mjs`
  and `research/skills/strikes/swing/swing-drill.mjs` over `research/cma.mjs`; the schedule
  `src/skills/strikes/shared/timed-push.ts`; the steer a correction adds through,
  `src/skills/strikes/shared/steer.ts`; a strike read on held-out places,
  `research/skills/strikes/straight-punch/punch-policy-check.mjs`.
- **The layer**: `src/control/` (`stance/`, `solve.ts`, `bearing.ts`, `balance-part.ts`,
  `motor-part.ts`); the assist `src/core/bodies/assist.ts`, its ceiling
  `src/combat/rulebook.ts` and its meter read over a bout, `research/bout.mjs`; what a strike asks of the legs, `LegsGoal` in
  `src/skills/framework/skill.ts` and `shared/steer.ts`; the registrations
  `src/app/registration/balances.ts` and `motors.ts`.
- **The pipeline**: the Strike drill's rungs `src/evaluation/strike/cases.ts`; saving and loading
  `src/game/arena/duel.ts` and `src/core/world/recording.ts`; the build's identity
  `scripts/build-identity.mjs`; the profiles `research/skills/strikes/strike-profiles.mjs`.

## Completion

A part that lands puts what worked into the recipe for its kind of work and what it changed into
the architecture. These notes are deleted once every part has landed or been dropped.
