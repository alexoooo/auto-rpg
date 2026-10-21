# Physics bake-off: Havok, MuJoCo, Rapier

The question: for this game in a browser, is MuJoCo or Rapier better than Havok, the engine the
core then ran, on fidelity **and** on speed? The verdict, read 2026-09-29: **Rapier, the SIMD
build**, which the core runs on (`owner-physics-engine` in `SOURCES`). Under one controller it
passes the clean fidelity bar at one sub-step, which Havok never reaches, and at that setting it
holds 23 standing humans within a 3 ms step against Havok's 9.

The live adapters are MuJoCo and Rapier (`research/physics-bakeoff/engines.mjs`, and the
`physics-bench.html` page, `src/physics-bench/`). Havok's adapter is not in the repository; its
rows are the record of the comparison. Harnesses: **Node** is Node v24.19.0 on the development
desktop (16 cores, 32 threads), one process, one thread; **Chrome** is `physics-bench.html` on the
same machine, the page's main thread. Times are medians of repeated runs. Raw runs are in
`results/`; how to run them is in [the research readme](../README.md#the-physics-bake-off).

## Packages

| Engine | Package | Version | What the page loads |
|---|---|---|---|
| Havok | `@babylonjs/havok` | 1.3.14 | `HavokPhysics.wasm` and a 67 kB ES loader |
| MuJoCo | `@mujoco/mujoco` | 3.14.0 | `mujoco.wasm` and a 293 kB Emscripten loader; `mt/` is a threaded build |
| Rapier | `@dimforge/rapier3d-compat` | 0.21.0 | one ES module, the wasm inlined as base64 |
| Rapier SIMD | `@dimforge/rapier3d-simd-compat` | 0.21.0 | the same, built with wasm SIMD |

## Setup

- **One body.** `model.ts` hands every adapter the same Warrior from `humanSpec("workshop-fighter")`
  (masses, centres, principal inertias, shapes, joints, ranges, muscle peaks), each segment built
  world-aligned at its centre of mass and the trunk hull as its bounding box.
- **One controller** (`control.ts`), no engine motor: at 120 Hz it reads each segment back and
  applies world torques held over the sub-steps. The law is the core servo's: a critically damped
  acceleration of each freedom's error at T = 0.1 s, times the joint-space inertia, plus the
  gravity moment of the side held up, clamped to the muscle's isometric peak (without the core
  servo's bias term or its re-solve after a clamp). A stance foot is read as the ground.
- **Knobs swept**: Havok's sub-steps, damping and feet inertia factor (it exposes no iteration
  count); MuJoCo's sub-steps, solver, iterations, integrator, cone and contact time constant;
  Rapier's sub-steps, iterations, PGS iterations, contact frequency and multibody joints.

**The cases:**

- **A, the standing foot**: the Warrior's left leg, the rest of the body as one block on the hip,
  held 10 s.
- **B, the forearm chain**: the right arm on a fixed shoulder at guard, the elbow swung from 1.3 to
  0.2 rad in 0.15 s, stopped and held: hand and wrist jitter, ringing after the stop, and the
  elbow's deviation from the reference's path.
- **C, one whole human** on both feet for 10 s, the scaling load. It was added after the bars, and
  judges nothing.

**The bars** (`thresholds.mjs`), written before any engine but Havok ran. The reference is MuJoCo
at 16 sub-steps (1920 Hz), which rings at 0.0784 rad/s.

- **today**, as good as Havok then: case A off the core's own stance (velocity motors, feet x100,
  120 Hz), which stood with spin 0.00037 rad/s, tilt 0.39°, drift 6.6 mm: marks of spin 0.01
  rad/s, tilt 0.4°, drift 7 mm. Case B is Havok under the shared law: hand jitter 0.289 rad/s,
  wrist 0.609, ringing 0.242, deviation 0.039 rad.
- **clean**, what the reference reaches within floors no player could see: case A spin 0.01 rad/s,
  tilt 0.1°, drift 1 mm; case B jitter 0.01 rad/s, deviation 0.01 rad, ringing within 0.01 rad/s
  of the reference's.

## Fidelity

Node. Each engine's cheapest setting that passes both cases at the today bar (`candidates.mjs`),
from 90 Havok, 78 MuJoCo and 151 Rapier settings:

