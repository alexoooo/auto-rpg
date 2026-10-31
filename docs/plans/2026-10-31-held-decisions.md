# Held decisions

## Why

The owner wants 60 fps, at least 30, with 10 or more fighters and richer minds. Today two Option
Mind Warriors drop the Arena below 10 fps here and there while both stand. A page that cannot step
the world in real time catches up by up to 12 steps a frame (`CATCH_UP_SECONDS`,
`src/arena/main.ts`), so a run of steps over 8.33 ms becomes frames of 100 ms or more.

The steps over 8.33 ms are minds redoing a decision's work every step, from inputs that barely
change, in several callers that do not share it:

- **Beside a lying foe**: 16 places, each with a route round the foe's exact colliders at three
  heights, from up to three callers a step (`besideLying`, `src/core/intent/action-window.ts`):
  12.8 ms a step at `a0577d3e` while a fighter is down, 4.0 once its colliders were read once
  ([a body lying, read once](../reference/step-cost.md#a-body-lying-read-once)). The place it
  chooses also flips between the body's sides from step to step
  ([roadmap](../roadmap.md#the-ai)).
- **A hand's change of pose**: each try builds the new shape's convex hull once for every
  collider in the world, and a blocked change is tried again every step (`poseBlocked`,
  `src/core/build/hand-poses.ts`; `canChangeShape`, `src/core/engine/rapier.ts`): 13.7 ms of the
  40 dearest standing steps of the bare-handed bout, steps to 28 ms.
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

Harness: Node, core world, `rapier-coordinate` (the game's engine), 120 Hz, Option Mind's Warriors
on the Arena's open stage, seed 0, to the verdict at 60 s.

The toolkit already holds some decisions, each its own way: the chooser by cue, period and exit
(`selectSet`, `src/core/mind/choice.ts`); the action tactics' table by period and patience
(`src/core/tactics/action-tactics.ts`); the ground approach by a plan kept until its target drifts (`src/core/perception/downed/wide.ts`);
fallen footprints until a body's centre drifts (`fallenSolids`, `src/core/navigation/crowd.ts`);
routes until their request, solids or progress change (`routeWalker`,
`src/core/navigation/navigation.ts`). None shares a result between callers, and nothing says
which work may run every step.

## The rule

A mind's work is of three kinds, and each has one place:

1. **Control**, every step: motor control, a live action's path and solve, steering. It is what
   must run at 120 Hz, and it is kept cheap.
2. **Readings**, at most once a step for each body and what it reads: the foe's colliders where
   they lie, the opening for a limb and family on a segment, the menu. Every caller in the step
   reads the one answer. A reading carries nothing to the next step.
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

## Steps

Steps 1 to 3 are speed rewrites: the same operations in the same order, no fingerprint case moved,
the reference bouts' digests the same, the time before and after in
[step cost](../reference/step-cost.md). Steps 4 on change what minds do: each names its moved
cases, is read against the version before on its drill (`--previous`) and in a match
(`npm run match`), and is watched by the owner.

1. **A hand's pose tried cheaply.** The new shape is tested only against colliders whose bounds
   can reach it, built once a pose. Check: the bare-handed bout's standing steps over 8 ms.
2. **Readings once a step.** A step reading in the toolkit: for each mind, a work area made once
   and cleared at its step's start, holding the foe's colliders read once (`sensedObstacle`) for
   every clearance and route caller (`besideLying`, `groundPosition`, `wide.ts`,
   `clearFootTranslation`), and each opening asked (by limb, family, foe and segment) for every
   readiness caller. Check: `openingSelector` and `worldShapes` calls a step, before and after.
3. **The menu once a step**, read from the step reading by the report, the option chooser and
   the Commander.
4. **A held decision in the toolkit**: one helper for the four triggers, its memory plain data in
   the caller's `state`, with the existing variants' rules expressible in it. First user: the
   place beside a lying foe, made again when the body's centre drifts past `CROWD.settled`, the
   window's target past its shift, or the way's cheap check (the kept route against the body's
   footprint) fails. Check: the stomping rung, the side-flip gone, the time while a fighter is
   down.
5. **The rest held**: ground positioning's mode and hand; an aim not yet under way, held as a
   point on its segment as Vanguard's committed aim does (`src/entrants/vanguard/committed-aim.ts`); a blocked hand
   pose tried again when its hand's contacts change, not every step; predictions made again on
   their events. Check: each one's drill and the match.
6. **Phases from the seed**: periodic decisions start at a seeded phase. Check: a crowd fight of
   ten Option Mind bodies, the dearest step and how many decisions fall on one step.
7. **A ceiling on heavy work**: the step-cost test counts the heavy searches a mind makes in a
   step of its bout (opening searches, route searches, shapes built) and holds them under a
   ceiling, as it holds allocation. Counts, not times, so the same on every machine.

## Done when

- In the reference bouts (sword against club, bare hands, the Crypt-clearing run's mob), no step
  takes more than 8.33 ms in Node on the game's engine.
- A ten-body fight of Option Minds steps in real time in Node, its dearest step under 8.33 ms.
- The owner plays the Arena and sees no drop below 30 fps.

## Open to the owner

- **When the world cannot keep real time**, the page catches up by up to 12 steps a frame, and
  the screen freezes. With fewer, the fight slows for a moment instead. Which feels better is the
  owner's call.
