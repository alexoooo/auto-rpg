# Next-wave combat laboratory

This is experimental infrastructure with a separate evidence-gated admission path. It runs the
game's real Havok simulation and the same `Intent` boundary as the player. No physics, motor
ceilings or damage rules are changed. Dated arena ratings remain available. Paired is the first
admitted specialist; other candidates remain experimental unless explicitly reviewed and admitted.

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

The September 21 continuation has a separately authorized **eight-hour** ledger at
`research/runs/wave3-budget/`. Add `--budget campaign-2026-09-21` for campaign commands; these
accept up to 3,600 seconds per job. The old pilot ledger and its limit are unchanged.

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
always distinguish termination from truncation. Terminal win/draw/loss is the default reward.
PPO's explicit `--reward potential` ablation adds `0.99 * Phi(next) - Phi(previous)`, where Phi
is public self-minus-opponent vitality and terminal Phi is zero. It adds no reward for attack
frequency or proximity. Evaluation always uses actual bout verdicts, never the shaped return.

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
versioned follow-up experiment, not an unrecorded change to old models. Version 2 now appends
body dimensions, part-health aggregates, natural-attack availability/readiness, hand socket
positions and one-hot weapon types. Version-1 networks retain their original feature mapping.
The `fair` command now collects an independent-seed validation episode and reports one-step
error against a persistence predictor; this does not establish long-horizon planning accuracy.

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

PPO additionally accepts `--envs 2` or `--envs 4`: each Gym worker owns its own Node/Havok process,
with no shared physics realm. The allowance measures job wall time, not the sum of CPU core time.
The CLI owns the whole process tree and kills it on its outer deadline. Compare measured throughput
before choosing a larger worker count. Evolution and NEAT now use four matched training episodes
per fitness estimate, with the incumbent reevaluated on the current generation's fixtures.

## Continuation experiments

All of these remain experimental; none changes the normal arena roster.

```powershell
node research/lab/cli.mjs population --dir research/runs/population --budget campaign-2026-09-21 --seconds 1200
node research/lab/cli.mjs teacher-campaign --dir research/runs/teachers --budget campaign-2026-09-21 --seconds 1200
node research/lab/cli.mjs dagger-campaign --dir research/runs/dagger --budget campaign-2026-09-21 --model research/runs/STUDENT/model.json --seconds 600
```

The population evolves observation-conditioned mixtures and adds earlier winners to its training
opponents. Its training archive is **not** the selection archive. DAgger performs three rounds,
retains ordinary student decisions and weights each teacher query eight times; baseline selections
retain the current student's action, not an invented zero command. Independent evaluation remains
required. `evaluate --repeats 4 --crossBuild true` expands seed and body coverage; `--spec FILE`
accepts a saved policy specification. `--terminalModel FILE` evaluates the experimental model from
`refit.json`, including absorbing win/loss/draw exchange outcomes; it does not replace old tables.

`poses --record FILE` reconstructs a saved replay (or reference checkpoint) and writes
`pose-replay.json`. Open the printed `/research/lab/viewer.html?data=...` path on the existing dev
server for slow playback and scrubbing. It renders recorded physical meshes, not decorative art,
and never runs or restores physics. `reference --decisions 600 --commit 0.5 --candidates 4` requests
a longer teacher fight, with checkpoints and the same compute deadline.

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

Privileged references also accept `--surface residual --baseline golem-duelist --opponent
golem-champion --seed 55 --build default`. Collect a matching ordinary control with the same
settings and `--policy golem-duelist`. Fair reference currently uses the pilot action surface.
Resume refuses changed fight settings, and search-deadline exhaustion preserves the last valid
executed prefix rather than discarding the fight.

Reissuing it continues the saved fight under the same source manifest. Default duration is the
normal 150-second harness cap; default eight decisions is a smoke workload, not a full fight.
Every replan can reconstruct the entire preceding fight, so cost grows with fight length.
Use `--decisions 600 --commit 0.5` for a bounded full-fight attempt. The `poses` command exports
verified replay geometry to `/research/lab/viewer.html?data=/research/runs/RUN/pose-replay.json`;
that viewer supports slow playback and scrubbing without pretending to restore physics snapshots.

`fair` builds a five-neighbour observation-transition ensemble from training transitions only and
searches constant-action continuations. Its interface has no replay, actual opponent identity,
controller state or random seed from the real world. Neighbour disagreement is reported, not
misrepresented as calibrated statistical confidence. This is an intentionally simple approximate
model baseline, **not** a learned hidden-state reconstruction or an exact fair Havok planner.
The command also collects separate-seed validation transitions and writes `model-calibration.json`,
including persistence-baseline error. Good one-step calibration would still not establish useful
long-horizon planning.

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
small competing hypotheses, not seven claimed upgrades. Two further candidates are `paired`,
with an independently scheduled off-hand thrust, and `adaptive`, with within-bout strategy selection.
The refit collector uses exploratory Planner choices, records exchange duration,
damage and next state, and leaves the old tables untouched. It reports coverage and outcomes;
terminal windows are excluded from the old vocabulary. A separate terminal-aware model includes
absorbing outcomes and is evaluated with `--terminalModel PATH` without changing production tables.

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
uses mirror builds; `--crossBuild true --repeats N` adds cross-build, multi-seed measurements. Its measurements are never
written into arena ratings. `--duration 12` shortens an evaluation for smoke testing, not promotion.

`archive` retains selection winners across cadence/retreat/achieved-range cells. It is a
selection archive, not a promotion mechanism. Inspect the full matchup matrix and confirmation
outcomes before calling anything a broad upgrade or a repeatable counter. A population league
with adaptive exploiter training is available through `population`; its archive remains training
evidence, not independent confirmation. `teacher-campaign` compares matched 4/16/64-branch searches;
`dagger-campaign --model PATH` performs three student-visited query/distillation rounds.

Preview generates an isolated arena page with experimental entries. Use an existing dev server
or start/stop your own on a known free port. No normal policy registration or old rating artifact
is changed. Browser review plus independent confirmation and full-league measurement remain
mandatory before a candidate is admitted to the normal picker.

`research/admit-lab.mjs` enforces that final gate. A proposal names the immutable policy spec,
current lab fingerprint, matched full-bout confirmation files and representative browser review.
It requires at least 64 confirmation bouts, a positive paired confidence interval and at least
10 percentage points of improvement over Duelist. It then runs a fresh complete cross-build
rating round under the shared campaign budget. Only `--publish true` registers the reviewed
candidate and publishes its dated rating. Existing candidates and their historical evidence remain.

## Research references

- PPO: https://arxiv.org/abs/1707.06347
- NEAT: https://nn.cs.utexas.edu/downloads/papers/stanley.ec02.pdf
- Quality-diversity: https://arxiv.org/abs/1504.04909
- Iterative teacher queries / DAgger: https://arxiv.org/abs/1011.0686

These motivate experiments; none establishes that its method wins in this simulator.