| Engine, setting | A: spin rad/s, tilt °, drift mm | B: hand, wrist jitter rad/s | B: deviation rad, ring rad/s | Clean bar |
|---|---|---|---|---|
| Havok then (1 step, feet x100) | falls | 0.289, 0.609 | 0.039, 0.241 | no |
| Havok, 12 sub-steps, feet x300 | 0.0066, 0.0058, 1.39 | 0.023, 0.051 | 0.015, 0.083 | no (hand jitter) |
| MuJoCo, 2 sub-steps, defaults | 9e-8, 7e-6, 7e-5 | 5e-5, 5e-5 | 0.024, 0.080 | no (deviation) |
| MuJoCo, 4 sub-steps, armature 0.001 kg m² | 6e-8, 5e-6, 6e-5 | 1.2e-3, 1.2e-3 | 0.026, 0.194 | no |
| Rapier (and SIMD), 1 sub-step, 16 iter, 2 PGS, feet x100 | 0.0027, 0.078, 0.0002 | 3e-4, 7e-4 | 0.00095, 0.078 | **yes** |

- **Havok** fails case A at 1 to 8 sub-steps at every conditioning, passes the today bar from 12
  sub-steps with the feet at x300, and never reaches the clean bar.
- **MuJoCo** needs no conditioning in case A and is jitter-free in B, but its semi-implicit Euler
  lags a fast swing: 0.052 rad at 120 Hz, 0.024 at 240, 0.011 at 480; only RK4 at 4 sub-steps
  reaches the clean bar. Newton is the solver to use; PGS and CG with few iterations diverge.
- **Rapier** needs the feet conditioned (x100); then it passes the clean bar cheaply. Case B's
  deviation follows the total iteration count, not the sub-steps. Multibody joints are unusable in
  0.21: no limits in the JS API, a wasm panic in case A, and 0.149 rad deviation in B.

**Case C, one whole human, 10 s** (Node, `case-c.mjs`): the centre of mass's height at 0.5 s and
at the end, its drift, and the fastest segment after 1 s.

| Engine, setting | Feet | COM, m | Drift, mm | Max speed, m/s |
|---|---|---|---|---|
| MuJoCo, 2 sub-steps | x1 | diverges (resets itself) | - | 1.2e5 |
| MuJoCo, 2 sub-steps | x100 | 1.016 to 1.023 | 15.8 | 0.04 |
| Rapier, 16 sub-steps | x1 | 0.996 to 0.303, falls | 2301 | 23.8 |
| Rapier (and SIMD), 1 sub-step, 16 iter, 2 PGS | x100 | 1.014 to 1.014 | 0.4 | 0.02 |
| Havok then, 1 sub-step | x100 | 1.016 to 0.235, falls | 1470 | 14.5 |
| Havok, 12 sub-steps | x300 | 1.021 to 1.022 | 0.2 | 0.00 |

**The feet's inertia conditioning is the control law's need, in every engine.** A servo that reads
the stance foot as the ground drives a light foot with gains sized to half the body; without the
factor it diverges even in MuJoCo at 1920 Hz.

## Performance

Each engine at its chosen setting (`src/physics-bench/chosen.ts`), N simplified humans at 120 Hz
under the shared controller with a full state read every step. **Spaced**: a grid 2 m apart.
**Pile**: layers of 8 dropped onto one another, timed after 1.5 s. Three fresh worlds a cell, 360
timed steps each. `havok-today` is one Havok sub-step, whose humans fall; `mujoco-pile` is the
cheapest MuJoCo that passes both cases and holds a pile (4 sub-steps, armature 0.001 kg m²).

Total ms a step, median (`perf.mjs` under `run-perf.sh`, tables by `summarize-perf.mjs`):

| Setting | Spaced N=8 | N=32 | N=64 | Humans in 3 ms | Pile N=8 | N=32 | N=64 | Humans in 3 ms |
|---|---|---|---|---|---|---|---|---|
| havok-today (falls) | 0.48 | 1.87 | 3.72 | 51 | 0.48 | 2.13 | 4.84 | 42 |
| havok (12 sub-steps) | 2.81 | 11.2 | 22.4 | 9 | 2.80 | 14.4 | 32.7 | 8 |
| mujoco (2 sub-steps; resets in the pile) | 0.82 | 3.23 | 7.28 | 30 | 0.87 | 3.26 | 6.05 | 29 |
| mujoco-pile | 1.56 | 6.20 | 12.9 | 15 | 1.55 | 38.3 | 105.0 | 12 |
| rapier | 1.86 | 9.22 | 18.5 | 11 | 1.84 | 11.4 | 25.6 | 11 |
| rapier-simd | 1.77 | 3.96 | 7.52 | 23 | 1.79 | 6.35 | 13.4 | 12 |

