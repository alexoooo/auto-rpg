# Training a skill

How a skill steered by a learned network (the run, the rise, the punch, the thrust) is trained:
`research/run-train.py` (PPO) against an environment served by `research/run-learning-server.mjs`.
A new skill reaches this recipe through [the skill recipe](skill.md), with a graded score and a
native controller that already succeeds on some cases.
Follow the steps in order. A step skipped is the usual reason a run teaches nothing.

## The shape: one skill, one actor

- **One actor steers the skill in every phase it covers**: for travel, starting, holding a pace,
  changing pace, turning and stopping; for a blow, its approach, the strike and settling after it.
  A phase the actor does badly gets more of the curriculum's episodes. It never gets a second actor: switching between actors makes a handover,
  and handovers are where the falls land.
- **One environment trains it**, with episodes that mix every phase the current stage asks for.
  An episode is a script of orders (for travel: go, change pace, turn, stop) played through the
  configured Option Mind, as the game gives them.
- **The actor corrects a native controller** (a gait, a stance, a schedule) and decides on the
  learner's interval (`src/core/math/learning/learner.ts`). The native controller under it stays
  fixed while it trains.

## Before the first run

1. **Name the bar.** Write down the evaluation cases and gates that decide the question, the
   ones the plan names. Training reward never decides it. The development cases that choose
   checkpoints hold several cases per phase (8 or more), varied in what the skill must handle:
   starting pose, first leg, heading, place. One case flips with noise between checkpoints, and
   a case that is a training episode's exact start shows the actor's memory, not its skill.
2. **Find the seed.** Look in `research/runs/<task>/README.md` for a kept actor that already does
   part of the skill. Play it once on the current code through the evaluation's cases. Its
   reading is the baseline the run is compared with.
3. **Know what invalidates a seed.** A change to the body, the observation layout, the actions'
   meaning, the decision timing or the controller under the actor makes every trained actor a
   seed to retrain, never a reading. Budget 2 to 5 M decisions to bring it back, started with
   `--start`, `--start-layout` and `--critic-first`, then compare it with the baseline from step 2.
