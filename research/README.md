# Research

Node scripts that measure the core (`src/core/`), most on its stand
(`tests/harness/core-stand.mjs`), and the physics engines' bake-off. They import `src/` directly
and run from the repository root; batteries spread their trials over worker threads (`--workers`),
one stand a trial. A figure is read with its harness: Node, the stand or the module it drives, the
engine and the rate. A script that writes a data file the core reads does so only with `--write`;
without it, it prints. Each script's doc comment gives its options, what it prints and the rule it
reads by.

## The core

| Script | What it measures | Writes |
|---|---|---|
| `physiques.mjs` | the physique grid and its ranges (`PHYSIQUE_GRID`, `physiqueRanges`, `physiqueGrid`) | |
| `core-stance-envelope.mjs` | each gait's fastest walk each way and turn at each speed at which every trial held, searched down from the fastest | `assets/core/<legs>-envelope.json` |
| `strike-profiles.mjs`, `edge-profiles.mjs` | the skills' profiles from drill records: each strike's from the Strike drill's (and the baseline's punch rungs), each ground edge's from the Rise drill's, naming what they were measured on | `assets/core/strike-profiles.json`, `assets/core/edge-profiles.json` |
| `core-stance-sweep.mjs`, `core-stance-trials.mjs`, `core-stance-worker.mjs` | the stance's batteries (stand, edge, step, walk, gait, shove) over tunings (`--variants`) | |
| `core-reach-map.mjs` | kinematics alone: where the knuckles and the club's swell reach, wrist held and freed | |
| `core-posture.mjs`, `-trials.mjs`, `-worker.mjs` | statics: whether the Warrior can hold still on each support from knees and hands to standing, at what share of its strength, then held by its motors on the world | `research/runs/postures/` |
| `man-postures.mjs`, `core-posture-runs.mjs`, `man-posture-starts.mjs` | the same statics on Man's envelopes (`--envelopes boot,barefoot,toe`), and the installed postures' starts; the bare foot, palm and passive toe hold no support posture the boot does not | with `--sweep`, `research/data/man-postures.json` |
| `man-toe-solver.mjs` | Man's passive toe on the game's solver, at 120 and 480 Hz; a passive toe hinge does not hold as a spring under load | |
| `core-rise.mjs`, `-trials.mjs`, `-worker.mjs` | the battery of falls: every model shoved sixteen ways (`--shoves`, `--turn`), with the club and without, watched (`--watch`) under a mind (`--mind`): how many rose, how fast, the furthest stage | |
| `core-rise-poses.mjs` | stages played on a body toppled stiff (`--lie`, `--degrees`): how it lies at each stage's end | |
| `core-rapier-probe.mjs` | Rapier's generic joint on the engine module alone: limits, motor axes, saturation, gyroscopic spin | |
| `rapier-package-parity.mjs` | stock SIMD 0.21.0 against the installed engine on three arena recipes (`--reference <unpacked package>`) | |
| `engine-adapter-cost.mjs` | the adapter against a commit (`--reference`) on the same solver, pose traces asserted equal | |
| `touches.mjs` | what a body sounds of: each part's touches, their energies and closing speeds, in each activity | |
| `blow-shares.mjs` | the surfaces' stiffness table and the share each takes where two meet | [wounds](../docs/reference/wounds.md) |
| `real-against-engine.mjs` | the core's real functions beside the engine's `Math`: values that differ, and each function's digest | |

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
| `bout-baseline.mjs` | how every matchup ends at each starting gap; with `--held empty`, `--never-off`, `--hand`, `--unit` and `--floors` | [wounds](../docs/reference/wounds.md) |
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

| Script | What it measures | Writes |
|---|---|---|
| `crypt-step.mjs` | a crypt run's step by seed; with `--listen`, what hearing costs; `--minds` with its minds on worker threads | |
| `step-garbage.mjs` | what a step allocates as bodies are added (`allocatedIn`, `tests/harness/garbage.mjs`); `--sites` by file and function | [step cost](../docs/reference/step-cost.md) |
| `step-time.mjs` | one bout's steps split into the solver and the rest; `--profile` by file and function; `--minds` with its minds on worker threads | [step cost](../docs/reference/step-cost.md) |
| `minds-apart.mjs` | the crowd fight, the reference bouts and the Crypt the same to the bit with their minds on 1 to 4 worker threads as on their bodies | [step cost](../docs/reference/step-cost.md) |
| `reach-bed.mjs` | the reach solves a bout asked (`tests/fixtures/reach-solves.json`), solved again: caps, passes, time | [step cost](../docs/reference/step-cost.md) |
| `crypt-plan.mjs` | a crypt run's own planning time by seed; `--profile` | [step cost](../docs/reference/step-cost.md) |
| `rest-probe.mjs` | limp bodies put to sleep through Rapier: the step's time, and what wakes them | [step cost](../docs/reference/step-cost.md) |

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
