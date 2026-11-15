# Many skills, faster

Notes on making a new skill, or a new idea for one, quick to try: hours or days from its start
to its sparring reading. They hold what a try costs, the readings that say whether the design
holds, the judge that reads a try, the starts a try is played from, and the design's two parts.
Each is taken up on the owner's request by a brief of its own.
A part describes a design under consideration; nothing in it is built.

## Goal

- **A new idea reaches its sparring reading in hours, a new skill in days.** The measure is the
  time from its start to that reading.
- **A try's reading tells it from what it is read beside**: better, worse or the same, at a
  margin its judge names.
- **A new idea is a variation of its own**: trying it moves nothing installed, and nothing else is
  played again for it.
- **A strike moves the arm and the trunk, and asks the stance where to face and where its
  centre goes.** It reads no leg and orders no step. Standing and footwork are the layer under
  it, so a change to the legs or the footwork leaves every strike as it is.
- **A strike is made by search**, with no training run where a search and a correction do, by
  one tool for every strike and body it is named.
- **Nothing is computed again routinely**: what is under work plays, and every other played row is
  found ([the architecture](../architecture.md#evaluations)).

## Where the time goes

Two costs are days each; the rest is paid on every try.

**Days: the training run.** PPO on the sparring punch steps about 240 decisions a second on 32
workers (train.log's decisions over its minutes,
[the training recipe](../recipes/training.md#before-the-first-run)), so the 20 to 50 M decisions
a skill is trained for ([the approaches](../approaches.md#every-skill)) take one to two and a
half days a run. A run is one try.

**Days: a measure that does not say what a fight does.** The Warrior's empty-handed punch is on
the mark in 78 of 96 trials at a still target
([the punch's notes](2026-11-10-warrior-punch.md#where-it-stands)). In `fights` it lands 6 of
its 48 trials, 14 of the moments unreached; with each strike priced by its
standing-target profile it lands 13 of the 42 it reaches
([why](2026-11-10-warrior-punch.md#why-the-punch-does-not-land-in-fights)). Each of those fights'
commitments that is read holds an input outside every range the drill plays
([the comparison](2026-11-10-warrior-punch.md#what-a-fight-asks-that-the-drill-does-not)).
Tracing it is 59 controlled replays and 73 physical probes, in those notes. Sparring is the
drill's rung at a foe that fights back, from starts drawn at random (`sparring`,
`src/evaluation/strike/cases.ts`).

**Every try.**

- **A try's reading does not tell it from the drive.** On the 240 held-out starts a candidate
  that reads 1.08 times the drive's damage a second has a 95 % interval of 0.79 to 1.47, so a try
  a fifth better and one a fifth worse read the same ([the judge](#the-judge-of-a-try)).
- **A variation names its record**
  ([Part 1](#part-1-a-variation-declares-its-record)), so a network of a variation's own goes
  into a record of its own. The straight punch's two both call one function (`punch`,
  `src/skills/strikes/straight-punch/index.ts`), which runs one layout (`PUNCH_LAYOUT`);
  `from-guard` names the drive's record and adds when its drive may begin.
- **Each try plays its own side.** `punch-sparring.mjs --bar` plays every held-out start by the
  candidate and finds the drive's rows on them; `npm run evaluate` keeps its rows uncommitted
  and across commits ([the architecture](../architecture.md#evaluations)).
- **Each sparring trial of a search and of the judge is played from its start**: the wait, the
  walk into the window and the play on to its reader's end, beside the stroke
  ([starts kept from fights](#starts-kept-from-fights)).
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

They say whether Part 2 holds, and they wait on no part. Each is of minds that priced a strike
from its sparring at one body whatever body it struck. A strike is priced from its sparring at
the body it strikes (`profileAgainst`, `src/skills/framework/profile.ts`), from a bout's start,
and its foe is modelled by the strikes it holds. Read so, the drive lands 107 of the 240
held-out starts, falls 3 times, loses 0.072 life a trial and reads 0.0898 of the table's value a
trial, and the installed network as a file reads as the drive does on every start. The per-span
fits are read so ([the form the search starts from](#the-readings-that-come-first), below); no
other form of the table is, and its ranks are of the pricing before.

**Where it stands.**

- **The trained correction does most of the punch sparring**: the drive's own settings played
  with no network land 20 of the 240 held-out starts, against 105 steered
  (`punch-sparring.mjs --bar` on a candidate of the drive's settings).
- **A search of the settings gains little that the judge can see**: the 15 settings searched with
  the network kept read 1.08 times the drive's damage a second, 95 % 0.79 to 1.47
  (`punch-sparring.mjs --search --keeps-network --out <file>`, then `--bar <file>`). A gain of
  that size is inside the judge's interval at 240 starts.
- **In fights the punch fails mostly in its delivery**: of the 48 `fights` trials the punch's
  notes diagnose, each strike priced by its standing-target profile, 14 are a fist
  that misses or lands elsewhere, 0.11 to 0.44 m from its moving aim in the misses; four are
  falls from the network's heading and centre asks, which end where those asks are suppressed;
  two are from its arm pushes
  ([the punch's notes](2026-11-10-warrior-punch.md#why-the-punch-does-not-land-in-fights)).
- **Holding the body up adds landings and no value**
  ([what the assist does to the punch](#part-2-a-strike-made-by-search-apart-from-the-legs)).
- **The tool steers a network file as the game steers its record's network**: the installed
  network as a file lands 106 of the 240 held-out starts against the drive's 105, one start
  landed by it alone and none by the drive alone (sign test p 1), at 1.0137 times the drive's
  damage a second, 95 % 0.9969 to 1.0452.
- **The steer's readings, read together.** Each file is written by
  `node research/skills/strikes/straight-punch/punch-sparring.mjs --network <form> --out <file>`
  and read by `--bar <file>`, on the Warrior's 240 held-out sparring starts beside the drive,
  which lands 105, falls 3 times, loses 0.029 life a trial and reads 0.1623 of the table's value
  a trial:

  | `<form>` | Landed | Only it, only the drive | Sign test p | Damage a second, times the drive's (95 %) | Falls | Life taken | Value |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | `installed` | 106 | 1, 0 | 1.000 | 1.0137 (0.9969 to 1.0452) | 3 | 0.030 | 0.1640 |
  | `fit` | 73 | 13, 45 | 0.00003 | 0.3555 (0.2607 to 0.4907) | 1 | 0.026 | 0.0451 |
  | `fit-aged` | 90 | 20, 35 | 0.058 | 0.5615 (0.4231 to 0.7413) | 2 | 0.028 | 0.0837 |
  | `fit-spans` | 93 | 22, 34 | 0.141 | 0.6858 (0.5257 to 0.9022) | 3 | 0.029 | 0.0981 |
  | `no-stance-asks` | 92 | 13, 26 | 0.053 | 0.7194 (0.5603 to 0.9155) | 1 | 0.029 | 0.1086 |
  | `blind-legs` | 85 | 16, 36 | 0.0078 | 0.6081 (0.4510 to 0.8267) | 3 | 0.025 | 0.0926 |
  | `fit-inputs` | 67 | 12, 50 | 0.0000012 | 0.4307 (0.3210 to 0.5710) | 2 | 0.026 | 0.0574 |
  | `walk-on` | 106 | 1, 0 | 1.000 | 1.0141 (0.9973 to 1.0456) | 3 | 0.030 | 0.1640 |
  | `walk-off` | 106 | 1, 0 | 1.000 | 1.0137 (0.9969 to 1.0452) | 3 | 0.030 | 0.1640 |

- **The fits copy the network in part on the twin's training half** (1,327 decisions on its 127
  starts): each push's share of its variance before tanh is 0.19 to 0.60 for `fit`, 0.26 to
  0.61 for `fit-aged`, and 0.41 to 0.69 for `fit-spans`, its three spans of the drive's age
  beginning at 0, 4/60 and 8/60 s, split at the thirds of the decisions (408, 407 and 512).
- **Sparring's commitments do not cover the fights' the punch's notes hold**
  ([the comparison](2026-11-10-warrior-punch.md#what-a-fight-asks-that-the-drill-does-not)): of
  those 20, each a `fights` trial whose punch missed, landed elsewhere or fell, 16 hold an input
  outside the ranges of held-out sparring's 188 commitments, a median 17 of the 59 inputs and at
  most 30. Of the twin's 184 commitments, another draw of sparring's own starts, 43 hold one, a
  median 0 and at most 14: one of them holds more than 7, and 12 of the fights' hold 11 or more.
  Outside most often are the trunk's flexion (lumbar in 12, thoracic in 11), each knee (11), each
  ankle (10) and the thoracic rotation (10). Four are inside every range, three of them falls
  from the network's heading and centre asks (3 m left moment 5, 5 m left and right moment 5) and
  one a blow landed elsewhere (4 m left moment 4). `punch-sparring.mjs --commitments` reads
  sparring's and the twin's commitments; the fights' are that comparison's.
- **`fights` gives no commitment to read as the tool steers it**: of the Warrior's 48 `fights`
  trials, 46 never reach their moment and 2 are refused (`--commitments`).

**What the steer's readings say.**

- **A correction needs the stroke's time.** One layer over the fit's 16 inputs holds 0.36 of
  the drive's damage a second, 0.56 with the drive's age an input, and 0.69 as a layer for each
  of three spans of that age. They land 73, 90 and 93 of the starts, against the steered 105
  and the 20 of the settings alone.
- **The heading and centre asks hold about a quarter of the punch's damage**: the installed
  network without them reads 0.72 of the drive's, 95 % 0.56 to 0.92. Blind to the legs and the
  stance it reads 0.61, 0.45 to 0.83.
- **The per-span fit reads near the installed network without its stance asks**: 0.69 beside
  0.72, each read against the drive and neither against the other. The fit asks the stance for
  nothing, so how much of what it is short by is the asks and how much the form is unread.
- **The walk ask moves nothing on sparring's starts**: held on and held off, the network reads
  as the control does.
- **No reading is of a form made for itself.** An edit is the installed network with a part at
  zero and the rest as trained, and a fit copies the network's outputs on the states the network
  reaches. The network on the fit's 16 inputs alone reads 0.43, under the per-span fit on the
  same inputs. A search that starts from a form scores the punch itself.
- **At 240 starts the readings are told from the drive and seldom from each other.** Their
  intervals reach about a quarter to a third either way, and `fit-aged`, `fit-spans`,
  `no-stance-asks` and `blind-legs` overlap one another.

**The form the search starts from.** `fit-spans-asks` is `fit-spans` with each span's heading and
centre rows fitted as its pushes are, where the other fits leave them at zero
(`--network fit-spans-asks --out <file>`). On the twin's training half (1,441 decisions on its
127 starts) it holds 0.74, 0.69 and 0.77 of the variance of the heading, the centre ahead and the
centre across, and 0.44 to 0.67 of each push's. Read as a strike is priced now, beside the drive
(`--bar <file>`, and `--bar <file> --on judge`):

| File | Starts | Landed, the drive's | Only it, only the drive | Sign test p | Damage a second, times the drive's (95 %) | Falls, the drive's | Value, the drive's |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `fit-spans` | 240 held out | 107, 107 | 21, 21 | 1.000 | 0.9771 (0.7537 to 1.2876) | 1, 3 | 0.0838, 0.0898 |
| `fit-spans-asks` | 240 held out | 125, 107 | 28, 10 | 0.0051 | 1.1767 (0.9267 to 1.5237) | 0, 3 | 0.1099, 0.0898 |
| `fit-spans-asks` | 2,400, the judge's draw | 1,166, 1,126 | 198, 158 | 0.039 | 0.9809 (0.9154 to 1.0480) | 12, 20 | 0.0864, 0.0879 |

- **A layer for each of three spans, over 16 inputs that hold no leg and no reading of the
  stance, deals the drive's damage a second**, within a tenth either way on the judge's draw. It
  lands a little more and falls less.
- **The 240 starts misled by a fifth**: 1.18 there is 0.98 on ten times the starts.
- **`fit-spans` read 0.69 of the drive as the minds priced before and reads 0.98 now**, on the
  same 240 starts. The table above is of that pricing, and what it says of one form beside
  another is unread as a strike is priced now.

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
| The fit | one layer over Part 2's inputs, its asks of the stance at zero, in three forms | whether a correction of the size and the inputs Part 2 searches carries the punch |
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
- **It is a mode of the tool** (`--network fit`, `fit-aged`, `fit-spans`). The mode plays the
  training half once, steered by the installed network through `steeredTrial`, keeps a copy of
  each decision's inputs and solves in Node, its weights under a ridge of a millionth of the
  decisions (`RIDGE`). `fit-spans` cuts three spans at the thirds of the decisions by the drive's
  age (`SPANS`).

Part 2's search starts from the per-span form with its asks fitted
([its design](#part-2-a-strike-made-by-search-apart-from-the-legs)).

**Two readings that play no network file.**

- **Whether sparring's commitments cover the fights'.** The punch's notes hold the comparison for
  the drill as a table
  ([the comparison](2026-11-10-warrior-punch.md#what-a-fight-asks-that-the-drill-does-not)): the
  layout's inputs at each commitment (`steerFeatures` at drive age zero), their ranges on the
  drill beside the fights'. `punch-sparring.mjs --commitments` makes it for sparring: it plays
  the Warrior's `sparring`, `sparring-twin` and `fights` trials steered by the record's network,
  keeps the layout's inputs at the first decision of each trial's punch (`commitmentOf`), and
  counts the commitments of `fights` and of the twin that hold an input outside `sparring`'s
  ranges. The twin's count is what another draw of sparring's own starts holds outside them.
  With `--out <file>` it writes every commitment. The three rungs play in 75 to 81 s, 52 to 53 s
  and 63 to 70 s on 30 workers. Where sparring's do not cover the fights', a try's measure is the
  `fights` rung.
- **What a try's comparison costs**: the time of a `--bar`. It sizes how many starts a try is
  read on. A sparring trial plays at most 11 s (`seconds`, `STILL`,
  `src/evaluation/strike/cases.ts`) at about 0.55 s of a core a simulated second
  ([the punch's notes](2026-11-10-warrior-punch.md#sparring-settings-searched-the-steer-trained)),
  so a side of 240 starts is at most 24 core-minutes, by arithmetic. Played, the drive's side of
  the control's `--bar` took 53.1 s on 30 workers of a machine of 32 logical processors (51.0 to
  53.1 s over the nine readings), and a network file's side 70 to 79 s.

## The judge of a try

**Where it stands.**

- **The judge reads damage dealt a second** against the drive's on held-out starts the Warrior
  is admitted to, its interval a paired bootstrap over the starts (`bar`, `punch-sparring.mjs`):
  the 240 of `sparring` (`--bar <file>`), or the 2,400 of `sparring-judge` (`--bar <file> --on
  judge`), ten times sparring's starts on a stream of its own that no search and no trainer
  plays (`SPARRING_JUDGE`, `src/evaluation/strike/cases.ts`). The candidate plays each start and
  the drive's side is found ([the architecture](../architecture.md#evaluations)). Beside it, it
  prints how many starts each side lands, how many only one side lands with the exact two-sided
  sign test's p on those two counts, and each side's seconds to play.
- **At 240 starts it does not tell a fifth better from a fifth worse**: a candidate that reads
  1.08 times the drive has an interval of 0.79 to 1.47, and the per-span fit with its asks
  fitted reads 1.18 there and 0.98 on the judge's draw
  ([the form the search starts from](#the-readings-that-come-first)).
- **At 2,400 it tells a tenth**: `from-guard` reads 0.9928 times the drive, 95 % 0.9137 to
  1.0794. It lands 1,083 against 1,126, 147 starts landed by it alone and 190 by the drive alone
  (sign test p 0.022), and falls 9 times against 20.
- **A side of the judge's draw plays in 470 to 490 s on 30 workers**, the drive's and a network
  file's alike; the drive's side found takes 14 s.
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
- **A variation is accepted on value**, damage dealt a second, on the judge's draw
  (`--on judge`).

**Open.**

- How many starts tell a variation made by search from the one it would replace, and at what
  time a try.
- What "as well" is as a margin: [the rules](../../AGENTS.md#the-rules) ask a reading that shows
  a replacement does as well, and a reading has an interval.
- Whether the paired landings rank tries as value does.

## Starts kept from fights

**Where it stands.**

- **A sparring trial of a search and of the judge is played from its start.** `playOne` makes
  the trial's world, and `playCase` (`src/evaluation/play.ts`) or `steeredTrial` builds it and
  plays it from the drill's first step to its reader's end (`punch-sparring.mjs`): the wait and
  the walk into the window, the stroke, and the play on that the value reads.
- **A fight's trial is played from a start kept of it** (`research/starts.mjs`). A protocol
  names its opening (`Cases.opening`: a fight while its drill's phase is `fighting`). `makeStart`
  plays a trial's bout to the step its opening ends, saving it every 120 steps, puts it back to
  the last save before, plays to two steps short of that end and saves there; played on, the
  opening must end at the step it did. `startBank` keeps the save by its condition under its
  evaluation, protocol and subject (`.cache/starts/`, outside Git), with where it came from, and
  keeps a fight that never comes to its moment as no start. `playFrom` builds the trial's world,
  puts a fresh reader beside it, loads the save and plays to the reader's end.
- **A trial from its start reads what the whole trial reads.** Of the Warrior's punch's 48
  `fights` trials, 34 come to their moments and 14 do not; each of the 34 played from its start
  ends in the reading its whole trial ends in, to the last figure. Played whole the 48 take 350
  core-seconds, their starts 323 to make, and the 34 from their starts 28: under a second a
  trial against seven. A start is 311 KiB kept.
- **Three rungs of fights are drawn for it** (`FIGHTS_TWIN`, `FIGHTS_DRAWN`, `FIGHTS_JUDGE`,
  `src/evaluation/strike/cases.ts`): `fights-twin`, 960 fights a body, each from a gap drawn to
  the millimetre between 3 and 5 m, its limb, mark and moment by turns, so no two trials share
  what came before their moments; `fights-drawn`, ten times as many on a stream of its own for a
  search to draw from; `fights-judge`, ten times as many on another that no search plays. The
  Warrior's punch is asked at 240 of the twin's and 2,400 of each of the others. None is
  played: how many come to their moments, and what the punch lands of them, is unread.
- **The punch's tool plays them** (`punch-sparring.mjs`): `--bar <candidate> --on fights-twin`
  and `--on fights-judge` make the starts the bank lacks by the drive's own bouts, then play the
  candidate and the drive from the same saves; `--search --draws fights` draws a generation's
  starts from `fights-drawn` and ranks on `fights-twin`. A candidate is the drive under other
  settings; a variation of its own is refused there.
- **The trainer keeps starts for its own run.** A learning environment given a `pool` plays each
  fresh draw to its learner's first decision, saves the world there and loads it for every
  episode begun from it (`WorldKind.save`, `research/case-learning-environment.mjs`). The saves
  are held in the run's memory, and the next run plays them in again.
- **The steered stroke is a small share of what a training run computes.** The trainer steps
  about 240 decisions a second on 32 workers ([where the time goes](#where-the-time-goes)). At
  0.55 s of a core a simulated second and a decision every two steps, 32 workers with a core
  each play about 3,500 decisions' worth of steps a second, by arithmetic: about a fifteenth of
  them are the trainer's. How the rest divides among the walk in, the play on, the foe's mind
  and the learner's update is unread.
- **A bout's save loads into a bout of its recipe less its minds, on whatever build made it.**
  `Duel.save` gives the physics and every module's memory, and `Duel.load` puts them into a bout
  of the same bodies, skills, Commanders and conditions (`src/game/arena/duel.ts`), part by part:
  a mind is the loading bout's own, its memory the save's where it is built as the save's was,
  fresh from the saved bodies where it is not, and any other part built otherwise refuses
  ([the architecture](../architecture.md#bouts-tapes-and-replay)). So a save the drive's own bout
  made loads under a striker's tuning: the punch tuned with its network kept, tuned with none, and
  steered by a trainer or a network's file (`playOne`) each build their memory as the drive's bout
  does, and load its save mid-bout. On a `still` trial, a bout built under each of the 15 searched
  settings moved a third of its range and loaded with the drive's opening save ends in the
  reading a fresh bout under that setting ends in; 11 of the 15 move the reading. A save still
  refuses a bout whose striker's character holds another variation (`DuelRecipe.skills`), and one
  whose drill Commander asks another limb or another moment (`striker`,
  `src/evaluation/strike/cases.ts`). A fork by a load costs the steps played from it and no more
  (`rollout`, `research/rollouts.mjs`).
- **The rung that reads a fight's commitments is small.** The Warrior's punch is asked at 48
  trials of `fights`: three gaps, two hands and eight moments the mind's own fight comes to
  (`FIGHTS`, `src/evaluation/strike/cases.ts`). It reaches 34 of them and lands 6: 7 to 35 in a
  hundred at 95 %, by arithmetic, each moment counted as a fight of its own.

**The design.**

- **A start is a trial of a fight saved two steps before its moment**: the trial's own bout, its
  gap, its limb and its moment drawn, played to the step its drill takes over (`reached`,
  `src/minds/command/drill.ts`), kept with its condition. Two steps before, so that a reader put
  beside the loaded bout sees the fight's last step before it sees the drill's first.
- **Each start is a fight of its own**, at a gap of its own: an interval drawn over starts is
  drawn over fights.
- **A trial is a start loaded and played on**: from the moment, through the drill's positioning
  and the stroke, to its reader's end. The fight before the moment is played once, for the bank.
- **Both sides of a comparison play from one world.** A candidate and what it is read beside
  load the same save, so the two trials are the same to the bit until their commands differ.
- **The bank is three draws**, as sparring's are: one a search and a trainer draw from, a twin
  to rank by, and one held out to judge on ([the judge](#the-judge-of-a-try)). The held-out draw
  is the larger measure of what `fights` reads on 48 trials.
- **A search's generation draws its starts from the bank** where sparring's commitments do not
  cover the fights' ([the readings](#the-readings-that-come-first)), and from `sparring-drawn`
  where they do.
- **A start is found by its condition, and the code is no part of what finds it**: its bout,
  gap, limb, moment and draw. It is a state a fight came to, and stays a start whatever changes
  after it. Where it came from is kept on it and gates nothing.
- **A start loads wherever each part of it fits**
  ([the architecture](../architecture.md#bouts-tapes-and-replay)): the bodies where their memory
  has the shape saved, and a mind's memory where it has, the mind starting fresh where it has
  not. The build is no part of what a load refuses.
- **A start is played again when it is asked**, as a played row is
  ([the code recipe](../recipes/code.md#code)): where there is reason
  to believe the fights the minds make now come to other moments.

**What it costs.** A start's fight is played to its moment once: about seven core-seconds on
the `fights` trials read. The twin's 240 fights for the Warrior's punch took 0.6
core-hours and keep 55 to 60 MiB; the judge's 2,400 are about six core-hours and 0.6 GiB, by
arithmetic. A trial from its start is about a core-second.

**Open.**

- **Of the drawn rungs only the twin is played**, for the Warrior's punch. Of its 240 fights
  178 come to their moments on the stance and 194 on the stance's footwork
  (`--holds stance/footwork`). On the footwork the drive lands 41 of the 194, and the per-span
  fit, steered from the same starts, deals 0.87 times its damage a second (95 % 0.60 to 1.26)
  and lands 41 (`--bar <fit> --holds stance/footwork --on fights-twin`). `fights-drawn` and
  `fights-judge` are unplayed, and so is `--draws fights`. Whether a candidate steered by a
  network's file or a trainer reads from a start as it does played whole is unread: the 34 read
  so are the drive's own, made and played by `makeStart` and `playFrom`.
- **A start under another variation.** A save loads under a striker's tuning and under a
  network's file. A variation of its own is its character's skill, which a load holds to
  (`DuelRecipe.skills`), and at a moment the mind's own action is under way in the striker's
  memory; its trial is a fight played from its start, which the tool does not play beside a
  kept one. A body that holds another balance is played from starts kept of its own fights,
  the drive beside it holding the balance too (`--holds`).
- **What a start carries of the mind that made it.** A candidate loaded two steps before a moment
  does what the save's mind had decided and not yet done: the orders and commands on their way,
  and the moment's own action where the drill carries it on. On the `still` trials read, that
  moved no reading from a fresh bout's; it is unread at a fight's moment.
- **One fight for several starts.** Whether the fight before a moment is the same play
  whichever limb and moment its drill asks. Where it is, a load across the Commander's limb and
  moment makes a start of each moment a fight comes to, and a bank costs a fraction of its
  fights.
- **Which fights the bank holds**: the matchups and the loadouts, beside the open stage's gaps
  of 3 to 5 m.
- **A walker's reach of its fellows is kept by the step's time alone** (`REACHES`,
  `src/skills/locomotion/shared/navigation/crowd.ts`), as the strike option's reading of its
  limbs was: a bout put back to a save could meet it stale. No reading shows it.

## Part 1: a variation declares its record

**Where it stands.** The straight punch's variations declare their records
([the architecture](../architecture.md#skills)).

- **A variation is its maker and what it reads** (`RecordedVariation`,
  `src/skills/framework/variations.ts`): the records it names and the bodies that have them.
  Naming another's record is how two share one: `from-guard` names the drive's. A skill's part
  holds what its variations have in common: its label, its effectors, its Option and what it
  needs of the body.
- **A record is a variation's on each body** (`straight-punch/<variation>`, a `PunchRecordKey`),
  registered beside the drive's (`straight-punch/data/registration.ts`).
- **The part's `reads` gives the records of the variation a config names** (`variationReads`),
  and every variation's where it names none: a mind loads by it (`treeData`,
  `src/minds/catalog/catalog.ts`), and a strike's digest asks with the variation its body runs
  (`skillDigest`). The part's `fits` asks the bodies of the variations a body holds
  (`variationRecordFault`).
- **The sparring tool takes the variation it reads and writes** (`punch-sparring.mjs
  --variation`): the record a search starts from and a form is written from, and the variation a
  network's file steers and `--commitments` plays.
- **Each other skill tuned per body has one variation and names its one record on its part**
  (`recordFault`, `src/skills/framework/records.ts`).

A new idea is a new variation: built, read and dropped without moving anything installed,
several of them side by side. The fingerprint shows a change moved only its own variation's
cases (`node scripts/fingerprint.mjs --compare <file> --variation <skill/variation>`).

**Open.**

- **A variation's record of its own in a case's key.** A key covers each seated body's row of
  every record its mind's tree names (`treeData`, `loadsOf`), and a skill's part named without a
  variation reads every variation's (`variationReads`): a record of a new variation's own plays,
  once, each case of that body whose mind names the skill, the other variations' among them.
  Narrowing it to the variation the body holds is unbuilt.
- Whether the punch's exporter (`punch-export.mjs`) and its trainer take a variation: each
  writes the drive's record.

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
  stance (`src/control/stance/`), the whole-body solve (`solve.ts`) and the assist (`assist.ts`), a
  root force and moment metered against the character's Steadiness
  ([motor control](../architecture.md#motor-control)), and carries out what a skill asks step by
  step (`LegsGoal`, `StanceGoal`). So each strike's network learns to place the centre of mass
  before its blow.
- **A strike's window says where it may begin** (`strikeWindow`, `quietToStrike`,
  `src/skills/strikes/shared/strike-window.ts`); the drill brings the striker into it
  (`straightSpot`, `src/minds/command/drill.ts`).
- **The search moves the settings and a correction together.** `punch-sparring.mjs --search`
  moves the 15 of `SEARCHED`; with `--steer <spans file>` it moves with them each span's rows of
  the eight pushes and the three asks over the fit's 16 inputs and a bias, 561 weights from the
  file's own (`weightsOf`, `candidateAt`), and the punch is steered by the spans. A candidate's
  network reaches a trial with its settings, as a file's content (`policyOf`, `steeredTrial`).
- **A generation is scored on starts drawn anew** from `sparring-drawn`, the same for each of its
  candidates (`--starts`). The search's start and then its mean every few generations play the
  twin, and the best of those readings is the search's best (`--rank`). A PPO run on the twin's
  127 training starts learned them: it reads 1.84 times the drive on them and 0.77 on the half
  it never played (`punch-sparring.mjs --bar <policy> --on train`, `--on dev`).
- **No search of a correction has run.** The tool's search is played for four generations of four
  candidates on eight starts, which says it runs and resumes and nothing of what it finds.

**The design.**

- **A strike's layout holds no leg joint, no reading of the stance and no walk output.** It is
  a few inputs (the target from the shoulder, the fist from the target, the fist's and the
  centre's velocity, the arm's angles), the pushes of the arm and the trunk, and the three asks
  of the stance: a heading turn, and the centre of mass ahead and across (`stanceAsks`). A
  layout names any of the steer's inputs and outputs (`SteerLayout`, `checkedLayout`,
  `src/skills/strikes/shared/steer.ts`); with no walk output, the settings' `halts` says whether
  a walk goes on. Standing and stepping are the stance's; getting into the window is the layer's
  and the mind's.
- **The asks of the stance stay** because the installed punch holds about a quarter of its
  damage by them, and the walk output goes because it moves nothing on sparring's starts
  ([what the readings say](#the-readings-that-come-first)).
- **A correction of one layer for each span of the drive's age** over those inputs, added to the
  schedule's pushes inside the stroke and sending the asks. One layer for the whole stroke
  holds about half of what three spans hold.
- **One search moves the schedule's settings and the correction's weights together.** A
  candidate's network goes to a trial with its settings. The search starts from the per-span
  fit with its asks' rows fitted ([its readings](#the-readings-that-come-first)).
- **A record's network chosen by the drive's age.** A file of spans is the tool's
  (`punch-sparring.mjs`): a record holds one network, and the steer runs it at every decision.
  A variation made in the per-span form needs the steer to choose its layer by the drive's age.
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
ceiling of 0, sparred on its 240 held-out starts with the striker's Steadiness set in the bout's
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
to the legs or the footwork leaves it valid, and its readings stand. A change to how the stance
answers its heading and centre asks moves it, as below.

**Where the separation stops.**

- A blow's worth is the mass behind the fist, so a strike still asks for a hip turn and a drive.
- The stomp, a kick and a way up take the legs themselves, as the ground skills do.
- A change to how the stance answers an ask it already takes moves every strike that sends it. A
  new optional ask that no installed variation sends moves none, which the fingerprint shows.

**Open.**

- Whether a linear correction holds what the open-loop schedule loses: 1.5 cm of foot took a bonk
  from 96 to 63 J. For the punch the per-span fit with its asks fitted holds the drive's damage
  a second, 0.98 times it, 95 % 0.92 to 1.05 on the judge's draw; whether a search from it
  passes the drive is unread.
- Whether the search reaches a good correction at a search's budget: 561 weights and biases for
  16 inputs, 8 pushes, 3 asks and 3 spans, by arithmetic, against the 15 settings it moves now,
  whose search ran 16 generations of 16 candidates on 80 starts.
- Whether a strike that sends the stance its heading and centre asks runs beside a walk: the
  mind runs together Options whose resources do not overlap
  ([Option Mind](../architecture.md#minds)).
- Whether the walk output is idle in fights as it is on sparring's starts.
- Whether a best found on starts drawn anew holds on the twin and the held-out starts, and how
  many starts a generation needs: its score then differs between generations by the draw.
- Whether a correction this small follows a moving target inside the stroke.
- Whether the swing's strikes take a correction the same way: the bonk's executor is the swing's
  (`src/skills/strikes/shared/swing.ts`), and its record holds no network.
- Whether one sparring run gives the skill's reading as well as its profile. The claim is a
  still-target cell so that how a body throws a move is read apart from what the move brings in a
  fight ([the claim](../recipes/skill.md#the-claim)).
- How much of the more landed with an assist is the blow held up and how much the stance stepping
  later, and whether the foe's Steadiness moves a strike's outcomes as the striker's does.

## Other candidates

Each is an idea, untested here.

- **Another base under the strikes** has [notes of its own](2026-11-14-fighting-base.md).
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

- **The steer's readings are read** on the tool's mode (`--network`). Each `--bar` of them
  finds the drive's side ([the architecture](../architecture.md#evaluations)).
- **A kept row waits on the mind's pricing.** What Option Mind prices a strike by is code both
  sides of every comparison run, the sparring foe's among it, so a row kept before a change to
  it is another code's: its subject is played again (`--fresh`).
- **Part 2's search is played on the balance the punch will fight on**, since what a search
  makes belongs to the base it was played on: the stance's footwork (`--holds stance/footwork`),
  on the fights' draws. Its start is the per-span fit with its asks' rows fitted. What it makes waits on Part 1 to be
  installed beside the drive, and on a steer that chooses a record's layer by the drive's age.
- **A stance that knows of a blow waits on a reading that shows a strike needs it.**
- **The larger measure of a fight waits on the judge's draw's first play**: the starts are made
  by the drive's own bouts the first time a rung is asked (`--bar <candidate> --on fights-judge`).
- **An actor under the strikes waits on Part 2**: until a strike's layout holds no reading of
  the legs, a base that moves the legs otherwise than the stance makes each strike's network a
  seed to retrain ([the base under a fight](2026-11-14-fighting-base.md#the-design)). The
  stance's footwork, a rule of the stance's own, leaves the installed punch as it reads on the
  stance ([where it stands](2026-11-14-fighting-base.md#where-it-stands)).

## To pick it up

- **The readings**: `research/skills/strikes/straight-punch/punch-sparring.mjs` (`candidateIn`,
  `steeredTrial`, `--bar`, `--on`, `--network` and its `FORMS`, `--commitments`); the installed
  network,
  `assets/skills/strikes/straight-punch/drive.json`, and its layout, `drive.layout.json`; what a
  layer computes, `src/core/math/learning/recovery-network.ts`; what an output asks,
  `src/skills/strikes/shared/steer.ts`.
- **The judge**: `bar` in `punch-sparring.mjs`; sparring's draws (`SPARRING`, `SPARRING_TWIN`,
  `SPARRING_DRAWN`, `SPARRING_JUDGE`) in `src/evaluation/strike/cases.ts`.
- **Kept starts**: the bank, `research/starts.mjs`; the drawn rungs, `FIGHTS_TWIN` and
  `drawnFights` in `src/evaluation/strike/cases.ts`; a bout's save and load, `Duel` in
  `src/game/arena/duel.ts`; a fork by a load,
  `research/rollouts.mjs`; the trainer's pool, `research/case-learning-environment.mjs`; a
  fight's moments, `FIGHTS` in `src/evaluation/strike/cases.ts` and `reached` in
  `src/minds/command/drill.ts`.
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
