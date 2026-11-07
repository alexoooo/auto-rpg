# Research

Node scripts that measure the core (`src/core/`), most on its stand
(`tests/harness/core-stand.mjs`), and the physics engines' bake-off. They import `src/` directly
and run from the repository root; batteries spread their trials over worker threads (`--workers`),
one stand a trial. A figure is read with its harness: Node, the stand or the module it drives, the
engine and the rate. A script that writes a data file the core reads does so only when asked
(`--write`, or `skills/locomotion/stance/core-stance-envelope.mjs`'s `--add`); without it, it prints. Three always write:
`skills/locomotion/walk-run/run-cycle.mjs` (`assets/skills/locomotion/cycle-run/run-cycle.json`, or `--out`), `skills/skill-records.mjs`
(`assets/skills/<capability>/<implementation>/<skill>.json` and `.meta.json`) and `skills/strikes/straight-punch/punch-export.mjs`
(`assets/skills/strikes/straight-punch/straight-punch.json`, or a held blow's `assets/skills/strikes/<kind>/<kind>.json`, with its
`.meta.json`; or `--out`). Each script's doc comment gives its options, what it prints and the rule
it reads by.

## The core

| Script | What it measures | Writes |
|---|---|---|
| `physiques.mjs` | the physique grid and its ranges (`PHYSIQUE_GRID`, `physiqueRanges`, `physiqueGrid`) | |
| `skills/locomotion/stance/core-stance-envelope.mjs` | each gait's fastest walk each way and turn at each speed at which every trial held, searched down from the fastest | `assets/skills/locomotion/<legs>/<legs>-envelope.json` |
| `skills/locomotion/residual-environment.mjs` | bounded velocity, activation or channel-reference residuals around a calibrated run, trained through the learning server's `travel` kind; `residual: steering` trains the learned cycle's twelve leg, pelvis, cadence, pace and effort offsets against its 47-input layout; physical centre-of-mass reward and physical-fall termination, with an explicit posture-rule comparison mode; reference offsets smooth across physical leg-role changes and add displacement feedback and rate feed-forward; an optional `braking` file overrides braking settings; muscle ceilings remain unchanged | |
| `skills/locomotion/idle-footing.mjs` | physical neutral-foot placement from a wide placed stance on each rated humanoid, with Balance 0; reports a fixture that never requests placement explicitly, falls and peak shift speed | `--out`: harness and per-body samples |
| `skills/locomotion/residual-probe.mjs` | a residual policy or zero residual on the Node stand at 120 Hz, Balance 0 and empty hands; `--from-rest` reads forward entry and hold, excluding stops and equipped confirmation; `--contacts` retains foot impulses, contact-point velocity and rigid foot motion; the physical mode substitutes the body's fall predicate for the run's posture guard | `--out`: raw samples, calibration, harness, source and policy identity |
| `skills/locomotion/residual-stop.mjs` | a stop order after a declared development run; `--braking-policy` selects an independent post-order correction; reads physical entry speed, falls and two seconds of standing below 0.15 m/s reached within two seconds; an unreached entry remains explicit; `--stance-trace` retains planned catches and physical support readings | `--out`: protocol, policy identity, readings and samples |
| `skills/locomotion/residual-search.mjs` | hip, knee and ankle corrections mirrored by leg role, sagittal by default or every leg channel with `--channels all`, using phase sine or quadrature; CMA search credits the slowest rolling second after a complete upright run inside the corridor, ranking partial survival below completed candidates; `--from` and `--seconds` select a development window, and the environment's `actionAt` defers corrections after the movement order | `--out`: protocol, trial rows, baseline, CMA checkpoint and policy |

Steering training can retain a calibrated reference actor with configuration's `referencePolicy`
and `referenceScale`. Its joint corrections stay fixed while the steering actor learns the cycle's
other controls. Both actors decide at the learner's requests, every 1/30 s, and act from the next control step. The reference actor also
drives warm-up to moving starts, preserving the calibrated trajectory before training takes over.
Contact traces retain each loaded shape pair, its region and rigid contact-point velocity so a
toe contact can be distinguished from the foot's main box.

The residual search's `--stop-at` and `--running-policy` freeze the movement before a stop and
train a separate braking correction. Set `--seconds` four seconds beyond the stop order. Its
development score weights speed at the two-second deadline and mean braking speed equally.
A valid quiet standing interval outranks those continuous rewards. `stopMet` also requires the declared entry speed; a higher development
score alone does not establish the stop gate.

Use comma-separated `--stop-at` times to train braking across independent entry conditions.
Each case ends four seconds after its stop; `--seconds` names the latest stop plus four.
The candidate receives its worst case's score, and rows retain every case's entry and outcome.
Partial braking survival credits only time after the stop order. An unreached deadline has no
speed reading.

For PPO braking episodes, `warmPolicy` names a frozen residual actor that plays the moving-start
prefix. Set `stopOnReset: true` with `fromRestShare: 0` to issue the stop after setup and use
`seconds` for the braking interval. `warmStarts` selects pace/time pairs on that actor's reached
trajectory; `cacheWarmStarts` caches those physical states. The prefix and its teachers remain
fixed while the braking actor learns. Confirm stop entry speed separately with the complete
running-prefix replay.
Stopping credit tracks total horizontal centre-of-mass speed; the gate still requires a complete
quiet standing interval, and checkpoint selection uses that physical reading.

For running-only development, `--period-range low,high` trains cadence jointly with the
trajectory coefficients; `--ahead-range low,high` also trains playback lead. Quote range arguments
to preserve their decimal bounds in PowerShell. The checkpoint's best reading records the selected
`period` and `ahead`; replay its policy with those values in the configuration's `cycleTuning`.
Cycle overrides apply only
to the experiment and do not replace a body's published record.

Set `entry` to `first-lift` in a residual environment configuration to try handover on the
first clear swing after facing settles, with the opposite foot planted. Omit it for the default
walking-landing handover. The environment records this choice in its harness; early entry is an
experimental controller choice and does not establish the forward-speed gate.

For state-dependent corrections, `--feedback speed` adds the positive and negative parts of
commanded speed minus observed forward speed to the actor's hidden features. Each selected
channel gets two coefficients after its phase coefficients. Use unit-cube values of 0.5 for
zero feedback when expanding a phase-only checkpoint. The exported policy includes these
features; the environment and muscle ceilings remain the same.

`--posture-policy` freezes an exported quadrature/speed actor and trains signed forward-tilt and
pitch-rate feedback around it. Use `--basis quadrature --feedback speed`; each selected channel
gets four new coefficients, with 0.5 giving zero added feedback. The exported actor includes the
frozen policy and the new features, under the same action bound.

Set `trim` to `at-pace` to accumulate the cycle's integral speed correction only when its
reference pace equals the order. The default `continuous` mode also integrates during reference
acceleration and braking. Each mode retains the configured trim bound; the harness names the mode.
`after-pace` begins integrating once the reference reaches the order and continues through its
speed oscillation. A changed order pauses accumulation until the reference reaches that order.

Braking overrides activate while the reference pace exceeds the order or the order is to stop.
This keeps a stopping posture independent of an unchanged running order.

Set `actuationTrace` in a residual environment configuration to retain each leg channel's command,
activation, delivered mean torque and directional bounds. Joint angles and speeds are the driver's
last readings; torque is the last world step's mean. The same samples retain reference pace,
integral trim and requested lean for diagnosing tracking and saturation.
| `skills/strikes/strike-profiles.mjs`, `skills/recovery/edge-profiles.mjs` | the skills' profiles from drill records: each strike's from the Strike drill's (and the baseline's punch rungs), each ground Option's from Option Mind's own tries in falls the stand-up target does not play, naming what they were measured on; `edge-profiles --model` refreshes one body's at the existing offsets | core profiles with `--write`; ground falls and trials cached in `research/runs/edge-profiles/`, or `--rows` |
| `skills/skill-records.mjs` | no measurement: a skill's row for one body (`SkillRecord`) written from a file of settings, refused unless whole and valid, or removed (`--remove`) | `assets/skills/<capability>/<implementation>/<skill>.json`, `.meta.json`, every run |
| `skills/strikes/stomp/skill-search.mjs` | a skill's settings (the stomp's, `SEARCHES`) searched on one body by CMA-ES on its task's trials; `--confirm` keeps the best only where it beats the start on fresh trials | `--out`; with `--confirm --write`, the body's row (through `skills/skill-records.mjs`) |
| `skills/strikes/swing/swing-drill.mjs` | a swung blow (`cut`, `club-blow`) searched on the Strike drill's still rung: each channel's windup and push, where it stands, how long it settles; `--verify` plays a found one | `--out` |
| `skills/strikes/sword-thrust/sword-thrust-search.json` | the sword thrust's searched schedule (`skills/strikes/straight-punch/punch-drill.mjs --blow sword-thrust --chamber --near`), which `assets/skills/strikes/sword-thrust/sword-thrust.json` names as how it was made | |
| `skills/strikes/straight-punch/punch-reshape.py` | no measurement: a steered punch's training run (`run-train.py`'s model and normalisation) carried from one learned-punch layout to another, input and output by name | the new run's directory |
| `skills/locomotion/stance/core-stance-sweep.mjs`, `skills/locomotion/stance/core-stance-trials.mjs`, `skills/locomotion/stance/core-stance-worker.mjs` | the stance's batteries (stand, edge, step, walk, gait, shove) over tunings (`--variants`) | |
| `humanoid/reach/core-reach-map.mjs` | kinematics alone: where the knuckles and the club's swell reach, wrist held and freed | |
| `humanoid/posture/core-posture.mjs`, `humanoid/posture/core-posture-trials.mjs`, `humanoid/posture/core-posture-worker.mjs` | statics: whether the Warrior can hold still on each support from knees and hands to standing, at what share of its strength, then held by its motors on the world | `research/runs/postures/` |
| `humanoid/posture/man-postures.mjs`, `humanoid/posture/core-posture-runs.mjs`, `humanoid/posture/man-posture-starts.mjs` | the same statics on Man's envelopes (`--envelopes boot,barefoot,toe`), and the installed postures' starts; the bare foot, palm and passive toe hold no support posture the boot does not | `humanoid/posture/man-postures.mjs`: `research/runs/postures/envelopes.json`; `humanoid/posture/man-posture-starts.mjs`: `research/humanoid/posture/data/man-postures.json`'s starts, every run, from the sweep `--sweep` names (`research/runs/postures/envelopes.json` where not given) |
| `man-toe-solver.mjs` | Man's passive toe on the game's solver, at 120 and 480 Hz; compares spring torque with its law, with a static angle prediction only while the toe bears no ground load; `--conditioning` controls contact and rotational inertia, `--planted` starts the toe against the ground, and `--stiffness` varies the fixture spring; `--mass` adds mass and inertia while retaining weight, compared with inertia alone; `--legacy-limits`, `--native-contact`, `--friction`, `--depth` and `--iterations` isolate solver constraints | `research/runs/man-toe-solver.json`; conditioning: `research/runs/man-toe-conditioning-<settings>.json`, with fixture settings per row |
| `toe-hinge.mjs` | a light passive toe isolated from a gait: free torque, loaded tip and heel-up ground contact at 120 and 480 Hz; `--mode layer` adds a stiff contact control and `--mode conditioning` varies inertia while retaining mass; `--pitch` selects the heel angle and `--frequency` rocks the held foot; `--articulated` checks a reduced-coordinate hinge with a motor-only impulse joint on a stationary held foot | `--out`: fixture settings and mechanical readings |
| `toe-support.mjs` | a physical slab toe sized from the Warrior's current foot, its mass split by volume and its load placed at the ankle; flat, heel-up and kneeling poses at 120 and 480 Hz, read at 120 Hz; `--load` selects the body-mass share, `--sole-layer` shares contact regularization across both sole parts, and `--contact-damping` and `--pgs` control the solver; `--frequency` uses an external velocity drive to rock the foot and meters its pitch torque; reports whole-run clearance, hinge and tracking errors and flags a fixture that leaves its floor | `--out`: settings, mechanical readings and source identity |
| `skills/recovery/core-rise.mjs`, `-trials.mjs`, `-worker.mjs` | the battery of falls: every model shoved sixteen ways (`--shoves`, `--turn`), with the club and without, watched (`--watch`) under a mind (`--mind`): how many rose, how fast, the furthest stage | |
| `skills/recovery/implementations/staged/core-rise-poses.mjs` | stages played on a body toppled stiff (`--lie`, `--degrees`): how it lies at each stage's end | |
| `skills/recovery/implementations/staged/rise-trace.mjs` | where a whole mind's rise spends its time on the stand-up target's falls: each ground action, where it began, how long, its stages and how it ended; `--seeds` checks other seeds | `--out` |
| `skills/recovery/implementations/staged/rise-search.mjs` | one body's loadout-specific recovery timings and poses searched through immutable tunings; each candidate's profiles are calibrated before scoring its normal chooser; `--offsets` changes the scoring directions; fresh falls reserved for confirmation | `--out`: settings, calibration and scoring rows, profiles and CMA checkpoint |
| `skills/recovery/witness/rise-witness.mjs` | whether a fast rise exists on the body as built: CMA-ES for one trajectory of pose and bearing phases from a placed start to verified standing within the target's allowance | `--out`: `.best.json`, `.jsonl` |
| `skills/recovery/witness/climb.mjs` | no measurement: Stand up's steady (`standUp`) with research variants, for `skills/recovery/witness/crouch-steady.mjs` and `skills/recovery/witness/rise-witness.mjs` | |
| `skills/recovery/witness/crouch-steady.mjs` | the steady from the Warrior's stored squat, under `skills/recovery/witness/climb.mjs`'s variants: the time to verified standing | |
| `skills/recovery/witness/climb-search.mjs` | CMA-ES over the steady's climb (the `ramp` variant), scored by the mean time to verified standing from the squat and the witnesses' hand-overs | |
| `core-rapier-probe.mjs` | Rapier's generic joint on the engine module alone: limits, motor axes, saturation, gyroscopic spin | |
| `rapier-package-parity.mjs` | stock SIMD 0.21.0 against the installed engine on three arena recipes (`--reference <unpacked package>`) | |
| `engine-adapter-cost.mjs` | the adapter against a commit (`--reference`) on the same solver, pose traces asserted equal | |
| `touches.mjs` | what a body sounds of: each part's touches, their energies and closing speeds, in each activity | |
| `blow-shares.mjs` | the surfaces' stiffness table and the share each takes where two meet, printed as [wounds](../docs/reference/wounds.md)' tables | |
| `real-against-engine.mjs` | the core's real functions beside the engine's `Math`: values that differ, and each function's digest | |
| `yaw-pitch-roll.mjs` | no measurement: a yaw, pitch and roll as the quaternion Babylon's `RotationYawPitchRollToRef` makes, for the scripts that place bodies by it | |

