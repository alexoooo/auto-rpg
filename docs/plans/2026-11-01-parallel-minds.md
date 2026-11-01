# Minds in parallel, a step late

## Why

The crowd fight cannot keep real time on one thread, and richer minds will make every fight
dearer. At `2bac8668` (Node, core world, `rapier-coordinate`, 120 Hz, pinned) its mean step is
8.4 to 8.9 ms against the 8.33 that 120 Hz allows, and it falls 1.3 s behind at best
([lag behind real time](../reference/step-cost.md#lag-behind-real-time)). About 4 ms of a step is
the world's own (Rapier at its least iterations, the muscles, the rules) and the rest is the
bodies' minds and motor control, which are each a body's own and run apart.

A mind already reaches the world only through its body: its senses and `OwnBody` in, its muscles'
command, its assist's ask and its hand and grip requests out (`Mind`, `src/core/mind/mind.ts`), and
nothing under `mind`, `control`, `skills`, `tactics` and the rest imports the engine
(`tests/core-boundary.test.mjs`). So each body's mind can run in another thread, fed a copy of what
it reads.

The owner's choices (2026-11-01):

- **Shared memory between threads**, not messages. Measured in Chrome on the owner's laptop, one
  world thread and three mind threads handing ten bodies' poses out and commands back cost
  21 to 23 µs a step with the threads spinning while they wait, 71 to 198 µs sleeping, and 213 to
  358 µs by `postMessage`, with one step of the last stalled 88 ms. The game's pages run
  cross-origin isolated with no change (the crowd fight and the Crypt, served with the headers).
- **A body's command takes effect one step after the step it is made on**, so the world steps
  while the minds think. Results stay deterministic: the delay is a rule of every world, on one
  thread or many, never a matter of timing.

## The shape

```
[page: draws, sends orders]  ⇄  [world worker]  ⇄  N × [mind worker]
```

- **The world worker** owns the world: the senses, the Commanders, the muscle driver (a command
  to motor targets and ceilings, `driveMuscles`, `src/core/muscle/driver.ts`), the assist's
  application, Rapier, contacts, blows, the rules, the frames.
- **A mind worker** runs some bodies' minds (`Mind.step`: decider, skills, motor control) on each
  body's mirror: an `OwnBody` read from shared memory.
- **Each step k**: the world applies the commands made on step k−1 and steps, while each mind
  reads the world as step k−1 left it and makes step k's command. The world waits for a command it
  needs; it never goes on with an older one. Two copies of each buffer, so neither side writes
  what the other reads.
- **Which bodies share a worker, and how many workers there are, never change a bout**: a mind
  shares nothing that changes with another (`src/core/state.ts`).
- **Offline stays on one thread**: evaluations, forks, the Lab and the tests run the same rule
  with every mind in the world's thread, and save and load a bout's state as now.

## Steps

Steps 1 and 2 change what bodies do: each names its moved fingerprint cases
(`scripts/fingerprint.mjs`), is read against the version before on the drills it touches
(`--previous`) and in a match (`npm run match`), and is watched by the owner. Steps 3 to 5 move no
fingerprint case.

1. **The gain read before the build.** On the replicated harness of the earlier check (each
   thread a whole copy of the crowd fight, its share of minds run and the rest replayed, a barrier
   a step), time in each thread its world part and its minds' part with every thread loaded, for 2
   to 4 mind threads, pinned and not. The step's projection is the world's part, or the dearest
   thread's minds, whichever is more, plus the handoff above. Check: a projected crowd step of no
   more than 6 ms unpinned for some number of threads. Otherwise the plan stops there and the
   owner is told what the split can give.
2. **The delay as a rule, on one thread.** `embody` holds a mind's command and applies it at the
   next step (`src/core/mind/mind.ts`); a body's first step at `full`, and its first back from
   another level, apply none. Every world takes it: the bouts, the Crypt, the drills, the Lab, the
   stand. The strike and gait profiles are measured again (`research/strike-profiles.mjs`,
   `research/gait-profiles.mjs`). Check: every rung of the punch, club and stomp drills, the
   Gait drill, the baseline battery and the stand-up on the owner's target
   ([rising](../reference/rising.md#the-owners-target)) read against the version before, and the match
   against it. Where a body's balance or a rung suffers, motor control is tuned for the late
   command (its sense of its own pose is a step older). If balance cannot be held, motor control
   stays in the world's thread with each mind's intent a step late instead, and the plan is
   rewritten to that.
3. **A mind's body read from a snapshot, on one thread.** Each body's mirror is made from its spec
   and refreshed from one `Float64Array` the world writes after each step:
   - its segments' poses and motion, contacts, hand poses and toes (`ReadBody`, `src/core/read-body.ts`);
   - its joints as the muscles read them, its dynamics, strengths, ceilings and torque delivered
     (`MuscleDriver`'s reading side);
   - its level, so the mind is told it is idle (`Mind.idle`);
   - its senses (`Senses`, `src/core/mind/senses.ts`; specs and fixed solids once, poses each step);
   - the observers it added after physics (`OwnBody.afterPhysics`), run as the snapshot comes.

   What a mind writes (its command, its assist's ask, hand-pose and grip requests) and what is read
   of it from outside (its report: engagement, actions, ended, prospects; its menu where a page or
   a Commander asks for it, `src/dungeon/run.ts`, `src/worker/duel-stage.ts`) go back the same
   way. The body's dynamics are updated in the mirror, which is the only reader. Check: a bout
   with every mind on its mirror is the same bout, step for step, as with every mind on its body
   (a test, whole records, in the Mind contract); no fingerprint case moves.
4. **Minds in workers, on Node.** The world starts its mind workers (`worker_threads`, one
   `SharedArrayBuffer` each way, `Atomics` to wait: spinning briefly, then sleeping); each worker
   loads the minds' data and makes its bodies' minds, the Crypt's as it builds them ahead
   (`DungeonRun.build`), the world waiting for a mind it needs before the body's first step.
   Check: the crowd fight, the reference bouts and the Crypt at seeds 10 and 25 the same to the
   bit with 1 to 4 workers as on one thread; each one's lag, pinned and not, in
   [step cost](../reference/step-cost.md).
5. **In the browser.** The world's worker (`src/worker/serve.ts`) starts the mind workers. The
   pages are cross-origin isolated: the headers in `vite.config.ts` for the dev server and preview,
   and `public/coi-sw.js` scoped to the game's pages on GitHub Pages, so a first visit reloads
   once. A page that cannot be isolated runs its minds in the world's thread, the same bout.
   Check: the world worker's bouts the same to the bit as Node's (`tests/world-worker.test.mjs`);
   the Arena's choices list and the Crypt's status as before; the owner plays the crowd fight and
   the Crypt.

## Done when

- The crowd fight to its verdict, the reference bouts and the Crypt at seeds 10 and 25 are never
  more than a step behind real time with the mind workers, pinned and not (Node, core world,
  `rapier-coordinate`, 120 Hz, the least of three playings' worst lag).
- A bout is the same to the bit on one thread and on any number of mind workers, in Node and in
  the browser.
- The owner plays the crowd fight and the Crypt and sees 60 fps, never below 30, and no slow motion.
