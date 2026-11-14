# Many skills, faster

Notes on making a new skill, or a new idea for one, quick to try: hours or days from its start
to its sparring reading. They hold what a try costs, the readings that say whether the design
holds, the judge that reads a try, and the design's two parts. Each is taken up on the owner's
request by a brief of its own.
A part describes a design under consideration; nothing in it is built.

## Goal

- **A new idea reaches its sparring reading in hours, a new skill in days.** The measure is the
  time from its start to that reading.
- **A try's reading tells it from what it is read beside**: better, worse or the same, at a
  margin its judge names.
- **A new idea is a variation of its own**: trying it moves nothing installed, and nothing else is
  played again for it.
- **A strike moves the arm and the trunk.** Standing and footwork are the layer under it, so a
  change to the legs, the stance or the footwork leaves every strike as it is.
- **A strike is made by search**, with no training run where a search and a correction do, by
  one tool for every strike and body it is named.
- **Nothing is computed again routinely**: what is under work plays, and every other played row is
  found ([played rows kept and found](2026-11-14-saved-results.md)).

## Where the time goes

Two costs are days each; the rest is paid on every try.

**Days: the training run.** PPO on the sparring punch steps about 240 decisions a second on 32
workers (train.log's decisions over its minutes,
[the training recipe](../recipes/training.md#before-the-first-run)), so the 20 to 50 M decisions
a skill is trained for ([the approaches](../approaches.md#every-skill)) take one to two and a
half days a run. A run is one try.

**Days: a measure that does not say what a fight does.** The Warrior's empty-handed punch is on
the mark in 78 of 96 trials at a still target
([the punch's notes](2026-11-10-warrior-punch.md#where-it-stands)) and lands 13 of the 42
`fights` trials it reaches
([why](2026-11-10-warrior-punch.md#why-the-punch-does-not-land-in-fights)). Each fight commitment
holds an input outside every range the drill plays
([the comparison](2026-11-10-warrior-punch.md#what-a-fight-asks-that-the-drill-does-not)).
Tracing it is 59 controlled replays and 73 physical probes, in those notes. Sparring is the
drill's rung at a foe that fights back, from starts drawn at random (`sparring`,
`src/evaluation/strike/cases.ts`).

**Every try.**

- **A try's reading does not tell it from the drive.** On the 240 held-out starts a candidate
  that reads 1.08 times the drive's damage a second has a 95 % interval of 0.79 to 1.47, so a try
  a fifth better and one a fifth worse read the same ([the judge](#the-judge-of-a-try)).
- **A variation's record is its skill's.** Each variation is a maker of its own
  (`ExecutorVariations`, `src/skills/framework/variations.ts`), so one can run its own executor
  and layout. The straight punch's two both call one function (`punch`,
  `src/skills/strikes/straight-punch/index.ts`), which runs one layout (`PUNCH_LAYOUT`) and each
  body's one record and network (`dataOf("straight-punch/drive")`); `from-guard` adds when its
  drive may begin. The part names that one record for every variation: what a mind loads and what
  a profile's digest covers (`reads`; `skillDigest`, `src/skills/framework/profile.ts`), and
  which bodies have the skill (`recordFault`). So a network of a variation's own goes into a
  record the part names for all of them, and each change to it moves the drive's profile.
- **Each try plays again what it is compared with.** `punch-sparring.mjs --bar` plays every
  held-out start by the candidate and by the drive. `npm run evaluate` keeps no row while a build
  input is uncommitted, and a commit finds none of the rows made before it
  ([played rows](2026-11-14-saved-results.md#where-it-stands)).
- **A strike is tied to the legs and the footwork.** Among its 59 inputs the straight punch's
  network reads 20 leg-joint angles and speeds and four readings of the stance (each foot's
  bearing, whether the stance shifts or swings). Four of its 12 outputs ask the stance for a
  heading turn, the centre of mass ahead and across, and whether the walk goes on (`stanceAsks`
  and `keepsWalk`, `src/skills/strikes/shared/steer.ts`). The bonk steps each foot to a searched
  place before its windup (`Swing.footing`, `src/skills/strikes/shared/swing.ts`). A change under
  a trained actor makes it a seed to retrain
  ([the training recipe](../recipes/training.md#before-the-first-run)).
- **The tool that searches and judges is one skill's on one body.**
  `research/skills/strikes/straight-punch/punch-sparring.mjs` holds the Warrior, the straight
  punch, its drive's record and the drive as what a candidate is read beside (`BODY`, `SKILL`,
  `record`, `bar`), and the settings it searches with their ranges (`SEARCHED`). Those settings
  are the straight drive's (`StraightDrive`), and its executor is the punch's and the sword
  thrust's (`straightDriveExecutor`, `src/skills/strikes/shared/straight-drive.ts`).

## The readings that come first

They say whether Part 2 holds, and they wait on no part.

**Where it stands.**

- **The trained correction does most of the punch sparring**: the drive's own settings played
  with no network land 20 of the 240 held-out starts, against 105 steered
  (`punch-sparring.mjs --bar` on a candidate of the drive's settings).
- **A search of the settings gains little that the judge can see**: the 15 settings searched with
  the network kept read 1.08 times the drive's damage a second, 95 % 0.79 to 1.47
  (`punch-sparring.mjs --search --keeps-network --out <file>`, then `--bar <file>`). A gain of
  that size is inside the judge's interval at 240 starts.
- **In fights the punch fails mostly in its delivery**: of the 48 `fights` trials, 14 are a fist
  that misses or lands elsewhere, 0.11 to 0.44 m from its moving aim in the misses; four are
  falls from the network's heading and centre asks, which end where those asks are suppressed;
  two are from its arm pushes
  ([the punch's notes](2026-11-10-warrior-punch.md#why-the-punch-does-not-land-in-fights)).
- **Holding the body up adds landings and no value**
  ([what the assist does to the punch](#part-2-a-strike-made-by-search-apart-from-the-legs)).

**What they read.** Each is a network file read on the held-out sparring starts beside the drive
(`punch-sparring.mjs --bar <file>`). The tool plays a file that names its `actions` and `layers`
as a network steering the punch in the installed layout (`candidateIn`, `steeredTrial`), and the
installed network is such a file (`man.network`,
`assets/skills/strikes/straight-punch/drive.json`: 59 inputs, two layers of 256 units, 12
outputs). So each is made from the installed network, in its layout.

**The files, read together.** The control and the fit decide. The others are the installed
network with weights edited: they say what a low fit lost, and two of them read the separation
from the legs whatever the fit reads (the stance asks, and the legs and the stance). An edit
needs no tool the control does not, so every file is read in one batch and none waits on
another's reading.

| Reading | The file | What it says |
| --- | --- | --- |
| The control | the installed network, unedited | about 1.00 where the tool steers as the game does; every other reading stands on it |
| The fit | one layer, shaped as Part 2 leaves the punch, in three forms | whether a correction of the size and the inputs Part 2 searches carries the punch |
| The stance asks | the last layer's heading and centre rows at zero | what the punch loses asking nothing of where it faces or where its centre is |
| The walk | the last layer's walk row at zero weights, its bias held above 0, then below | an output of 0 halts the walk, so the ask is read held on and held off |
| The legs and the stance | the first layer's 20 leg-joint columns and four stance columns at zero | each held at its training mean (the network's `normalization`): what the punch loses blind to them |
| Every input but the fit's | the first layer's 43 other columns at zero | the two hidden layers on the fit's 16 inputs: what is lost from here to the fit is lost by one layer, and the next size is an actor over the same inputs |

**The fit.** One layer is an affine map of the normalised inputs, squashed by tanh
(`recoveryNetwork`, `src/core/math/learning/recovery-network.ts`).

- **It reads 16 of the layout's inputs**: the target from the shoulder, the fist from the target,
  the fist's velocity and the centre's velocity, three each, and the four angles of the arm. Every
  other column is at zero.
- **It drives the eight pushes of the trunk and the arm.** Its heading and centre rows are at
  zero, so it asks the stance for nothing (`stanceAsks`). Its walk row is zero weights and a bias
  below 0, which halts a walk as the record's `halts` does for an unsteered punch (`keepsWalk`).
- **Its weights are fitted by least squares** to the installed network's outputs before the
  squash, as its `actionLimit` clamps them, on every decision of the twin's training half
  (`--on train`).
- **It is read in three forms**, since one map of those 16 inputs reads no time and the schedule
  it corrects is timed: the 16 inputs alone; with the drive's age a 17th (`drive age`); and a
  layer for each of two or three spans of the drive's age, each fitted on its span's decisions
  and chosen by that age as the punch plays. The last is the form of its provenance, a feedback
  fitted to each fragment of a schedule (Liu, van de Panne & Yin, below).
- **It is a mode of the tool.** `steeredTrial` holds each decision's inputs, and the tool runs
  its command line wherever it is imported. The mode plays the training half once, steered by the
  installed network, keeps each decision's inputs and solves in Node.

Where a form of the fit holds most of the steered landings, Part 2's layout and that form of
correction carry the punch, and its search starts from it. Where each lands near the unsteered
20, it is evidence against them, short of proof: a fit copies the network on the states the
network reaches, and a search scores the punch itself.

**Two readings that play no network file.**

- **Whether sparring's commitments cover the fights'.** The punch's notes hold the comparison for
  the drill as a table
  ([the comparison](2026-11-10-warrior-punch.md#what-a-fight-asks-that-the-drill-does-not)): the
  layout's inputs at each commitment (`steerFeatures` at drive age zero), their ranges on the
  drill beside the fights'. A tool that reads a protocol's commitments makes it for sparring.
  Where sparring's do not cover the fights', a try's measure is the `fights` rung.
- **What a try's comparison costs**: the time of a `--bar`. It sizes how many starts a try is
  read on. A sparring trial plays at most 11 s (`seconds`, `STILL`,
  `src/evaluation/strike/cases.ts`) at about 0.55 s of a core a simulated second
  ([the punch's notes](2026-11-10-warrior-punch.md#sparring-settings-searched-the-steer-trained)),
  so a side of 240 starts is at most 24 core-minutes, by arithmetic.

## The judge of a try

**Where it stands.**

- **The judge reads damage dealt a second** against the drive's on the 240 held-out starts the
  Warrior is admitted to, each start played by both, its interval a paired bootstrap over the
  starts (`bar`, `punch-sparring.mjs`). Beside it, it prints how many starts each side lands.
- **At 240 starts it does not tell a fifth better from a fifth worse**: a candidate that reads
  1.08 times the drive has an interval of 0.79 to 1.47.
- **Landings paired by start tell more at the same count of starts.** A reading of the drive
  beside `from-guard` on 240 sparring starts has 125 landings against 116, and of the starts
  where only one lands, 13 the drive's against 4 `from-guard`'s (exact two-sided sign test
  p 0.049; [the punch's notes](2026-11-10-warrior-punch.md#why-the-punch-does-not-land-in-fights)).
- **A landing is not value**: held up by the assist the punch lands more and its value does not
  move ([what the assist does to the punch](#part-2-a-strike-made-by-search-apart-from-the-legs)).
- **`sparring-drawn` holds ten times sparring's starts** for a trainer to draw from; the rung and
  its twin stay out of training, to judge and to rank by (`SPARRING_DRAWN`,
  `src/evaluation/strike/cases.ts`).

**The design.**

- **A try is screened on landings paired by start**: the starts where only the candidate lands
  against those where only the drive does, by an exact sign test, beside the falls. `--bar`
  prints them with its bar.
- **A variation is accepted on value**, damage dealt a second, on a held-out draw of ten times
  sparring's starts: a protocol on a stream of its own, drawn as `sparring-drawn` is, that no
  search and no trainer plays. An interval narrows with the square root of its starts, to about a
  third as wide, by arithmetic.
- **The drive's side of that draw is played once and found after**
  ([played rows kept and found](2026-11-14-saved-results.md#the-design)): it is half of each
  comparison's play.

**What it would cost.** Ten times the starts is ten times the play: at most about four
core-hours a side, by the arithmetic of [a try's comparison](#the-readings-that-come-first).

**Open.**

- How many starts tell a variation made by search from the one it would replace, and at what
  time a try.
- What "as well" is as a margin: [the rules](../../AGENTS.md#the-rules) ask a reading that shows
  a replacement does as well, and a reading has an interval.
- Whether the paired landings rank tries as value does.

## Part 1: a variation declares its record

**Where it stands.** A variation is its maker (`ExecutorVariations`). A skill's part names one
record for all of them: in its `reads`, in its `recordFault` and in the data it registers
(`straight-punch/data/registration.ts`). `reads` takes a config: a mind loads by it
(`treeData`, `src/minds/catalog/catalog.ts`), and a strike's digest reads by it beside the
variation its body runs (`chosenVariation`, in `skillDigest`).

**The design.**

- **A variation is its maker and what it reads**: the records it names and the bodies that have
  them. Naming another's record is how two share one. A skill's part holds what its variations
  have in common: its label, its effectors, its Option and what it needs of the body.
- **A record is a variation's on each body** (`straight-punch/<variation>`), registered by its
  variation.
- **The part's `reads` gives the records of the variation a config names**, and every
  variation's where it names none. A strike's digest asks with the variation its body runs, so a
  profile moves only with its own variation's record. The part's `fits` asks the bodies of the
  variations a body holds.
- **The research tools take the variation they read and write**: the record a search starts from
  and the variation a network file steers (`punch-sparring.mjs --variation`).
- **A variation under work plays; every other variation's rows are found**
  ([played rows kept and found](2026-11-14-saved-results.md#the-design)).

**What it would bring.** A new idea is a new variation: built, read and dropped without moving
anything installed, several of them side by side. The fingerprint shows a change moved only its
own variation's cases (`node scripts/fingerprint.mjs --compare <file> --variation
<skill/variation>`).

**What it would cost.** Nothing is played again: `drive` and `from-guard` name the record and the
layout they run now, which the fingerprint shows.

**Open.**

- Whether a variation has a row of [the table](../reference/the-table.md) or is read as a subject
  against its skill's row.

## Part 2: a strike made by search, apart from the legs

**Where it stands.**

- **The punch is a push schedule searched by CMA-ES, then an actor trained by PPO** that adds to
  its pushes and asks the stance at each decision. The bonk is one searched swing with no network
  in its record (`assets/skills/strikes/bonk/swing.json`).
- **A strike needs a searched schedule and a correction inside the stroke.** A blow that tracks a
  declared path is too slow, 4 to 6 m/s against 6.8, and a schedule played open-loop works only
  from the start it was searched from ([the approaches](../approaches.md#weapon-strikes)).
- **The layer under a strike reacts to a blow's push only once the body moves.** It holds the
  stance (`stance-balance.ts`), the whole-body solve (`solve.ts`) and the assist (`assist.ts`), a
  root force and moment metered against the character's Balance
  ([motor control](../architecture.md#motor-control)), and carries out what a skill asks step by
  step (`LegsGoal`, `StanceGoal`). So each strike's network learns to place the centre of mass
  before its blow.
- **A strike's window says where it may begin** (`strikeWindow`, `quietToStrike`,
  `src/skills/strikes/shared/strike-window.ts`); the drill brings the striker into it
  (`straightSpot`, `src/minds/command/drill.ts`).
- **The search moves settings alone.** `punch-sparring.mjs --search` moves the 15 of `SEARCHED`
  and plays each candidate by its tuning. A network reaches a trial as a file's path, steering as
  a trainer does (`policyOf`, `steeredTrial`).
- **The search scores the same starts in every generation**: every third twin start the Warrior
  is admitted to (`--every`). A PPO run on the twin's 127 training starts learned them: it reads
  1.84 times the drive on them and 0.77 on the half it never played
  (`punch-sparring.mjs --bar <policy> --on train`, `--on dev`).

**The design.**

- **A strike's layout holds no leg joint, no reading of the stance and no ask of the legs.** It
  is a few inputs (the target from the shoulder, the fist from the target, the fist's and the
  centre's velocity, the arm's angles) and the pushes of the arm and the trunk. A layout names
  any of the steer's inputs and outputs (`SteerLayout`, `checkedLayout`,
  `src/skills/strikes/shared/steer.ts`); with no walk output, the settings' `halts` says whether
  a walk goes on. Standing is the stance's; getting into the window is the layer's and the
  mind's.
- **A one-layer correction over those inputs**, added to the schedule's pushes inside the stroke.
- **One search moves the schedule's settings and the correction's weights together.** A
  candidate's network goes to a trial with its settings. The search starts from
  [the fit](#the-readings-that-come-first).
- **Each generation is scored on starts drawn anew from `sparring-drawn`**, the same starts for
  every candidate of the generation, so no start recurs often enough to be learned for itself.
  The twin (`sparring-twin`, `src/evaluation/strike/cases.ts`) ranks a search's bests, and the
  held-out starts judge them ([the judge](#the-judge-of-a-try)).
- **The tool takes the skill, the body, the variation and what a candidate is read beside.** The
  settings it moves and their ranges are the executor's, so the punch on another body and the
  sword thrust are the same search.
- **The search runs in the installed layout as the readings do**, the columns it leaves out at
  zero. What it makes is installed as a variation of its own, in a layout of its own (Part 1).
- **The correction aims**: it reads where the target is, and sparring's starts span places. A map
  from the target's place to the schedule's settings is for places one schedule and its
  correction miss.
- **Where a linear correction falls short**, an actor over the same few inputs is the next size,
  trained from the search's best.
- **Where a reading shows a strike needs the stance to know of its blow**, the strike declares
  the impulse it expects at contact and when, and the stance holds its capture point against it
  before the blow (Wang, Tanguy, Gergondet & Kheddar, "Impact-aware humanoid robot motion
  generation with a quadratic optimization controller", Humanoids 2019), or the assist's ceiling
  is raised for it (Yuan & Kitani, "Residual Force Control for Agile Human Behavior Imitation and
  Extended Motion Synthesis", NeurIPS 2020). An impulse J moves the capture point by J / (m ω),
  with ω = √(g / h): 9 cm for an untrained punch's 22.8 N s
  ([the strike reference](../reference/human-strike-reference.md)) on an 80 kg body with its
  centre at 1 m, by arithmetic.

Provenance: schedules played open-loop with a linear feedback fitted to each (Liu, van de Panne &
Yin, "Guided Learning of Control Graphs for Physics-Based Characters", ACM Transactions on
Graphics 2016); a few global parameters of one movement adjusted to a new target (Kober, Wilhelm,
Oztop & Peters, "Reinforcement learning to adjust parametrized motor primitives to new
situations", Autonomous Robots 2012; Mülling, Kober, Kroemer & Peters, "Learning to select and
generalize striking movements in robot table tennis", International Journal of Robotics Research
2013).

**What counts as made.** A variation made by search takes an installed one's place once a
reading on the game's cases shows it does as well ([the rules](../../AGENTS.md#the-rules)). The
judge's bar is that of a search for a better punch: damage dealt a second at least twice the
drive's, the low end of its interval above 1.5 (`RATE`, `LOW`). What tells "as well" from a fifth
worse is [the judge's](#the-judge-of-a-try).

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

**What it would bring.** A strike on a new body or loadout is a search, with no training run. One
strike covers sparring's range of places. A strike's network stops reading the legs, so a change
to the stance, the legs or the footwork leaves it valid, and its readings stand. A strike that
leaves the legs alone runs beside a walk: the mind runs together Options whose resources do not
overlap ([Option Mind](../architecture.md#minds)).

**Where the separation stops.**

- A blow's worth is the mass behind the fist, so a strike still asks for a hip turn and a drive.
- The stomp, a kick and a way up take the legs themselves, as the ground skills do.
- A change to how the stance answers an ask it already takes moves every strike that sends it. A
  new optional ask that no installed variation sends moves none, which the fingerprint shows.

**Open.**

- Whether a linear correction holds what the open-loop schedule loses: 1.5 cm of foot took a bonk
  from 96 to 63 J. The fit reads it for the punch.
- Whether the search reaches a good correction at a search's budget: 136 weights and biases for
  16 inputs and 8 pushes, against the 15 settings it moves now, whose search ran 16 generations
  of 16 candidates on 80 starts.
- Whether a best found on starts drawn anew holds on the twin and the held-out starts, and how
  many starts a generation needs: its score then differs between generations by the draw.
- Whether a correction this small follows a moving target inside the stroke.
- Whether the swing's strikes take a correction the same way: the bonk's executor is the swing's
  (`src/skills/strikes/shared/swing.ts`), and its record holds no network.
- Whether one sparring run gives the skill's reading as well as its profile. The claim is a
  still-target cell so that how a body throws a move is read apart from what the move brings in a
  fight ([the claim](../recipes/skill.md#the-claim)).
- How much of the more landed with an assist is the blow held up and how much the stance stepping
  later, and whether the foe's Balance moves a strike's outcomes as the striker's does.

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

The readings change no file of the game. The judge's larger draw is a protocol added beside
sparring's. Each part is built beside what is installed: a new variation, research code, or a
refactor the fingerprint shows. Two choices reach installed skills:

- **A change to how the stance answers an ask it already takes, or to what shared strike code
  does.** Either moves every skill on it.
- **An installed variation replaced by one made here**, once its reading on the game's cases
  shows it does as well.

## How the parts depend

- **The readings wait on the tool's modes and on nothing else built**: the fit's, and a network
  file's edit. Each `--bar` of them plays the drive's side once more until the judge finds its
  rows ([played rows kept and found](2026-11-14-saved-results.md#the-design)).
- **The judge's paired landings wait on nothing.** Its larger draw is a protocol added beside
  sparring's; with the played rows its drive's side is played once.
- **Part 1 and the played rows wait on no reading**: every try after them plays only its own
  variation.
- **Part 2's search waits on the fit**, its start, and on a candidate's network going to a trial
  with its settings. What it makes waits on Part 1 to be installed beside the drive.
- **A stance that knows of a blow waits on a reading that shows a strike needs it.**

## To pick it up

- **The readings**: `research/skills/strikes/straight-punch/punch-sparring.mjs` (`candidateIn`,
  `steeredTrial`, `--bar`, `--on`); the installed network,
  `assets/skills/strikes/straight-punch/drive.json`, and its layout, `drive.layout.json`; what a
  layer computes, `src/core/math/learning/recovery-network.ts`; what an output asks,
  `src/skills/strikes/shared/steer.ts`.
- **The judge**: `bar` in `punch-sparring.mjs`; sparring's draws (`SPARRING`, `SPARRING_TWIN`,
  `SPARRING_DRAWN`) in `src/evaluation/strike/cases.ts`.
- **Variations**: `src/skills/framework/variations.ts`; a skill's part, as
  `src/skills/strikes/straight-punch/index.ts`; its records `straight-punch/data/`; what loads
  and digests them, `src/minds/catalog/catalog.ts` and `src/skills/framework/profile.ts`; the
  boundary `scripts/source-boundary.mjs`.
- **A strike by search**: `punch-sparring.mjs --search` and `--bar` over `research/cma.mjs`; a
  tuning laid over a subject, `withTuning` in `research/drill-trials.mjs`; the executor
  `src/skills/strikes/shared/straight-drive.ts` and its schedule `shared/timed-push.ts`; the
  steer a correction adds through, `shared/steer.ts`; the sword thrust,
  `src/skills/strikes/sword-thrust/`; sparring's starts `src/evaluation/strike/cases.ts`.
- **The layer**: `src/control/` (`stance/`, `solve.ts`, `bearing.ts`, `balance-part.ts`,
  `motor-part.ts`); the assist `src/core/bodies/assist.ts`, its ceiling
  `src/combat/rulebook.ts`; what a strike asks of the legs, `LegsGoal` in
  `src/skills/framework/skill.ts` and `shared/steer.ts`; the window `shared/strike-window.ts`;
  the drill's footwork `src/minds/command/drill.ts`.

## Completion

A part that lands puts what worked into the recipe for its kind of work and what it changed into
the architecture. These notes are deleted once every part has landed or been dropped.
