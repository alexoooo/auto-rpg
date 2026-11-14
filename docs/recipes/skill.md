# Developing a skill

How a skill goes from a request to something the owner sees in the game: the rules every piece of
skill work keeps, then the steps in order. Skill work is any change to a skill, an Option, a
body's control, a training run or a table cell. Read this page before starting it; its rules bind
as [AGENTS.md](../../AGENTS.md)'s do, and a run's files go where
[the training recipe](training.md#what-to-keep) says. [The training recipe](training.md) is the steps' last part,
[the table](../reference/the-table.md) is how a skill is read, and
[the approaches](../approaches.md) is what has been tried.

## The rules

### One row, one question

- **A run works one question on one skill on one body**: one row of
  [the table](../reference/the-table.md), its loadouts the cells, from a brief the owner approved
  ([AGENTS.md](../../AGENTS.md#the-rules)). It ends at its question, or at its budget where it has one, and opens no
  other row. Its report is the table's lines for its row as the run began and as it ends
  (`npm run evaluate -- table --body <model> --skill <name>`), each cell better, worse or within
  noise, the worse ones first.
- **An iteration is one question**: one implementation changed, read paired against the one
  before (`--previous`, `npm run match`), kept or dropped with the reason in the commit message,
  and in the approaches when the reason is the mechanism's. A live alternative stays only while an
  open question uses it.
- **A run answers a decision**: name the question and what each answer would change first. Play
  only what the decision reads; screen small (one body, one loadout, calm air) and widen where it
  is close. Price a run from its first trials (a training run from its first chunk's rate, never
  its first returns). Keep what is played as rows and reuse them: a saved reading answers a
  question before a new one is played (`--by`).

### The approach

- **Choose an approach that can work.** Before a goal's work starts or changes direction, read its
  section of [the approaches](../approaches.md) and `git log -i --grep=<skill>`. The brief names
  the mechanism that does the part that fails today and the entries it was checked against; a
  ruled-out approach is taken up again only with evidence that its cause no longer holds. A
  mechanism that fails for a structural reason is replaced, never tuned.
- **An approach is stopped by its signal or the brief's budget.** Before an approach's work
  starts, name its signal (the reading that moves if its mechanism does the part that fails
  today) and the result that would show the mechanism cannot. Read the signal the cheapest way
  first: the failing part alone, on a few cases. An approach stops when its signal stays flat: a
  search or a training run at its recipe's plateau, other work after three changes of different
  kinds aimed at the named cause, each read doing what it was made to do; a change that breaks
  what it did not aim at has a defect, found and fixed before it counts. Its best is kept. At the budget the run stops with its signal
  reported, and going on is the owner's choice.
- **A failure's cause is reported with its evidence**: what the mechanism could not do, why, and
  whether the mechanism or its settings limit it. It becomes a constraint in
  [the approaches](../approaches.md) when the owner accepts it. A low reading is first a question
  about its test: whether the cases ask what the skill offers, against a target that lets it
  happen.

### What a change is kept on

- **A change is kept when it raises the skill's value.** The value is what the skill gains in
  play, in the game's own terms (the time an order takes, the life a blow takes and costs, the life
  a guard keeps), read on the game's cases paired against the version before, beyond the spread
  of one version read twice. Every effect is priced in it: a fall costs its time down, its rising
  and what is lost meanwhile. No figure is a gate and no effect vetoes a change; a change to a
  shared piece adds its gains and losses on every skill it touches and reports each. A skill's
  first reading when its work begins is its baseline (`npm run evaluate -- table --baseline`
  names it where the cell has none).
  Where an iteration brings no gain, its best is kept and the report says what its readings show
  limits it (the body, the controller or the drill).
- **What a change is judged on**: a record or a variant on its own body; a shared piece on every
  body. A change under a body (anatomy, engine, rate, timing) reads every skill on it in the same
  change, and its commit names each loss. A body a shared change sets back is searched again on the new code first; a setback that
  remains is a defect in its path or the reason it gets a record or a variant of its own, never
  the reason to reject the change; the architecture is never bent to spare a skill its retuning.
- **A bug is fixed to its own layer's contract**, never judged by a reading above it; what the fix
  breaks above is a defect there, fixed next in the same push. A table cell that drops meanwhile
  is named in the commit.
- **Reference figures are a scale**: a person's or one the owner names, reported beside each
  reading; they decide nothing.

### The claim

- **A claim that a skill is better is its table cell**: the cell's line from
  `npm run evaluate -- table`, read at the commit claimed (the commit its line shows), its value
  against its baseline and its Ratings link. The table plays the drills' Option Mind (`option-drill`: its
  priors, no profile, no tree search) with what is installed, so a skill the Mind does not use moves no cell and is reported as not in the game. A
  reading on a drill, a search or a training screen is progress toward a claim and never the claim.
  A check that shows a change works (the table cell, the fresh agent, the fingerprint) is never
  dropped to save time; time is saved on everything else.
- **A fresh agent checks a claim before it is reported**: a subagent given the claim and the
  cell's commands, and no account of the work, reads in Node alone: the cell's lines and its
  trials' outcomes from the saved results, failures first
  (`npm run evaluate -- table --body <model> --skill <name> --by <field>`), and the cell's cases
  at 480 Hz, played once. It says what
  the numbers show. The report carries its words beside the claim; where they contradict it, the
  claim is withdrawn. How a skill looks is the owner's to watch
  ([the roadmap](../roadmap.md#waiting-on-the-owner)), never an agent's to judge in a browser.
- **Compare minds alike**: the same scenarios, bodies, physics, assists and scoring, results by
  opponent, fresh cases to confirm a gain. A claim is `npm run match`; a mind's figure from
  another commit or protocol is read again before it is compared with another mind's.
- **Name the harness** of every figure (Node stand or page, engine, rate); say whether a peak was
  driven or struck; read the faster physics rate at the slower one's spacing; believe the stand
  over the fight; never one seed. A conclusion is void once its reference is corrected.

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
  a gap, closed by adding it to the drill. A probe (a rate the game does not run, a Balance or
  physique changed, a finer sample of what the drill holds) scores no skill.
- **One Mind for every body**: Option Mind runs one loop for every body, and everything it does is
  an Option, made and priced the same way, with no special case for any act.
- **One act an Option**: one skill used one way, its limbs, target and aim, as the item is really
  used (a club is swung; a sword cuts and thrusts). No Option switches between acts by a setting
  or bundles acts (walking over and striking): sequencing is the chooser's. What Options share is
  code they call, never a kind of Option that makes one of each.
- **No body is named in control code**: shared code (the framework, each area's `src/skills/<area>/shared/`)
  is general, every body through the same code. A skill specializes by Option first, then by
  variation: logic of a character's own is a variation of the skill that it holds, as many of one
  skill as it likes, a skill of any role (`Part.variations`)
  (`BodySpec.skills`), its own code in a folder only that skill's part imports
  (`src/skills/<area>/<skill>/<variation>/`, `scripts/source-boundary.mjs`). What skills and
  variations do alike is shared, never copied: one implementation in the area's `shared/` that each
  calls with its own settings and options, the variation's folder holding only what is its own. A variation's
  settings are a record per body (`SkillRecord`, `recordFault`), with entries per loadout where a
  loadout needs its own; a controller is never made per loadout. A change to one variation moves
  only the fingerprint cases that run it (`node scripts/fingerprint.mjs --compare <file>
  --variation <skill/variation>`).

## The steps

Each step's output is the next step's input; a step skipped is how days pass without a kept gain.
A skill that exists enters at the step its failing part belongs to.

### 1. The reader and its score

- **Read physical facts**: contact by collider, speed, energy, path, falls, where the limb ends.
  An executor's phase labels are not evidence.
- **One graded score a trial: the skill's value**
  ([What a change is kept on](#what-a-change-is-kept-on)), every effect priced in it, a fall at
  what it costs in play. Form the owner asks for (a blow's shape) is part of the score, graded by
  nearness, not a pass or fail. The same score is the search's objective, the training reward and
  the reading a change is kept on. A strike's value is sparse (a blow that does not land trades
  about nothing), so its search scores a trial by its value and a blow that did not land up to
  0.05 hp a second below it by how near it came to the bar (`searchScore`,
  `research/drill-trials.mjs`): candidates that land nothing still climb, and no nearness
  outweighs a landing.
- **Show the reader scoring the visible failure low**, for a physical reason, before anything is
  searched.
- **Build only the primary screen first**: the reader, one fixture, one hand, one loadout, one
  rate. Misses, cancellations, moving targets, repetitions, other hands, loadouts and rates come
  once the primary screen succeeds on some cases.
- **A test is built from the skill it tests**: its cases are the marks, limbs, bodies and
  loadouts the skill's Option offers (`caseFaults`, `strikesBy`), never a list shared with other
  skills. A case the skill does not offer is no case of it, and scores nothing.
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
- **A form term must allow the mechanism its figure needs.** A club's speed comes from a whip
  (shoulder, elbow, then a wrist cock and snap); a run's from flight. Declare that mechanism as a
  phase of the motion, so the form term reads it rather than forbids it.

### 3. A native controller that succeeds on some cases

- **Name the mechanism that makes the motion** (foot placement from balance for a start or a stop,
  timed pushes for a blow) and check it against [the approaches](../approaches.md). A controller
  without it is not searched or trained.
- **Start from the simplest controller that can make the motion**: a schedule of timed pushes
  (`src/skills/strikes/shared/timed-push.ts`) over a posture, a gait, a stance. A tracker following a
  declared course runs behind it by its response time; at a blow's speed that lag is the stroke.
- **Search it** with CMA-ES on its drill's twin, scored by the graded score, at 120 Hz; its
  confirmation plays the cells' cases at 120 and 480 Hz, the worse counting
  ([research scores on its drill](#an-options-code)). A hand-picked set of variants is not a search. Price the search from
  its first generation; a search learns over tens of generations. A plateau is thirty generations
  without a better best: a search still improving has gone nine between two bests. A search is
  given no clock and no count of generations: it runs for as long as it improves and ends on
  its plateau (`--patience 30`). A record's settings are searched by
  `research/skills/skill-search.mjs` (`SEARCHES`), which a skill joins with its settings, its
  drill's trials and a trial's score.
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
  ([the training recipe](training.md#what-to-keep)): nothing in it is added to a commit. One
  hand-made variant that fails is none of the three.
- **Before training, it succeeds on some held-out cases**: the sign the mechanism works. The straight punch's
  schedule landed 8 of 60 before training took it to 92 %. A controller that succeeds on none is
  not a seed: change the controller, or go back to feasibility. Training does not make up for it.

### 4. A learned actor over it

Follows [the training recipe](training.md). What is particular to a new skill:

- **The actor corrects the native controller**: it adds to its pushes and asks its stance. An
  output acts only through something that can move: a push on a leg bearing the body moves
  nothing, so the stance is asked instead.
- **The reward is the graded score of step 1**, and an episode is a trial of its drill's twin
  from saved starts at the action's first decision, at places the action's window admits.
- **Start from scratch or from this skill's own earlier actor.** Another skill's network starts
  behind scratch.

### 5. Widen and confirm

- Add what step 1 held back, one at a time, as episodes and cases of the twin: the other hand,
  loadouts, approaches, moving targets, misses and cancellations. Each keeps the earlier cases in
  the mix.
- Confirm once on the cells' cases at 120 and 480 Hz, on the chosen checkpoint or record.
- Register it in Option Mind, install its record in the game and build its profiles sparring
  (a strike's: the Strike drill's `sparring` and `sparring-laid` kept with `--json`, then
  `research/skills/strikes/strike-profiles.mjs --write`); a drill Commander using it alone does
  not show the Mind uses it.
- Play its table cells (`npm run evaluate -- table --body <model> --skill <name> --fresh`) and
  make [the claim](#the-claim); a good drill reading with a cell that did not move is a skill the
  game does not use.

## Traps

- **Filling a score's zeros with a new skill**: a low cell says its skill is weak or its test asks
  what the skill does not offer. It never asks for another skill; that is the owner's to ask.
- **A plan followed as the request**: a plan's line, a roadmap item or an earlier agent's handover
  says where things are. The request is the owner's words in the brief.
- **Infrastructure first**: readers and fixtures for every case before any trial succeeds. Each
  is right and none moves the skill.
- **An all-or-nothing objective**: with nothing met, every candidate ties and the search returns
  nothing to keep.
- **A fixed bar deciding what is kept**: a gain short of an arbitrary number is thrown away.
- **A form term that forbids the mechanism its figure needs.**
- **Developing on starts the game does not give**: a sit-back handover finished more of the Rise
  drill's trials, none slower, and its stand-up rows were still worse: on the Warrior's falls its
  front-sit-back failed after a roll from states the drill's placed starts never hold
  (`55d4839f`). A change to a skill read on falls is developed on its drill's twin (the
  stand-up's: the way-up drill's `fresh` falls), its cells' falls held out.
- **Reporting the drill**: the search's or the screen's figure given as the skill's, with the
  record never installed or the Mind never choosing it.
- **Installing a record change on stale profiles**: a technique's digest covers its body's whole
  record (`techniqueDigest`), every loadout included, so a change to one loadout's settings
  leaves every loadout of that body without its profiles, and the game's Mind prices it by hand.
  Refresh the body's (`node research/skills/recovery/edge-profiles.mjs --model <body> --write`)
  in the change that installs the record. The table reads no profile, so its reading neither
  waits on nor moves with them.
