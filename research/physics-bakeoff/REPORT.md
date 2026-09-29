# Physics bake-off: Havok, MuJoCo, Rapier

2026-09-29. The question: for this game in a browser, is MuJoCo or Rapier better than Havok on
fidelity **and** on speed? Jolt was optional and was not run (see the end).

Every figure names its harness. **Node** is Node v24.19.0 on the development desktop (16 cores,
32 threads), one process, one thread. **Chrome** is `physics-bench.html` on the same machine, the
page's main thread. Times are medians of repeated runs unless a row says otherwise.

**The answer, in short.** Rapier (the SIMD build, 0.21) beats Havok on both. Under the same
controller it passes the clean fidelity bar at one sub-step, which Havok never reaches; Havok
needs 12 sub-steps to reach today's bar. At those passing settings Rapier SIMD holds 23 standing
humans within a 3 ms step against Havok's 9 (Node; Chrome 21 against 8), and 12 against 8 in a
pile. MuJoCo is the most exact on the arm and the cheapest to read, but it resets itself when bodies
pile up unless it is conditioned. Conditioned, it holds 15 humans spaced and 12 piled, and slows
sharply past 16 piled bodies. It is the largest download (1.9 MiB brotli) and the largest port.
MuJoCo's threaded build deploys on GitHub Pages through a service worker, but on Windows its pool
stalls in 16 ms steps and is slower than one thread. The recommendation and its caveats are at
the end.

## Packages

