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
| `control-foundation.mjs`, `-trials.mjs`, `-worker.mjs` | the shared tasks by `--suite`: `baseline`, `reach`, `ccd`, `competency` (with `--competency`, `--blow`, `--blow-settings`, and `--grid axes\|full` over `--size`, `--weight`, `--strength`, `--speed`), `moving-strike`, `defense` and `solver`; `--actuation`, `--samples`, `--from`, `--hz`, `--models` | a manifest, source archive, rows and summary under `research/runs/control-foundation/`; [control foundation](../docs/reference/control-foundation.md) |
| `competencies.mjs` | the competency suite: stand, guard, punch, walk, rise and kick, each workshop body empty-handed and with the club, against each competency's human target | [competencies](../docs/reference/competencies.md) |
| `physiques.mjs` | the physique grid (`PHYSIQUE_GRID`, `physiqueRanges`, `physiqueGrid`) | the jobs of `--grid` |
| `competency-passes.mjs` | whether each competency passes at every rate of `RATES` | JSON on stdout |
| `core-stance-envelope.mjs` | each gait's fastest walk each way and turn at each speed at which every trial held, searched down from the fastest | `assets/core/<legs>-envelope.json` |
| `strike-profiles.mjs`, `edge-profiles.mjs` | the skills' profiles from drill records: each strike's from the Strike drill's (and the baseline's punch rungs), each ground edge's from the Rise drill's, naming what they were measured on | `assets/core/strike-profiles.json`, `assets/core/edge-profiles.json` |
| `core-stance-sweep.mjs`, `core-stance-trials.mjs`, `core-stance-worker.mjs` | the stance's batteries (stand, edge, step, walk, gait, shove) over tunings (`--variants`) | |
| `reptile-bite.mjs` | the reptile's closing-jaw strikes against a fixed body | [reptile](../docs/reference/reptile.md) |
| `core-reach-map.mjs` | kinematics alone: where the knuckles and the club's swell reach, wrist held and freed | [human and strikes](../docs/reference/human-and-strikes.md) |
| `core-posture.mjs`, `-trials.mjs`, `-worker.mjs` | statics: whether the Warrior can hold still on each support from knees and hands to standing, at what share of its strength, then held by its motors on the world | [postures](../docs/reference/postures.md); `research/runs/postures/` |
| `man-postures.mjs`, `core-posture-runs.mjs`, `man-posture-starts.mjs` | the same statics on Man's envelopes (`--envelopes boot,barefoot,toe`), and the installed postures' starts | [Man's postures](../docs/reference/man-postures.md); with `--sweep`, `docs/reference/man-postures.json` |
| `man-toe-solver.mjs` | Man's passive toe on the game's solver, at 120 and 480 Hz | [passive toes](../docs/reference/man-passive-toes.md) |
| `core-rise.mjs`, `-trials.mjs`, `-worker.mjs` | the battery of falls: every model shoved sixteen ways (`--shoves`, `--turn`), with the club and without, watched (`--watch`) under a mind (`--mind`): how many rose, how fast, the furthest stage | [rising](../docs/reference/rising.md) |
| `core-rise-poses.mjs` | stages played on a body toppled stiff (`--lie`, `--degrees`): how it lies at each stage's end | [rising](../docs/reference/rising.md) |
| `core-rapier-probe.mjs` | Rapier's generic joint on the engine module alone: limits, motor axes, saturation, gyroscopic spin | |
| `rapier-package-parity.mjs` | stock SIMD 0.21.0 against the installed engine on three arena recipes (`--reference <unpacked package>`) | [the engine record](../docs/reference/rapier-vendor.md) |
| `engine-adapter-cost.mjs` | the adapter against a commit (`--reference`) on the same solver, pose traces asserted equal | |
| `native-posture-control.mjs` | the offline native-rollout posture hold or transfer (`--posture`, `--transfer`, `--envelope`) | [native posture control](../docs/reference/native-posture-control.md) |
| `touches.mjs` | what a body sounds of: each part's touches, their energies and closing speeds, in each activity | [look](../docs/reference/look.md#touches-measured) |
| `blow-shares.mjs` | the surfaces' stiffness table and the share each takes where two meet | [wounds](../docs/reference/wounds.md) |
| `real-against-engine.mjs` | the core's real functions beside the engine's `Math`: values that differ, and each function's digest | [real functions](../docs/reference/real-functions.md) |

`core-club-unit.json` is the club blow that sets the damage unit (`core-club-unit` in `SOURCES`),
found by the strike search of `research/core-strike-search.mjs@bca8fc87`.
The `control-foundation.mjs` suites are declared in their records:
[moving strike](../docs/reference/moving-strike.md), [point defense](../docs/reference/point-defense.md)
and [the solver contract](../docs/reference/solver-contract.md).

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
| `bout-baseline.mjs` | how every matchup ends at each starting gap; with `--held empty`, `--never-off`, `--hand`, `--unit` and `--floors` | [bouts](../docs/reference/bouts.md), [wounds](../docs/reference/wounds.md) |
| `crypt-blows.mjs` | a crypt run's blows by what met | [bouts](../docs/reference/bouts.md) |
| `assist-need.mjs`, `assist-sweep.mjs` | what each side's soles miss of what its stance asks; what balance does to how bouts end | [assist](../docs/reference/assist.md) |
| `rollouts.mjs`, `rollout-worker.mjs`, `rollout-pool.mjs` | a bout forked by replay and played on under other orders: a row's value to a side, and the choice among responses | |
| `oracle.mjs` | a side that tries every response in a fork each half second, beside its tactics alone; `--out` keeps each bout's recipe, tape and link | [oracle](../docs/reference/oracle.md) |

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
| `body-cost.mjs` | a body's step by its state, standing to rising; the solver's part | [play](../docs/reference/play.md) |
| `crypt-step.mjs` | a crypt run's step by seed; with `--listen`, what hearing costs | [play](../docs/reference/play.md) |
| `step-garbage.mjs` | what a step allocates as bodies are added (`allocatedIn`, `tests/harness/garbage.mjs`); `--sites` by file and function | [step cost](../docs/reference/step-cost.md) |
| `step-time.mjs` | one bout's steps split into the solver and the rest; `--profile` by file and function | [step cost](../docs/reference/step-cost.md) |
| `reach-bed.mjs` | the reach solves a bout asked (`tests/fixtures/reach-solves.json`), solved again: caps, passes, time | [step cost](../docs/reference/step-cost.md) |
| `crypt-plan.mjs` | a crypt run's own planning time by seed; `--profile` | [step cost](../docs/reference/step-cost.md) |
| `blow-cost.mjs` | each blow part's cost a step on the punch stand | [step cost](../docs/reference/step-cost.md) |
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
| Standing up | `rising-*.mjs`, `recovery-transfer.mjs`; `stand-controller/`, the stand-up from hands and knees on toes the owner accepted (`c/sitback.mjs`, its runs' settings in `c/.runvar.sh`, the research foot in `bodies.mjs`, frames watched in `c/view/`); `sit-back.mjs`, the game's sit-back from the same starts | [rising](../docs/reference/rising.md), [recovery transfer](../docs/reference/recovery-transfer.md), [toes](../docs/reference/toes.md#measurement), [the sit-back](../docs/reference/rising.md#the-sit-back) |
| Punches | `punch-*.mjs`, `greedy-punch.mjs`, `whole-body-spike.mjs` | [punch calibration](../docs/reference/punch-calibration.md), [punch foundation](../docs/reference/punch-foundation.md), [whole-body spike](../docs/reference/whole-body-spike.md), [learned punch](../docs/reference/learned-punch.md) |
| Learning | `run-learning-server.mjs` (an environment file's copies on worker threads: `environments/punch.json`, `gait.json`, `bout.json`), `case-learning-environment.mjs` (any learnable part in an evaluation's cases), `run-train.py` (PPO against the server), `learning-speed.mjs` (its decisions a second) | [learned punch](../docs/reference/learned-punch.md), [the trainer's speed](../docs/reference/learned-punch.md#the-trainers-speed) |
| Walking and running | `locomotion-*.mjs`, `run-cycle*.mjs`, `run-feasibility.mjs`, `mocap-import.mjs`, `bvh.mjs`, `combat-locomotion.mjs` | [locomotion](../docs/reference/locomotion.md), [run body](../docs/reference/run-body.md) |
| Strikes and fights | `arena-combat*.mjs`, `combat-*.mjs`, `strike-*.mjs`, `empty-hand-league.mjs`, `attack-force.mjs`, `front-kicks.mjs`, `stance-stagger.mjs`, `oracle-spread.mjs`, `cap-series.mjs` (shorter bout caps from recorded reports' bar series) | [arena combat](../docs/reference/arena-combat-evaluation.md), [blows](../docs/reference/blows.md), [front kicks](../docs/reference/front-kicks.md) |
| Held items | the blade, buckler and court tasks are evaluations (`src/evaluation/`) | [sword and buckler](../docs/reference/sword-and-buckler.md) |
| Contact and the solver | `contact-*.mjs`, `rapier-effort-precision.mjs`, `posture-limits.mjs`, `control-foundation-joint-shapes.mjs`, `control-foundation-solvers.mjs` | [contact step](../docs/reference/contact-step.md), [friction](../docs/reference/contact-friction.md), [solver contract](../docs/reference/solver-contract.md) |
| The reptile | `reptile-*.mjs`, `bite-load.mjs`, `body-plan-regression.mjs` | [reptile](../docs/reference/reptile.md), [bites](../docs/reference/reptile-bites.md) |
| Minds | `arena-control-trials.mjs`, `ground-combat.mjs`, `action-cycles.mjs` (their request ledger) | [ground combat](../docs/reference/ground-combat.md) |
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
