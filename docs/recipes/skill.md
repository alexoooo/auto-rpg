# Developing a skill

What has worked in taking a skill from a request to something the owner sees in the game, kept
so that a similar request has a recipe to follow: how a skill is read, how its code is laid out,
the steps in order, then how its actor is trained. It describes one way, a native controller that
is searched with a learned actor over it; where the owner asks for something else, the owner's
words decide and the request is not reshaped to fit this page.
[The table](../reference/the-table.md) is how a skill is read.

A bullet that ends in a confidence (*repeated*, *shown*, *suspected*) is a finding, cited and
graded as [the approaches](../approaches.md) say; the findings on travel, standing up, weapon
strikes, guarding and minds are there.

## Conventions

### A skill's value

- **A skill's value** is what the skill gains in
  play, in the game's own terms (the time an order takes, the life a blow takes and costs, the life
  a guard keeps), read on the game's cases paired against the version before, beyond the spread
  of one version read twice. Every effect is priced in it: a fall costs its time down, its rising
  and what is lost meanwhile. A skill's
  first reading when its work begins is its baseline (`npm run evaluate -- table --baseline`
  names it where the cell has none).
- **A fixed pass-or-fail number set without a baseline throws away gains and gets moved to fit**:
  travel blocks were rejected one after another at none of seven gates (`7db04797`); the stomp's
  bar went from 6.4 to 3.0 m/s within an hour of landing none (`bcd4f589`, `1d958355`); the club's
  bar moved five times, among them `41766c12`. *Repeated.*
- **What a change moves**: a record or a variant, its own body; a shared piece, every body that
  runs it; a change under a body, every skill on it, its commit naming each loss.
- **A change to the body, its muscles, contacts, the engine, the rate or the command delay voids
  every schedule, record, trained actor and profile on that body.** Toes took the run from 4.5 to
  0.7 m/s and step-up from 56 to 0 of 64 (`d22b1c7a`, `735962c8`, `9e7d7603`); the run's legs took
  step-up from 47 to 14 of 64 (`5e9208e9`); the Rogue's elbows, doubled for her stand-up, took her
  punch to 0 of 30 (`de9d8496`). *Repeated.*
- **A bug is fixed to its own layer's contract**, never judged by a reading above it; what the fix
  breaks above is a defect there, fixed next in the same push. A table cell that drops meanwhile
  is named in the commit.
- **Reference figures are a scale**: a person's or one the owner names, reported beside each
  reading; they decide nothing.

### Comparing figures

- **Compare minds alike**: the same scenarios, bodies, physics, assists and scoring, results by
  opponent, fresh cases to confirm a gain. A claim is `npm run match`; a mind's figure from
  another commit or protocol is read again before it is compared with another mind's.
- **Name the harness** of every figure (Node stand or page, engine, rate); say whether a peak was
  driven or struck; read the faster physics rate at the slower one's spacing; believe the stand
  over the fight; never one seed. A conclusion is void once its reference is corrected.
- **Readings and training count only on the game's engine, rate and command delay.** Stand-up was
  tuned on parent-axis `rapier` for a month while the game ran `rapier-coordinate`; on the game's
  engine 153 of 160 became 67 of 80 (`66a46676`, `4acb557d`). *Shown.*

### An Option's code

- **An Option's profile measures its outcomes**, falls among them, so the Mind prices its risk.
  How well a body throws a move and what the move brings in a fight are two readings: a skill's
  own test reads the first, at a target that lets it happen; a profile is the second, read where
  the Mind uses it. A strike's is built only from blows thrown sparring (`sparring`,
  `sparring-laid`): from starts drawn at random against a foe fighting back.
- **Drills read no profile and search no tree**: a table cell, its drill opponents and every
  skill's search and training run the drills' Mind (`option-drill`: its priors, its options run
  in their order, `RANKED_CHOOSER`), fast and the same each time: a drill drives its skills, and
  whether the Mind would choose them is a fight's question. Profiles and the tree
  search are for fights and for measuring the profiles themselves.
