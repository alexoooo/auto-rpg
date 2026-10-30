# Control foundation: common tasks

The common task runner (`research/control-foundation.mjs`), its protocol and its baseline readings,
and the shared environment whose reach settings `src/control-foundation/main.ts` uses. The suites
built on it (bar, strike, support, posture) have their own records, linked below.

## Protocol 3

`control-foundation.mjs` runs the fixtures in `control-foundation-trials.mjs`, one sequential job
stream per worker (`control-foundation-worker.mjs`), on the core stand, recovery watch and arena
world as they are.

```powershell
node research/control-foundation.mjs --suite baseline --split development --workers 4
node research/control-foundation.mjs --suite recovery --split development --samples 16 --workers 4
node research/control-foundation.mjs --suite strike-block --split development --samples 16 --workers 4
```

- **Output.** A new directory under `research/runs/control-foundation/` (`--out` names one; a
  manifest is never overwritten): `manifest.json`, append-only `rows.jsonl` (completion order,
  stable task IDs), `summary.json`, and `source.json.gz`, the normalized source and JSON content
  with its hash in the manifest. A failed run keeps its rows, writes `failure.json` and stops
  every worker; a source change during a run invalidates it.
- **Manifest.** Source hash (dirty and untracked research code included), Git revision, Node
  version, lockfile identity, installed package entry hash, engine and revision. Each job declares
  model, loadout, initial geometry, controller variant, rate and watch. No fixture uses a root or
  weapon assist. Policy and physics both run every step, at 120 Hz unless `--hz` names a multiple.
- **`--actuation`.** `symmetric` is the gameplay reference; `directional` bounds each torque
  direction by its own anatomical envelope. It is world configuration, in every task ID, summary
  cell and guard pairing (protocol 1 records predate it).
- **`CORE_ENGINE`.** `rapier` keeps parent-axis limit rows; `rapier-coordinate` selects the
  measured-angle correction ([limit record](joint-limits.md)).
- **`--shared`** (point-strike, moving-strike): one club in both hands, with keep-both,
  release-left and release-right cells; gates in [shared strike](shared-strike.md).
- **`--joint-stops`** (bar, point-strike, moving-strike, defense): [near-stop
  prediction](joint-stop-tracking.md), in the task IDs; other suites refuse it.

### Starts and splits

`--samples` (default two a cell) is a screening battery, not a capability estimate; `--from` picks
another range. Development indices are below 1,000,000, held-out from 1,000,000; a range crossing
the bound is refused. A seed indexes explicit initial conditions: the fraction
`(((seed + 1) * 2654435761) >>> 0) / 4294967296` sets the shove's heading over 360 degrees or a
bout gap over [3, 5) m. Each job stores the resolved values. Candidates are frozen before a
held-out run.

### Tasks and readings

| Task | Fixture | Outcome and denominator |
|---|---|---|
| Recovery | `felled` shove: stand 1 s, 1.5 N s/kg, at most 3 s to fall; watch 40 s | Lying and rise-then-steady minds; rose is 2 continuous seconds up, success also up at the end. Denominator: falls. |
| Guard comparison | Mirror bouts capped at 20 s, both in pose against either side covering, same gap | Head and total damage, falls, duration, preparation; paired by model, loadout, seed and rate. |
| Pinned shared bar | `tasks/bar.ts` ([motion tracking](motion-tracking.md)) | Capture, movement, contact, release continuity, exact replay; each release its own denominator. |
| Standing shared items / integrated sequence | none | Explicit unsupported rows, never successes or exclusions. |

Every task records a digest of sampled segment poses, the largest joint-anchor separation,
peak segment-centre speed (startup and impact included: diagnostic, not driven), summed normal
impulse on fixed scenery (once per dynamic segment), and integrals of assist force and moment.
`World.step` is timed apart from sampling; timings are instrumented, never in digests or success.
Non-finite outcome values serialize as named strings; a non-finite physical reading fails the run.
Rates carry counts and Wilson 95 % intervals (z = 1.959963984540054); zero eligible trials has none.

## Stock baseline

The strike tasks of this baseline are those of `research/control-foundation-trials.mjs@bca8fc87`:
a high-band searched recipe thrown through `evaluateBlow` with either hand at its place, at a target
up to 0.12 m across disclosed at commitment, and at nothing, each perturbed by up to 1/240 s and
0.02 of its pushes and watched 3 s after. Harness: Node 24.19.0, core world, Rapier SIMD npm
0.21.0, 120 Hz, four workers, balance 0 %, no weapon assist. Development indices 0 and 1, all three bodies, empty or right-hand club in recovery
and bouts, either-hand clubs in strikes: 138 tasks (24 recovery, 72 strikes, 36 bouts, 6
unsupported). Source SHA256 `2188a9d03283b6207092d6d485a411c34f76ec228760ad9c536978f2bbaaa549`;
package entry SHA256 `956709f8dccb9cb4d7eb8cd2d7319089fb8864ac7b1a18a605913624c3ec82a1`. Manifest
and rows without wall-clock timings: [control-foundation-stock.json](control-foundation-stock.json).

