# Developing a skill

How a skill is made, every time: one procedure, the rules that bind each step, and the rules every
reading and training run follows. What each approach has done and found is in
[the approaches](../approaches.md); [the table](../reference/the-table.md) is how a skill is read.
Where the owner asks for something else, the owner's words decide.

## The procedure

The owner, 2026-11-25: "our standard approach is to make the movement using authored code, to make
it work some of the time, and then to ttune that with machine learning"; "i want *you* to develop
the skills, not me". The push kick was searched for days with no one looking at it, and its frames
showed a body flinging itself back.

1. **Author** the movement. 2. **Look** at it. 3. **Make it work some of the time**, by hand.
4. **Tune** only its timings and gains. 5. **Install and confirm** it.

Each step's output is the next step's input. A step that fails goes back to step 1, never on.

### 1. Author the movement

- **From how a person does the motion**, in code, as stages and settings. Name the mechanism that
  makes it (foot placement from balance for a start or a stop, timed pushes or paths for a blow)
  and check it against [the approaches](../approaches.md).
- **The simplest controller that can make it**: a schedule of timed pushes or timed paths over a
  posture, a gait, a stance (the stomp, `41c828d4`; the front kick, `42b7a9aac`).
- **A skill says where it leaves its body** (`AsSkill.ends`, `src/parts/parts.ts`): standing, or
  the ground position a skill done on the ground ends in (`1f0b04d3e`).
- **A step and a strike are each a skill**, met by the Mind and the Move, never a strike made again
  for each step (the owner: "step back, step forward, punch, sword").
- **One act an Option**: one skill used one way, as the item is really used. No Option switches
  acts by a setting. One Mind runs every body, everything it does an Option, with no special case.
- **No body is named in control code.** A character's own logic is a variation of the skill it
  holds (`Part.variations`, [the architecture](../architecture.md)). A variation's settings are a
  record per body holding only what it reads (`SkillRecord`, `96a34f45e`); never a controller per
  loadout. A change to one variation moves only the fingerprint cases that run it (`--variation`).
- **Where a skill asks the body at its limit, find what the body can do first**: its channels
  pushed flat out, searched on its value (`punch-drill.mjs`), a scale and never a gate. A body that
  cannot is changed here (a tuned `SOURCES` entry), never after a controller is built on it.
- **A form term allows the mechanism its figure needs** (a club's whip, a run's flight).

### 2. Look at it

- **`npm run look -- <body> <skill/variation>`** plays it on its drill and draws strips at each
  change of stage in `research/looks/<body>/<variation>/<code>/`. Read them against how a person
  does the motion and write `verdict.md` beside them. Git keeps the verdict and `look.json`; the
  command redraws the strips (`19f485bf7`).
- **No search starts without a verdict at its code as it is now** saying "Looks like the motion:
  yes" and "Works some of the time: yes" (`requireLook`, `research/look-gate.mjs`, `1f0b04d3e`).
  Frames that do not look like the motion send it back to step 1.
- **Looked at again before it is called better.**
- **See the striking point touch the target in a trace** before anything is tuned: the rat's
  incisors sat inside its skull capsule and every bite closed on nothing (`INCISORS_CLEAR`).

### 3. Make it work some of the time