- **Research scores on its drill**: a search, a training run or a screen that scores a skill
  plays its drill's training twin, the protocols its cells read with the same situations drawn
  at other points (the way-up drill's `fresh` falls, its shoves turned halfway), on the drills'
  Mind at 120 Hz. The cells' own cases are held out: the confirmation plays them once before a
  record is kept, at 120 and 480 Hz, the worse counting, so a fit to the engine's step is caught.
  A situation the game puts the skill in is a case of its drill; one played only in research is
  a gap, closed by adding it to the drill. A probe (a rate the game does not run, a Steadiness or
  physique changed, a finer sample of what the drill holds) scores no skill.
- **One Mind for every body**: Option Mind runs one loop for every body, and everything it does is
  an Option, made and priced the same way, with no special case for any act.
- **One act an Option**: one skill used one way, its limbs, target and aim, as the item is really
  used (a club is swung; a sword cuts and thrusts). No Option switches between acts by a setting.
  What Options share is code they call, never a kind of Option that makes one of each.
- **No body is named in control code**: shared code (the framework, each area's
  `src/skills/<area>/shared/`) is general and names no skill. A skill specializes by Option
  first, then by variation: logic of a character's own is a variation of the skill that it holds
  (`Part.variations`, `BodySpec.skills`), in a folder only that skill's part imports
  ([the architecture](../architecture.md)). Whether a variation calls shared code or keeps its
  own is its author's choice. A variation's settings are a record per body (`SkillRecord`,
  `recordFault`), with entries per loadout where a loadout needs its own; a controller is never
  made per loadout. A change to one variation moves only the fingerprint cases that run it
  (`node scripts/fingerprint.mjs --compare <file> --variation <skill/variation>`).

## The steps

The order that has worked for a skill made this way. Each step's output is the next step's
input.

### 1. The reader and its score

- **Read physical facts**: contact by collider, speed, energy, path, falls, where the limb ends.
  An executor's phase labels are not evidence.
- **A strike bar that reads speed or touch alone accepts nudges, chops and bent-arm pushes**: a
  blow's worth is the mass behind the fist (`54a592aa`, `127eb165`, `ed11435a`). Since `3d6b1a01`
  `landed` counts any completed touch with the striking face, in the drill and the training reward,
  so a strike reading from before it is not compared with one after. *Repeated.*
- **One graded score a trial: the skill's value** ([a skill's value](#a-skills-value)), and the
  same score is the search's objective and the training reward. Form the owner asks for (a
  blow's shape) is part of it, graded by nearness, not a pass or fail: under an all-or-nothing
  objective every candidate ties while nothing is met, and the search returns nothing to keep.
  A strike's value is sparse (a blow that does not land trades about nothing), so its search
  scores a blow that did not land up to 0.05 hp a second below its value by how near it came to
  the bar (`searchScore`, `research/drill-trials.mjs`): candidates that land nothing still
  climb, and no nearness outweighs a landing.
- **A strike scored on energy alone yields a motion the owner rejects** (the club jab, the flailing
  swing, `a6e778e2`, `abfa50e3`). The score holds the form from the first search, and the form
  allows the mechanism that makes the speed (`5b1d36c6`). *Repeated.*
- **Bout wins and Elo do not measure a strike**: tuned so, a search tunes spacing while the blow
  stays a nudge (Puncher, Vanguard's 80 to 100 variants). *Shown.*
- **Show the reader scoring the visible failure low**, for a physical reason, before anything is
  searched.
- **Build only the primary screen first**: the reader, one fixture, one hand, one loadout, one
  rate. Misses, cancellations, moving targets, repetitions, other hands, loadouts and rates come
  once the primary screen succeeds on some cases: readers and fixtures for every case, built
  before any trial succeeds, are each right and none moves the skill.
- **A test is built from the skill it tests**: its cases are the marks, limbs, bodies and
  loadouts the skill's Option offers (`caseFaults`, `strikesBy`), never a list shared with other
  skills. **A test that asks a skill what it does not offer scores the test, and its zeros read
  as a missing skill**: a low cell says its skill is weak or its test asks what the skill does
  not offer, never that another skill is wanted. The Strike drill ordered every blow at each
  mark with each hand while a blow
  not begun counted 0, so half of a reading or more was orders the Option does not take: the
  Warrior's punch, offered at the middle mark with an empty hand, read 0.444 with them and 0.888
  without (`9dd4c338`, `0b866060`), and a punch at the head was built to fill the zeros and then
  called the straight punch's limit (`e0851a10`, `68f37a1b`, withdrawn in `046bb933`). `--by`
  reads a cell's outcomes by mark and hand. *Shown.*
- **A skill is judged on itself, against a target that lets it happen**: a blow at a mark it can
  reach, as a person's punch is judged on a pad. A foe's guard or best answer says nothing of the
  skill; against a best answer no act would pass. A defence in front of the mark is the fight's
  question (when to strike, where the openings are), read in fight protocols, and never parks,
  rules out or caps a skill.

### 2. What the body can do

- **Find what the body can do before building a controller**: a search with the skill's channels
  pushed flat out, or its controller's limits wide, scored on the skill's value.
  `punch-drill.mjs` and `swing-drill.mjs` search pushes so. The result is a scale beside later
  readings, never a gate.
- **A body that cannot do what the owner asks is changed here**: its muscles tuned for the result
  (a tuned `SOURCES` entry naming what it is set for). Never after a controller is built on it.
- **A light body cannot meet a mass-scaled strike bar by more speed**: the Skeleton's fist meets
  0.09 to 0.22 kg whatever its speed (`0c3b4599`, `168a82e6`, `2793a30c`, `ed11435a`).
  *Repeated.*
- **A form term must allow the mechanism its figure needs.** A club's speed comes from a whip
  (shoulder, elbow, then a wrist cock and snap); a run's from flight. Declare that mechanism as a
  phase of the motion, so the form term reads it rather than forbids it.

### 3. A native controller that succeeds on some cases

- **Name the mechanism that makes the motion** (foot placement from balance for a start or a stop,
  timed pushes for a blow) and check it against the findings here and in
  [the approaches](../approaches.md). A controller without it is not searched or trained.
- **Start from the simplest controller that can make the motion**: a schedule of timed pushes
  (`src/skills/strikes/shared/timed-push.ts`) over a posture, a gait, a stance. The stomp is a
  chamber, a braced stroke and a square-up step (`41c828d4`).
- **A tracking controller cannot throw a blow at a person's speed**: a tracker following a
  declared course runs behind it by its response time, and at a blow's speed that lag is the
  stroke. Effector paths, whole-body and greedy solves, an arm-tracking layer and a point-driven
  fist reached 4 to 6 m/s against 6.8 (`13439495`, `62420987`, `127eb165`, `7d9ee206`,
  `a340fbac`, `87d13005`). *Repeated.*
- **A controller tuned to one strength or speed cannot use more of either**: its activations
  overdrive or mistime the larger muscle. Grit as a strength surge and Haste as faster muscles add
  nothing to a controller that was not searched or trained across the attribute's range
  (`94a3f567`, `b21d6687`, `e8d6c775`, `1f6b963b`). *Repeated.*
- **Search it** with CMA-ES on its drill's twin, scored by the graded score
  ([research scores on its drill](#an-options-code)). A hand-picked set of variants is not a
  search. A search learns over tens of generations and is given no clock and no count of them:
  it runs while it improves and ends on its plateau, thirty generations without a better best
  (`--patience 30`; a search still improving has gone nine between two bests). Price it from its
  first generation. A record's settings are searched by `research/skills/skill-search.mjs`
  (`SEARCHES`), which a skill joins with its settings, its drill's trials and a trial's score.
- **A search ends one of three ways, and its report says which.** *Better*: its best beats the
  record the body plays on fresh trials and is installed. *Flat*: it reached a plateau and the
  record is kept. That says this search, from this start over these ranges, stopped finding
  gains; it never says nothing better exists. A thing is shown possible by doing it once, and
  shown impossible only by a bound the body cannot meet (a torque or a reach it does not have,
  step 2), never by a search that failed. *Unfinished*: it was stopped before a plateau (a
  count of generations, a crash, a session that ended), which says nothing about what the skill
  can do. An unfinished search's out file is copied to
  `research/runs/<skill>-search/`, beside a `README.md` naming it and the commit it was played
  on, and a later run goes on from it with `--resume`. That folder is kept outside Git
  ([what to keep](#what-to-keep)): nothing in it is added to a commit. One
  hand-made variant that fails is none of the three.
- **Before training, it succeeds on some held-out cases**: the sign the mechanism works. One PPO
  actor correcting a native controller that already succeeds on some cases, trained 20 to 50 M
  decisions, is the learning that worked: the run (`1e4dd787`, 4.64 m/s), the punch (`35b6998e`,
  its schedule's 8 of 60 held-out places to 92 %), the club drive (`4a2354fe`, 91 %). The same
  trainer on a seed that succeeds on none stays flat: the sword thrust three times (`7cd65504`,
  `39588333`, `d70fdeeb`), the Rogue's club (`e0bbce4a`), the Skeleton's punch (`8ed9abf4`). A
  controller that succeeds on none is not a seed: change the controller, or go back to
  feasibility. Training does not make up for it. *Repeated.*

### 4. A learned actor over it

Follows [Training](#training). What is particular to a new skill:

- **An open-loop push schedule lands only within about 2 cm of its searched distance**
  (`166c1e54`). *Repeated.*
- **The actor corrects the native controller**: it adds to its pushes and asks its stance. An
  output acts only through something that can move: a push on a leg bearing the body moves
  nothing, so a striker's legs are asked through the stance (`0b5af8eb`, `7d9ee206`). *Shown.*
- **An episode is a trial of its drill's twin** from saved starts at the action's first
  decision, at places the action's window admits; its reward is step 1's score.
- **Start from scratch or from this skill's own earlier actor.** Another skill's or body's
  network starts behind scratch (`d6154220`, `e0bbce4a`).

### 5. Widen and confirm

- Add what step 1 held back, one at a time, as episodes and cases of the twin: the other hand,
  loadouts, approaches, moving targets, misses and cancellations. Each keeps the earlier cases in
  the mix.
- **The learned punch's window (0.89 to 1.01 m) is not where fighters stand** (about 0.6 m, the
  foe's guard over the mark); training on fight moments failed twice (`d664e869`, `d11e7e9d`,
  `843a8f8b`). *Suspected.*
- Confirm once on the cells' cases at 120 and 480 Hz, on the chosen checkpoint or record.
- Register it in Option Mind, install its record in the game and build its profiles sparring
  (a strike's: the Strike drill's `sparring` and `sparring-laid` kept with `--json`, then
  `research/skills/strikes/strike-profiles.mjs --write`); a drill Commander using it alone does
  not show the Mind uses it.
- Play its table cells (`npm run evaluate -- table --body <model> --skill <name> --fresh`); a
  good drill reading with a cell that did not move is a skill the game does not use. A search's
  or a screen's figure is never reported as the skill's while the record is not installed or the
  Mind does not choose it.

## Training

How any skill steered by a learned network is trained: `research/run-train.py` (PPO) against an
environment served by `research/run-learning-server.mjs`. A skill reaches it through the steps
above, with a graded score and a native controller that already succeeds on some cases. What is
particular to one skill (its phases, its value, its stages, its settings) is its plan's; this
holds only the steps every skill's training takes, in order. A step skipped is the usual reason a
run teaches nothing.

### The shape: one skill, one actor

- **One actor steers the skill in every phase it covers.** A phase the actor does badly gets more
  of the curriculum's episodes, never a second actor: switching between actors makes a handover,
  and handovers are where the failures land. Per-phase actors in short blocks met none of seven
  gates (`7db04797`).
- **One environment trains it**, with episodes that mix every phase the current stage asks for,
  each a trial of the skill's drill's training twin
  ([research scores on its drill](#an-options-code)).
- **The actor corrects a native controller** and decides on the learner's interval
  (`src/core/math/learning/learner.ts`). The native controller under it stays fixed while it
  trains.

### Before the first run

1. **Name the value and its cases from the game.** Write down, in the plan, the skill's value
   ([a skill's value](#a-skills-value)) and the evaluation cases that read
   it, taken from the situations the game puts the skill in and the orders it gives there, as it
   gives them. A case the game never produces is not read, and training reward never decides it. The development cases that choose checkpoints hold several cases per
   phase (8 or more), varied in what the skill must handle: its starting state, its side, its
   direction, its target. One case flips with noise between checkpoints, and a case that is a
   training episode's exact start shows the actor's memory, not its skill.
2. **Find the seed.** Look in `research/runs/<task>/README.md` for a kept actor that already does
   part of the skill. Play it once on the current code through the plan's cases and a few cases of
   every phase the stages will train. Its reading is the baseline the run is compared with, and
   it says, phase by phase, what the seed already does and what it cannot yet start.
3. **Know what invalidates a seed.** A change to the body, the observation layout or the
   meaning of an input, the actions' meaning, the decision timing or the controller under the
   actor makes every trained actor a seed to retrain, never a reading. Budget 2 to 5 M decisions
   to bring it back, started with `--start`, `--start-layout` and `--critic-first`, then compare it
   with the baseline from step 2. Its input normalisation is measured anew on the new episodes:
   statistics frozen on a narrower mix saturate what it never saw. So a run waits for the
   finished design: one trained while the controller, observation or actions are still changing
   is retrained when they settle.
4. **Start the spread at one the seed survives.** `--start` begins exploring at `--log-std`
   (default −1, a spread of 0.37), whatever the seed's own. Play the seed with that noise on each
   phase: where it fails in more than a few episodes, lower the spread until it does not, and
   note the setting in the plan. Failures caused by the noise teach the same avoidance as a phase
   that nearly always fails, and noise on every channel breaks an open-loop schedule the actor
   corrects.
5. **Start from reached states.** Warm-ups are played on the body and cached as snapshots. Never
   set a velocity or a pose to make a start. A warm-up that fails is reported and excluded; a
   worker that reaches none of a kind of start plays the other episodes. Copy each delivered order
   into mutable world state so snapshot restores cannot rewrite the curriculum's scripts.
6. **Check the reward is the value the checkpoints are ranked by**: the same quantities, measured
   the same way. A fall costs what it costs in play. An episode that ends at a fall is charged the
   value the rest of it would have earned as well, so ending early is never the cheaper way out.
7. **Check parity once per new environment.** The seed played through the environment reproduces
   the ordinary game's trajectory step for step (`research/learner-adapter.mjs` is the one loop).
   If it does not, fix the environment before training.

### The run

```powershell
.tools/ai-lab-venv/Scripts/python.exe research/run-train.py --config .tmp/<task>/<run>/config.json --output .tmp/<task>/<run>
```

- Keep the defaults: PPO, 256 hidden (a `--start` takes its seed's width), learning rate 3e-4,
  20 M decisions (`--steps`), a kept checkpoint every 1 M (`--keep`). Change one only for a named
  reason.
- **Set the config's `workers` to the machine's logical processors.** The server's default of 8
  leaves most of a large machine idle, and the rate scales with workers.
- **Price it from the first chunk**: train.log's decisions over its minutes gives the rate, and
  the run's decisions at that rate is its time.
- **A run slower than 1 M decisions in 45 minutes is profiled before its question opens**:
  `--profile` shows whether the environment or the learner is the wait, and a wait that is a
  defect is fixed first. A run that is slow for what it simulates runs at its rate.
- **Do not judge before 2 M decisions.** Returns dip and recover in the first million. An actor
  learns over 3 to 50 M decisions, depending on the skill. A block of a few hundred thousand
  decisions shows noise, not a result.
- Read train.log's trend over the last few million decisions: the `--keywords` the value reads
  should improve. Read the trend, not the last line.
- One run answers one question. A reward or curriculum change is a new run from a kept
  checkpoint, compared with the run before it at the same decisions on the same cases.

### Choosing a checkpoint

1. Play every kept checkpoint (one per 1 M) on the development cases from step 1 of
   [Before the first run](#before-the-first-run), as it lands. Training return does not choose: it can keep rising while the
   cases get worse. Reserved or confirmation cases never rank checkpoints: they are played once,
   on the chosen one.
2. Take the best by the value over every phase trained so far, the earlier stages' included.
   A phase no stage has
   trained yet is read and reported, but ranks nothing: its outcome is chance. The last
   checkpoint is often not the best.
3. **Install it in the game at once**, commit it, and play it there, in the screens that use the
   skill. The owner sees a skill only in the game, and the game finds what the cases missed: a
   failure there that the cases do not have is a case the plan lacks, added before the next run.
4. **Polish**: resume the best into a new output for 2 to 5 M decisions and screen again:
   `--resume .tmp/<task>/<run>/model-<n>.zip --output .tmp/<task>/<run>-polish --lr 1e-4 --steps 3000000`.
   A checkpoint resumes only into another folder; decisions count on from its own.
5. Compare the chosen checkpoint with the baseline, paired on the same cases
   (`npm run evaluate -- <drill> <subject> --previous <baseline>`), and play its table cells. Keep it when the skill's value rises, each loss
   named beside the gain. The limits the skill
   publishes, which the game plans by, are what it holds on the plan's cases, never what its
   training asked.

### The curriculum

- Stages add phases in order: the skill's core act from reached states; then entering it, from
  rest and from the acts that lead into it; then leaving it; then its variations; then the
  game's situations as the game gives them; then loadouts and disturbances. A plan names its
  skill's stages in that order.
- **A phase the seed already does is in the mix from the first stage.** A stage without it
  trains it away, and the next stage spends millions of decisions winning it back.
- **A stage opens only when some of its cases already succeed**, played by the checkpoint it
  starts from. A phase that nearly always fails teaches the actor to avoid it, not to do it: it
  gives up its other phases to fail less, and returns rise while the skill gets worse.
  When none succeed, open an easier stage first, or develop the native controller under it by
  [step 3](#3-a-native-controller-that-succeeds-on-some-cases).
- **Within a phase, the smallest change comes first**, and the next size is added once the
  smaller one succeeds on the development cases.
- Each stage resumes from the previous stage's chosen checkpoint
  (`--resume <checkpoint> --output <stage folder>` with the stage's config) and **keeps every
  earlier stage's episodes in the mix**, so what was learned holds. Half the episodes from earlier
  stages is a sound start.
- A stage ends when it plateaus.

### Plateaus and changing direction

- **A kept gain** is a screened checkpoint better than the best before it, by the order in
  [Choosing a checkpoint](#choosing-a-checkpoint). It restarts the plateau count.
- **A plateau** is 5 M decisions (five kept checkpoints) with no kept gain.
- On a plateau, check the environment before anything else: parity, reached starts, a reward
  that is the value the checkpoints are ranked by, and episodes that contain the failing case.
  **Most failed training runs were environment defects, not learning**: actions applied a
  decision late (`5e20a7f2`), inputs clipped by a narrower normalisation (`d7a61762`,
  `ca7203c0`), a reader starting after the action (`7db22ea2`), an environment that never shows
  the actor the case it fails. *Repeated.*
- Then change one thing (the curriculum's mix, a reward term, the observation) and run it as a
  new question. A phase that still succeeds on almost none of its cases is not a training
  question: go back to the curriculum's opening rule. A plateau the environment does not explain
  is the controller's limit, written as a finding.
- Native-controller tuning under a trained actor is judged only after the actor is retrained on
  it. Without that retraining the reading measures the actor outside the states it learned on.

## What to keep

A run's output goes to `.tmp/<task>/`: checkpoints, traces, screens, rejected candidates.
`research/runs/<task>/` keeps only what a later run reads (a selected model with its
normalisation and configuration, rows a comparison reuses) and a README naming each file. A file
loose in `research/runs/`, a folder there with no README or an entry its README does not name, or
a folder over 1,000 files or 1 GB is a stray `npm run clean` lists. `npm run evaluate` keeps
played rows in `.cache/evaluations/<id>/` and its results, a few numbers a trial, in
`assets/evaluations/<id>.json`, committed with the change they read
([the architecture](../architecture.md#evaluations)). A pooled environment keeps
its starts in `.cache/starts/<evaluation>/<protocol>/learner-<name>/`, each found again by its
condition whatever commit played it (about 0.3 MB a start); deleting that folder plays them
again. A start holds the minds' memory as it was saved, the learner's inputs among them: a
layout given more inputs, or a skill's state given a field, loads none of them ("that save's
memory ... is built otherwise by this code"), so move the learner's folders aside with the change.
What a skill reads afresh from the senses every step is no memory and stays out of its state.

When a checkpoint is chosen, copy its `model-<n>.zip`, `normalize-<n>.pkl`, `policy-<n>.json`,
`layout.json` and the run's config to `research/runs/<task>/<name>/`, and add a line for it to
`research/runs/<task>/README.md`. The rest of `.tmp/<task>/<run>/` is deleted with the task. A
dropped run keeps nothing; its reading goes in the commit message.

## Traps

- **Developing on starts the game does not give**: a sit-back handover finished more of the Rise
  drill's trials, none slower, and its stand-up rows were still worse: on the Warrior's falls its
  front-sit-back failed after a roll from states the drill's placed starts never hold
  (`55d4839f`). A change to a skill read on falls is developed on its drill's twin (the
  stand-up's: the way-up drill's `fresh` falls), its cells' falls held out.
- **Installing a record change on the profiles of the record before it**: a profile is found by
  its skill and its body, not by its record, so the game's Mind goes on pricing the skill by the
  trials of the record replaced. Refresh the body's
  (`node research/skills/recovery/edge-profiles.mjs --model <body> --write`)
  in the change that installs the record. The table reads no profile, so its reading neither
  waits on nor moves with them.

### In training

- Removing the actor to read the native controller after a learned warm-up: the controller
  alone may not continue from the state the actor left, and its failure is then the removal's.
- One decision that plays many world steps (an action's windup before its first steer, a return
  played to the reader's end) under SAC, which steps every environment together: each decision
  waits on the longest, and the run slows to a fraction of one environment's rate times the
  workers. PPO's workers play their rollouts on their own and meet once a rollout. Measure one
  pooled environment's rate (decisions over its stepping and idle time) and compare it with the
  first chunk's.
- A world step costs what it costs whichever decision it serves: the steps played on after the
  learner stops (to the reader's end) and a pooled start's walk in are most of a strike run's
  machine time. Count them (train.log's world steps over its decisions) before pricing a run.
- A pooled start whose reader begins after the action did: the reader misses what it reads at the
  action's beginning (where the hand rests at guard), and the reward reads a different trial from
  the checkpoint reading's. Check parity on the pooled environment, not only a fresh one.
- A fight moment read to the reader's end with the learner answered nought once it stops: the
  mind throws again before the reading's blow lands, so the reward pays a blow no actor steered
  (166 nought requests in one of `moving`'s episodes). Steer the learner run again as the
  episode's next decision (`again`), and pay each blow as it lands (the Strike drill's `dealt`).