Each cell is stock, then [directional](#directional-actuator-screening):

| Model | Held | Staged: rose and remained up / fell | Hit and stayed up / targeted throws | Stood after miss / misses | Fallen sides / 6 guard-comparison bouts |
|---|---|---|---|---|---|
| Warrior | empty | 1/2, 2/2 | 8/8, 8/8 | 4/4, 4/4 | 2, 4 |
| Warrior | club | 2/2, 2/2 | 8/8, 8/8 | 4/4, 4/4 | 3, 2 |
| Rogue | empty | 0/2, 0/2 | 8/8, 8/8 | 4/4, 4/4 | 2, 2 |
| Rogue | club | 0/2, 0/2 | 8/8, 8/8 | 4/4, 4/4 | 6, 6 |
| Skeleton | empty | 0/2, 0/2 | 8/8, 8/8 | 4/4, 4/4 | 0, 4 |
| Skeleton | club | 0/2, 0/2 | 8/8, 8/8 | 4/4, 2/4 | 1, 4 |

Prepared strikes work in these starts; recovery and bouts fail. Two seeds a cell is orientation,
not a rate.

## Directional actuator screening

Same starts and watches on vendored Rapier 0.21.0-auto-rpg.2, source SHA256
`8071ac63169f1858129c8065dc5d4f5e2f83da3bef92eb66380ed4329d9cba22`. `--actuation symmetric`
reproduces all 138 stock rows exactly (task IDs and timing aside); the directional run's rows and
manifest are [control-foundation-directional.json](control-foundation-directional.json), its cells
in the table above.

A finite velocity command can pull or brake, each within its direction's envelope; an infinite one
is one-way torque, the opposing bound zero. Delivered mean torque and both bounds are saved with the
muscle state.

In the Warrior fours diagnostic (Node stand, directional, empty, 120 Hz), `riseLimbs` moves a
predicted right-shin support from the knee to the knee-foot midpoint as a foot corner enters its
3 cm band: between steps 1019 and 1020 its z jumps from 1.279402 to 1.059866 m while the centre of
mass moves about 0.1 mm. That is a discontinuity in a desired support estimate, not contact motion.

## Controller replacement

`tests/core-direct.test.mjs@2a1b29ac` (Node stand, Rapier 0.21.0-auto-rpg.2, 120 Hz, directional, no
assist, no ground, lower trunk pinned): Warrior, Rogue and skeleton each reach 0.6 rad right-elbow
flexion within 0.025 rad after 2 s and stay in that band another second, under 0.1 s error decay,
at most 3 rad/s requested and full activation. The policy reads detached observations and acts
through validated actions, with no motor, stance or skill stack; it passes replay, idle and
resume, and disposal, and runs beside a fighter in an arena fixture.

The common body adapter keeps the game's stance-height fall allowance apart from the physical
standing-height reading. Under it all 138 screening rows equal stock (symmetric, four workers;
source SHA256 `f9298bba5c42a69248feeb172eee5100825f65a2559fd0a0b6c2400dfe8f8844`).

## Shared environment and browser parity

`createEnvironment` gives seeded reset, detached observation, checked actions held between
decisions, fixed 120 Hz physics with integer policy periods, save, load and disposal. Termination
is the task ending by its rules; truncation is the step budget running out; an invalid simulation
has its own reason. Replay restores RNG, held actions, decision phase and task, controller and
physics state, across a reset to another seed. A snapshot of another solver artifact, actuator
law, anatomy or configuration is refused without touching the live episode.

The reach fixture (`tasks/reach.ts`, the page's `configuration`) pins the lower trunk, with gravity
and no ground:

| Setting | Value |
|---|---:|
| Goal: right-elbow flexion, seeded uniform | [0.5, 0.7) rad |
| Success: error at most, for consecutive steps | 0.025 rad, 120 steps |
| Step budget (`maxSteps`) | 360 |
| Policy period (`policyPeriodSteps`) | 4 steps (30 Hz) |
| Direct feedback: error decay, speed cap, activation | 0.1 s, 3 rad/s, 1 |
| Layered joint servo (`servoSeconds`) | 0.1 s |

Both controllers use directional actuation and no root or weapon assist; pin reactions are not
metered. These are fixture settings, not anatomy.

```powershell
node research/control-foundation.mjs --suite reach --actuation directional --from 42 --samples 1 --workers 4
```

Harness: Node 24.19.0 and Chrome on the built `/control-foundation.html`, Rapier
0.21.0-auto-rpg.2, 120 Hz, development seed 42 (target 0.6202207503840327 rad). **Verify replay**
saves at step 14, between decisions, and replays from there. Every cell matches its own replay and
Node's full observation SHA256, negative zero included; no browser errors.
[Manifest and rows](control-foundation-reach.json); source SHA256
`bb99d0e76d963a5c7f262fb41c3ab537845ff4b7223795893630317e45b88ae2`.

| Body | Controller | Success step | Full observation SHA256 in Node and Chrome |
|---|---|---|---|
| Warrior | actuator | 161 | `3e41072fb20711e879bafa165c8afc4aba0398a1b7f6548fd4547d433bdd19a7` |
| Warrior | layered | 179 | `d5b7ef7d89f0006e720290f8b32f113388dcba9f95b92ff3c8372904dafe8651` |
| Rogue | actuator | 162 | `7e42e9475ec0ac38de9d7ffff65c42be71c7554779bd2842a388fe46ab05dadc` |
| Rogue | layered | 180 | `b43f201c672ce3ba06116fe9103a94b46f267a193a585e1eafdd4f5f2ed5bf1c` |
| Skeleton | actuator | 161 | `fdbd3c53ae22119802cc198782658fbc5f1c9fb3de9b30733baf2121b78985c8` |
| Skeleton | layered | 179 | `a38550ae9268b35035953e7b9c6b0c7fd6d09d85ed23aa5bde0f626acd884c18` |

This checks reproducibility and replaceability; it does not rank controllers. The standing bar is
in [standing shared equipment](standing-bar.md) and [the captured-posture
comparison](bar-posture.md); the physical tasks' page is [control tasks](control-tasks-browser.md).
