# Research

Node scripts that measure the core (`src/core/`), most on its stand
(`tests/harness/core-stand.mjs`), and the physics engines' bake-off. They import `src/` directly
and run from the repository root; batteries spread their trials over worker threads (`--workers`),
one stand a trial. A figure is read with its harness: Node, the stand or the module it drives, the
engine and the rate. A script that writes a data file the core reads does so only when asked
(`--write`, or `core-stance-envelope.mjs`'s `--add`); without it, it prints. Three always write:
`run-cycle.mjs` (`assets/core/run-cycle.json`, or `--out`), `skill-records.mjs`
(`assets/core/<skill>.json` and `.meta.json`) and `punch-export.mjs`
(`assets/core/straight-punch.json`, or a held blow's `assets/core/<kind>.json`, with its
`.meta.json`; or `--out`). Each script's doc comment gives its options, what it prints and the rule
it reads by.

## The core

| Script | What it measures | Writes |
|---|---|---|
| `physiques.mjs` | the physique grid and its ranges (`PHYSIQUE_GRID`, `physiqueRanges`, `physiqueGrid`) | |
| `core-stance-envelope.mjs` | each gait's fastest walk each way and turn at each speed at which every trial held, searched down from the fastest | `assets/core/<legs>-envelope.json` |
| `strike-profiles.mjs`, `edge-profiles.mjs` | the skills' profiles from drill records: each strike's from the Strike drill's (and the baseline's punch rungs), each ground Option's from Option Mind's own tries in falls the stand-up target does not play, naming what they were measured on | `assets/core/strike-profiles.json`, `assets/core/edge-profiles.json` |
| `skill-records.mjs` | no measurement: a skill's row for one body (`SkillRecord`) written from a file of settings, refused unless whole and valid, or removed (`--remove`) | `assets/core/<skill>.json`, `.meta.json`, every run |
| `skill-search.mjs` | a skill's settings (the stomp's, `SEARCHES`) searched on one body by CMA-ES on its task's trials; `--confirm` keeps the best only where it beats the start on fresh trials | `--out`; with `--confirm --write`, the body's row (through `skill-records.mjs`) |
| `swing-drill.mjs` | a swung blow (`cut`, `club-blow`) searched on the Strike drill's still rung: each channel's windup and push, where it stands, how long it settles; `--verify` plays a found one | `--out` |
| `sword-thrust-search.json` | the sword thrust's searched schedule (`punch-drill.mjs --blow sword-thrust --chamber --near`), which `assets/core/sword-thrust.json` names as how it was made | |
| `learned-puncher.json` | a mind whose one action is the straight punch, thrown by the punch executor: a subject the Strike drill's records name | |
| `punch-reshape.py` | no measurement: a steered punch's training run (`run-train.py`'s model and normalisation) carried from one learned-punch layout to another, input and output by name | the new run's directory |
| `core-stance-sweep.mjs`, `core-stance-trials.mjs`, `core-stance-worker.mjs` | the stance's batteries (stand, edge, step, walk, gait, shove) over tunings (`--variants`) | |
| `core-reach-map.mjs` | kinematics alone: where the knuckles and the club's swell reach, wrist held and freed | |
| `core-posture.mjs`, `-trials.mjs`, `-worker.mjs` | statics: whether the Warrior can hold still on each support from knees and hands to standing, at what share of its strength, then held by its motors on the world | `research/runs/postures/` |
| `man-postures.mjs`, `core-posture-runs.mjs`, `man-posture-starts.mjs` | the same statics on Man's envelopes (`--envelopes boot,barefoot,toe`), and the installed postures' starts; the bare foot, palm and passive toe hold no support posture the boot does not | `man-postures.mjs`: `research/runs/postures/envelopes.json`; `man-posture-starts.mjs`: `research/data/man-postures.json`'s starts, every run, from the sweep `--sweep` names (`research/runs/postures/envelopes.json` where not given) |
| `man-toe-solver.mjs` | Man's passive toe on the game's solver, at 120 and 480 Hz; a passive toe hinge does not hold as a spring under load | |
| `core-rise.mjs`, `-trials.mjs`, `-worker.mjs` | the battery of falls: every model shoved sixteen ways (`--shoves`, `--turn`), with the club and without, watched (`--watch`) under a mind (`--mind`): how many rose, how fast, the furthest stage | |
| `core-rise-poses.mjs` | stages played on a body toppled stiff (`--lie`, `--degrees`): how it lies at each stage's end | |
| `rise-trace.mjs` | where a whole mind's rise spends its time on the stand-up target's falls: each ground action, where it began, how long, its stages and how it ended | `--out` |
| `rise-witness.mjs` | whether a fast rise exists on the body as built: CMA-ES for one trajectory of pose and bearing phases from a placed start to verified standing within the target's allowance | `--out`: `.best.json`, `.jsonl` |
| `climb.mjs` | no measurement: Stand up's steady (`standUp`) with research variants, for `crouch-steady.mjs` and `rise-witness.mjs` | |
| `crouch-steady.mjs` | the steady from the Warrior's stored squat, under `climb.mjs`'s variants: the time to verified standing | |
| `climb-search.mjs` | CMA-ES over the steady's climb (the `ramp` variant), scored by the mean time to verified standing from the squat and the witnesses' hand-overs | |
| `core-rapier-probe.mjs` | Rapier's generic joint on the engine module alone: limits, motor axes, saturation, gyroscopic spin | |
| `rapier-package-parity.mjs` | stock SIMD 0.21.0 against the installed engine on three arena recipes (`--reference <unpacked package>`) | |
| `engine-adapter-cost.mjs` | the adapter against a commit (`--reference`) on the same solver, pose traces asserted equal | |
| `touches.mjs` | what a body sounds of: each part's touches, their energies and closing speeds, in each activity | |
| `blow-shares.mjs` | the surfaces' stiffness table and the share each takes where two meet, printed as [wounds](../docs/reference/wounds.md)' tables | |
| `real-against-engine.mjs` | the core's real functions beside the engine's `Math`: values that differ, and each function's digest | |
| `yaw-pitch-roll.mjs` | no measurement: a yaw, pitch and roll as the quaternion Babylon's `RotationYawPitchRollToRef` makes, for the scripts that place bodies by it | |

