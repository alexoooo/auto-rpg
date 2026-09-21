# Next-wave combat laboratory

This is experimental infrastructure, not a new set of promoted champions. It runs the game's
real Havok simulation and the same `Intent` boundary as the player. No physics, motor ceilings,
damage rules or shipped policies are changed. Dated arena ratings remain available.

## Setup and bounded runs

Use Node from the game and an isolated Python 3.13 environment for learning:

```powershell
python -m venv .tools/ai-lab-venv
.tools/ai-lab-venv/Scripts/python.exe -m pip install -r research/lab/requirements-lock.txt
```

The verified installation uses CPU PyTorch. The machine's NVIDIA GPU is not automatically used;
installing a CUDA build and benchmarking it is a separate resource choice. No packages are added
to the game's npm dependencies. The lock lists transitive Python versions; `requirements.txt`
records the five direct dependencies.

All commands below use the shared one-hour pilot budget in `research/runs/wave2-budget/`.
Individual commands refuse allowances above ten minutes. One command owns the budget lock at a
time; deadlines, errors and interruptions retain their compute charges. Do not remove the budget
file to obtain more compute. Longer work needs a newly approved resource budget and an explicit
budget-policy change. A changed source fingerprint requires a new experiment directory, but does
not reset the shared budget. Raw artifacts are ignored by Git.

```powershell
node research/lab/cli.mjs collect --dir research/runs/my-lab --duration 10 --seconds 60
node research/lab/cli.mjs oracle --dir research/runs/my-lab --index 12 --seconds 120
node research/lab/cli.mjs fair --dir research/runs/my-lab --seconds 30
node research/lab/cli.mjs refit --dir research/runs/my-lab --bouts 4 --seconds 120
node research/lab/cli.mjs train --dir research/runs/my-lab --method ppo --seconds 120
node research/lab/cli.mjs train --dir research/runs/my-lab --method neat --seconds 120
node research/lab/cli.mjs train --dir research/runs/my-lab --method evolution --seconds 120
node research/lab/cli.mjs train --dir research/runs/my-lab --method ppo --surface direct --seconds 120
node research/lab/cli.mjs train --dir research/runs/my-lab --method ppo --surface residual --seconds 120
```

`--duration` for training sets the episode time limit (default 150 seconds). Short episodes are
smoke tests, not equivalent league bouts: they often truncate with no terminal reward. Results
always distinguish termination from truncation. PPO receives terminal win/draw/loss reward only;
there is no secretly shaped reward for attack frequency, staying close or looking active.

The smoke defaults deliberately use small networks and populations. A single short seed is not
an algorithm comparison. Use equal declared budgets, several training seeds and untouched test
batches before claiming superiority.

## Interfaces and reproducibility

`createBout` adds `step`, `result`, `finish` and idempotent `dispose` around the existing harness.
The original `runBout` drives those exact methods and disposes on failure. A frame still advances
the fixed-step accumulator, then combat clocks and verdicts, in the original order.

`createEnvironment` provides an observation vector, `step(action)`, result/state and `close`.
Actions are held over 5 frames at 12 Hz (2/1 frames at 30/60 Hz). Each environment owns fresh
Havok; a second live environment in the same realm is refused. Parallelism must use isolated
workers. Publishing boundary observations does not begin an extra locomotion substep.

The version-1 observation is 48 named, fixed-scaled floats derived exclusively from `FighterView`:
relative placement/bearing, clock, range, vitality, body posture and both hands' reach, loss,
tip positions and velocities. It is deliberately a pilot observation set, not a claim that all
useful perception is represented. Additional body/weapon and natural-striker features are a
versioned follow-up experiment, not an unrecorded change to old models.

- `pilot`: 12 normalized outputs mapped to the existing nine tactical axes and three gates.
- `direct`: 22 outputs covering movement, posture, both hands and natural striker. Roll maps to
  radians, wrist bend/crouch to [0,1], and other continuous fields to their normalized range.
- `residual`: the same outputs correct Driver's commands by at most 0.25 per continuous field;
  button outputs within [-0.5,0.5] retain the original button. Lost hands receive neutral commands.

The browser-compatible model format contains version, exact ordered observation names, surface,
frequency and either dense tanh/linear layers or a topologically ordered feed-forward NEAT graph.
Import refuses invalid dimensions, non-finite weights and incompatible feature names. Training
exports deterministic PPO means, not its exploration distribution. A 32-input-vector parity
check is mandatory before export. A physical regression also compares externally supplied
network actions with the deployed policy on all three surfaces.

The Python bridge is versioned JSON-lines over a child process's stdio: `reset`, batched `step`,
`infer`, `close`. It never starts a web server. EOF, explicit close and parent death dispose the
simulator. Every request has an ID and timeout; malformed commands return an error, not a draw.

PPO retains its training checkpoint, NEAT saves completed generations, and evolution/distillation
save network weights. These are **restart/warm-start facilities, not bit-identical interrupted
training**: environment trajectory, optimizer state for distillation, and evolution's population
distribution are not restored. The paired evaluation command, unlike training, resumes completed
side-swapped pairs without replaying them. Fingerprints prevent cross-source resume.

## Replay, teachers and datasets

`collect` saves a replay, observation transitions, matching-replay verification and a scenario
index. By default it explores legal pilot actions; `--policy punisher` (or another bespoke name)
records that fighter instead. `--build` chooses a named body, including difficult builds.

