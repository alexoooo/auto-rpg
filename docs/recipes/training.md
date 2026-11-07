# Training a skill

How a skill steered by a learned network (the run, the rise, the punch, the thrust) is trained:
`research/run-train.py` (PPO) against an environment served by `research/run-learning-server.mjs`.
Follow the steps in order. A step skipped is the usual reason a run teaches nothing.

## The shape: one skill, one actor

- **One actor steers the skill in every phase it covers.** For travel that is starting, holding a
  pace, changing pace, turning and stopping. A phase the actor does badly gets more of the
  curriculum's episodes. It never gets a second actor: switching between actors makes a handover,
  and handovers are where the falls land.
- **One environment trains it**, with episodes that mix every phase the current stage asks for.
  An episode is a script of orders (go, change pace, turn, stop) played through the configured
  Option Mind, as the game gives them.
- **The actor corrects a native controller** (a gait, a stance, a schedule) and decides on the
  learner's interval (`src/core/math/learning/learner.ts`). The native controller under it stays
  fixed while it trains.

## Before the first run

1. **Name the bar.** Write down the evaluation cases and gates that decide the question, the
   ones the plan names. Training reward never decides it.
2. **Find the seed.** Look in `research/runs/<task>/README.md` for a kept actor that already does
   part of the skill. Play it once on the current code through the evaluation's cases. Its
   reading is the baseline the run is compared with.
3. **Know what invalidates a seed.** A change to the body, the observation layout, the actions'
   meaning, the decision timing or the controller under the actor makes every trained actor a
   seed to retrain, never a reading. Budget 2 to 5 M decisions to bring it back, started with
   `--start`, `--start-layout` and `--critic-first`, then compare it with the baseline from step 2.
4. **Start from reached states.** Warm-ups are played on the body and cached
   (`warmStarts` and the environments' snapshots). Never set a velocity or a pose to make a start.
   A warm-up that falls or leaves its corridor is reported and excluded.
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
- **Price it from the first chunk**: train.log's decisions over its minutes gives the rate, and
  20 M at that rate is the run's time. Hours are normal; time alone never stops a run.
- **Do not judge before 2 M decisions.** Returns dip and recover in the first million. A
  locomotion actor learns over 5 to 40 M decisions. A block of a few hundred thousand decisions
  shows noise, not a result.
- Read train.log's trend over the last few million decisions: falls (`down`) and shortfall should
  fall. Read the trend, not the last line.
- One run answers one question. A reward or curriculum change is a new run from a kept
  checkpoint, compared with the run before it at the same decisions on the same cases.

## Choosing a checkpoint

1. Play every kept checkpoint (one per 1 M) on the bar's cases from step 1 of the first section.
   Training return does not choose: it can keep rising while the cases get worse.
2. Take the best by the gate reading: falls first, then each gate's figure. The last checkpoint
   is often not the best.
3. **Polish**: resume the best (`--resume`, `--lr 1e-4`) for 2 to 5 M decisions and screen again.
4. Compare the chosen checkpoint with the baseline, paired on the same cases
   (`npm run compare`). Keep it only if it gains without a loss elsewhere.

## The curriculum

- Stages add phases in order: sustain the skill from reached states, then entry from rest and
  changes, then stopping, then directions and turns, then loadouts and gusts.
- Each stage resumes from the previous stage's chosen checkpoint and **keeps the earlier stages'
  episodes in the mix**, so what was learned holds. Half the episodes from earlier stages is a
  sound start.
- A stage ends when its cases meet their gates on a screened checkpoint, or when it plateaus.

## Plateaus and changing direction

- **A plateau** is 5 M decisions (five kept checkpoints) with no screened gain.
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

## Review feedback

These are advisory observations and suggestions for review, not changes to the instructions above.

This recipe and the [Warrior travel plan](../plans/2026-11-05-warrior-travel.md) give a concrete path toward
progress. One actor across travel phases removes specialist-actor handovers; sustained training
budgets discourage abandoning runs on noisy returns; checkpoint selection by capability gates
keeps training reward from deciding success. Training through the configured Option Mind and
checking timing parity make the evidence relevant to the game.

The plan's first watched milestone, forward running and stopping, gives useful work to land
before every direction and loadout is solved. Preserving recovery without requiring its separate
ten-second target first keeps a meaningful guard without making that target an entry requirement.

Three practical concerns to consider:

- **Bootstrap order:** the travel plan asks for entry from rest before the unified environment,
  while the curriculum begins with reached moving states. Consider explicitly allowing that
  reached-state curriculum during restoration if entry training stalls. This would not establish
  that entry meets its gate.
- **Budget precedence:** a five-million-decision plateau can take longer than the repository's
  four-hour limit without a kept gain. Consider stating which rule governs that situation,
  including when the limit arrives before the initial two-million-decision allocation finishes.
- **Checkpoint selection:** `--resume` loads the output directory's `model.zip` and
  `normalize.pkl`; it does not select a numbered checkpoint. Consider specifying how to stage
  the chosen `model-<n>.zip` and matching `normalize-<n>.pkl` under those names, together with
  `layout.json`, in the next run's output directory.

Decision counts are starting budgets, not evidence that a run succeeds. One actor removes
specialist handovers but still needs a working controller and an environment that exposes the
failing cases. The recipe supplies enough direction to make modelling and training choices
without asking the owner to make them; execution remains the agent's responsibility.
