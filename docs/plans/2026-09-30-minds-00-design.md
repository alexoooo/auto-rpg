# Minds: the design, and the order it lands in

This is the design of the AI above the muscles, and the index of the eight plans that build it,
01 to 08.
Each plan lands green by itself; this file is deleted with the last of them.

## The design

1. **A body is senses and effectors; a mind is a stateful function between them.** A mind learns
   of the world only through its body's senses, and touches it only through its body's effectors.
   That one rule replaces "a mind drives a body only through its command".
2. **The effectors are raw**: for each freedom, an activation (0 to 1) and a speed asked for --
   the muscle driver's command (`MuscleDriver.activation`, `.velocity`,
   `src/core/muscle/driver.ts`). A torque is the special case: a speed beyond the muscles' reach
   pushes at the ceiling the activation sets, and a speed of zero holds. Nothing else moves a body.
3. **The input is three things.**
   - *Its own body, whole* (`OwnBody`): the spec with what it holds, each freedom's angle, rate
     and strength, the body's dynamics. Handed over once, when the mind is made; read every step.
   - *The world its senses let through* (`Senses`): the clock, every other body's segments (pose
     and velocity), whether each is still in the fight. Never another mind's memory or command,
     never the camera, never the future. The senses are one layer, read in a phase of the step
     of its own before any mind, which can delay what it shows; the delay starts at none.
   - *Orders*, for a mind that takes them: a port a person, or a team's plan, writes.
4. **Layers are a library, not the interface.** Tactics make an `Intent`, skills make a
   `BodyCommand`, motor control makes muscle commands: that stack stays, as one way to write a
   mind (`commandMind` under `driveBy`), and every body the game has today runs it. A mind that
   skips it and writes activations is as much a mind.
5. **Body shapes share the seam, not the library.** `Mind`, `OwnBody` and `Senses` name no hand
   or foot: the channels are the body's own. The human library (stance on two feet, hand goals,
   strikes) asks for a human; a quadruped gets a library of its own behind the same seam.
6. **State is data.** A bout is built from a plain-data recipe, and everything that changes from
   step to step -- the physics, each controller's memory, each mind's, the rules' -- is plain data
   that saves and loads whole. A fork is a load; a replay is the recipe and the orders given.
7. **An assist is a declared effector, not anatomy.** A force and a moment on the root, which a
   mind asks for as it asks its muscles, with a ceiling that belongs to the bout's recipe, the
   same for both sides in each body's own weight, metered every step. It is a dial, not a
   decision: at none it is absent, and it can be turned at any time, at the cost of measuring
   again what was measured without it.
8. **A person gives orders.** WASD and the pointer become `Orders` (walk this way, face there,
   attack that) on the orders port of a layered mind, in place of its tactics. The page turns the
   camera's view into world directions, so the camera never reaches a mind, and the orders are
   recorded by step (the tape), so a bout a person fought plays again from its recipe and its
   tape.
9. **A fork is a bout played out from a step under other orders.** First by replay, which needs
   nothing but the recipe and the tape; then by a load, which costs only what is played out.
10. **The oracle is an instrument, not a mind.** It holds the true world, forks it, and tries
    responses. It reports the ceiling of the space it searched, which every figure names, and it
    is clairvoyant about the opponent unless the forks are perturbed.

## What exists today, and what changes

