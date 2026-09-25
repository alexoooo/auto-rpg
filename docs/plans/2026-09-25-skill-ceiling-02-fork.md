# Session 02: a forkable world

## Goal

Copy a live bout into a scratch world, run the copy forward under different commands, and throw it
away. Then measure how long a fork stays faithful. Everything that searches (the expert, a planner
school, a teacher, a drill's start state) stands on this.

## Why there is none today

There is no snapshot or restore of a Havok world. The header of `src/golem/duel-model.ts` records
why: allocator and solver history are not part of body state and can flip a winner. So both search minds searched hand-fitted Markov tables instead of the physics.
The lab's teacher (`research/lab/reference.mjs`) replays every decision from t = 0, and produced
four trajectories.

That objection is about **bit-exactness**, and a planner does not need it. A planner needs a fork
that tracks the original well enough, over 0.5 to 2 s, to rank the candidate commands in the right
order. That is a measurable property, and this session measures it.

## Changes

1. **World state capture.** For every body in the bout:
   - pose, linear and angular velocity, and activation state;
   - every joint motor's target and ceiling (the `JointServo` / `JointActuator` state);
   - each locomotion carrier's virtual state and the stability ledger;
   - `Combat`'s cooldowns and health;
   - the clock.

   Capture reads `mesh.position` and `mesh.rotationQuaternion`, never a world matrix, per the trap
   in `AGENTS.md`.

   **Every stateful piece implements one interface** (`capture()` / `restore(state)`): a module, a
   carrier, `Combat`, a mind. The fork walks a body's pieces and never asks what they are. A new
   morphology is forkable by implementing the interface in its own modules. A test fails if any
   registered module does not implement it. Another test forks an odd build (three legs, one
   arm) and checks isolation on it.
2. **Restore into a scratch world.** Build the same bodies in a second scene and write the state in
   by teleport (`disablePreStep = false` for one solver step, following the `setTargetTransform`
   trap), then restore motor targets. It is restore-into-fresh, not restore-in-place, so the
   original world is never touched.
3. **Snapshotable minds.** `Mind` gains `snapshot()` and `restore()`. Every mind that the expert
   will play against (the naive ladder and the frozen benchmarks) implements it, including its
   random stream. The expert's full-knowledge instrument restores the opponent's mind state and
   **reseeds** its stream, so it knows the policy and not the dice.
4. **One realm.** Havok's wasm state is realm-global, and `Promise.all` over two bouts in one realm
   was measured to change outcomes. That was concurrency. Whether a *sequential* scratch world in
   the same realm disturbs the original is unmeasured, and it is this session's first measurement.
   If it does, forks run in a worker beside the bout and state crosses as data.

## Measure

- **Divergence against horizon.** Fork a bout at 200 random moments across the probe-mind mirrors.
  Run the fork and the original on the same commands, and report the median and 90th-percentile
  distance of each body's root, and of each blade tip, at 0.1, 0.25, 0.5, 1, 2 and 4 s. Name the
  harness.
- **Ranking fidelity.** This is the measure that matters to a planner. At each fork moment, run four
  different command prefixes in both the fork and a replay-from-t=0 reference. Report how often the
  fork ranks them in the same order by damage dealt minus taken over the horizon.
- **Isolation.** A bout with forks taken and discarded throughout, against the same bout with none,
  on the same seed. It must be identical to the bit. If not, fall back to the worker arrangement,
  and measure again.
- **Cost.** Capture, restore and one simulated second of a fork, in milliseconds on this host.

## Gates

- Isolation is bit-identical.
- Ranking agreement at 1 s is high enough to plan on. The threshold is set from the data and
  written here, with the rule: a fork that ranks four prefixes no better than chance at 0.5 s is
  not a planning substrate, and session 04 stops to rethink.

**Result, 2026-09-25** (`docs/analysis/2026-09-25-fork.md`; Node bout runner and fork study, main at
release-120, 5ac61ce; 222 fork moments over 70 mirror bouts of the five probe minds):

- **Isolation: passes.** Bouts with forks taken and discarded throughout are bit-identical in pose
  and result to bouts without them. That holds with forks in the original's Havok instance, in a
  second one, and for exact forks. No worker fallback is needed.
- **Threshold, set from the data: at 1 s, pairwise agreement ≥ 0.98 and top-1 agreement ≥ 0.95**
  with a replay from t = 0.
  - The rule behind the numbers: a planning fork must scramble the ranking no more than the
    opponent's dice already do over twice the horizon. An exact fork with the opponent reseeded
    agrees at 2 s with lower bounds of 0.984 pairwise and 0.967 top-1.
- **The exact fork (Havok's heap copied) passes: 1.000 pairwise and 1.000 top-1 at 0.5, 1 and 2 s.**
  Its score vectors are identical to the replay's at all 222 moments. It is the planning substrate.
- **The teleport fork (state written through Havok's accessors) fails**, at 0.743 pairwise and 0.582
  top-1 at 1 s. It is not a planning substrate.
- **The chance rule does not trigger.** At 0.5 s the teleport fork's 95 % lower bounds, 0.779
  pairwise and 0.629 top-1, are far above chance (0.5 and 0.25). The exact fork is at 1.000.

## Depends on

Body release 1.