By hand, on its drill, read by its score ([a skill's value](#a-skills-value)):

- **It lands, or reaches what its drill asks, on some trials, and ends where it says** (`AsSkill.ends`).
  A trial that ends elsewhere scores no better than doing nothing (`searchScore`).
- **Show the reader scoring the visible failure low**, for a physical reason.
- **The primary screen first**: one fixture, one hand, one loadout, one rate. The rest is step 5.
- **A test asks only what the skill offers**: the marks, limbs and loadouts its Option offers
  (`caseFaults`, `strikesBy`). Orders it does not take read as a missing skill (`9dd4c338`,
  `0b866060`, `046bb933`).
- **Judged on itself, at a target that lets it happen**, as a punch on a pad. A foe's guard is the
  fight's question and never parks or caps a skill.
- **One that succeeds on none is not tuned**: search and training on it stay flat (the sword
  thrust, `7cd65504`, `39588333`, `d70fdeeb`; the Rogue's club, `e0bbce4a`; the Skeleton's punch,
  `8ed9abf4`).

### 4. Tune its timings and gains

- **Only timings and gains, never its shape.**
- **A search is CMA-ES on its drill's twin** (`cmaSearch`; a record's settings by
  `research/skills/skill-search.mjs`, `SEARCHES`), ranking its candidates as its confirmation
  keeps a best: fewer trials lost, then the score. Ranked by the score alone, a search climbed by
  landing more while falling more, toward a best the confirmation refuses. Hand-picked variants are not a search. Given no
  clock or count, it runs to its plateau (`--patience 30`). Price it from its first generation.
- **Its best is looked at again before it is written** (`npm run look -- <body> <variation>
  --tuning <its settings>`; `--write` refuses without that verdict).
- **It ends better** (installed), **flat** (the record kept: this search stopped finding gains,
  never "nothing better exists") **or unfinished** (copied to `research/runs/<skill>-search/` with
  a README and resumed by `--resume`). Its report says which.
- **A run whose readings already answer it is stopped at once**: the owner, "My goal is fast
  development velocity, running things that can't work for no reason makes no sense".
- **A learned actor over it** where an open-loop schedule is too narrow (one lands within about 2 cm
  of its searched distance, `166c1e54`): one PPO actor correcting the controller, by
  [Training](#training) (the run, `1e4dd787`; the punch, `35b6998e`; the club, `4a2354fe`). It adds
  to the controller's pushes and asks its stance (`0b5af8eb`, `7d9ee206`), from scratch or this
  skill's own earlier actor (`d6154220`, `e0bbce4a`).

### 5. Install and confirm

- **Widen one case at a time** (the other hand, loadouts, approaches, moving targets, misses),
  keeping the earlier cases in the mix.
- **Confirm once on the cells' cases at 120 and 480 Hz.**
- **Register it** (its Option kind in `OPTION_KINDS`; a way up's technique with its `purpose`): a
  Mind naming no Options fights by every registered one (`optionsOf`), so there is no list.
- **Install its record and its profiles in one change.** A strike's profiles rest on
  `sparring-drawn` and `sparring-judge` (`strike-profiles.mjs --write`, `54dc338cc`); a way up's
  on `edge-profiles.mjs --write`. A profile is found by skill and body, not record.
- **Play its table cells** (`npm run evaluate -- table --body <model> --skill <name> --fresh`). A
  drill gain with no cell moved is a skill the game does not use, and a search's figure is never
  the skill's until it is installed and chosen.
- **A skill is just a skill**: in every Mind that can use it by that Mind's config, never behind a
  preset or a helper of its own.

## Every step

### A skill's value

- **What the skill gains in play, in the game's terms** (the time an order takes, the life a blow
  takes and costs, the life a guard keeps), read paired against the version before, beyond one
  version's spread read twice. A fall is priced as its time down and its rising. Its first reading
  is its baseline (`npm run evaluate -- table --baseline`).
- **One graded score a trial**, the search's objective and the training reward alike. Form is
  graded by nearness, never pass or fail; a blow that did not land scores up to 0.05 hp a second
  below its value by how near it came (`searchScore`, `research/drill-trials.mjs`).
- **Read physical facts** (contact by collider, speed, energy, path, falls), never an executor's
  phase labels.
- **A blow's worth is the mass behind it**: speed or touch alone accepts nudges (`54a592aa`,
  `127eb165`, `ed11435a`); energy alone gives motions the owner rejects (`a6e778e2`, `abfa50e3`);
  bout wins and Elo do not measure a strike.
- **No fixed pass-or-fail number without a baseline**: such bars were missed or moved to fit
  (`7db04797`, `bcd4f589`, `1d958355`, `41766c12`).
- **A change to the body, its contacts, the engine, the rate or the command delay voids its
  schedules, records, actors and profiles** (`d22b1c7a`, `735962c8`, `9e7d7603`, `5e9208e9`,
  `de9d8496`).
- **A bug is fixed to its own layer's contract**; what it breaks above is fixed next, each cell
  that drops named in the commit.
- **Reference figures are a scale**, reported beside a reading; they decide nothing.

### Research scores on its drill

- **A search, a training run or a screen plays its drill's training twin** on the drills' Mind
  (`option-drill`) at 120 Hz, the game's rate; as its best rises (at most every ten generations)
  that best is read at 480 Hz in the background, and one losing more trials there is told at once.
  The cells' own cases are held out and played once at 120 and 480 Hz before a record is kept, the
  worse counting. Every damped aim is exact over the world's step (`damping`,
  `src/control/approach.ts`), so a response is a time, alike at every rate; the 480 Hz confirmation
  stays for the engine's own step. A record failing at 480 Hz is a dependence on the rate: find the
  setting or mechanism that differs between the two, fix it at its root, and resume the search
  (the front kick's best, asking a path response of 13 ms under the explicit step that was there,
  read 0.33 at 120 Hz with 1 fall in 32 and fell in 21 at 480; exact, 0.10 with 17 falls and
  0.07 with 16). A situation only research plays is a gap, closed by adding it to the drill.