| Today | After |
|---|---|
| `Mind.decide(sight, dt): Intent` (`src/core/mind/mind.ts`) | `Tactics.decide(sight, dt): Intent` (`src/core/mind/tactics.ts`), the top layer of a layered mind |
| no raw mind; the seam is `MuscleController` | `Mind.step(senses, dt)`, built with its `OwnBody` (`src/core/mind/mind.ts`) |
| `createBody` hard-wires motor control onto `driveMuscles` | the same call, its motor control a mind (`commandMind`) given its body by `embody` |
| a mind's target is handed to it (`Duel.plan`, a live `Body`) | it picks it from what it sees (`Senses.others`, `seekFoe`) |
| the left side sees the right a step late | both see the same step (`createSenses`, in `World.sense`'s phase) |
| a person watches the arena | a person may take a side (`Orders`), walking one way and facing another |
| a bout is gone once fought | its recipe and its tape play it again, from a link (`Duel.play`) |
| nothing but its muscles holds a body up, and 8 bouts of 9 end by a fall | an assist with a ceiling in the bout's recipe (`Assist`), none unless it says otherwise |
| a bout cannot be forked | by replay (`research/rollouts.mjs`), then by a load (`Duel.save`, `Duel.load`) |
| no instrument for a skill ceiling | `research/oracle.mjs` |

The crypt (`src/dungeon/run.ts`) keeps its run's plan as the commander of its fighters: the plan
reads the map and gives each fighter a direction and a target, which is orders by another name. It
takes the renames and nothing else. Moving it onto senses, and saving a run whose bodies are built
as they wake, is not in this set.

## The plans

| # | Plan | Lands | Needs | Eye gate |
|---|---|---|---|---|
| 01 | [baseline](2026-09-30-minds-01-baseline.md) | a bout is a recipe; its trace digest; the standing table of how bouts end | | |
| 02 | [the mind at the muscles](2026-09-30-minds-02-mind-at-the-muscles.md) | `Mind`, `OwnBody`, `embody`; `Tactics`; every body driven through `Mind` | 01 | |
| 03 | [senses](2026-09-30-minds-03-senses.md) | `Senses`; the arena's tactics see their opponent; `Duel.plan` goes | 02 | |
| 04 | [orders](2026-09-30-minds-04-orders.md) | `Orders`, the orders tape, WASD and the pointer in the arena | 03 | the owner fights a bout |
| 05 | [assist](2026-09-30-minds-05-assist.md) | what the soles miss, published and measured; the assist effector; its sweep | 02 | the owner watches assisted bouts |
| 06 | [oracle](2026-09-30-minds-06-oracle.md) | forks by replay on worker threads; the oracle; its first table; a tape in a link | 04 | the owner watches an oracle's bout |
| 07 | [engine save](2026-09-30-minds-07-engine-save.md) | `PhysicsWorld.save` and `load` | | |
| 08 | [fork](2026-09-30-minds-08-fork.md) | `saveState`/`loadState`; every module's memory as data; `Duel.save`/`load`; forks by a load | 05, 06, 07 | |

04 and 05 come first because they are what a person sees. The fork comes twice: 06 forks by
replay, which costs the bout up to the fork and nothing in the core, so the oracle and the clone
arrive before the large change; 08 moves every module's memory into data and makes the fork a
load, behind the same call. 07 touches one module and can land at any time. 05 can land before
04; 06 needs only 04, and reads better with 05's table beside it.

Every plan ends with `npm test`, `npm run check` and `npm run build`, the line-ending gate
(`git diff --numstat` equal to `git diff --ignore-cr-at-eol --numstat`), and one commit.

## The rules this changes

Each is changed by the plan that makes it true, in the same commit.

- `AGENTS.md`, "A mind drives a body only through its command" becomes (plan 02):
  > **A mind reaches the world only through its body.** It learns of it through its senses
  > (`Senses`, `src/core/mind/senses.ts`) and its own body (`OwnBody`), and moves it through its
  > muscles' command and nothing else (`Mind.step`, `src/core/mind/mind.ts`). Camera state never
  > reaches a mind. A person gives orders (`Orders`); a body's own mind carries them out while it
  > defends itself.
- `AGENTS.md` gains, beside "Solver conditioning is not anatomy" (plan 05):
  > **An assist is not anatomy.** A force or moment no muscle gives is an assist (`Assist`,
  > `src/core/control/assist.ts`): its ceiling is the fight's (`ASSIST`, `src/arena/duel.ts`),
  > the same for every side in each body's own weight, metered every step, and kept out of the
  > body's numbers. A figure measured under an assist names its ceiling.
- `AGENTS.md` gains, under Code (plan 08):
  > **What changes from step to step is plain data in one `state` object** per module
  > (`src/core/state.ts`), hung on the bout's; `tests/arena-fork.test.mjs` forks a bout to prove
  > it. A body, a node or a function is not state, and a constant a state points at is frozen.
- `docs/architecture.md`, "Minds" and the standing decision "A person never commands muscles":
  rewritten by plans 02 to 04 as they land. The decision stands: a person's input is orders.
- `docs/roadmap.md`, "The AI": the first item goes with plan 02, and the pointer to this set
  with plan 08; "Orders a person can give a side" goes with plan 04.

## What was measured before this was written

Harness for all of it: Node 24.19, the core world, Rapier 0.21 (simd-compat), 120 Hz, at commit
`144961d4` or its parent, which differ in the core by comments alone; the digests were read at
`144961d4`. The scripts were prototypes, on the tree or on a patched copy of `src/`; the plans
land the ones worth keeping, and each plan carries the tables it is built on.

**The core repeats.** `workshop-fighter` against `workshop-rogue`, built twice in fresh worlds:
2271 steps both times, the right side winning by a fall at 18.925 s, 31 blows, and one digest of
every segment's pose at every step, `fd30dd8586076627`. A driven bout step costs 1.24 to 1.38 ms.
So a trace digest gates a change that should change nothing, and a replay is a fork.

**Rapier's snapshot continues to the bit.** Two limp clubbed humans dropped into each other (32
bodies, 30 joints, 37 colliders, 421 body-to-body contacts with an impulse in the first 90
steps): a world restored from a snapshot at step 90 matches the original in all 416 values after
1, 10, 60 and 360 steps; a snapshot of a restored world does too. Control: an impulse of
1e-4 N s on one body changes 70 of 96 coordinates after one step. The snapshot is 329 kB, 0.48 ms
to take and 1.4 ms to restore; the timestep and the solver's iterations survive it.