4. **Start from reached states.** Warm-ups are played on the body and cached
   (`warmStarts` and the environments' snapshots). Never set a velocity or a pose to make a start.
   A warm-up that falls or leaves its corridor is reported and excluded. Copy each delivered
   order into mutable world state so snapshot restores cannot rewrite the curriculum's scripts.
5. **Check the reward reads what the gate reads**: the same speed (centre of mass, along the
   requested direction), the same fall predicate, the same corridor. Credit is per second,
   progress is a share of the requested pace, and a fall costs once and ends the episode.
6. **Check parity once per new environment.** The seed played through the environment reproduces
   the ordinary game's trajectory step for step (`research/learner-adapter.mjs` is the one loop).
   If it does not, fix the environment before training.

## The run

```powershell
.tools/ai-lab-venv/Scripts/python.exe research/run-train.py --config .tmp/<task>/<run>/config.json --output .tmp/<task>/<run>
```

- Output goes to `.tmp/<task>/<run>/`, never `research/runs/`.
- Keep the defaults: PPO, 256 hidden, learning rate 3e-4, 20 M decisions (`--steps`), a kept
  checkpoint every 1 M (`--keep`). Change one only for a named reason.
- **Set the config's `workers` to the machine's logical processors.** The server's default of 8
  leaves most of a large machine idle, and the rate scales with workers.
- **Price it from the first chunk**: train.log's decisions over its minutes gives the rate, and
  20 M at that rate is the run's time. Hours are normal; time alone never stops a run that is
  still gaining.
- **A run slower than 1 M decisions in 45 minutes is sped up before its question opens**: its
  plateau (below) would outlast [the four-hour ceiling](../../AGENTS.md#doing-the-work), so the
  run could never be judged. `--profile` shows whether the environment or the learner is the wait.
- **Do not judge before 2 M decisions.** Returns dip and recover in the first million. An actor
  learns over 3 to 50 M decisions, depending on the skill. A block of a few hundred thousand
  decisions shows noise, not a result.
- Read train.log's trend over the last few million decisions: the `--keywords` the gate reads
  (for travel, falls `down` and shortfall) should improve. Read the trend, not the last line.
- One run answers one question. A reward or curriculum change is a new run from a kept
  checkpoint, compared with the run before it at the same decisions on the same cases.

## Choosing a checkpoint

1. Play every kept checkpoint (one per 1 M) on the bar's development cases from step 1 of the
   first section. Training return does not choose: it can keep rising while the cases get worse.
   Reserved or confirmation cases never rank checkpoints: they are played once, on the chosen one.
2. Take the best by the gate reading of the phases trained so far: falls first, then each gate's
   figure. A phase no stage has trained yet (a stop before the stop stage) is read and reported,
   but ranks nothing: its outcome is chance. The last checkpoint is often not the best.
3. **Polish**: resume the best into a new output for 2 to 5 M decisions and screen again:
   `--resume .tmp/<task>/<run>/model-<n>.zip --output .tmp/<task>/<run>-polish --lr 1e-4 --steps 3000000`.
   A checkpoint resumes only into another folder; decisions count on from its own.
4. Compare the chosen checkpoint with the baseline, paired on the same cases
   (`npm run compare`). Keep it only if it gains without a loss elsewhere.

## The curriculum

- Stages add phases in order: the skill's core act from reached states; then entering it, from
  rest and from the acts that lead into it; then leaving it (stopping, settling); then its
  variations (directions, targets, turns); then loadouts and disturbances (gusts). A plan names
  its skill's stages in that order.
- **A phase the seed already does is in the mix from the first stage.** A stage without it
  trains it away, and the next stage spends millions of decisions winning it back.
- Each stage resumes from the previous stage's chosen checkpoint
  (`--resume <checkpoint> --output <stage folder>` with the stage's config) and **keeps the
  earlier stages' episodes in the mix**, so what was learned holds. Half the episodes from earlier
  stages is a sound start.
- A stage ends when its cases meet their gates on a screened checkpoint, or when it plateaus.

## Plateaus and changing direction

- **A kept gain** is a screened checkpoint better than the best before it, by the order in
  [Choosing a checkpoint](#choosing-a-checkpoint). It restarts both the plateau count and the
  four-hour ceiling's clock.
- **A plateau** is 5 M decisions (five kept checkpoints) with no kept gain.
- On a plateau, check the environment before anything else: parity, reached starts, a reward
  that reads what the gate reads, and episodes that contain the failing case. Most plateaus are
  an environment that never shows the actor the case it fails.
- Then change one thing (the curriculum's mix, a reward term, the observation) and run it as a
  new question.
- Native-controller tuning under a trained actor is judged only after the actor is retrained on
  it. Without that retraining the reading measures the actor outside the states it learned on.

## What to keep

When a checkpoint is chosen, copy its `model-<n>.zip`, `normalize-<n>.pkl`, `policy-<n>.json`,
`layout.json` and the run's config to `research/runs/<task>/<name>/`, and add a line for it to
`research/runs/<task>/README.md`. The rest of `.tmp/<task>/<run>/` is deleted with the task. A
dropped run keeps nothing; its reading goes in the commit message.

## Traps

- Short blocks judged and rejected one after another: each looks like failure, and none runs
  long enough to learn.
- A new actor for each phase (velocity, low-speed, braking, turning): the failures move to the
  handovers.
- A series of reward weights, each tried briefly: no run tells you anything about any of them.
- Fixing the controller under a trained actor and reading the actor unchanged: the actor no
  longer fits, and the reading blames the fix.
- Infrastructure work in the middle of a training question: finish or pause the question first,
  and retrain after it (step 3 of the first section).
