# Ten fighters in real time

## Why

The owner wants 60 fps, at least 30, with 10 or more fighters and richer minds. Today two Option
Mind Warriors drop the Arena below 10 fps here and there while both stand.

Three things stand in the way:

- **Spikes.** Minds redo a decision's work every step, from inputs that barely change, in several
  callers that do not share it. A run of steps over 8.33 ms makes long frames; past a 30 fps
  frame's worth of steps the page plays the fight in slow motion (`CATCH_UP_SECONDS`,
  `src/arena/main.ts`, `src/dungeon/main.ts`).
- **The steady cost.** Sword against club takes about 2.4 ms a step for two bodies at `d1ef9b8d`:
  the engine 0.55, the skills 0.66, motor control 0.29, the minds' choices 0.26, and reading the
  bodies before and after physics most of the rest; 0.29 ms of it is contacts read out of Rapier
  a call at a time ([step cost](../reference/step-cost.md#where-the-minds-time-goes)). At that
  cost for each body, ten bodies take at least 12 ms a step, half again the 8.33 ms that 120 Hz
  allows, and a mind in a crowd reads more foes.
- **One thread.** The world steps and the scene renders on the page's one thread, so every slow
  step is a late frame, and the world's budget is what rendering leaves of each frame.

Only the crowd fight (step 2) plays ten fighters: the Arena is a duel (`DuelRecipe`,
`src/arena/duel.ts`; team bouts are open, [roadmap](../roadmap.md#the-game)), and a Crypt run's
encounters are a few bodies, each on Option Mind (`cryptMind`, `src/entrants/game.ts`).

The causes, each measured on the harness below:

- **Beside a lying foe**: 16 places, each with a route round the foe's exact colliders at three
  heights, from up to three callers a step (`besideLying`, `src/core/intent/action-window.ts`):
  12.8 ms a step at `a0577d3e` while a fighter is down, 4.0 once its colliders were read once
  ([a body lying, read once](../reference/step-cost.md#a-body-lying-read-once)). The place it
  chooses also flips between the body's sides from step to step
  ([roadmap](../roadmap.md#the-ai)).
- **A hand's change of pose**: a blocked change is tried again every step (`poseBlocked`,
  `src/core/build/hand-poses.ts`; `canChangeShape`, `src/core/engine/rapier.ts`). Each try built
  the new shape's hull against every collider in the world: 13.7 ms of the 40 dearest standing
  steps of the bare-handed bout, steps to 28 ms; tested only against colliders near it, the
  longest step is 10.0 ms
  ([a hand's new shape tested near it](../reference/step-cost.md#a-hands-new-shape-tested-near-it)).
- **The aim**: the opening search (`openingSelector`, `src/core/perception/openings.ts`) runs
  from every readiness call, with no memo, through the option's offer and ask, orders, admission
  and start, the menu, and the tactics' rechecks.
- **The menu** is built afresh on every read of `report.menu` (`menuOf`,
  `src/core/skills/framework/menu.ts`), each entry a readiness call and a `besideLying`: the drill
  Commander reads it up to three times a step (`src/core/command/drill.ts`), and the Arena's page
  each frame for each side.
- **Ground positioning** (`groundPosition`, `src/core/perception/downed/position.ts`) reads the
  foe's highest opening and sweeps the hands' and soles' clearance against its rebuilt colliders
  every step while the foe is low.
- **Predictions**: `foeModel` and `prior` (`src/core/option/percepts.ts`) are built again on every
  read from a constant spec and event-rate inputs.
- **Idle skills**: the kick reads every segment's contacts through the engine each step, a kick
  under way or not (`supportReadiness`, `src/core/control/support-readiness.ts`, from the kick's
  `update`): 0.19 ms a step for two bodies. Only its own motion reads what it reads.

Harness: Node, core world, `rapier-coordinate` (the game's engine), 120 Hz, Option Mind's Warriors
on the Arena's open stage, seed 0, to the verdict at 60 s.

The toolkit already holds some decisions, each its own way: the chooser by cue, period and exit
(`selectSet`, `src/core/mind/choice.ts`); the action tactics' table by period and patience
(`src/core/tactics/action-tactics.ts`); the ground approach by a plan kept until its target
drifts (`src/core/perception/downed/wide.ts`); fallen footprints until a body's centre drifts
(`fallenSolids`, `src/core/navigation/crowd.ts`); routes until their request, solids or progress
change (`routeWalker`, `src/core/navigation/navigation.ts`). None shares a result between
callers, and nothing says which work may run every step.

One defect bears on any fight with more than one foe: the strike option keeps its offer once a
step keyed on the time alone (`offer`, `src/core/option/strike.ts`), and the chooser appraises
every other foe's situation in the same step (`decide`, `src/core/mind/choice.ts`), so each other
foe is answered with the focus's target and readiness.

## The design

### A mind's work

A mind's work is of three kinds, and each has one place:

1. **Control**, every step: motor control, a live action's path and solve, steering. It is what
   must run at 120 Hz, and it is kept cheap.
2. **Readings**, at most once a step for each body and what it reads: the foe's colliders where
   they lie, the opening an action's selector finds for a foe, the menu. Every caller in the step
   reads the one answer. A reading carries nothing to the next step.
3. **Decisions**, held: a target, an aim not yet under way, a place and its way, a chosen option.
   A decision is made, kept in its module's `state`, and made again only on a trigger:
   - an **event**: a cue the decision names changes (focus, orders, posture, a blow);
   - **drift**: an input it was made from has moved past its tolerance since then (a lying body's
     centre past `CROWD.settled`, a target past its shift);
   - **failure**: a cheap check, each step, that the held answer still holds fails (a way blocked,
     a place no longer clear, an aim's segment gone);
   - a **deadline**: its period has run (`rethink`), the backstop, never the main trigger.

   Between triggers a held decision costs its cheap check. Bodies' periodic work is spread over
   steps by a phase, a new grant beside the seed (`HostGrants.phase`, read as `BodyHost.phase`,
   `src/core/mind/host.ts`): each fight gives it from its own order, the duel and the team bout
   by place, the Crypt as it builds each body, so bodies built together fall evenly; a body given
   none takes 0.

### The crossing into Rapier

Of about 3600 calls a step into Rapier's wasm at `59a6ff37`, contacts take about 2500 (each pair,
manifold and point read one call at a time, each pair a JavaScript object made and freed), the
joint motors 280 and the segments' poses and velocities 128
([across the boundary](../reference/step-cost.md#across-the-javascript-and-wasm-boundary)).
The vendored Rapier (`vendor/rapier/auto-rpg.patch`) gains three bulk calls, each one crossing a
step, each writing or reading a typed array made once:

- **contacts out**: after the step, for each collider asked for in the engine's order
  (`colliderHandles`), its pairs in Rapier's order (`contactPairsWith`), each manifold's
  flip, normal and solver points (point, separation, impulse), and the other collider's handle.
  The engine sums them in JavaScript as it does now (`contactsOf`, `contactManifoldsOf`), so the
  same values come out in the same order. Filled again after a load, before the first step.
- **motors in**: every joint freedom's model, speed and force bounds from one array, applied before
  the step;
- **poses out**: every body's translation, rotation and velocities into one array.

The contacts' read is owned here once: no reading above the engine caches contacts. The saving
read so far is about 0.4 ms of 2.9 a step (`59a6ff37`, unprofiled).

### The world in a worker

The world steps in a Web Worker; the Arena's and the Crypt's pages render. The core already runs
headless (a `NullEngine` scene, as `buildBout` builds it, `src/evaluation/bout.ts`), so the
worker builds the world from the screen's recipe exactly as Node does, and its bouts are the same
to the bit.

- **Out of the worker, each step**: every segment's and held item's position and rotation; each
  body's life, phase and level; each mind's report as the page shows it (its actions, its
  engagement; the menu when a panel asks); the hands' poses; touches, blows and the air through
  them for sound; bodies built, held and disposed (the Crypt builds its foes as the party nears,
  `src/dungeon/run.ts`); notes and the verdict. A trial beside the bout (`besideBout`) is a second
  world in the same worker.
- **Into the worker**: what a person does (orders, a shove, pause, a setting), applied at the
  next step and kept on the world's tape, so a bout with a person in it still replays.
- **The page** builds its own nodes for each body from the spec and poses them each frame between
  the last two steps it holds, so motion is smooth at the display's rate whatever the step costs.
  The skins, the fighter's panel, the mind inspector, the trial's overlay and the Crypt's hearing
  (`src/render/`, `src/arena/`, `src/ui/`, `src/dungeon/hearing.ts`) read what is sent; nothing on
  the page reaches the world.
- **From a console** `__arena` and `__dungeon` step and read through the worker. AGENTS.md's
  browser rules and the scripts that drive a page (`scripts/arena-view-browser-check.mjs`) change
  with them.
- **Rapier** loads in the worker only for these two pages (the setup previews draw puppets); the
  Lab, the physics bench and the control pages keep theirs.
- **Falling behind**: when the world cannot keep real time, its clock runs behind real time and
  the fight plays in slow motion (the owner's choice); the page keeps its frame rate.

Several worlds (rooms, a Crypt floor, a match played in the background) each take a worker.
Splitting one world's minds across workers is not planned: each step would wait on a message,
and one thread has room once the steps above are done.

### Rates

Physics and motor control stay at 120 Hz. Above them, a body's driver (its mind's decisions and
its skills' commands, the punch's arm solve among them; `act`,
`src/core/control/command-layers.ts`) can run at a lower rate, its command held between: muscles
are Rapier velocity motors with a force bound, solved inside the physics step, so a held command
stays stable, and motor control's servo and the effector tracker go on every step.

- **The mind at 30 Hz.** A driver call costs about 0.5 ms a body. Called every second, third or
  fourth step it fought the same mind at 120 Hz to no loss measured
  ([the mind every few steps](../reference/step-cost.md#the-mind-every-few-steps)), so the
  slowest is tried first and the rate raised to 40 Hz, then 60, only where a check finds a loss.
  With the bodies' phases spread, a quarter of the drivers run on each step: for ten bodies about
  1.3 ms a step instead of 5. It does not shrink a dear decision: a held decision does that.
- **What it touches.**
  - Every step still: the body's look, the sub-minds' `wants` and a sub-mind that has the body
    (the rise).
  - The driver is handed the steps since its last scheduled call times the step, counted afresh
    when the body is released or resumed, never the seconds a sub-mind held it.
  - A resume (`BodyView.resumed`) is kept until the driver runs.
  - A profile is measured at a rate: the driver's rate joins `Measured` as a field of its own
    (`src/core/skills/framework/profile.ts`; its `hz` is the physics'), so a profile measured at
    120 Hz reads as stale at 30 until measured again.
  - The learned blows steer every `PUNCH_DECIDE` (1/60 s) and apply a steer one call after it is
    read; at 30 Hz that lag is 33 ms, not the 8 ms they were trained with, which their drills
    read. Where they lose, a steered swing calls the driver every second step while it runs.
- **Motor control at 60 Hz**: the whole-body solve on alternate steps, bodies staggered, the assist
  still metered every step. It halves about 0.3 ms a step for two bodies and changes motion
  everywhere, so it is tried after the mind's rate, and kept only if the battery, the match and the
  owner's eye find nothing lost.

The effector tracker's three reach solves a step are 0.02 ms, not worth changing; nor is motor
control in Rust, dense arithmetic on small matrices whose gain is unmeasured.

## Steps

Step 2 adds the crowd fight and the harnesses that read the rest. Speed rewrites (steps 3 to 6)
do the same operations in the same order: no fingerprint case moved (step 3 names one state's
digest, as it says), the reference bouts' digests the same, the time before and after in
[step cost](../reference/step-cost.md). Steps 7 on change what minds or bodies do: each names its
moved cases, is read against the version before on its drill (`--previous`) and in a match
(`npm run match`), and is watched by the owner.

1. **A hand's pose tried cheaply.** Built: the new shape is tested only against colliders whose
   bounds can reach it, built once a pose; the bare-handed bout's standing steps over 8 ms went
   from 54 to 2, the longest 10.0 ms. Those two are read again on step 2's timers.
2. **What the steps are measured on.** Built: the crowd fight (`TeamBout`, `crowdFight`,
   `src/arena/team-bout.ts`; its screen `?play=crowd`, `src/arena/crowd.ts`), five Option Mind
   Warriors a side in two lines, each body under a duel's rules for one, a side beaten when every
   body of it is, at the cap the side with more life summed; each mind chooses its focus among the
   other side's. `research/step-time.mjs` plays an Arena link or the crowd fight,
   `research/crypt-step.mjs` takes the mind every body plays, both report the dearest step past
   the first 2 s; `research/call-count.mjs` counts calls a step. The crowd fight's first 30 s:
   14.0 ms a step, the dearest past 2 s 30.9 ms
   ([the crowd fight](../reference/step-cost.md#the-crowd-fight)).
3. **Readings once a step.** Built: a reading stamp on the view (`StepReading`) that moves at
   each look, after each command and after each physics step; a foe's colliders (`stepObstacle`)
   and the surface aim's opening kept against it and the foe's observation time; the kick's
   support read only while it kicks. The crowd fight's calls into wasm a step 14147 to 6543, its
   step about 0.9 ms less ([readings once a step](../reference/step-cost.md#readings-once-a-step)).
4. **The menu once a pass.** Built: a member view builds it at its first read for the Commander's
   decision, and the Arena's page only while its choices list is open. A memo on the stamp would
   go stale: readiness reads the skills' state, which the command changes, and a Commander reads
   the menu after the senses move and before the bodies look.
5. **The batched crossing.** Built: contacts, motors and poses each cross into the wasm once a
   step (`auto-rpg.10`); the sword against club bout's calls in went from 3623 a step to 227, its
   allocation from 1205 KiB a step to 673, its step 0.1 to 0.3 ms quicker, no fingerprint case
   moved ([one crossing a step](../reference/step-cost.md#one-crossing-a-step)). The garbage-free
   step's contacts' read ([a garbage-free step](2026-10-30-garbage-free-step.md#steps), its step 2)
   was this one.
6. **The world in a worker**, the crowd fight, then the Arena, then the Crypt, as the design says.
   Built for the crowd fight, the Arena and the Crypt (`src/worker/`, [the world in a worker](../architecture.md#the-world-in-a-worker)):
   the crowd fight's digest in the worker equals Node's (`tests/world-worker.test.mjs`; in Chrome's
   worker too, the first 240 steps of seed 0); the Arena's bout plays on a duel's stage
   (`duelStage`) with its aftermath, a trial and the one beside it, a person's lead through the
   team of one, holds on a new choice, the HUD, sounds and overlays read from each step's news, and
   a bout a person led replays in Node from the tape the worker kept; the setup previews draw
   puppets, so the Arena's page loads no Rapier; a Crypt run plays on its stage (`cryptStage`), its
   foes' puppets made as the run builds them, its fog, doors, party, selection, notice, routes,
   hearing and inspected mind read from each step's news, the person's commands, selection, drawn
   routes and lead its input, and a run a person commanded replays in Node from the tape the worker
   kept; the Crypt's page loads no Rapier. Check: a bout's digest in the
   worker equals Node's; the page holds the display's rate while a step is made slow on purpose; the
   owner plays.
7. **The strike option's offer for each foe.** Built: its once-a-step memo kept for each focus. The
   crowd fight to its verdict: the right side won by drain at 104.7 s, 1885 blows landed by 90 s;
   now the left wins by drain at 117.0 s, 3796 by 90 s. A duel has one foe; in the Crypt, whose bodies
   play Option Mind, it serves each foe a body faces.
8. **A held decision in the toolkit.** Built: `Held`, `stillHeld` and `hold`
   (`src/core/mind/held.ts`); the place beside a lying foe held by Option Mind's walk into a
   strike's window (`HeldBeside`), and the drill Commander's spot beside one (`HELD_SPOT`). On the
   stomping rung (`option/stomp`) the drill's spot jumped more than 0.5 m 124 times before and 6
   after; it landed 4 of 12 before and 3 of 12 after, one trial falling, within what 12 trials
   tell apart. The time while a fighter is down is not read: the menu still finds its spot
   afresh at each decision.
9. **The rest held**: ground positioning's mode and hand; an aim not yet under way, held as a
   point on its segment as Vanguard's committed aim does
   (`src/entrants/vanguard/committed-aim.ts`); predictions made again on their events. A blocked
   hand pose (a body hook, not a mind's) is read again first, and held only if it is still dear.
   Check: each one's drill and the match. Built: the surface aim's held opening, one set of aims a
   mind ([the held aim](../reference/step-cost.md#the-held-aim)): opening searches 14.8 a step to
   4.2; the punch's guarding rung lands as before; the match 5 of 12 before, 8 after. The
   predictions take no share the profiler lists, and are not held. Ground positioning runs only
   while a foe is low, and no body goes down in the crowd fight's 149 s or in the sword against
   club duel to its verdict at 41 s; a hand's blocked pose takes no share the profiler lists. Neither
   is held.
10. **Phases spread**: the phase grant, given by the duel, the team bout and the Crypt, and
    periodic decisions start at it. Built: `HostGrants.phase`, `phaseOf`, the chooser's deadline on
    it (`nextDecision`) ([phases spread](../reference/step-cost.md#phases-spread)): steps where all
    ten chose afresh 16 to 1, the 99th per cent step 21.3 ms to 12.8.
    Check: the crowd fight's dearest step and how many decisions fall on one step.
11. **The mind at 30 Hz**: the rate a field of the mind's config, carried to the command layers
    (`kitBody`, `src/core/tactics/fighter.ts`; `LayerOptions`), the driver every fourth step at
    the body's phase, as the design says; the profiles measured again at it. Check: the baseline
    battery (`npm run evaluate -- baseline`: walk, punch, stand-up, fights), the punch and club
    drills, the match against 120 Hz, the crowd fight's step; the owner watches. Where one loses,
    40 Hz, then 60, the same way. Built, not the presets' default
    ([the mind at 30 Hz](../reference/step-cost.md#the-mind-at-30-hz)): the decider at its pace
    (`Pace`, `driveBy`), the skills every step, `OptionMindConfig.rate`, the profiles at both
    rates. The command held between calls lost the strikes; the intent held keeps the punch and
    the gait, plays the match level (0.567), and loses the club blow (7 of 16 against 11 of 15) and
    the stomp, for about a twentieth of the crowd fight's step. 40 and 60 Hz save less still.
12. **Motor control at 60 Hz, tried**, as the design says. Check: the baseline battery and the
    match against 120 Hz control; the owner watches. Kept, or recorded in step cost as tried and
    why not. Tried, not kept ([the mind at 30 Hz](../reference/step-cost.md#the-mind-at-30-hz)):
    the punch lands none of six, the club 4 of 14, for at most motor control's 14 % of the step.
13. **A ceiling on heavy work**: the step-cost test counts the heavy searches a mind makes in a
    step of its bout (opening searches, route searches, shapes built) and fails at a ceiling well
    above what a step does once its work is held: it catches a search put back in every step,
    not a count that moves. Built (`SEARCHES`, `tests/harness/heavy-work.mjs`): opening searches
    in a duel of Option Minds at 1 m and route searches in a Crypt run's first second, 0.5 a
    body-step against about 0.1 held; the held aim made to search every call reads 1.07. No
    shape is built in either fixture, so `worldShapes` is counted by `research/call-count.mjs` alone.

## Done when

Read pinned to the performance cores, the first 2 s not read: a bout by `research/step-time.mjs`
(the least of three playings), a Crypt run by `research/crypt-step.mjs`.

- In the reference bouts (sword against club and bare hands at seed 0) and the Crypt's runs at
  seeds 10 and 25, no step takes more than 8.33 ms on the game's engine.
- The crowd fight steps in real time, its dearest step under 8.33 ms.
- The Arena and the Crypt step their worlds in a worker, and the owner plays the crowd fight and
  the Crypt and sees 60 fps, never below 30.