- **Rapier SIMD holds the most humans at a passing setting**: 23 spaced against Havok's 9 and
  MuJoCo's 15; 12 piled against 8 and 12. At 64 piled it takes 13.4 ms, Havok 32.7, MuJoCo 105
  (95th percentile 775 ms: Newton slows sharply once dozens of bodies touch).
- **SIMD matters from about 16 humans**; only the SIMD build is worth shipping.
- **MuJoCo resets itself in the pile** at its cheaper settings: when the second layer lands a light
  freedom runs away and its automatic reset (BADQVEL) restarts the world, with or without the
  controller. `mujoco-armature.mjs` found 4 sub-steps and 0.001 kg m² the cheapest armature that
  holds a pile of 64 and still passes case B.
- **Reading the state**: MuJoCo's reads are typed-array views, 0.002 ms for 8 humans; Rapier's
  0.05 ms, Havok's 0.12. At 32 humans Rapier allocates 76 to 80 KB a step, MuJoCo 31, Havok then
  138.
- **Chrome agrees with Node** within 0 to 20 % at a passing setting (64 spaced: Rapier SIMD 8.5 ms,
  21 humans in 3 ms; Havok 24.0 ms, 8), with longer tails (95th percentile 1.3 to 2 times the
  median). Fidelity in Chrome repeats Node's to two or three figures.

## MuJoCo's threaded build

The owner asked that it not be ruled out. `@mujoco/mujoco/mt` starts a pool of web workers on
shared memory. Without a pool it costs what the single-threaded build does; **with a pool it is
slower at every N above a handful, by one or two orders of magnitude**: a step takes the
single-threaded time or stalls a whole number of ~16 ms, and 8 threads stall from 2 humans (Node
and Chrome alike). On this machine a timed `Atomics.wait` asked for 0.05 to 5 ms returns after
16 ms, Windows' timer tick, which fits a pool whose idle threads wake a tick late; MuJoCo's pool
code was not read, so that is a hypothesis.

It deploys on GitHub Pages through a 28-line service worker (`public/coi-sw.js`) that adds the
cross-origin isolation headers, with each pthread started from a blob so it inherits the page's
isolation, and Vite's `worker: { format: "es" }`. That costs a reload on the first visit,
same-origin or CORP for everything loaded, and about 0.5 GB of resident memory for a pool of 32.

## Load size and init

`load-cost.mjs`, Node, the median of three cold processes:

| Engine | Brotli, MiB | Init, ms | Build 32 humans, ms | RSS with 32 humans, MB |
|---|---|---|---|---|
| Havok | 0.49 | 15 | 64 | +65 |
| MuJoCo | 1.87 | 70 | 235 | +63 |
| MuJoCo, threaded | 1.92 | 204 | 225 | +529 |
| Rapier SIMD (`-compat`) | 1.12 | 91 | 23 | +122 |

MuJoCo compiles a model holding every human and cannot add a body to it: spawning means a
recompile or a pool. Rapier builds a human three times faster than Havok.

## Porting

Rapier is maximal-coordinate, like Havok: bodies and joints map one to one onto `buildBody`, and
the stance's velocity motors keep their design, with `numSolverIterations` as a real knob. MuJoCo
would change the architecture (a compiled, static model in reduced coordinates), with the most to
gain in read cost and exact inverse dynamics and the most to rewrite. Either needs a new mesh
sync, collision events for scoring and the harness.

## Verdict

Rapier, the SIMD build: the only engine that passes the clean bar at one sub-step (case B's elbow
within 0.001 rad of the 1920 Hz reference, a whole human still to 0.4 mm over 10 s), about 2.5
times the humans of the passing Havok in a 3 ms step, 1.1 MiB brotli, and the smaller port. No
engine gains from threads in the browser; a one-threaded world in a worker, off the render thread,
is open to any of them.

**Limits of the reading:**

- One machine (Windows, a 16-core desktop), one browser (Chrome), Node 24; a phone was not
  measured.
- The human is simplified (world-aligned segments, box trunk) and the controller lacks the core
  servo's bias term and re-solve. Weapons, strikes and contacts between fighters other than falling
  were not exercised.
- The bars were read off Havok before the others ran; MuJoCo's pile reset was found by reading
  the result, not by a bar.
- Jolt, optional in the brief, was not run.