- **Drills read no profile and search no tree**; profiles and the tree are a fight's.
- **A profile measures an Option's outcomes, falls among them**, from blows thrown sparring
  (`sparring`, `sparring-laid`). What it read the foe do is the foe's Mind's: read that before
  pricing a range by it ([the approaches](../approaches.md#minds)).
- **A part that reads a skill's record reads the search's tuning too** (`aimFor`,
  `src/minds/option/options/strike-kinds.ts`): the bite's aim read the record while the search tuned the executor.
- **A skill read on falls is developed on its drill's twin** (the way-up drill's `fresh` falls):
  placed starts never hold what the game's falls do (`55d4839f`).

### Comparing figures

- **Minds alike**: the same scenarios, bodies, physics, assists and scoring; a claim is
  `npm run match`, and a figure from another commit is read again.
- **Name the harness** (Node or page, engine, rate); never one seed; a conclusion is void once its
  reference is corrected.
- **Only the game's engine, rate and command delay count** (`66a46676`, `4acb557d`).
- **A strike's setting is believed on 24 to 48 bouts at gaps that did not choose it** (`8f55482d5`).
- **A bar is the owner's words**, its skill and baseline one command's protocols on the same
  trials (`--ablate`; `eb65bd3a6`).
- **A drill's own orders may make its figure**: read where the skill stood when each blow came.

## Training

How a skill's learned actor is trained: `research/run-train.py` (PPO) against
`research/run-learning-server.mjs`, once step 3 holds. A step skipped is the usual reason a run
teaches nothing.

- **One actor, one environment**: one actor steers every phase it covers; a weak phase gets more
  episodes, never a second actor (`7db04797`). The controller under it stays fixed while it trains.

Before the first run:

1. **The plan names the value and its development cases**, taken from the game: 8 or more a phase,
   varied in start, side, direction and target, none a training episode's exact start.
2. **The seed's baseline**: a kept actor (`research/runs/<task>/README.md`) played once on those cases.
3. **A changed body, observation, action, timing or controller makes a seed, not a reading**:
   retrain it 2 to 5 M decisions (`--start`, `--start-layout`, `--critic-first`), inputs added under
   `--freeze-normalization` (`52776b0a9`). A run waits for the finished design.
4. **A starting spread the seed survives** (`--log-std`), noted in the plan.
5. **Starts are reached states**, warm-ups played and cached; never a set velocity or pose.
6. **The reward is the value the checkpoints are ranked by**; an episode ended by a fall is charged
   the rest of its value.
7. **Parity once per environment**: the seed reproduces the game step for step
   (`research/learner-adapter.mjs`), on the pooled environment too.

The run:

```powershell
.tools/ai-lab-venv/Scripts/python.exe research/run-train.py --config .tmp/<task>/<run>/config.json --output .tmp/<task>/<run>
```

- **The defaults** (256 hidden, learning rate 3e-4, 20 M decisions, a checkpoint every 1 M), changed
  only for a named reason; `workers` set to the logical processors.
- **Priced from the first chunk**, world steps over decisions counted; slower than 1 M decisions in
  45 minutes is profiled (`--profile`) first.
- **Not judged before 2 M decisions**; read the trend of the value's `--keywords`, not the last line.
- **One run, one question**: a reward or curriculum change is a new run from a kept checkpoint.

### Choosing a checkpoint

1. **Play every kept checkpoint on the development cases**; training return never chooses, and
   held-out cases are played once, on the chosen one.
2. **The best by the value over every phase trained so far**; often not the last.
3. **Install it at once and play it in the game**, with its own profiles (`8f55482d5`); a failure
   there is a case the plan lacks. An install the owner asks to watch is made once.
4. **Polish**: resume it into a new folder for 2 to 5 M decisions at `--lr 1e-4`.
5. **Kept when the value rises against the baseline**, paired on the same cases, each loss named.

The curriculum and plateaus:

- **Stages add phases in order** (the core act, entering it, leaving it, variations, the game's
  situations, loadouts and disturbances), each resuming the last stage's checkpoint with its
  episodes kept in the mix, about half. A phase the seed already does is in from the first stage.
- **A stage opens only when some of its cases succeed**; a phase that nearly always fails teaches
  avoiding it. Within a phase, the smallest change first.
- **A plateau is 5 M decisions without a kept gain.** Check the environment first: most failed runs
  were its defects (`5e20a7f2`, `d7a61762`, `ca7203c0`, `7db22ea2`). Then change one thing as a new
  run. A controller retuned under an actor is judged only after the actor is retrained on it.
- **Under SAC a long decision stalls every environment**; PPO's workers do not wait on each other.
- **The learner steered again as an episode's next decision** (`again`), each blow paid as it lands
  (`dealt`).

## What to keep

A run's output goes to `.tmp/<task>/`, deleted with the task. `research/runs/<task>/` keeps only
what a later run reads (a chosen `model-<n>.zip`, `normalize-<n>.pkl`, `policy-<n>.json`,
`layout.json` and config; rows a comparison reuses) and a README naming each file; it is outside
Git, and `npm run clean` lists its strays. A dropped run keeps nothing; its reading goes in the
commit message. `npm run evaluate` keeps played rows in `.cache/evaluations/<id>/` and its results
in `assets/evaluations/<id>.json` ([the architecture](../architecture.md#evaluations)). A pooled
environment's starts (`.cache/starts/`) hold the minds' memory as saved: a layout or skill state
given a field loads none of them, so move the learner's folders aside with the change.

## Traps

- **Removing the actor to read its controller after a learned warm-up**: the controller may not
  continue from where the actor left it, and its failure is then the removal's.
- **A source copied into a run's folder** imports the live `src` and nothing type-checks it.
- **A fall in a fight blamed on the foe**: trace one before reading a fight's falls (what
  touched the body, and what its gait was asked). The rat's trot, asked to back off a foe it
  faced, trod in place and tipped over with the man touching nothing (`425cc6643`).