**A load under a driven bout is transparent, and the physics is not the whole state.** With
`save`/`load` on a copy of the engine module (plan 07's code), the fighter-rogue bout at step
1200, compared with a bout run straight through, over the next 600 steps:

| What was loaded, under which controllers | First step that differs |
|---|---|
| its own bytes, in place, controllers at step 1200 | none |
| another world's bytes (same recipe, run to step 1200) | none |
| step 1200's bytes under controllers 600 steps on | 1 |
| step 1200's bytes under controllers one step behind | 1 |

**Bouts end by falling.** Every arena matchup once (9 bouts, one gap, so a count, not a rate):

| Left | Right | Winner | Ending | s | Blows | Wounding |
|---|---|---|---|---|---|---|
| fighter | fighter | left | fallen | 8.0 | 0 | 0 |
| fighter | rogue | right | fallen | 18.9 | 31 | 19 |
| fighter | skeleton | left | fallen | 11.3 | 10 | 4 |
| rogue | fighter | right | severed | 9.7 | 1 | 1 |
| rogue | rogue | right | fallen | 12.0 | 0 | 0 |
| rogue | skeleton | left | fallen | 11.5 | 2 | 2 |
| skeleton | fighter | right | fallen | 10.7 | 2 | 2 |
| skeleton | rogue | right | fallen | 11.6 | 2 | 0 |
| skeleton | skeleton | right | fallen | 35.9 | 1 | 1 |

Eight of nine end by a fall, two of them before any blow. In the fighter-fighter bout the body
that falls is setting its feet for a strike; its root tilts 25 degrees half a second before, and
84 degrees at the fall with the root 0.15 m under its built height.

**An assist bolted on from outside does not fix that.** One step hook per body, outside the
core: a torque on the root toward upright about the level axes (300 N m/rad, 15 N m s/rad,
clipped at a ceiling), and a lift at the root's centre toward its built height (clipped at a share
of the body's weight). Falls, of the same nine bouts:

| Torque ceiling, N m | Lift ceiling, weights | End by a fall | Mean torque given, N m |
|---|---|---|---|
| 0 | 0 | 8 | 0 |
| 25 | 0 | 7 | 5.6 |
| 50 | 0 | 7 | 6.6 |
| 100 | 0 | 7 | 11.7 |
| 200 | 0 | 6 | 14.3 |
| 50 | 0.25 | 8 | 9.3 |
| 100 | 0.25 | 8 | 21.8 |
| 200 | 0.5 | 8 | 41.9 |
| 0 | 1 | 8 | 0 |
| 200 | 1 | 7 | 31.2 |
| 400 | 2 | 7 | 33.7 |

Nine bouts cannot tell 6 from 8, and the torque was at its ceiling in under a tenth of the steps:
righting the root is not what these bodies lack. Two things follow, and plan 05 is built on them.
The assist belongs inside the stance's own solve, supplying the wrench its soles cannot give, not
beside it; and what that wrench is has to be measured before a ceiling is chosen. A third reading:
with the gain scaled to the ceiling instead (the ceiling over 0.15 rad, damped over 0.1 s), the
torque sat at its ceiling 78 to 98 % of steps from 50 N m up, and at 200 and 400 N m every bout
ended by a fall, in 3.1 and 1.1 s on average. An explicit torque on one light segment at 120 Hz
goes unstable; an assist is solved with the body, like every other torque here.

**Inside the stance's solve, it does.** The stance already computes the wrench the ground must
give and settles for what the soles can give; the assist supplies that shortfall, up to a
ceiling, and the root is asked for what the two give together. Over 27 bouts a cell (every
matchup at gaps of 3, 4 and 5 m):

| Force ceiling, weights | Moment ceiling, N m | End by a fall | Falls a minute | Mean given, N and N m |
|---|---|---|---|---|
| 0 | 0 | 20 | 3.33 | |
| 0.25 | 50 | 9 | 0.37 | 7.4, 5.2 |
| 1 | 200 | 1 | 0.04 | 8.0, 7.4 |
| 0 | 200 | 8 | 0.38 | 0, 9.6 |
| 1 | 0 | 14 | 0.63 | 11.1, 0 |

A mean of about a hundredth of a body's weight takes falls down ninefold, and the moment does
most of it. A body that falls misses half its weight and 240 to 420 N m in its last second; one
that does not, a tenth and 63 N m at most. On the stand, a steady pull of a tenth of the
Warrior's weight at its root fells it in 1.4 m and eleven recovery steps; with the assist it
holds within 0.05 m and takes none, on 2 N and 2 N m. [Plan 05](2026-09-30-minds-05-assist.md)
has the whole tables.

**Past a fall the stance's ask has no bound** (over 1e50 N within 3 s, on the stand). Nothing
reads it in a bout, which ends at the fall; the assist refuses an ask that is not finite and is
withdrawn at the verdict, and the defect goes on the roadmap.

**Walking one way while facing another holds at half pace.** Each arena body, club in hand, 8 s
at each of eight bearings: at its fastest walk facing ahead, 3, 1 and 0 of 8 fall (Warrior,
Rogue, skeleton), and facing behind, 6, 7 and 0; at half pace until it has turned to its
facing, then up to the whole pace forward, none falls facing ahead or a quarter turn off, and 1,
2 and 0 on a half turn. [Plan 04](2026-09-30-minds-04-orders.md) has the table and the rule.

**A side held by orders stands, and the other fights on.** The left of the fighter-rogue bout
ordered to stand moved 5 mm in 4 s while the right came 1.0 m nearer; handed back, it gained
0.49 m in 3 s.

## Dials, with where they start

None of these is a decision now; each is a value in a recipe or a constant with a record.

- **The senses' delay**: none (`DuelRecipe.senseDelay`, in steps; plan 03).
- **What is seen of another body**: its spec with what it holds, its segments' poses and
  velocities, and whether it is out. Not its hit points.
- **Walking while facing elsewhere**: half the fastest walk across the heading or backward, and
  until the body has turned to within 0.3 rad of its facing (`STRAFE`, plan 04).
- **The assist's ceiling**: none (`ASSIST`, or `DuelRecipe.assist`, or `&assist=` in a link;
  plan 05). A force in the body's weights and a moment in its weights times a metre.