`skills/strikes/held-blow/core-club-unit.json` is the club blow that sets the damage unit (`core-club-unit` in `SOURCES`):
the Warrior's strongest one-handed blow with the wooden club, found by a strike search.

```powershell
node research/skills/locomotion/stance/core-stance-envelope.mjs --legs walk-run --models workshop-fighter --holds empty --walks
node research/humanoid/posture/core-posture.mjs --workers 30
node research/skills/recovery/core-rise.mjs --workers 30 --watch 40 --only workshop-fighter --shoves 128 --falls
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
| `minds-apart.mjs` | the crowd fight, the reference bouts, the Crypt and every entrant the same to the bit with their minds on 1 to 4 worker threads as on their bodies, and each duel the same from a fork | [step cost](../docs/reference/step-cost.md) |
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
| Standing up | `rising-*.mjs`, `skills/recovery/implementations/staged/recovery-transfer.mjs`; `skills/recovery/implementations/staged/sit-back.mjs`, the game's sit-back from hands and knees on toes | [the owner's target](../docs/reference/rising.md#the-owners-target) |
| Punches | `punch-*.mjs` | |
| Learning | `run-learning-server.mjs` (an environment file's copies on worker threads: `skills/strikes/straight-punch/environments/punch.json`, `entrants/bare/environments/gait.json`, `entrants/bare/environments/bout.json`), `case-learning-environment.mjs` (any learnable part in an evaluation's cases), `learner-adapter.mjs` (the loop every environment steps through: an action answers its learner's request and acts until the next; a transition's info counts its world steps and seconds), `run-train.py` (PPO or SAC against the server, from scratch or from another part's network; it keeps the environment's layout, its decision interval included, and refuses a resume or start on another), `learning-speed.mjs` (its decisions a second); a blow trains fastest with PPO from scratch on 8 workers of 4 environments, on the rate's curriculum (`curriculum`: 120 Hz first, the file's own rates mixed in) | |
| Walking and running | `locomotion-*.mjs`, `run-cycle*.mjs`, `skills/locomotion/walk-run/run-feasibility.mjs`, `mocap-import.mjs`, `bvh.mjs`, `skills/locomotion/stance/combat-locomotion.mjs`; the run cycle is fitted to CMU clips (`skills/locomotion/walk-run/run-cycle.mjs` names them and their licence) | |
| Strikes and fights | `arena-combat*.mjs`, `combat-*.mjs`, `strike-*.mjs`, `empty-hand-league.mjs`, `skills/locomotion/stance/stance-stagger.mjs`, `oracle-spread.mjs`, `cap-series.mjs` (shorter bout caps from recorded reports' bar series) | |
| Held items | the court task is an evaluation (`src/evaluation/`) | |
| Contact and the solver | `contact-*.mjs` (the one-step contact predictor, `predictPointContacts`, and the friction profiles, against the engine), `humanoid/posture/posture-limits.mjs` | |
| The reptile | `skills/strikes/bite/reptile-combat.mjs`, `skills/strikes/bite/bite-load.mjs`, `body-plan-regression.mjs` | [reptile](../docs/reference/reptile.md) |
| Other | `jump-test.mjs` (a squat jump's take-off), `pad-surface.mjs` (a pad's support surface) | |

`cma.mjs` is the resumable CMA-ES the searches share.

Travel policy seeds declare their observation transform (`normalization`) explicitly. When
estimating a transform, collect statistics through standing, entry and running phase. Replay the
initial and critic-only exports against the seed before interpreting learned checkpoints: input
clipping and float32 conversion can change physical outcomes even while the actor's weights are held.

Price a residual search with a short generation limit, then use `--resume` with the same output
prefix to extend it. The saved protocol, calibration and code identity must match; its baseline
and completed candidates are reused.

## The physics bake-off

`physics-bakeoff/` compares engines under one controller on the same cases: a standing foot and a
forearm chain for fidelity, a whole human observed with no bar, and many humans spaced or piled
for speed. The live adapters are MuJoCo and Rapier (`physics-bakeoff/engines.mjs`); the
`/physics-bench/` page runs the same cases in a browser (`src/app/browser/physics-bench/`).
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
