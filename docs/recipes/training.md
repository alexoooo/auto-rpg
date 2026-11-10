# Training a skill

How any skill steered by a learned network is trained: `research/run-train.py` (PPO) against an
environment served by `research/run-learning-server.mjs`. A new skill reaches this recipe through
[the skill recipe](skill.md), with a graded score and a native controller that already succeeds
on some cases. What is particular to one skill (its phases, its bar, its stages, its settings)
is its plan's; this recipe holds only the steps every skill's training takes.
Follow the steps in order. A step skipped is the usual reason a run teaches nothing.

## The shape: one skill, one actor

- **One actor steers the skill in every phase it covers.** A phase the actor does badly gets more
  of the curriculum's episodes, never a second actor: switching between actors makes a handover,
  and handovers are where the failures land.
- **One environment trains it**, with episodes that mix every phase the current stage asks for.
  An episode is a script of the orders the game gives the skill, played through the game's own
  mind, as the game gives them.
- **The actor corrects a native controller** and decides on the learner's interval
  (`src/core/math/learning/learner.ts`). The native controller under it stays fixed while it
  trains.

## Before the first run

1. **Name the bar from the game.** Write down, in the plan, the evaluation cases and gates that
   decide the question, taken from the situations the game puts the skill in and the orders it
   gives there, as it gives them. A case the game never produces is not on the bar, and training
   reward never decides it. The development cases that choose checkpoints hold several cases per
   phase (8 or more), varied in what the skill must handle: its starting state, its side, its
   direction, its target. One case flips with noise between checkpoints, and a case that is a
   training episode's exact start shows the actor's memory, not its skill.
2. **Find the seed.** Look in `research/runs/<task>/README.md` for a kept actor that already does
   part of the skill. Play it once on the current code through the bar's cases and a few cases of
   every phase the stages will train. Its reading is the baseline the run is compared with, and
   it says, phase by phase, what the seed already does and what it cannot yet start.
3. **Know what invalidates a seed.** A change to the body, the observation layout or the
   meaning of an input, the actions' meaning, the decision timing or the controller under the
   actor makes every trained actor a seed to retrain, never a reading. Budget 2 to 5 M decisions
   to bring it back, started with `--start`, `--start-layout` and `--critic-first`, then compare it
   with the baseline from step 2. Its input normalisation is measured anew on the new episodes:
   statistics frozen on a narrower mix saturate what it never saw.
4. **Start the spread at one the seed survives.** `--start` begins exploring at `--log-std`
   (default −1, a spread of 0.37), whatever the seed's own. Play the seed with that noise on each
   phase: where it fails in more than a few episodes, lower the spread until it does not, and
   note the setting in the plan. Failures caused by the noise teach the same avoidance as a phase
   that nearly always fails.
5. **Start from reached states.** Warm-ups are played on the body and cached as snapshots. Never
   set a velocity or a pose to make a start. A warm-up that fails is reported and excluded; a
   worker that reaches none of a kind of start plays the other episodes. Copy each delivered order
   into mutable world state so snapshot restores cannot rewrite the curriculum's scripts.
6. **Check the reward reads what the gate reads**: the same quantities, measured the same way,
   with the same failure predicate. Credit is per second and a failure costs once and ends the
   episode. **The return orders outcomes as the checkpoint ranking does**: every cost only takes
   credit away (the rate is floored at zero), and a failure costs more than any episode earns, so
   no episode is worse than one that fails; an outcome the gate counts as unmet but not failed
   ends the episode without that cost. A cost that can outgrow the failure's makes failing the
   cheaper way out.
7. **Check parity once per new environment.** The seed played through the environment reproduces
   the ordinary game's trajectory step for step (`research/learner-adapter.mjs` is the one loop).
   If it does not, fix the environment before training.

## The run

```powershell
.tools/ai-lab-venv/Scripts/python.exe research/run-train.py --config .tmp/<task>/<run>/config.json --output .tmp/<task>/<run>
```