| engine | package | version | what the page loads |
|---|---|---|---|
| Havok | `@babylonjs/havok` | 1.3.14 (with `@babylonjs/core` 9.18.1) | `HavokPhysics.wasm` + a 67 kB ES loader |
| MuJoCo | `@mujoco/mujoco` | 3.14.0 (Google DeepMind's official wasm bindings) | `mujoco.wasm` + a 293 kB Emscripten loader; `mt/` is a threaded build |
| Rapier | `@dimforge/rapier3d-compat` | 0.21.0 | one ES module with the wasm inlined as base64 |
| Rapier SIMD | `@dimforge/rapier3d-simd-compat` | 0.21.0 | the same, built with wasm SIMD |

MuJoCo's README calls its Windows support experimental; it ran without trouble here, in Node and
in Chrome. Its loader imports Node's `module` under a Node check, which Vite reports as
externalized for the browser and which does no harm.

## Setup

All code is in `src/physics-bench/` (engine adapters, the shared controller, the cases, the page)
and `research/physics-bakeoff/` (Node runners, results). Nothing in `src/core/` or the old path was
changed.

**One body, every engine.** `model.ts` reads `humanSpec("workshop-fighter")` -- each segment's
mass, centre of mass, principal inertia, shapes, each joint's centre, freedoms, ranges and muscle
peaks -- and hands every adapter the same neutral body. Two simplifications, the same for all: each
body is built world-aligned at its centre of mass, and a trunk convex hull becomes its bounding box.
Havok additionally runs the core's own `buildBody` (`havok-real.ts`) as the baseline of what the game
does today.

**One controller, every engine** (`control.ts`). No engine motor is used. At 120 Hz the page reads
each segment's pose and velocity back, computes joint torques in JavaScript and hands them to the
engine as world torques held over its sub-steps. The law is the core servo's (`servo.ts`): each
freedom asks for a critically damped acceleration of its error at T = 0.1 s (`SERVO_SECONDS`), and
the torques are the joint-space inertia times those accelerations, `J^T diag(m, I) J a`, plus the
gravity moment of the side held up, clamped to the muscle's isometric peak. It lacks the core
servo's bias term and its re-solve after a clamp. A stance foot is read as the ground. Two earlier
laws were rejected on the way (the doc comments in `control.ts` and `cases.ts` have the numbers).
The first was a PD per joint with gains sized to the inertia each joint holds up; it rang on light
segments at 120 Hz in every engine, as the core found. The second was a whole-human placement that
counted the pelvis twice or cantilevered the shared weight; it squeezed the pelvis between the legs
until the ankles saturated.

**Engine knobs** (`engines/*.ts`, each read from the package's `.d.ts` and README):

- **Havok**:
  - `substeps` (the solver step; `HP_World_SetIdealStepTime` follows it)
  - damping (Havok's own 0.1 angular, as the core's bodies have, or zero)
  - the feet's inertia factor (the core's `STANCE_FOOT_CONDITIONING`)
  - Havok exposes no iteration count. It is stepped through the raw `HP_*` calls, not Babylon's
    scene step.
- **MuJoCo**:
  - MJCF built as a string, reduced coordinates: a free joint per model and a hinge per spec
    freedom, composed in freedom order
  - `substeps`, `solver` (Newton, CG, PGS), `iterations`, `ls_iterations`
  - `integrator` (Euler, implicitfast, implicit, RK4), `cone`, `noslip`
  - `timeconst` (every geom's contact `solref` time constant)
  - torques go in `xfrc_applied`; the state is read between `mj_step1` and `mj_step2`
- **Rapier**:
  - generic impulse joints, maximal coordinates like Havok, the free axes limited through the raw
    `jointSetLimits` (the typed API limits only one-axis joints)
  - `substeps`, `iterations` (`numSolverIterations`), `pgs` (`numInternalPgsIterations`)
  - `contactHz` (`contact_natural_frequency`)
  - `joints: "multibody"` (reduced coordinates)

**The cases**:

- **A, the standing foot**: the left leg of the Warrior with the rest of the body as one block on
  the hip, foot on the ground, held for 10 s.
- **B, the forearm chain**: the right arm on a fixed shoulder at guard. It holds, swings the elbow
  from 1.3 to 0.2 rad in 0.15 s at 2.5 s, stops and holds, over 4 s. Its measures are hand and
  wrist jitter, the ringing after the stop, and the elbow's deviation from the reference's path.
- **C, one whole human on both feet** for 10 s: the scaling load. It was added after the bars
  were written, when the first scaling run was found to be timing humans that fell (below), so it
  is an observation and judges nothing.

**The bars, written before any engine but Havok was run** (`thresholds.mjs`):

- **today**: at least as good as Havok does today.
  - A is read off the core's own stance: the Warrior, velocity motors in the solver, feet ×100,
    120 Hz (`baseline-today.mjs`), which stands with foot spin 0.00037 rad/s, tilt 0.39°, drift
    6.6 mm. The marks are spin 0.01 rad/s, tilt 0.4°, drift 7 mm. The shared torque law cannot
    stand Havok at one sub-step at any conditioning tried.
  - B is Havok today under the shared law: hand jitter 0.289 rad/s, wrist 0.609, ringing 0.242,
    deviation 0.039 rad.
- **clean**: what the fine reference reaches, within floors no player could see.
  - A: spin 0.01 rad/s, tilt 0.1°, drift 1 mm.
  - B: jitter 0.01 rad/s, deviation 0.01 rad, ringing within 0.01 rad/s of the reference's
    0.0784.

The reference is MuJoCo at 16 sub-steps (1920 Hz). Rapier at 16 sub-steps follows its elbow
within 0.0026 rad, and Havok within 0.016.

## Fidelity

Node. Each engine was swept over its knobs:

- Havok: 90 settings (1-32 sub-steps × damping × feet ×1-×1000)
- MuJoCo: 78 settings (1-4 sub-steps × solver × iterations × integrator × cone × contact time
  constant)
- Rapier: 151 settings (1-16 sub-steps × iterations × PGS iterations × feet × contact frequency,
  and multibody)

The table shows each engine's cheapest setting that passes both cases at the **today** bar, by the
cost of 8 humans (`candidates.mjs`):

| engine, setting | A: spin rad/s, tilt °, drift mm | B: hand, wrist jitter rad/s | B: deviation rad, ring rad/s | clean bar |
|---|---|---|---|---|
| Havok today (1 step, feet ×100) | **falls** | 0.289, 0.609 | 0.039, 0.241 | no |
| Havok, 12 sub-steps, feet ×300 | 0.0066, 0.0058, 1.39 | 0.023, 0.051 | 0.015, 0.083 | no (hand jitter) |
| MuJoCo, 2 sub-steps, defaults | 9e-8, 7e-6, 7e-5 | 5e-5, 5e-5 | 0.024, 0.080 | no (deviation) |
| MuJoCo, 1 sub-step, contact tc 0.03 | 8e-6, 5e-4, 8e-4 | 1e-4, 1e-4 | **0.052**, 0.082 | fails B's deviation mark |
| Rapier, 1 sub-step, 16 iter, 2 PGS, feet ×100 | 0.0027, 0.078, 0.0002 | 3e-4, 7e-4 | 0.00095, 0.078 | **yes** |
| Rapier SIMD, the same | 0.0027, 0.078, 0.0005 | 3e-4, 6e-4 | 0.00095, 0.078 | **yes** |
| MuJoCo, 4 sub-steps, armature 0.001 kg m² (`mujoco-pile`, added after the pile, below) | 6e-8, 5e-6, 6e-5 | 1.2e-3, 1.2e-3 | 0.026, 0.194 | no (deviation, ringing) |

What the sweeps show:

- **Havok:**
  - Case A fails at every setting from 1 to 8 sub-steps, at every conditioning. It passes the
    today bar from 12 sub-steps (1440 Hz), and only with the feet at ×300; ×100 needs 32
    sub-steps, and ×1000 never passes.
  - It never reaches the clean bar: hand jitter is 0.009 rad/s even at 32 sub-steps.
  - Case B alone passes today's bar from 2 sub-steps; Havok today is the bar.
  - Its damping setting makes no difference that matters.
- **MuJoCo:**
  - It needs no conditioning in case A.
  - At one sub-step case A needs a softer contact (time constant 0.03-0.06 s; at the default
    0.02, the foot buzzes at 0.37 rad/s).
  - Case B is jitter-free at every setting (1e-4 rad/s). Its only fault is the path. Its default
    integrator is semi-implicit Euler in joint coordinates, and the elbow's swing lags the
    reference by 0.052 rad at 120 Hz, 0.024 at 240 Hz and 0.011 at 480 Hz. Only RK4 at 4
    sub-steps reaches the clean bar (0.0007).
  - PGS, and CG with few iterations, diverge on case A; Newton is the solver to use.
- **Rapier:**
  - It needs the feet conditioned (×100), like Havok. Unconditioned, it stands but rocks
    (tilt 1.6° at 16 sub-steps).
  - Once conditioned, it passes the clean bar cheaply. At one sub-step with 16 iterations it is
    as good as three other ways of spending the same iterations, {2 sub-steps, 8 iterations} and
    {4, 4}, because case B's deviation follows the total iteration count, not the sub-steps.
  - `contact_natural_frequency` produced no pass the defaults did not.
  - Multibody joints are unusable here: the JS API gives them no limits, case A panics inside
    the wasm (`RuntimeError: unreachable`), and case B deviates 0.149 rad.

**Case C, one whole human, 10 s** (Node, the shared law at T = 0.1 s, `case-c.mjs`). The centre of
mass's height at 0.5 s and at the end, its horizontal drift, and the fastest segment after 1 s:

| engine, setting | feet | COM m | drift mm | max speed m/s |
|---|---|---|---|---|
| MuJoCo, 2 sub-steps | ×1 | diverges (resets itself) | -- | 1.2e5 |
| MuJoCo, 16 sub-steps | ×1 | 1.170 → 0.736 | 927 | 1289 |
| MuJoCo, 2 sub-steps | ×100 | 1.016 → 1.023 | 15.8 | 0.04 |
| MuJoCo, 1 sub-step, tc 0.03 | ×100 | 1.014 → 1.021 | 18.7 | 0.06 |
| Rapier, 16 sub-steps | ×1 | 0.996 → 0.303, falls | 2301 | 23.8 |
| Rapier, 1 sub-step, 16 iter, 2 PGS | ×100 | 1.014 → 1.014 | 0.4 | 0.02 |
| Rapier SIMD, the same | ×100 | 1.014 → 1.014 | 0.4 | 0.02 |
| Havok today, 1 sub-step | ×100 | 1.016 → 0.235, falls | 1470 | 14.5 |
| Havok, 12 sub-steps | ×300 | 1.021 → 1.022 | 0.2 | 0.00 |

- **The feet's inertia conditioning is the control law's need as much as Havok's.** A torque servo
  that reads the stance foot as the ground drives a light foot with gains sized to half the body.
  Without the factor that diverges even in MuJoCo at 1920 Hz, and Rapier falls. With it, all three
  stand.
- Havok at 12 sub-steps is the stillest. Rapier is as still at one sub-step. MuJoCo creeps (16 mm
  in 10 s, 7 mm up: its soft contacts settle).
- **The first scaling run was void.** Before the whole-human placement was fixed, every scaling
  human fell or flailed, and MuJoCo reset itself on diverged accelerations about once a second.
  Those timings were thrown away and the runs below were taken again.

## Performance

Each engine at its chosen setting (`src/physics-bench/chosen.ts`), N simplified humans at 120 Hz,
the shared controller and a full state read every step. **Spaced**: a grid 2 m apart, each human
standing. **Pile**: layers of 8 dropped 1.9 m apart onto one another, timed after 1.5 s. Each (layout, N) is
three fresh worlds; each run's median and 95th percentile of 360 timed steps, then the median of
the three runs. The rows:

- `havok`: the cheapest Havok that passes both cases (12 sub-steps, feet ×300).
- `havok-today`: one sub-step, the neutral human. It fails case A, and its humans fall (case C).
- `havok-real-today`: one sub-step, the core's own `buildBody` humans: the cost of what ships.
  Its humans fall too, so both "today" rows time fallen bodies. They are the cost baseline, not a
  passing setting.
- `mujoco` (2 sub-steps) and `mujoco-1step` (one sub-step, softer contacts; fails B's deviation).
- `mujoco-pile`: 4 sub-steps and `armature` 0.001 kg m² on every hinge. This is the cheapest
  MuJoCo that passes both cases and holds the pile (below).
- `rapier` and `rapier-simd`: one sub-step, 16 iterations, 2 PGS; they pass the clean bar.

**MuJoCo diverges in the pile at its chosen settings.** The 2-sub-step and one-sub-step rows
reset. When the second layer lands, a light freedom runs away (an upper arm at 1.5e5 rad/s by
0.39 s), and MuJoCo's automatic reset (the BADQVEL warning) puts the whole world back to its start.
It does the same with the controller switched off (a throwaway probe, not kept), so the
cause is not the controller. Their pile rows therefore time a world that was restarted once, with
all 64 humans "upright" because they were reset. They are kept for the record, and
`mujoco-pile` is the MuJoCo row that holds.

`mujoco-armature.mjs` (Node) measured the armature's cost at each setting: MuJoCo's warning
counters, counted over a controlled pile of 16, 32 and 64.

| sub-steps | armature kg m² | A (today, clean) | B deviation rad | B hand jitter rad/s | B today | C drift mm | pile resets 16 / 32 / 64 |
|---|---|---|---|---|---|---|---|
| 2 | 0 | pass, pass | 0.0244 | 5.3e-5 | pass | 15.8 | 1 / 1 / 1 |
| 2 | 0.0001 | pass, pass | 0.0235 | 6.2e-5 | pass | 15.9 | 1 / 1 / 1 |
| 2 | 0.001 | pass, pass | 0.0302 | 9.0e-4 | pass | 15.8 | 0 / 0 / 1 |
| 2 | 0.003 | pass, pass | 0.0592 | 1.6e-2 | **FAIL** | 15.6 | 0 / 0 / 0 |
| 2 | 0.01 | pass, pass | 0.1090 | 8.8e-2 | **FAIL** | 15.2 | 0 / 0 / 0 |
| 4 | 0.001 | pass, pass | 0.0256 | 1.2e-3 | pass | 15.6 | 0 / 0 / 0 |
| 2 | 0.002 | pass, pass | 0.0467 | 7.0e-3 | **FAIL** | 15.5 | 0 / 0 / 0 |
| 4 | 0.002 | pass, pass | 0.0423 | 8.5e-3 | **FAIL** | 15.6 | 0 / 0 / 0 |

### Node

`perf.mjs` under `run-perf.sh`, one process, `--expose-gc --max-semi-space-size=64`. The busy share
of the whole machine (32 logical CPUs) over each run is in its `results/perf-*.json`: the Havok
rows 4-5 %, Rapier 5-6 %, MuJoCo 10-12 %, `mujoco-pile` 23 % (its first run, at 98 % busy while
another session searched, was discarded and repeated). "Humans in 3 ms" interpolates linearly
between the measured N; "(solver + read)" leaves the shared control law out.

#### spaced: total ms a step, median (p95)

| setting | N=1 | N=2 | N=4 | N=8 | N=16 | N=32 | N=48 | N=64 | humans in 3 ms (total) | (solver + read) |
|---|---|---|---|---|---|---|---|---|---|---|
| havok-today | 0.07 (0.10) | 0.13 (0.14) | 0.24 (0.26) | 0.48 (0.55) | 0.95 (1.01) | 1.87 (2.02) | 2.84 (3.02) | 3.72 (3.98) | 51 | 58 |
| havok-real-today | 0.09 (0.10) | 0.15 (0.16) | 0.28 (0.31) | 0.55 (0.60) | 1.08 (1.16) | 2.15 (2.31) | 3.29 (3.52) | 4.60 (5.16) | 44 | 49 |
| havok | 0.40 (0.42) | 0.75 (0.79) | 1.45 (1.52) | 2.81 (3.00) | 5.56 (5.84) | 11.2 (12.3) | 16.9 (20.2) | 22.4 (23.7) | 9 | 9 |
| mujoco | 0.10 (0.11) | 0.21 (0.26) | 0.41 (0.45) | 0.82 (0.87) | 1.59 (1.71) | 3.23 (3.55) | 4.90 (5.78) | 7.28 (8.37) | 30 | 32 |
| mujoco-1step | 0.06 (0.06) | 0.11 (0.11) | 0.21 (0.22) | 0.43 (0.51) | 0.86 (0.88) | 1.71 (1.78) | 2.54 (2.66) | 3.50 (3.81) | 56 | 63 |
| mujoco-pile | 0.20 (0.20) | 0.40 (0.42) | 0.79 (0.81) | 1.56 (1.60) | 3.10 (3.27) | 6.20 (6.35) | 9.46 (9.95) | 12.9 (14.0) | 15 | 16 |
| rapier | 0.28 (0.33) | 0.49 (0.51) | 0.96 (1.20) | 1.86 (2.09) | 4.55 (4.90) | 9.22 (11.0) | 13.8 (16.2) | 18.5 (20.8) | 11 | 12 |
| rapier-simd | 0.24 (0.27) | 0.47 (0.49) | 0.88 (1.02) | 1.77 (1.85) | 2.19 (2.35) | 3.96 (4.28) | 5.97 (6.65) | 7.52 (8.36) | 23 | 26 |

#### pile: total ms a step, median (p95)

| setting | N=1 | N=2 | N=4 | N=8 | N=16 | N=32 | N=48 | N=64 | humans in 3 ms (total) | (solver + read) |
|---|---|---|---|---|---|---|---|---|---|---|
| havok-today | 0.07 (0.08) | 0.13 (0.19) | 0.25 (0.27) | 0.48 (0.53) | 1.00 (1.07) | 2.13 (2.21) | 3.51 (3.81) | 4.84 (5.76) | 42 | 46 |
| havok-real-today | 0.08 (0.09) | 0.15 (0.16) | 0.29 (0.30) | 0.57 (0.59) | 1.17 (1.21) | 2.52 (2.69) | 4.13 (4.61) | 6.24 (7.45) | 37 | 39 |
| havok | 0.40 (0.60) | 0.75 (0.77) | 1.46 (1.50) | 2.80 (2.85) | 7.00 (7.20) | 14.4 (15.0) | 23.0 (24.8) | 32.7 (35.5) | 8 | 8 |
| mujoco | 0.11 (0.13) | 0.22 (0.23) | 0.44 (0.45) | 0.87 (0.92) | 1.65 (1.91) | 3.26 (4.21) | 4.75 (6.16) | 6.05 (8.15) | 29 | 32 |
| mujoco-1step | 0.06 (0.06) | 0.12 (0.12) | 0.23 (0.24) | 0.45 (0.46) | 0.89 (1.09) | 1.67 (2.52) | 2.43 (3.70) | 3.20 (4.56) | 60 | >64 |
| mujoco-pile | 0.19 (0.20) | 0.40 (0.41) | 0.78 (0.81) | 1.55 (1.63) | 4.56 (5.48) | 38.3 (71.1) | 39.7 (116.0) | 105.0 (775.4) | 12 | 12 |
| rapier | 0.26 (0.28) | 0.48 (0.53) | 0.93 (1.02) | 1.84 (1.91) | 4.70 (5.03) | 11.4 (13.0) | 18.1 (20.7) | 25.6 (30.3) | 11 | 12 |
| rapier-simd | 0.24 (0.25) | 0.45 (0.47) | 0.89 (0.92) | 1.79 (1.83) | 4.06 (4.17) | 6.35 (7.10) | 9.25 (10.6) | 13.4 (16.3) | 12 | 13 |

#### the split, ms a step, median (p95), and memory

| setting | layout N | solver | read | control | alloc B/step | GCs in timed steps | upright |
|---|---|---|---|---|---|---|---|
| havok-today | spaced 8 | 0.302 (0.346) | 0.122 (0.165) | 0.053 (0.059) | 34735 | 0/0/0 | 0/0/0 of 8 |
| havok-today | spaced 32 | 1.166 (1.278) | 0.489 (0.560) | 0.211 (0.225) | 137555 | 0/0/0 | 0/0/0 of 32 |
| havok-today | pile 8 | 0.303 (0.330) | 0.123 (0.130) | 0.052 (0.056) | 127831 | 0/0/0 | 0/0/0 of 8 |
| havok-today | pile 32 | 1.419 (1.486) | 0.495 (0.523) | 0.216 (0.235) | 137556 | 0/0/0 | 0/0/0 of 32 |
| havok-real-today | spaced 8 | 0.409 (0.450) | 0.083 (0.090) | 0.056 (0.059) | 82366 | 0/0/0 | 0/0/0 of 8 |
| havok-real-today | spaced 32 | 1.582 (1.739) | 0.344 (0.359) | 0.219 (0.229) | 95751 | 0/0/0 | 0/0/0 of 32 |
| havok-real-today | pile 8 | 0.431 (0.452) | 0.083 (0.085) | 0.055 (0.057) | 164879 | 0/0/0 | 0/0/0 of 8 |
| havok-real-today | pile 32 | 1.957 (2.103) | 0.356 (0.386) | 0.219 (0.230) | 95751 | 0/0/0 | 0/0/0 of 32 |
| havok | spaced 8 | 2.640 (2.814) | 0.124 (0.134) | 0.050 (0.060) | 3304 | 0/0/0 | 8/8/8 of 8 |
| havok | spaced 32 | 10.5 (11.4) | 0.495 (0.528) | 0.202 (0.377) | 10706 | 0/0/0 | 32/32/32 of 32 |
| havok | pile 8 | 2.622 (2.668) | 0.124 (0.129) | 0.050 (0.055) | 3252 | 0/0/0 | 8/8/8 of 8 |
| havok | pile 32 | 13.7 (14.3) | 0.497 (0.515) | 0.215 (0.238) | 10838 | 0/0/0 | 0/0/0 of 32 |
| mujoco | spaced 8 | 0.759 (0.795) | 0.002 (0.002) | 0.053 (0.060) | 8554 | 0/0/0 | 8/8/8 of 8 |
| mujoco | spaced 32 | 2.989 (3.118) | 0.007 (0.009) | 0.226 (0.404) | 31026 | 0/0/0 | 32/32/32 of 32 |
| mujoco | pile 8 | 0.817 (0.856) | 0.002 (0.002) | 0.053 (0.065) | 7986 | 0/0/0 | 8/8/8 of 8 |
| mujoco | pile 32 | 2.964 (3.824) | 0.007 (0.010) | 0.267 (0.477) | 31022 | 0/0/0 | 32/32/32 of 32 |
| mujoco-1step | spaced 8 | 0.372 (0.385) | 0.002 (0.002) | 0.053 (0.108) | 17995 | 0/0/0 | 8/8/8 of 8 |
| mujoco-1step | spaced 32 | 1.485 (1.523) | 0.007 (0.008) | 0.213 (0.242) | 31026 | 0/0/0 | 32/32/32 of 32 |
| mujoco-1step | pile 8 | 0.398 (0.408) | 0.002 (0.002) | 0.050 (0.052) | 7986 | 0/0/0 | 8/8/8 of 8 |
| mujoco-1step | pile 32 | 1.455 (2.207) | 0.007 (0.007) | 0.210 (0.230) | 31022 | 0/0/0 | 32/32/32 of 32 |
| mujoco-pile | spaced 8 | 1.510 (1.548) | 0.002 (0.002) | 0.052 (0.060) | 7986 | 0/0/0 | 8/8/8 of 8 |
| mujoco-pile | spaced 32 | 5.966 (6.064) | 0.007 (0.008) | 0.217 (0.307) | 31026 | 0/0/0 | 32/32/32 of 32 |
| mujoco-pile | pile 8 | 1.499 (1.570) | 0.002 (0.003) | 0.052 (0.063) | 7986 | 0/0/0 | 8/8/8 of 8 |
| mujoco-pile | pile 32 | 35.5 (66.2) | 0.069 (0.126) | 2.464 (5.167) | 31026 | 0/0/0 | 0/0/0 of 32 |
| rapier | spaced 8 | 1.713 (1.922) | 0.048 (0.053) | 0.093 (0.142) | 18860 | 0/0/0 | 8/8/8 of 8 |
| rapier | spaced 32 | 8.633 (9.673) | 0.190 (0.218) | 0.378 (0.761) | 75952 | 0/0/0 | 32/32/32 of 32 |
| rapier | pile 8 | 1.700 (1.766) | 0.047 (0.049) | 0.090 (0.114) | 158626 | 0/0/0 | 8/8/8 of 8 |
| rapier | pile 32 | 10.8 (12.4) | 0.184 (0.205) | 0.375 (0.598) | 79876 | 0/0/0 | 0/0/0 of 32 |
| rapier-simd | spaced 8 | 1.617 (1.687) | 0.049 (0.052) | 0.092 (0.129) | 19099 | 0/0/0 | 8/8/8 of 8 |
| rapier-simd | spaced 32 | 3.389 (3.491) | 0.197 (0.208) | 0.358 (0.447) | 76293 | 0/0/0 | 32/32/32 of 32 |
| rapier-simd | pile 8 | 1.640 (1.679) | 0.049 (0.052) | 0.090 (0.104) | 158868 | 0/0/0 | 8/8/8 of 8 |
| rapier-simd | pile 32 | 5.782 (6.359) | 0.193 (0.206) | 0.363 (0.509) | 80018 | 0/0/0 | 1/1/1 of 32 |

What the tables say (Node harness unless named):

- **At a passing setting, Rapier SIMD holds the most humans in 3 ms a step**: 23 spaced, against
  Havok's 9 and MuJoCo's 15 (the conditioned MuJoCo, `mujoco-pile`). At 64 humans spaced it takes
  7.5 ms, Havok 22.4 and MuJoCo 12.9. In the pile the gap narrows: 12 humans against Havok's 8 and
  MuJoCo's 12, and at 64 in the pile Rapier SIMD takes 13.4 ms, Havok 32.7, MuJoCo 105 (with a 95th
  percentile of 775 ms: its Newton solver slows sharply once dozens of bodies touch).
- **SIMD matters to Rapier from about 16 humans**: below 8 both builds cost the same; at 64 spaced
  the scalar build takes 18.5 ms against 7.5. Only the SIMD build is worth shipping; wasm SIMD is in
  every current major browser (Safari since 16.4).
- **Havok as it ships is the fastest row and the wrong one.** One sub-step holds 51 (neutral human)
  or 44 (the core's own `buildBody`) spaced humans in 3 ms, but its humans fall in case C, so those
  rows time bodies lying on the ground. To stand the same humans under this controller Havok needs
  12 sub-steps, and the cost goes up by a factor of about 6 (the solver is the whole of it).
- **MuJoCo's unconditioned rows are fast and reset in the pile.** At 2 sub-steps it holds 30 humans
  (one sub-step, 56), but those pile rows time a world that restarted itself; the conditioning that
  prevents it (4 sub-steps, armature) halves its speed.
- **Reading the state back**: MuJoCo's reads are typed-array views of its heap, 0.002 ms for 8
  humans. Rapier's cost 0.05 ms and Havok's 0.12 (0.49 at 32 humans, a quarter of the whole
  Havok-today step). The control law itself is the same JavaScript everywhere, 0.05 ms for 8
  humans and 0.2 for 32 (Rapier's 0.09 and 0.37 include its torque calls).
- **Allocation**: every engine allocates in the step, but none triggered a collection in the
  timed steps (the runner gives V8 a 64 MB young generation, so this proves little about pauses in
  a browser's default 16 MB one). The rate is the figure to read: at 32 humans Havok today
  allocates 138 KB a step (the per-call read allocations of H50), Rapier 76-80 KB, MuJoCo 31 KB,
  and the passing Havok 11 KB (its cost is in the solver, which allocates nothing visible to JS).
  At 120 Hz Rapier's 76 KB is 9 MB/s of short-lived garbage, a minor collection every second or
  two at the default young generation. That was not measured in Chrome.
- **Chrome agrees with Node** within 0-20 % at a passing setting (Chrome harness, hidden tab,
  one run for Havok and Rapier, three for MuJoCo; the table below). The piles differ more, as a
  chaotic pile should: MuJoCo's conditioned pile of 32 took 13 ms in Chrome and 38 in Node.

### Chrome

The page (`physics-bench.html?auto=1`), Chrome on the same machine, built with
`--base=/auto-rpg/` and served by `vite preview` on a port of its own, cross-origin isolated by
`coi-sw.js` (so `performance.now()` has its fine resolution). The tab was in the background: it
yields between runs through a `MessageChannel`, which Chrome does not throttle as it does timers.
Two passes on a quiet machine: MuJoCo's three rows at every N with three runs each, then Havok and
Rapier at N = 1, 4, 16, 32, 64 with one run each (to finish before another session's CPU-bound
search started). MuJoCo's conditioned pile of 64 was not run in Chrome. The column "in 3 ms" is
interpolated linearly between the measured N, as in Node.

Total ms a step, median:

| setting | spaced 1 | 4 | 16 | 32 | 64 | in 3 ms | pile 1 | 4 | 16 | 32 | 64 | in 3 ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| havok-today | 0.07 | 0.29 | 1.10 | 2.22 | 4.51 | 43 | 0.08 | 0.30 | 1.17 | 2.48 | 5.62 | 37 |
| havok-real-today | 0.09 | 0.31 | 1.21 | 2.45 | 4.94 | 39 | 0.09 | 0.31 | 1.27 | 2.82 | 6.29 | 34 |
| havok | 0.40 | 1.49 | 5.76 | 11.7 | 24.0 | 8 | 0.41 | 1.48 | 7.08 | 15.4 | 35.3 | 7 |
| mujoco | 0.11 | 0.45 | 1.73 | 3.39 | 6.98 | 28 | 0.12 | 0.46 | 1.75 | 3.34 | 6.47 | 29 (reset) |
| mujoco-1step | 0.06 | 0.25 | 0.97 | 1.93 | 3.97 | 49 | 0.10 | 0.27 | 1.02 | 1.93 | 3.73 | 51 (reset) |
| mujoco-pile | 0.20 | 0.80 | 3.15 | 6.27 | 13.0 | 15 | 0.19 | 0.79 | 4.47 | 13.2 | -- | 11 |
| rapier | 0.26 | 0.94 | 4.41 | 9.19 | 18.6 | 11 | 0.26 | 0.95 | 4.75 | 11.4 | 27.2 | 10 |
| rapier-simd | 0.23 | 0.85 | 2.32 | 4.34 | 8.49 | 21 | 0.22 | 0.86 | 3.90 | 6.55 | 14.5 | 12 |

- **The ranking is Node's.** Chrome's medians are 0-20 % above Node's at the same N (64 spaced:
  Havok 24.0 against 22.4, Rapier SIMD 8.5 against 7.5, MuJoCo conditioned 13.0 against 12.9).
- **Chrome's tails are longer**: the 95th percentile is typically 1.3-2 times the median in the
  page (Rapier SIMD at 64 spaced: 14.6 ms against 8.5), against about 1.1 times in Node. The page
  shares its main thread; a game would see this too unless the world moves into a worker.
- **Fidelity in Chrome repeats Node's** to two or three figures: Rapier SIMD case A spin 0.0027
  rad/s, tilt 0.084°, B hand jitter 0.0003 rad/s, C drift 0.35 mm; Havok at 12 sub-steps A spin
  0.0066, B hand jitter 0.023, C drift 0.2 mm; Havok today falls in A and C, as in Node.

## MuJoCo's threaded build

The owner asked that MuJoCo's multithreaded WASM build not be ruled out, and that it be measured
single-threaded and with several threads at the same body counts, with what it needs to deploy.

**What it is.** `@mujoco/mujoco/mt` is the same MuJoCo 3.14.0 built with Emscripten pthreads
(`mt/mujoco.wasm`, 10.42 MB raw against 10.31 MB). At load it starts a pool of web workers, one
for each of `navigator.hardwareConcurrency` (32 here), each instantiating the wasm module on
shared memory. MuJoCo then uses a thread pool bound to one `MjData` (`mju_threadpool(data, n)`,
declared in both builds' `.d.ts`; the single-threaded build has the function but no threads).
What MuJoCo 3.14 runs on that pool is not documented in the package; the timings below are what it
does for this scene.

**Measured both ways** at the chosen MuJoCo setting (2 sub-steps, feet ×100), the same N as every
other row. `mujoco` is the single-threaded build; `mujoco-mt-t1` the threaded build with no pool;
`-t2`, `-t4`, `-t8` with a pool of that many threads. Node harness (worker threads), Chrome
harness (the page, cross-origin isolated by `coi-sw.js`, below):


spaced, Node: total ms a step, median (p95)

| build, pool | machine busy | N=1 | N=2 | N=4 | N=8 | N=16 | N=32 | N=48 | N=64 |
|---|---|---|---|---|---|---|---|---|---|
| mujoco | 12 % | 0.10 (0.11) | 0.21 (0.26) | 0.41 (0.45) | 0.82 (0.87) | 1.59 (1.71) | 3.23 (3.55) | 4.90 (5.78) | 7.28 (8.37) |
| mujoco-mt-t1 | 6 % | 0.10 (0.10) | 0.20 (0.21) | 0.39 (0.40) | 0.77 (0.79) | 1.56 (1.62) | 3.09 (3.19) | 4.68 (4.95) | 6.35 (6.58) |
| mujoco-mt-t2 | 19 % | 0.10 (0.11) | 0.20 (0.22) | 0.36 (0.46) | 0.71 (32.0) | 16.3 (63.3) | 63.6 (64.1) | 64.0 (64.1) | 63.9 (64.1) |
| mujoco-mt-t4 | 16 % | 0.10 (0.10) | 0.41 (32.0) | 0.37 (30.9) | 0.77 (64.0) | 47.5 (64.0) | 63.5 (64.0) | 64.0 (64.1) | 63.9 (64.1) |
| mujoco-mt-t8 | 99 % | 0.15 (0.19) | 38.3 (68.9) | 34.3 (59.7) | 65.8 (97.2) | 65.7 (93.7) | 66.8 (99.4) | 67.6 (97.7) | 66.6 (96.3) |

pile, Node: total ms a step, median (p95)

| build, pool | machine busy | N=1 | N=2 | N=4 | N=8 | N=16 | N=32 | N=48 | N=64 |
|---|---|---|---|---|---|---|---|---|---|
| mujoco | 12 % | 0.11 (0.13) | 0.22 (0.23) | 0.44 (0.45) | 0.87 (0.92) | 1.65 (1.91) | 3.26 (4.21) | 4.75 (6.16) | 6.05 (8.15) |
| mujoco-mt-t1 | 6 % | 0.11 (0.11) | 0.22 (0.22) | 0.42 (0.45) | 0.84 (0.86) | 1.58 (1.85) | 3.02 (3.85) | 4.41 (5.81) | 5.81 (7.86) |
| mujoco-mt-t2 | 19 % | 0.11 (0.11) | 0.19 (0.22) | 0.40 (64.0) | 0.76 (48.4) | 31.9 (63.5) | 63.1 (64.1) | 63.1 (64.0) | 63.6 (64.1) |
| mujoco-mt-t4 | 16 % | 0.11 (0.11) | 0.21 (32.0) | 0.42 (0.59) | 15.4 (63.5) | 47.2 (63.7) | 63.1 (64.1) | 63.1 (64.0) | 64.6 (93.0) |
| mujoco-mt-t8 | 99 % | 0.16 (0.18) | 33.1 (53.6) | 67.6 (102.1) | 65.6 (98.7) | 65.0 (94.3) | 65.7 (99.0) | 65.2 (98.6) | 65.8 (98.5) |

Chrome (the page with `?mt=1`, a short first run, N = 4 only): the threaded build with no pool
took 0.69 ms a step, with a pool of 4 threads 31.8 ms.

- **The threaded build without a pool costs nothing**: `mujoco-mt-t1` is within a few per cent of
  the single-threaded build at every N.
- **With a pool it is slower at every N above a handful, by an order of magnitude or two.** A
  step either takes what the single-threaded build takes or it stalls, and a stall is a whole
  number of ~16 ms: medians and 95th percentiles sit at 16, 32, 48, 64 ms and nothing between.
  Once most steps stall, the time a step no longer depends on N (64 ms at 32 humans as at 64).
  More threads stall sooner: 8 threads stall at 2 humans.
- **Why, as far as it was established.** 16 ms is Windows' default timer tick (15.6 ms). On this
  machine a timed `Atomics.wait` in a worker asked to wait 0.05, 0.5, 1 or 5 ms returns after
  16.0 ms, in Node (`worker_threads`) and in Chrome (a dedicated worker in the isolated page) alike.
  Emscripten's pthreads wait on `Atomics.wait`; the stall pattern fits a pool whose idle threads
  sleep with a short timeout and so wake a whole tick late. MuJoCo's pool code is compiled into the
  wasm and was not read, so the mechanism is a hypothesis; the stall itself was measured in both
  harnesses. Linux and macOS schedule timed waits more finely, so the result may differ there;
  it was not measured. Most of this game's players are on Windows.
- **It also burns cores.** The machine's busy share over a run rose from 5 % (single-threaded) to
  16-19 % with a pool of 2-4 (Node harness, 32 logical CPUs): the pool's threads spin while they wait.
- **The `threads = 8` row is loaded**: it ran while another session's CPU-bound search held the
  machine at 99 % busy, and is kept only because its pattern is the other rows'. A rerun on the
  quiet machine was cut short after two sizes: 0.10 ms at 1 human, and 0.26 ms with a 95th
  percentile of 32.0 ms at 2, stalling from 2 humans as the loaded run did.

**What it needs to deploy.** `SharedArrayBuffer` requires the page to be cross-origin isolated:
the document served with `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` (or `credentialless`). MuJoCo's README says so, and
the build refuses to start without it (`loadEngine` throws before loading it). GitHub Pages sets no
custom headers. The workaround is a service worker that re-serves every response in its scope with
the headers added (the approach of the `coi-serviceworker` project). This bake-off ships its own,
28 lines, `public/coi-sw.js`, and checked it rather than assuming it:

- `vite preview` serves `dist` with no COOP/COEP headers, as Pages does (checked with `curl -I`).
  The build was made with `--base=/auto-rpg/`, the deploy's own path.
- `physics-bench.html?mt=1` registers `coi-sw.js` scoped to the bench page and reloads once. After
  the reload `crossOriginIsolated` is `true`, the threaded build loads (1.7 s) and runs cases A, B,
  C and the scaling rows.
- **A worker started from a URL was refused.** Dedicated workers are matched against service-worker
  scopes by their own URL. The pthread script under `assets/` was outside the page's scope, so it
  loaded without COEP and Chrome refused it (an `error` event with no message; MuJoCo waits forever
  on "loading-workers"). The fix, in `main.ts`: start each pthread from a blob that imports the
  worker bundle (Emscripten's `mainScriptUrlOrBlob`), which inherits the page's isolation. The other
  fix is to scope the service worker to the whole site, which isolates the game's pages too.
- **Vite needed `worker: { format: "es" }`**: the build uses top-level await in its worker, which
  the default `iife` worker format cannot bundle (`npm run build` failed without it).

What it would cost the deploy, if adopted:

- **The first visit loads twice.** The service worker can only add headers once it controls the
  page, so a first visit installs it and reloads. A visit where service workers are unavailable
  (some private windows, or storage blocked) does not get isolation, so it runs single-threaded or
  not at all.
- **Everything the page loads must be same-origin or send CORP/CORS.** Today the game loads nothing
  cross-origin (checked: every asset is under `/auto-rpg/`). A CDN font, analytics, or an embedded
  video would break under `require-corp`.
- **Memory and start-up.** The pool is `hardwareConcurrency` workers, each instantiating the 10.4 MB
  module: 1.7 s to load in the page against 0.46 s for the single-threaded build (Chrome, one load
  each). In Node the pool adds about 0.5 GB of resident memory before a body is built (the load
  table below).
- It does **not** only run on the dev server: it runs from a static host with no headers. Setting
  the headers in `vite.config`'s `server.headers` would make the dev server isolated but not Pages;
  the service worker is what makes Pages work.

**Verdict on threads.** On Windows, in this build, threads make MuJoCo slower, not faster, and the
threaded build is only worth its deploy cost if its pool is fixed or MuJoCo's parallel work is
coarse enough to hide a 16 ms wake-up, which at a 8.3 ms control step it cannot. The deploy path
works; the speed does not.

## Load size and init

`load-cost.mjs`. The download sizes are the files the page would fetch, compressed as a static
host would serve them. Init is the time from the module import to a usable world, cold, in a
fresh Node process. "32 humans" builds 32 of the bake-off humans and reads the process memory.
Each figure is the median of three processes (Node v24.19.0, machine quiet: another session's
search had not started).

| engine | files | raw MiB | gzip MiB | brotli MiB | init ms | build 32 humans ms | RSS after init MB | RSS with 32 humans MB |
|---|---|---|---|---|---|---|---|---|
| Havok | ES loader + `HavokPhysics.wasm` | 2.06 | 0.64 | 0.49 | 15 | 64 | +6.5 | +65 |
| MuJoCo | Emscripten loader + `mujoco.wasm` | 10.12 | 2.50 | 1.87 | 70 | 235 | +25 | +63 |
| MuJoCo, threaded | `mt/` loader + wasm | 10.24 | 2.56 | 1.92 | 204 | 225 | +491 | +529 |
| Rapier (`-compat`) | one `.mjs`, wasm inlined as base64 | 4.14 | 1.57 | 1.14 | 84 | 24 | +21 | +122 |
| Rapier SIMD (`-compat`) | the same | 4.41 | 1.57 | 1.12 | 91 | 23 | +18 | +122 |
| Rapier, the wasm alone | `rapier_wasm3d_bg.wasm` | 2.94 | 1.12 | 0.81 | | | | |
| Rapier SIMD, the wasm alone | the same | 3.14 | 1.10 | 0.80 | | | | |

Init in Chrome (the page, `window.__physicsBench.loads`, one load each, hidden tab): MuJoCo
463 ms, Rapier 576 ms, Rapier SIMD 196 ms, Havok 99 ms; MuJoCo's threaded build 1719 ms
(the earlier small MT run). The browser figures include fetching from the local preview server and
compiling the wasm, so they are larger than Node's and are single loads, not medians.

- **Rapier's `-compat` packages inline the wasm as base64**, a third larger raw; after gzip or
  brotli the gap nearly closes (1.12 against 0.80 MiB brotli). The non-`compat` packages
  (`@dimforge/rapier3d`, `rapier3d-simd`) ship the `.wasm` separately for a bundler; they were not
  installed or measured here, so the last two rows are the lower bound of what they would fetch.
- **Rapier builds a human 3 times faster than Havok and 10 times faster than MuJoCo**, whose
  per-human cost is compiling an MJCF model (the adapter compiles one model holding every human).
  MuJoCo cannot add a body to a compiled model; spawning means a recompile or a pool.
- **Memory**: Havok's world is the leanest (+65 MB for 32 humans). Rapier's grows its wasm
  heap to about twice that. The threaded MuJoCo build costs about 0.5 GB of resident memory before
  it builds anything: a pool of 32 workers (`hardwareConcurrency`), each instantiating the module.
- **Threading**: Havok's and Rapier's wasm modules each define their own unshared memory
  (read from the modules' imports and exports): single-threaded builds, and neither package ships
  another. Only MuJoCo has a threaded build (`mt/`, whose memory is imported, i.e. shared), treated
  below. Any of the three can be run inside a dedicated worker, off the render thread; that was not
  measured.

## Porting cost

What moving the core off Havok would take, file by file. The adapters written for this bake-off
(`src/physics-bench/engines/`, 150-165 lines each) are the smallest honest measure of the glue: each
builds the same 16-segment human from the spec, applies torques and reads the state back.

| file | lines | what it does with Havok | MuJoCo | Rapier |
|---|---|---|---|---|
| `src/core/engine/havok.ts` | 34 | brings `HavokPlugin` up on the scene, gravity, the fixed sub-step | rewritten: load the wasm, own an `MjModel`/`MjData` pair and step it. Babylon has no MuJoCo plugin, so the mesh sync (write each segment's `xpos`/`xquat` to its node) is new, and `World.step` calls `mj_step` itself | rewritten: `new World(gravity)`, `world.step()`; no Babylon plugin either, so the same new mesh sync from `body.translation()`/`rotation()` |
| `src/core/build/build-body.ts` | 205 | a `PhysicsBody` per segment with explicit mass properties, shapes (capsule, box, sphere, convex hull from a carrier mesh), a `Physics6DoFConstraint` per joint with limits | rewritten as an MJCF writer: a body tree, a hinge per freedom (the order of the spec's freedoms), `inertial` from the spec, geoms per shape; the hull becomes a `mesh` asset. **A model is compiled once and is static**: adding a body means recompiling the whole model (or a pool of pre-built bodies parked out of the world), which the game's spawn-on-demand bodies (dungeon) would have to be designed around | close to a line-for-line port: `RigidBodyDesc` with `setAdditionalMassProperties` (mass, centre, principal inertia and frame), `ColliderDesc` capsule/cuboid/ball/convexHull with zero density, a generic `ImpulseJointData` per joint. Limits on a multi-axis joint are reachable only through the raw `jointSetLimits`, not the typed API (as `engines/rapier.ts` does) |
| `src/core/engine/constraint.ts` | 24 | reads the applied angular impulse through Babylon's private `_pluginData` and `HP_Constraint_GetAppliedImpulses` | goes away: `qfrc_constraint`, `qfrc_actuator` and `efc_force` are public arrays in joint coordinates | no public getter for a joint's applied impulse in the 0.21 typed API; contact forces are available from the event queue. The torque read-back would have to be derived (the change in momentum across the step) |
| `src/core/muscle/driver.ts` | 286 | each freedom a Havok velocity motor with a symmetric ceiling; the side (which muscles pull) is chosen before the step; the doc comment is mostly about the motor's ring and lag (H73) | an actuator per freedom whose `forcerange` can be asymmetric, so the side choice becomes a range; or, as in this bake-off, torques in `qfrc_applied` from the servo, which removes the motor's ring from the problem entirely | Rapier's joint motors also take one symmetric max force (`setMotorMaxForce`; per-axis motors are typed only on `SphericalImpulseJoint`, a generic joint's go through the raw set), so the side choice stays; or torques through `addTorque`, as here |
| `src/core/control/stance.ts` | 985 | asks velocity motors for leg speeds so Havok's solver finds the two-leg closed chain's torques with the contact in one solve; conditions the feet (`STANCE_FOOT_CONDITIONING` = 100) because Havok exposes no iteration count | the stance's logic (plan, capture point, legSpeeds) is engine-free; the "motor inside the solver" design would change: MuJoCo solves reduced coordinates with an exact inverse dynamics (`mj_inverse`), so the closed chain could be solved outside the step instead of handed to the solver | the same motor-in-solver design ports directly (Rapier velocity motors on generic joints), with `numSolverIterations` as a real knob |

**Havok workarounds that would go** (with the history entry that paid for each):

- the collision filter on leaf shapes only (H45), and the body teleport by `disablePreStep` (H46): both engines set these directly;
- inertia per kilogram and the centre-of-mass velocity confusion (H49): both take the inertia itself and report plain SI;
- velocity reads that allocate (H50): MuJoCo reads are typed-array views of the wasm heap; Rapier 0.21's `translation()`, `rotation()`, `linvel()` take a target to write into (the allocation column below has what a step still costs);
- the asynchronously removed observers and the never-pruned constraint map (H53, H54): Babylon-plugin artefacts;
- the velocity motor's lag and ring (H73): only if the servo's torques replace motors, which works in every engine;
- float32 `Matrix` rotation noise (H75) is Babylon's, not Havok's, and stays wherever Babylon math is used;
- Havok's swing-and-halfway-twist limit measure (H76): MuJoCo's hinges are plain angles; Rapier's generic joint limits are per axis;
- no solver iteration control (the reason `STANCE_FOOT_CONDITIONING` is 100 and not a smaller factor with more iterations): Rapier has `numSolverIterations`, MuJoCo `iterations`;
- the private `HP_Constraint_GetAppliedImpulses` read: MuJoCo only.

**What would not go.** The foot's inertia conditioning is still needed in every engine under this
control law (case C); it belongs to the torque servo's model of a stance foot, not to Havok.

**What would be new work**, in any port: the Babylon mesh sync, collision events for scoring
(Havok's collision observable is what the old path uses; MuJoCo gives `contact` arrays per step, Rapier
an `EventQueue`), the physics viewer, and the harness (`tests/harness/`, every `core-*` test) —
roughly the 1,500 lines of the five files plus their tests. MuJoCo's static model is the largest
design change; Rapier is the smaller port.

## Recommendation

**Rapier, the SIMD build, is the engine to move to.** It beats Havok on fidelity and on speed.
MuJoCo beats Havok on speed where it holds, but fails in the pile unless it is conditioned, and it
costs the most to download and to port.

- **Fidelity.** Rapier (one sub-step, 16 iterations) is the only engine that passes the clean bar at one sub-step:
  case B's elbow follows the 1920 Hz reference within 0.001 rad with no visible jitter, and one whole
  human stands still to 0.4 mm over 10 s. Havok needs 12 sub-steps (1440 Hz) to reach today's bar
  and never reaches the clean one. MuJoCo passes today's bar at 2 sub-steps; its semi-implicit
  integrator lags a fast swing, and only RK4 at 4 sub-steps reaches the clean bar. It must also be
  conditioned (armature, 4 sub-steps) or it resets itself when bodies land on one another.
- **Speed at a passing setting** (Node, spaced; humans a 3 ms step holds): Rapier SIMD 23, MuJoCo conditioned for the pile 15, Havok at 12 sub-steps 9 (Chrome: 21, 15, 8).
  Rapier SIMD holds about 2.5 times as many humans as the passing Havok. In the pile, where the
  solver works hardest, Rapier SIMD holds 12 against Havok's 8 and MuJoCo's 12, and 64 piled humans take it 13.4 ms a step, Havok 32.7 and MuJoCo 105 (Node). Havok as it ships today is faster than all of them, but its
  humans fall under this control law (cases A and C). A "today" speed is not a passing speed.
- **Load.** Rapier SIMD is 1.1 MiB brotli, against Havok's 0.5 and MuJoCo's 1.9, as one JavaScript
  module with the wasm inlined. The non-`compat` package ships a separate `.wasm` without the base64
  overhead; it was not measured here.
- **Porting.** Rapier is maximal-coordinate, like Havok: bodies and joints map one to one onto
  `buildBody`, and the stance's velocity motors keep their design. MuJoCo would change the
  architecture (a compiled, static model, reduced coordinates), with the most to gain in read cost
  and exact inverse dynamics and the most to rewrite.
- **Threads.** MuJoCo's threaded build deploys on Pages through a service worker, but on Windows it
  runs slower than the single-threaded build at every N above a few (16 ms stalls). No engine
  here gains from threads in the browser today. Running the one-threaded world in a worker, off the
  render thread, is available to every engine and is the threading worth having.

**Caveats.**

- One machine (Windows, a 16-core desktop), one browser (Chrome), Node 24. Timings on a phone or a
  4-core laptop will be slower in proportion; the ranking should hold, but that was not measured.
- The human is simplified: every segment is world-aligned at its centre of mass, and the trunk
  hulls are boxes. The controller is the core servo's law without its bias term or its re-solve
  after a clamp. Weapons, strikes, and contacts between fighters other than falling were not
  exercised.
- The bars were read off Havok before the others ran. Case C was added after them and judges
  nothing. The pile's failure mode (MuJoCo's reset) was found by reading the result, not by a bar.
- Rapier needs the feet conditioned (×100), like Havok. The control law needs it in every engine
  (case C). Solver iterations are a real knob in Rapier and MuJoCo, and the factor could be
  revisited once they are used.
- A Rapier multibody (reduced-coordinate) chain was unusable in 0.21: no limits in the JS API, and a
  wasm panic. The recommendation is for impulse joints.
- Jolt, optional in the brief, was not run; the time went to MuJoCo's threaded build and its pile
  divergence.
- Machine load: every Node figure carries the machine's busy share over its run
  (`results/perf-*.json`, `machineBusy`). Runs under another session's load were discarded and
  repeated, except where a row says otherwise.

**Next step, if the owner takes it**: port `buildBody`, the muscle driver and the world step
to Rapier behind the core's own interfaces, and run the core's stance and strike tests on both
engines side by side before switching.
