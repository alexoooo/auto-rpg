# Ten fighters in real time

## Why

The owner wants 60 fps, at least 30, with 10 or more fighters and richer minds. Today two Option
Mind Warriors drop the Arena below 10 fps here and there while both stand.

Three things stand in the way:

- **Spikes.** Minds redo a decision's work every step, from inputs that barely change, in several
  callers that do not share it. A run of steps over 8.33 ms becomes frames of 100 ms or more,
  because the page catches up by up to 12 steps a frame (`CATCH_UP_SECONDS`,
  `src/arena/main.ts`).
- **The steady cost.** Sword against club takes about 3.3 ms a step: the engine 0.75 (contacts read
  out one call at a time included), motor control and reach 0.65, and the minds' choices and skills
  most of the rest ([step cost](../reference/step-cost.md#motor-control-in-the-step)). At that
  cost for each body, ten bodies take about 16 ms a step: twice the 8.33 ms that 120 Hz allows.
- **One thread.** The world steps and the scene renders on the page's one thread, so every slow
  step is a late frame, and the world's budget is what rendering leaves of each frame.

The spikes' causes, each measured on the harness below:

- **Beside a lying foe**: 16 places, each with a route round the foe's exact colliders at three
  heights, from up to three callers a step (`besideLying`, `src/core/intent/action-window.ts`):
  12.8 ms a step at `a0577d3e` while a fighter is down, 4.0 once its colliders were read once
  ([a body lying, read once](../reference/step-cost.md#a-body-lying-read-once)). The place it
  chooses also flips between the body's sides from step to step
  ([roadmap](../roadmap.md#the-ai)).
- **A hand's change of pose**: each try built the new shape's convex hull once for every collider
  in the world, and a blocked change is tried again every step (`poseBlocked`,
  `src/core/build/hand-poses.ts`; `canChangeShape`, `src/core/engine/rapier.ts`): 13.7 ms of the
  40 dearest standing steps of the bare-handed bout, steps to 28 ms
  ([a hand's new shape tested near it](../reference/step-cost.md#a-hands-new-shape-tested-near-it)).
- **The aim**: the opening search (`openingSelector`, `src/core/perception/openings.ts`) runs
  from every readiness call, with no memo, through the option's offer and ask, orders, admission
  and start, the menu, and the tactics' rechecks.
- **The menu** is built afresh on every read of `report.menu` (`menuOf`,
  `src/core/skills/framework/menu.ts`), each entry a readiness call and a `besideLying`; the drill
  Commander reads it up to three times a step.
- **Ground positioning** (`groundPosition`, `src/core/perception/downed/position.ts`) reads the
  foe's highest opening and sweeps the hands' and soles' clearance against its rebuilt colliders
  every step while the foe is low.
- **Predictions**: `foeModel` and `prior` (`src/core/option/percepts.ts`) are built again on every
  read from a constant spec and event-rate inputs.
- **The body's own contacts**: the punches and the kicks each read every segment's contacts
  through the engine each step (`supportReadiness`, `src/core/control/support-readiness.ts`):
  0.26 ms a step.

Harness: Node, core world, `rapier-coordinate` (the game's engine), 120 Hz, Option Mind's Warriors
on the Arena's open stage, seed 0, to the verdict at 60 s.

The toolkit already holds some decisions, each its own way: the chooser by cue, period and exit
(`selectSet`, `src/core/mind/choice.ts`); the action tactics' table by period and patience
(`src/core/tactics/action-tactics.ts`); the ground approach by a plan kept until its target
drifts (`src/core/perception/downed/wide.ts`); fallen footprints until a body's centre drifts
(`fallenSolids`, `src/core/navigation/crowd.ts`); routes until their request, solids or progress
change (`routeWalker`, `src/core/navigation/navigation.ts`). None shares a result between
callers, and nothing says which work may run every step.

## The design

### A mind's work

A mind's work is of three kinds, and each has one place:

1. **Control**, every step: motor control, a live action's path and solve, steering. It is what
   must run at 120 Hz, and it is kept cheap.
2. **Readings**, at most once a step for each body and what it reads: the foe's colliders where
   they lie, the body's own contacts, the opening for a limb and family on a segment, the menu.
   Every caller in the step reads the one answer. A reading carries nothing to the next step.
3. **Decisions**, held: a target, an aim not yet under way, a place and its way, a chosen option,
   a pose to try again. A decision is made, kept in its module's `state`, and made again only on
   a trigger:
   - an **event**: a cue the decision names changes (focus, orders, posture, a blow);
   - **drift**: an input it was made from has moved past its tolerance since then (a lying body's
     centre past `CROWD.settled`, a target past its shift);
   - **failure**: a cheap check, each step, that the held answer still holds fails (a way blocked,
     a place no longer clear, an aim's segment gone);
   - a **deadline**: its period has run (`rethink`), the backstop, never the main trigger.

   Between triggers a held decision costs its cheap check. A body's decisions due on the same
   step are not all made on it: periods start at a phase drawn from the host's seed
   (`BodyHost.seed`), so ten bodies do not re-decide together.

### The crossing into Rapier

Of about 3600 calls a step into Rapier's wasm, contacts take about 2500 (each pair, manifold and
point read one call at a time, each pair a JavaScript object made and freed), the joint motors
280 and the segments' poses and velocities 128
([across the boundary](../reference/step-cost.md#across-the-javascript-and-wasm-boundary)).
The vendored Rapier (`vendor/rapier/auto-rpg.patch`) gains three bulk calls, each one crossing a
step, each writing or reading a typed array made once:

- **contacts out**: after the step, every contact of the bodies asked for (both colliders' handles,
  normal, point, impulse) into one array; the engine's `contactsOf` reads its body's rows from it;
- **motors in**: every joint freedom's model, speed and force bounds from one array, applied before
  the step;
- **poses out**: every body's translation, rotation and velocities into one array.

The values are Rapier's own, converted as the per-call path converts them, so no bout moves. The
saving read so far is about 0.4 ms of 2.9 a step.

### The world in a worker

The world steps in a Web Worker; the page renders. The core already runs headless (a
`NullEngine` scene, as `buildBout` builds it, `src/evaluation/bout.ts`), so the worker builds the
world from the screen's recipe exactly as Node does, and its bouts are the same to the bit.

- **Out of the worker**: each step's poses (every segment's and held item's position and rotation)
  in a transferred buffer, and the events the page shows or plays (hits, notes, the verdict).
- **Into the worker**: what a person does (orders, a shove, pause, a setting), applied at the
  next step and kept on the world's tape, so a bout with a person in it still replays.
- **The page** builds its own nodes for each body from the spec and poses them each frame between
  the last two steps it holds, so motion is smooth at the display's rate whatever the step costs.
  The skins and overlays that read a body's segments (`src/render/`, `src/arena/`) read these
  nodes; nothing on the page reaches the world.
- **Rapier** loads in the worker only; the page loads none.
- **Falling behind**: when the world cannot keep real time, the screen no longer freezes; whether
  the fight slows or skips ahead is the owner's call (below).

Several worlds (rooms, a Crypt floor, a match played in the background) each take a worker.
Splitting one world's minds across workers is not planned: each step would wait on a message,
and one thread has room once the steps above are done.

### Motor control

Muscles are Rapier velocity motors with a force bound, solved inside the physics step, so a
command held for more than one step stays stable; the servo's 0.1 s (`SERVO_SECONDS`) is twelve
steps at 120 Hz and six at 60. That makes two cuts possible besides the readings:

- **One reach solve a step**: the effector tracker solves each limb's chain three times a step, at
  the step before, now and after, to take its angles' rates and accelerations by differences
  (`src/core/control/effector-tracker.ts`). The chain's Jacobian at the one solve gives the rates
  from the path's velocity, and the accelerations from the path's acceleration, at a third of the
  cost.
- **Control at 60 Hz**: physics stays at 120 Hz; motor control and the reach run on every other
  step, holding their commands between, half the bodies on even steps and half on odd so a
  crowd's step cost stays even. It halves about 0.65 ms a step for two bodies, more with ten. It
  changes motion everywhere, so it is an experiment, kept only if the battery, the match and the
  owner's eye find nothing lost.

Motor control written in Rust inside the wasm is not planned: with the crossing batched, it is
dense arithmetic on small matrices, its gain unmeasured, and it would be taken up only if control
still dominates once the rest is done.

## Steps

Speed rewrites (steps 1 to 5) do the same operations in the same order: no fingerprint case
moved, the reference bouts' digests the same, the time before and after in
[step cost](../reference/step-cost.md). Steps 6 on change what minds or bodies do: each names its
moved cases, is read against the version before on its drill (`--previous`) and in a match
(`npm run match`), and is watched by the owner.

1. **A hand's pose tried cheaply.** The new shape is tested only against colliders whose bounds
   can reach it, built once a pose. Check: the bare-handed bout's standing steps over 8 ms.
2. **Readings once a step.** A step reading in the toolkit: for each mind, a work area made once
   and cleared at its step's start, holding the foe's colliders read once (`sensedObstacle`) for
   every clearance and route caller (`besideLying`, `groundPosition`, `wide.ts`,
   `clearFootTranslation`); the body's own contacts, read once for the punches and the kicks
   (`supportReadiness`); and each opening asked (by limb, family, foe and segment) for every
   readiness caller. The strike option's memo of its offer (`offer`, `src/core/option/strike.ts`)
   is keyed on the time alone, and is keyed on the focus too. Check: `openingSelector`,
   `worldShapes` and `contactsOf` calls a step, before and after.
3. **The menu once a step**, read from the step reading by the report, the option chooser and
   the Commander. Check: `menuOf` calls a step.
4. **The batched crossing.** The three bulk calls in the vendored Rapier's patch, a new tarball
   built by `vendor/rapier/build.sh`, and the engine reading and writing through them. The
   contacts read into an array made once is also the contacts' read of
   [a garbage-free step](2026-10-30-garbage-free-step.md#steps) (its step 2), done once for both.
   Check: calls into wasm a step, allocation, and the step's time, before and after.
5. **The world in a worker**, the Arena first: the worker builds and steps the bout, the page
   poses its own nodes from the poses it is sent, and what a person does goes in as messages kept
   on the tape. Then the Crypt, the Lab and the Ratings reel, one a step. Check: a bout's digest in
   the worker equals Node's; the page holds the display's rate while a step is made slow on
   purpose; the owner plays.
6. **A held decision in the toolkit**: one helper for the four triggers, its memory plain data in
   the caller's `state`, with the existing variants' rules expressible in it. First user: the
   place beside a lying foe, made again when the body's centre drifts past `CROWD.settled`, the
   window's target past its shift, or the way's cheap check (the kept route against the body's
   footprint) fails. Check: the stomping rung, the side-flip gone, the time while a fighter is
   down.
7. **The rest held**: ground positioning's mode and hand; an aim not yet under way, held as a
   point on its segment as Vanguard's committed aim does
   (`src/entrants/vanguard/committed-aim.ts`); a blocked hand pose tried again when its hand's
   contacts change, not every step; predictions made again on their events. Check: each one's
   drill and the match.
8. **Phases from the seed**: periodic decisions start at a seeded phase. Check: a crowd fight of
   ten Option Mind bodies, the dearest step and how many decisions fall on one step.
9. **One reach solve a step**, the rates from the chain's Jacobian. Check: the punch and guard
   drills, the match, the reach's time a step.
10. **Control at 60 Hz, tried**: motor control and reach on alternate steps, bodies staggered.
    Check: the baseline battery (`npm run evaluate -- baseline`: walk, punch, stand-up, fights)
    and the match against 120 Hz control; the owner watches. Kept, or recorded in step cost as
    tried and why not.
11. **A ceiling on heavy work**: the step-cost test counts the heavy searches a mind makes in a
    step of its bout (opening searches, route searches, shapes built) and holds them under a
    ceiling, as it holds allocation. Counts, not times, so the same on every machine.

## Done when

- In the reference bouts (sword against club, bare hands, the Crypt-clearing run's mob), no step
  takes more than 8.33 ms in Node on the game's engine.
- A ten-body fight of Option Minds steps in real time in Node, its dearest step under 8.33 ms.
- The Arena and the Crypt step their worlds in a worker, and the owner plays them and sees no drop
  below 30 fps.

## Open to the owner

- **When the world cannot keep real time**: the fight slows for a moment (its clock runs behind
  real time, the screen smooth), or it skips ahead (the world steps several times to catch up and
  the screen jumps). Today the page catches up by up to 12 steps a frame and the screen freezes;
  in a worker neither freezes it. Which feels better is the owner's call.
