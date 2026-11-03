# Physics bake-off: Havok, MuJoCo, Rapier

The question: for this game in a browser, is MuJoCo or Rapier better than Havok on fidelity
**and** on speed? The answer: **Rapier, the SIMD build**, which the core runs on
(`owner-physics-engine` in `SOURCES`). Under one controller it passes the clean fidelity bar at
one sub-step, which Havok never reaches; at that setting it holds 23 standing humans within a 3 ms
step against Havok's 9 at its passing setting, and loads in 1.1 MiB brotli.

The live adapters are MuJoCo and Rapier (`research/physics-bakeoff/engines.mjs`, and the
`physics-bench.html` page, `src/physics-bench/`). Havok's adapter is not in the repository; its
rows in `results/` are the record of the comparison. Harnesses: **Node**, one process, one thread;
**Chrome**, `physics-bench.html` on the page's main thread. Times are medians of repeated runs. How
to run them is in [the research readme](../README.md#the-physics-bake-off).

## Setup

- **One body.** `src/physics-bench/model.ts` hands every adapter the same Warrior from `humanSpec("workshop-fighter")`,
  each segment built world-aligned at its centre of mass and the trunk hull as its bounding box.
- **One controller** (`src/physics-bench/control.ts`), no engine motor: at 120 Hz it reads each segment back and
  applies world torques held over the sub-steps: a critically damped acceleration of each
  freedom's error at T = 0.1 s, times the joint-space inertia, plus the gravity moment of the side
  held up, clamped to the muscle's isometric peak. A stance foot is read as the ground.
- **The cases.** A, the standing foot: the Warrior's left leg, the rest of the body as one block
  on the hip, held 10 s. B, the forearm chain: the right arm on a fixed shoulder at guard, the
  elbow swung from 1.3 to 0.2 rad in 0.15 s, stopped and held. C, one whole human on both feet for
  10 s, the scaling load; it judges nothing.
- **The bars** (`thresholds.mjs`). The reference is MuJoCo at 16 sub-steps (1920 Hz). **today**
  is as good as Havok under the core's own stance. **clean** is what the reference reaches within
  floors no player could see: case A spin 0.01 rad/s, tilt 0.1°, drift 1 mm; case B jitter
  0.01 rad/s, deviation 0.01 rad, ringing within 0.01 rad/s of the reference's.
- **Performance**: N simplified humans at 120 Hz under the shared controller with a full state
  read every step, spaced 2 m apart or piled in layers of 8 (`perf.mjs` under `run-perf.sh`,
  tables by `summarize-perf.mjs`); each engine at its chosen setting
  (`src/physics-bench/chosen.ts`).

The feet's inertia conditioning is the control law's need, in every engine: a servo that reads the
stance foot as the ground drives a light foot with gains sized to half the body, and without the
factor it diverges even in MuJoCo at 1920 Hz (case C).

## Answer

- **Rapier** (1 sub-step, 16 iterations, 2 PGS, feet x100) passes the clean bar: case B's elbow
  within 0.001 rad of the reference, a whole human still to 0.4 mm over 10 s. Its SIMD build is
  the only one worth shipping, from about 16 humans up. Multibody joints are unusable in 0.21.
- **Havok** passes the today bar only from 12 sub-steps with the feet at x300, and never the clean
  bar.
- **MuJoCo** is jitter-free, but its semi-implicit Euler lags a fast swing; only RK4 at 4
  sub-steps reaches the clean bar. Its cheaper settings reset themselves in a pile, and it compiles
  one static model, so spawning a body means a recompile.
- **MuJoCo's threaded build** (`@mujoco/mujoco/mt`) is slower than its single-threaded one at
  every N above a handful, by one or two orders of magnitude, in Node and Chrome alike. It deploys
  on GitHub Pages through a service worker that adds the cross-origin isolation headers
  (`public/coi-sw.js`). No engine gains from threads in the browser.

## Limits

- One machine (Windows, a 16-core desktop), one browser (Chrome), Node 24.
- The human is simplified (world-aligned segments, box trunk) and the controller lacks the core
  servo's bias term and re-solve. Weapons, strikes and contacts between fighters other than falling
  were not exercised.
- The bars were read off Havok before the others ran; MuJoCo's pile reset was found by reading
  the result, not by a bar.
- Jolt was not run.