`core-club-unit.json` is the club blow that sets the damage unit (`core-club-unit` in `SOURCES`):
the Warrior's strongest one-handed blow with the wooden club, found by a strike search.

```powershell
node research/core-stance-envelope.mjs --legs walk-run --models workshop-fighter --holds empty --walks
node research/core-posture.mjs --workers 30
node research/core-rise.mjs --workers 30 --watch 40 --only workshop-fighter --shoves 128 --falls
node research/engine-adapter-cost.mjs --reference <commit> --runs 3
```

## Bouts

Arena bouts off the page: Node, the core's world, Rapier, 120 Hz. A bout is its recipe
(`DuelRecipe`) and its tape and plays the same to the bit from them, so a row names both.

| Script | What it measures | Writes |
|---|---|---|
| `bout.mjs`, `bout-worker.mjs`, `bout-pool.mjs` | one bout played from its recipe (built by `buildBout`, `src/evaluation/bout.ts`) in a world of its own (how it ended, what landed, each side's assist, the digest of every pose); its worker; many over workers | |
| `bout-trace.mjs` | one bout's row: the digest a change that should change nothing leaves as it was | |
| `bout-baseline.mjs` | how every matchup ends at each starting gap; with `--held empty`, `--never-off`, `--hand`, `--unit` and `--floors` | |
| `crypt-blows.mjs` | a crypt run's blows by what met | |
| `assist-need.mjs`, `assist-sweep.mjs` | what each side's soles miss of what its stance asks; what balance does to how bouts end | |
| `rollouts.mjs`, `rollout-worker.mjs`, `rollout-pool.mjs` | a bout forked by replay and played on under other orders: a row's value to a side, and the choice among responses | |
| `oracle.mjs` | a side that tries every response in a fork each half second, beside its tactics alone; `--out` keeps each bout's recipe, tape and link | |

```powershell
node research/bout-trace.mjs
node research/bout-baseline.mjs --gaps 3,3.5,4,4.5,5 --held empty --floors 1,5
node research/assist-sweep.mjs --workers 14
node research/oracle.mjs --all --side both --workers 14 --out research/runs/oracle
```

## The step

What a world step takes in time and memory: Node, the core's world, Rapier, 120 Hz. Times are wall
time on a quiet machine; bytes and counts are the same on any.

| Script | What it measures | Record |
|---|---|---|
| `crypt-step.mjs` | a crypt run's step by seed; with `--listen`, what hearing costs; `--minds` with its minds on worker threads | |
| `step-garbage.mjs` | what a step allocates as bodies are added (`allocatedIn`, `tests/harness/garbage.mjs`); `--sites` by file and function | [step cost](../docs/reference/step-cost.md) |
| `step-time.mjs` | one bout's steps split into the solver and the rest; `--profile` by file and function; `--minds` with its minds on worker threads | [step cost](../docs/reference/step-cost.md) |
| `minds-apart.mjs` | the crowd fight, the reference bouts and the Crypt the same to the bit with their minds on 1 to 4 worker threads as on their bodies | [step cost](../docs/reference/step-cost.md) |
| `reach-bed.mjs` | the reach solves a bout asked (`tests/fixtures/reach-solves.json`), solved again: caps, passes, time | [step cost](../docs/reference/step-cost.md) |
| `crypt-plan.mjs` | a crypt run's own planning time by seed; `--profile` | [step cost](../docs/reference/step-cost.md) |
| `rest-probe.mjs` | limp bodies put to sleep through Rapier: the step's time, and what wakes them | [step cost](../docs/reference/step-cost.md) |
| `call-count.mjs` | how many times a step the heavy work runs (the shape, menu, opening and router searches, the engine's contacts) and the calls into Rapier's WebAssembly, over a bout (`--link`) or the crowd fight (`--crowd`) | [step cost](../docs/reference/step-cost.md) |
| `call-count-hook.mjs` | no measurement: the load hook `call-count.mjs` registers, which counts each call without changing a result | |
| `mind-make.mjs` | what making a body's Crypt mind costs, warm: the median and least of `--makes` makes after the first | [step cost](../docs/reference/step-cost.md) |
| `mind-split.mjs` | what splitting the minds off the world's thread could give the crowd fight: each step's world part and each mind's, on copies loading `--threads` threads, and each copy's worst lag | [step cost](../docs/reference/step-cost.md) |
| `mind-split-hook.mjs` | no measurement: the load hook `mind-split.mjs` registers, which times each body's mind without changing a result | |
| `lag.mjs` | no measurement: a world's lag behind real time from its steps' times (`lagOf`), for `crypt-step.mjs`, `step-time.mjs` and `mind-split.mjs` | [step cost](../docs/reference/step-cost.md) |

```powershell
node research/step-garbage.mjs --bodies 1,2,4,8,10,12,16,24,32,48
node research/step-time.mjs --profile
node research/crypt-plan.mjs --seeds 1,2,3,4 --profile
```

## Experiments by family

Scripts not listed above, by what they study; each is read by the record named.

| Family | Scripts | Record |
|---|---|---|
| Standing up | `rising-*.mjs`, `recovery-transfer.mjs`; `sit-back.mjs`, the game's sit-back from hands and knees on toes | [the owner's target](../docs/reference/rising.md#the-owners-target) |
| Punches | `punch-*.mjs` | |
| Learning | `run-learning-server.mjs` (an environment file's copies on worker threads: `environments/punch.json`, `gait.json`, `bout.json`), `case-learning-environment.mjs` (any learnable part in an evaluation's cases), `run-train.py` (PPO or SAC against the server, from scratch or from another part's network), `learning-speed.mjs` (its decisions a second); a blow trains fastest with PPO from scratch on 8 workers of 4 environments, on the rate's curriculum (`curriculum`: 120 Hz first, the file's own rates mixed in) | |
| Walking and running | `locomotion-*.mjs`, `run-cycle*.mjs`, `run-feasibility.mjs`, `mocap-import.mjs`, `bvh.mjs`, `combat-locomotion.mjs`; the run cycle is fitted to CMU clips (`run-cycle.mjs` names them and their licence) | |
| Strikes and fights | `arena-combat*.mjs`, `combat-*.mjs`, `strike-*.mjs`, `empty-hand-league.mjs`, `stance-stagger.mjs`, `oracle-spread.mjs`, `cap-series.mjs` (shorter bout caps from recorded reports' bar series) | |
| Held items | the court task is an evaluation (`src/evaluation/`) | |
| Contact and the solver | `contact-*.mjs` (the one-step contact predictor, `predictPointContacts`, and the friction profiles, against the engine), `posture-limits.mjs` | |
| The reptile | `reptile-*.mjs`, `bite-load.mjs`, `body-plan-regression.mjs` | [reptile](../docs/reference/reptile.md) |
| Other | `jump-test.mjs` (a squat jump's take-off), `pad-surface.mjs` (a pad's support surface) | |

`cma.mjs` is the resumable CMA-ES the searches share.

## The physics bake-off

`physics-bakeoff/` compares engines under one controller on the same cases: a standing foot and a
forearm chain for fidelity, a whole human observed with no bar, and many humans spaced or piled
for speed. The live adapters are MuJoCo and Rapier (`physics-bakeoff/engines.mjs`); the
`physics-bench.html` page runs the same cases in a browser (`src/physics-bench/`).
[`REPORT.md`](physics-bakeoff/REPORT.md) holds the results and the choice of Rapier; `results/`
the raw runs.

```powershell
node research/physics-bakeoff/fidelity.mjs reference
node research/physics-bakeoff/fidelity.mjs rapier-simd
node research/physics-bakeoff/summarize-fidelity.mjs
sh research/physics-bakeoff/run-perf.sh
node research/physics-bakeoff/summarize-perf.mjs
```

`case-c.mjs` (a whole human standing), `candidates.mjs` (passing settings ranked by cost),
`load-cost.mjs` (download, start-up and memory) and `mujoco-armature.mjs` (MuJoCo's conditioning
for piles) answer narrower questions; `thresholds.mjs` holds the pass bars.