Reconstruction starts from fresh wasm and repeats the prefix while updating both policy histories.
A rolling digest covers both sides' observations and actual Intent commands at every solver step;
decision-boundary observations, damage and winner are checked too. There is no claim that visible
transforms alone restore a world. The continuation test and deliberately changed branch verify
that replay is useful rather than just matching a summary. Exactness is established only for
the tested setup/runtime, not promised across Havok versions or machines.

Scenario tags are observable proxies: reachable attack, incoming tip trajectory, deceleration
after a fast motion, or actual hand loss. A missing tag means the recorded bout did not exhibit
that condition. The collector does not fabricate a severed hand or label a fast withdrawing blade
as an incoming attack merely because its speed is high.

The privileged `oracle` replays a prefix for each candidate, then uses **responsive opponent
continuation**, never the original future commands. It compares CEM-generated four-segment action
sequences over two seconds and always includes baseline continuation. Output is a first action
plus alternatives, values, search budget and explicit uncertainty. The horizon objective is a
terminal outcome priority followed by relative vitality change; it is not a proven game value.
One favorable short branch does not establish whole-fight superiority. The `reference` command
implements repeated search with 0.25-second executed prefixes and incremental replay checkpoints:

```powershell
node research/lab/cli.mjs reference --dir research/runs/my-lab --tier privileged --decisions 8 --seconds 120
node research/lab/cli.mjs reference --dir research/runs/my-lab --tier fair --decisions 8 --seconds 60
```

Reissuing it continues the saved fight under the same source manifest. Default duration is the
normal 150-second harness cap; default eight decisions is a smoke workload, not a full fight.
Every replan can reconstruct the entire preceding fight, so cost grows with fight length. Long
reference fights and a pose-recorded slow-motion viewer still need their own budget/work package.

`fair` builds a five-neighbour observation-transition ensemble from training transitions only and
searches constant-action continuations. Its interface has no replay, actual opponent identity,
controller state or random seed from the real world. Neighbour disagreement is reported, not
misrepresented as calibrated statistical confidence. This is an intentionally simple approximate
model baseline, **not** a learned hidden-state reconstruction or an exact fair Havok planner.
The smoke command queries its training observations; held-out predictive calibration remains a
gate before claims about model quality.

```powershell
node research/lab/cli.mjs train --dir research/runs/my-lab --method distill --labels research/runs/my-lab/teacher.json --seconds 60
node research/lab/cli.mjs dagger --dir research/runs/my-lab --model research/runs/my-lab/ppo-pilot-1/model.json --seconds 120
node research/lab/cli.mjs train --dir research/runs/my-lab --method distill --labels research/runs/my-lab/student-teacher.json --seconds 60
```

`dagger` records states actually visited by a student, then queries the privileged oracle there.
Retain and combine earlier query datasets when scheduling additional iterations; one query pass
is not a completed DAgger training campaign. Baseline-selected oracle labels have `action:null`
and are excluded from regression, never silently relabeled as a zero action. Students only receive
the fair observation vector, even when the teacher used privileged information.

## Portfolio, evaluation and publication

Seven bespoke prototypes use the existing third executor: recovery punisher, trajectory
interceptor, feint/counter, spare-hand cover coordinator, rush, turtle and circle. They are
small competing hypotheses, not seven claimed upgrades. The coordinator exploits existing
executor hand choice/cover; independently scheduled simultaneous two-hand strokes are not yet
implemented. The refit collector uses exploratory Planner choices, records exchange duration,
damage and next state, and leaves the old tables untouched. It reports coverage and outcomes;
terminal windows are excluded rather than inventing a terminal transition for the old vocabulary.

```powershell
node research/lab/cli.mjs evaluate --dir research/runs/my-lab --seconds 300
node research/lab/cli.mjs archive --dir research/runs/my-lab --seconds 10
node research/lab/cli.mjs evaluate --dir research/runs/my-lab --model research/runs/my-lab/ppo-pilot-1/model.json --split confirmation --seconds 300
node research/lab/cli.mjs evaluate --dir research/runs/my-lab --refit true --seconds 300
node research/lab/cli.mjs preview --dir research/runs/my-lab --seconds 10
```

Training, selection and confirmation pools are explicitly separate in `experiments.mjs`.
Both side assignments use seeds that follow the policy. Only complete pairs enter results;
deadline-interrupted bouts are excluded, and engine errors remain errors. The first protocol
uses mirror builds, not the larger cross-build production league. Its measurements are never
written into arena ratings. `--duration 12` shortens an evaluation for smoke testing, not promotion.

`archive` retains selection winners across cadence/retreat/achieved-range cells. It is a
selection archive, not a promotion mechanism. Inspect the full matchup matrix and confirmation
outcomes before calling anything a broad upgrade or a repeatable counter. A population league
with adaptive exploiter training is an additional campaign, not implied by this static pool.

Preview generates an isolated arena page with experimental entries. Use an existing dev server
or start/stop your own on a known free port. No normal policy registration or old rating artifact
is changed. Browser review plus independent confirmation and full-league measurement remain
mandatory before a candidate is admitted to the normal picker.

## Research references

- PPO: https://arxiv.org/abs/1707.06347
- NEAT: https://nn.cs.utexas.edu/downloads/papers/stanley.ec02.pdf
- Quality-diversity: https://arxiv.org/abs/1504.04909
- Iterative teacher queries / DAgger: https://arxiv.org/abs/1011.0686

These motivate experiments; none establishes that its method wins in this simulator.