- **The oracle's search**: its responses, its period (0.5 s), its horizon (2 s), and whether it
  is blind, named in each run (plan 06).

## The owner's choices

Two, each with what it changes in play. Neither blocks a plan; each plan lands the default.

1. **The arena's assist** (plan 05), after watching bouts with it. *Default:* none: a body
   stands on its muscles alone, and most bouts end by a fall inside 20 s. *Or:* a quarter of a
   body's weight and 0.065 weight-metres (50 N m on the Warrior): falls drop ninefold, bouts run
   about four times longer and most end by a wound or at the cap, on a help of about a
   hundredth of a body's weight. It is a constant, and can be turned again whenever.
2. **What the pointer does while a person stands still** (plan 04). The stance turns only while
   it walks. *Default:* a standing body does not turn to the pointer; the person walks to turn.
   *Or:* a pointer more than a quarter turn off makes the body take a slow step toward its own
   heading so it can turn, which moves it without being asked.

The owner's words of 2026-09-30, "wasd + pointer (for face/attack and move)", are taken as the
scheme: WASD walks, the pointer faces, the left button attacks where it points. That replaces the
earlier scheme of keys for facing and attack direction.

## Not in this set

- A learned mind, and a registry of minds a recipe can name. The seam is what one plugs into;
  the arena's recipe names bodies, and each side runs `seekFoe` unless ordered.
- A rising skill, and hoisting a fallen body: the assist holds a body up, and a fall still ends
  a bout.
- Sight that is blocked: the senses pass every body whatever stands between.
- Turning on the spot, a quadruped's library, the crypt on senses, the crypt's hero walking one
  way and facing another, saving a crypt run.