- Output goes to `.tmp/<task>/<run>/`, never `research/runs/`.
- Keep the defaults: PPO, 256 hidden (a `--start` takes its seed's width), learning rate 3e-4,
  20 M decisions (`--steps`), a kept checkpoint every 1 M (`--keep`). Change one only for a named
  reason.
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
  should improve. Read the trend, not the last line.
- One run answers one question. A reward or curriculum change is a new run from a kept
  checkpoint, compared with the run before it at the same decisions on the same cases.

## Choosing a checkpoint

1. Play every kept checkpoint (one per 1 M) on the bar's development cases from step 1 of the
   first section, as it lands. Training return does not choose: it can keep rising while the
   cases get worse. Reserved or confirmation cases never rank checkpoints: they are played once,
   on the chosen one.
2. Take the best by the gate reading of every phase trained so far, the earlier stages'
   included: failures first, then cases met, then each gate's figure. A phase no stage has
   trained yet is read and reported, but ranks nothing: its outcome is chance. The last
   checkpoint is often not the best.
3. **Install it in the game at once**, commit it, and play it there, in the screens that use the
   skill. The owner sees a skill only in the game, and the game finds what the cases missed: a
   failure there that the cases do not have is a case the bar lacks, added before the next run.
4. **Polish**: resume the best into a new output for 2 to 5 M decisions and screen again:
   `--resume .tmp/<task>/<run>/model-<n>.zip --output .tmp/<task>/<run>-polish --lr 1e-4 --steps 3000000`.
   A checkpoint resumes only into another folder; decisions count on from its own.
5. Compare the chosen checkpoint with the baseline, paired on the same cases
   (`npm run compare`). Keep it only if it gains without a loss elsewhere. The limits the skill
   publishes, which the game plans by, are what it holds on the bar's cases, never what its
   training asked.

## The curriculum

- Stages add phases in order: the skill's core act from reached states; then entering it, from
  rest and from the acts that lead into it; then leaving it; then its variations; then the
  game's situations as the game gives them; then loadouts and disturbances. A plan names its
  skill's stages in that order.
- **A phase the seed already does is in the mix from the first stage.** A stage without it
  trains it away, and the next stage spends millions of decisions winning it back.
- **A stage opens only when some of its cases already succeed**, played by the checkpoint it
  starts from. A phase that nearly always fails teaches the actor to avoid it, not to do it.
  When none succeed, open an easier stage first, or develop the native controller under it by
  [the skill recipe](skill.md#3-a-native-controller-that-succeeds-on-some-cases).
- **Within a phase, the smallest change comes first**, and the next size is added once the
  smaller one succeeds on the development cases.
- Each stage resumes from the previous stage's chosen checkpoint
  (`--resume <checkpoint> --output <stage folder>` with the stage's config) and **keeps every
  earlier stage's episodes in the mix**, so what was learned holds. Half the episodes from earlier
  stages is a sound start.
- A stage ends when its cases meet their gates on a screened checkpoint, or when it plateaus.

## Plateaus and changing direction

- **A kept gain** is a screened checkpoint better than the best before it, by the order in
  [Choosing a checkpoint](#choosing-a-checkpoint). It restarts both the plateau count and the
  four-hour ceiling's clock.
- **A plateau** is 5 M decisions (five kept checkpoints) with no kept gain.
- On a plateau, check the environment before anything else: parity, reached starts, a reward
  that orders outcomes as the gate does, and episodes that contain the failing case. Most
  plateaus are an environment that never shows the actor the case it fails.
- Then change one thing (the curriculum's mix, a reward term, the observation) and run it as a
  new question. A phase that still succeeds on almost none of its cases is not a training
  question: go back to the curriculum's opening rule.
- Native-controller tuning under a trained actor is judged only after the actor is retrained on
  it. Without that retraining the reading measures the actor outside the states it learned on.

## What to keep

When a checkpoint is chosen, copy its `model-<n>.zip`, `normalize-<n>.pkl`, `policy-<n>.json`,
`layout.json` and the run's config to `research/runs/<task>/<name>/`, and add a line for it to
`research/runs/<task>/README.md`. The rest of `.tmp/<task>/<run>/` is deleted with the task. A
dropped run keeps nothing; its reading goes in the commit message.

## Traps

- A bar of the training's own orders: an actor meets every gate it was trained on and fails on
  the first situation the game gives it, because no stage and no case gave it.
- A stage that starts from another seed than the previous stage's chosen checkpoint, or whose mix
  leaves out an earlier stage: each stage undoes the last.
- Removing the actor to read the native controller after a learned warm-up: the controller
  alone may not continue from the state the actor left, and its failure is then the removal's.
- A phase that nearly always fails, its failure costing more than the phase earns: the actor
  learns to avoid it and gives up its other phases to fail less. Returns rise while the skill
  gets worse.
- Short blocks judged and rejected one after another: each looks like failure, and none runs
  long enough to learn.
- A new actor for each phase: the failures move to the handovers.
- A series of reward weights, each tried briefly: no run tells you anything about any of them.
- Fixing the controller under a trained actor and reading the actor unchanged: the actor no
  longer fits, and the reading blames the fix.
- One decision that plays many world steps (an action's windup before its first steer, a return
  played to the reader's end): the trainer steps every environment together, so each decision
  waits on the longest, and the run slows to a fraction of one environment's rate times the
  workers. Measure one pooled environment's rate (decisions over its stepping and idle time) and
  compare it with the first chunk's.
- A pooled start whose reader begins after the action did: the reader misses what it reads at the
  action's beginning (where the hand rests at guard), and the reward reads a different trial from
  the gate's. Check parity on the pooled environment, not only a fresh one.
- The default starting spread on a correction to an open-loop schedule: noise on every channel
  each decision breaks the schedule it corrects. Measure the landed share at a few spreads with
  random steers before the run, and start where most still land.
- Infrastructure work in the middle of a training question: finish or pause the question first,
  and retrain after it (step 3 of the first section).
