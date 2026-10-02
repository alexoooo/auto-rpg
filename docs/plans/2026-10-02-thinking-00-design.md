# Thinking: thought that outlasts a step, bodies that run less of themselves, a step that makes no garbage

## Why

The step is 120 Hz: senses, minds, motor control, the solver, the blows. Three things about it
have no home in the design, and each fight has answered them its own way or not at all.

1. **Thinking that takes longer than a step.** The crypt reads who sees whom and searches every
   walker's path inside its step, on a cadence of its own (`RUN_TIMING`, `src/dungeon/run.ts`).
   That planning is 3 to 4 % of a run's steps in the mean and half of its slowest: on seed 4,
   every one of the ten slowest steps has 6 to 9 ms of it, against a step of 8.33 ms
   ([step-cost.md](../reference/step-cost.md#the-crypts-plan-in-the-step)). The arena has no
   thinking above its tactics yet. What comes next is heavier: the oracle's rollouts are whole
   bouts ([oracle.md](../reference/oracle.md)), and a learned mind, a planner and blocked sight
   are on the roadmap.
2. **How many bodies a step carries.** A body under control costs 0.58 to 0.61 ms a step and the
   step is the bodies' sum: fourteen are real time with nothing drawn, eight are 57 % of it
   ([step-cost.md](../reference/step-cost.md#bodies-in-a-step)). The crypt holds a far enemy
   still and lets a dead one go limp by three functions of its own (`hold`, `drop`, `rest`),
   which dispose a body's mind and make another.
3. **What a step allocates.** A body allocates 0.54 MiB a step, 65 MiB a second. The collector
   takes about 1 % of the step at every count read, and its pauses are under 1.2 ms to twelve
   bodies: it is not what bounds the bodies. The allocation costs the code that makes it: a
   function whose temporaries were taken out, and nothing else changed, ran a fifth faster
   ([Readings](#readings)).

The owner asked for one systematic, simple way to do each, the same for every fight, that grows
to many more bodies and many more ways of thinking and of control.

One thing found on the way is not this set's: the hands' reach solver runs to its cap and takes
6 to 11 ms a step for a third of a second in a two-body bout
([step-cost.md](../reference/step-cost.md#the-reach-solver-at-its-cap)). It is the longest step
measured, it is motor control's, its remedy is not found, and every remedy is another bout. It is
on the roadmap.

## The design

Three rules, each one thing in one place.

### 1. A thought is a pure function, asked at one step and answered at a named later one

A **kind** of thought is a function from a question to its answer, both plain data
(`ThoughtKind`, `src/core/think/thoughts.ts`). A **thinker** asks questions of one kind and takes
their answers: it says how often it may ask (`every`, steps) and how late an answer is
(`latency`, steps). The world keeps the thoughts that are out, as state, and its step takes each
answer at the step it is due, never sooner and never later, before any mind steps.

```
World.step:  sensing hooks  ->  thoughts (answers due, then questions)  ->  step hooks  ->  solver  ->  after-step hooks
```

- **The game is the same wherever a thought is thought.** An answer is a function of its question
  alone, and it is taken at a step the game names. So it may be thought in the step it is due, in
  a worker, or in another process, and the bout or the run is the same to the bit. A fingerprint
  with workers equals one without.
- **The question is copied when it is asked** (`saveState`), so what thinks it sees what was
  asked, whatever the asker writes after.
- **What is out is state**: each thought's thinker, kind, question and due step. Answers are
  never state. A save holds the questions; whoever loads it has them thought again
  (`Thoughts.resume`), as whoever loads a bout shows its senses again (`SensesHub.show`).
- **A budget is in work, never in milliseconds.** A kind that searches is bounded by a count in
  its question (nodes, rollouts, plies), so its answer is the same on any machine.
- **Latency is the design's one cost.** A walker's route arrives a tenth of a second after it
  wants one, where today it has it the same step. Each thinker's two numbers are tuned constants
  with a measured table, as every other is.

With no runner a world thinks each thought in the step it is due: that is every Node test, every
research script, and a page before plan 02. With a runner (`ThoughtRunner`, plan 02) a question is
posted when it is asked and its answer is expected by its due step.

**When an answer is late, the world waits** (the owner's choice). `World.advance` takes no step
while a thought due at it is still out, and the time it could not take is dropped, as it is when a
page falls behind. A page does not wait for ever: after a number of frames (`THOUGHT_PATIENCE`, a
numeric setting of the host) the step thinks the thought itself, which is the same game and one
long step. `World.step` never waits: called directly, it thinks whatever has not come.

### 2. How much of itself a body runs is its level, and one rule sets it

A body is at one **level** (`BodyLevel`, in its muscles' state):

| Level | Senses and mind | Muscles | The solver | A step costs |
|---|---|---|---|---|
| `full` | run | driven | dynamic | 0.53 to 0.70 ms |
| `limp` | not run | released | dynamic | 0.28 ms |
| `held` | not run | released | fixed where it is | 0.02 to 0.04 ms |

(`docs/reference/play.md#bodies-in-the-step`.)

- **A level is data on one body, not another body.** Leaving `full`, the body's mind is told the
  body is nobody's (`Mind.idle`), which is the hand-over a host already makes to a sub-mind
  (`HostMind.release`, `SubMind.end`); back at `full`, it takes the body up as it is
  (`resume`, `begin`). Nothing is disposed and nothing is made again.
- **One pure rule gives every body's level** (`levelsOf`, `src/core/rules/levels.ts`) from what a
  fight knows of each: where it is and whose side it is on, whether it is out and for how long,
  and whether it has anything to do. It is one sentence: a body with nothing to do and nobody
  near is `held`; any other is `full` in the fight and `limp` out of it. The distances are the
  fight's data (`LevelRule`).
- **The living and the dead are one case.** An enemy waiting far from the party and a body that
  has lain still with nobody walking near are both bodies with nothing to do: both are held, and
  both are let go when somebody comes.
- **A level is read from the game, never from the machine.** There is no cap (the owner's
  choice): every body that is near runs in full, and the run is the same on every machine. With
  more bodies near than a machine carries, the game plays slower, as it does when an answer is
  late. How many are near at once is the level's to decide, as it places them.

### 3. A step makes no garbage of its own

What a body needs to work in is made with the body and sized from its spec: its solves' matrices
and vectors as flat `Float64Array`s (`src/core/math/flat.ts`), written in place by functions that
take what they write into. The engine is read once a step into the body's own arrays.

- **The rewrite changes no bout.** Each function does the same operations in the same order on
  the same numbers, so every digest and fingerprint stands, and a chunk that moves one is wrong.
- **A test holds it** (`tests/core-garbage.test.mjs`): what a body's step allocates, read by V8's
  sampling heap profiler (`allocatedIn`, `tests/harness/garbage.mjs`), is under a ceiling that
  each chunk lowers and none may raise.
- **What is left is named**: the engine's binding makes a wrapper for each vector read, and V8
  boxes numbers in code it has not yet compiled. The test's last ceiling is theirs.
- Each chunk says what it took off the step in milliseconds, before and after. The claim is the
  measured one and no more.

## The owner's choices

Answered 2026-10-02:

1. **When a background answer is late**: "world waits (your default)".
2. **How many bodies**: "we can design the game in a way that works within the constraints, so if
   we can only support 10 at a time, then we'll need to design around that (by only the close
   ones having control)".

3. **The cap** (2026-10-02): "there is no cap -- we should be able to support as many of them as
   we can". So nothing in the rule counts bodies, and what a machine carries is raised by what a
   body costs ([Readings](#readings), and Not in this set).
4. **The dead** (2026-10-02): fixed in place after some time, "e.g. when player is some distance
   from them", and in time gone, "but I haven't really though this through yet, so let's keep
   it simple and open to future refinement". Plan 03 holds a body out of the fight once it has
   lain still and nobody walks near, by the rule that holds a waiting enemy, and lets it go when
   somebody does. That it disappears is not planned: it would be a fight disposing a body it has
   held for long.

## How it extends

| Later | Where it goes |
|---|---|
| The oracle's rollouts in play | A kind whose question is a bout's save (`Duel.save`) with the orders to try and a count of rollouts, and whose answer is each one's value; a thinker in the mind's tactics with a latency of the horizon it can afford. Nothing else changes. |
| A planner, or tactics that search | A thinker whose answer is `Orders` or an `Intent`; the mind carries out the last one it took. |
| A learned mind at 120 Hz | Not a thought: it is a `Mind`, in the step, with its weights and its work arrays made with the body (rule 3). Too slow for a step, its forward pass is a kind and the mind holds its last answer. |
| Sight that is blocked, for the senses | The kind the crypt's sight is, asked by the senses' hub. |
| A mind for a squad | One thinker whose answer is several bodies' orders, as the crypt's sight thinker sets every enemy's target. |
| A table too large to copy at every ask (a policy's weights, a baked level) | Each realm's kinds are made with it (`kinds(tables)`), from an asset or a message sent once; a question names it. |
| Forty bodies in a room | They all run, and the step is their sum: what carries them is what a body costs (plan 04, and Not in this set). A body that needs to be seen moving and not to fight wants a fourth level, `carried`: the solver moves it through a played pose, with no control. It is a member of `BodyLevel` and a row of its one switch. |
| A body of another shape | Its work arrays are sized from its spec; its level is the same three. |
| Archery | An arrow is a body with no muscles and no level. Finding the shot is a kind, bounded by a count. |
| A crypt run that saves | The thoughts out and every body's level are already state. |
| Thinking on a server | A `ThoughtRunner` over a socket. The game is the same. |
| Another engine | `SegmentBody.setFixed` is the only thing a level asks of it. |
| Control on other threads | Not this design: see below. |

## What exists today and what changes

| Today | After |
|---|---|
| `RUN_TIMING.perceive`, `.replan`: the run's own cadence, inside `DungeonRun.plan` | Thinkers on the world's schedule (`THINKING`), plan 01 |
| `findPath`, `reveal`, `canSee`, `explorationGoal` called in the step | Three kinds (`src/dungeon/thoughts.ts`), thought where the world's runner puts them, plans 01 and 02 |
| No worker in the game; `research/` has pools of its own | One runner (`src/think/`), plan 02 |
| `World.advance` takes what real time owes | And takes none while a thought due is out, plan 02 |
| `DungeonRun.hold`, `.drop`, `.rest`; a body disposed and driven afresh | `Body.setLevel`, `levelsOf`, `Mind.idle`, plan 03 |
| The dead lie loose for the rest of the run | Held once they have lain still and nobody walks near, by the same rule, plan 03 |
| Solves on arrays of row arrays, made for each call | `src/core/math/flat.ts` and each body's work arrays, plan 04 |
| No test of what a step allocates | `tests/core-garbage.test.mjs`, plan 04 |

The arena changes in nothing it plays: it gives its world no kinds, its two bodies are always at
`full`, and plan 04 leaves its bouts the same to the bit.

## The plans

| # | Plan | Lands | Needs | Eye gate |
|---|---|---|---|---|
| 01 | `2026-10-02-thinking-01-thoughts.md` | The world's thoughts, thought in the step; the crypt's sight, routes and exploring on them | | A crypt run: the party walks, follows and fights as before |
| 02 | `2026-10-02-thinking-02-workers.md` | The runner over workers; the world waits; the crypt page thinks off its thread | 01 | A crypt run on the page with the workers on: no hitch as the hero explores |
| 03 | `2026-10-02-thinking-03-levels.md` | A body's level; `levelsOf`; the dead held; the crypt's `hold`, `drop` and `rest` go | | A crypt fight: the party walks off and comes back, and the dead lie as they lay and can be pushed aside |
| 04 | `2026-10-02-thinking-04-garbage.md` | The ceiling test; the flat kernel; each part of control on its body's work arrays; the engine read once a step | | None: every bout is the same to the bit |

01 and 02 are one line of work; 03 and 04 need nothing and may go in any order or beside them.
They are numbered by what they buy the game. 01 and 02 take the planning out of the crypt's
slowest steps and are the seam every heavier mind needs. 03 is what keeps the bodies nobody is
near, the dead among them, out of the step's sum. 04 is last because the collector is 1 % of a step and the gain in the step
itself, about a tenth by the one function tried, is to be measured chunk by chunk; it is also the
one that can be checked to the bit, so it is safe to take whenever there is a quiet day.

## Readings

All in Node 24.19, the core world, Rapier, 120 Hz, one thread of the development host, quiet.
The tables and their commands are in [reference/step-cost.md](../reference/step-cost.md).

- Bodies standing under the command layers, no assist: a step is 0.64 ms with one body, 4.73
  with eight, 9.22 with sixteen, 29.40 with forty-eight; 0.54 MiB allocated a body a step; the
  collector about 1 % of the step at every count.
- A bout of the Warrior against the Rogue with clubs, 1145 steps, no assist: the median step
  1.17 ms, of which the solver 0.51; motor control 45 % of the bout's time, the solver 32 %,
  tactics and skills under 1 %.
- A crypt run, the hero exploring with three Warriors, four seeds: the run's plan is over 1 ms
  about five times a second and over 4 ms 3 to 158 times in a run; 17 to 181 steps a run are over
  8.33 ms.
- One function with its temporaries taken out, and nothing else changed: in a scratch copy of
  `bodyDynamics.update` (`src/core/build/dynamics.ts@fda2945b`), the loop that sums the body's
  mass matrix written with no array made in it. Over the same bout as it was then (2434 steps),
  the least of three playings, twice: the function took 72 and 74 us a step before and 59 and 58
  after; the step 1.315 and 1.303 ms before and 1.272 and 1.290 after; 157 KiB a step fewer
  allocated; the bout's digest the same. Plan 04's chunk C does it for good and reads it again.

## Not in this set

- **The reach solver's remedy.** On the roadmap, with its readings.
- **Faster searches.** `findPath` scans its whole open set for the best cell at every pop, and
  `reveal` walks a line to every cell in range. Plan 02 takes them off the step whatever they
  cost; making them cheap is its own change.
- **Control on other threads.** A body's control reads the engine's state and writes its motors;
  on another thread it would need an engine of its own kept in step. The step is the bodies' sum,
  so this is what would raise what a machine carries by the number of cores. It is a design of its own, after
  this one's seams are in.
- **The simulation in a worker, the page drawing snapshots.** The same.
- **A solve that starts from the last step's answer** (the stance's share of the ground's
  wrench). It would take most of that solve's passes, and it is another bout.
- **A body put to rest by the engine**, and the `carried` level.
- **The crypt on senses**, and enemies built from the start so a run saves.
